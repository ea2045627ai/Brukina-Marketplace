import { createClient } from 'npm:@supabase/supabase-js@2';
import { notifyOrderBySms } from '../_shared/notify-order-sms.ts';

const PAYSTACK_API_URL = 'https://api.paystack.co';
const PAYSTACK_CHECKOUT_HOST = 'checkout.paystack.com';
const MAX_CHECKOUT_BODY_BYTES = 16 * 1024;
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRANSACTION_REFERENCE_PATTERN = /^BM-[A-F0-9]{32}$/;

type CheckoutItem = {
  inventory_id: string;
  quantity: number;
};

type CheckoutRequest = {
  items: CheckoutItem[];
  idempotency_key: string;
};

type CheckoutOrder = {
  order_id: string;
  order_number: string;
  transaction_ref: string;
  subtotal: number;
  delivery_charge: number;
  total: number;
  payment_status: string;
  authorization_url: string | null;
};

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const jsonResponse = (body: Record<string, unknown>, status: number, headers: HeadersInit = {}) => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
};

async function readJsonBody(
  request: Request,
  maximumBytes: number
): Promise<{ raw: string; value: unknown }> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError('Request body is required.', 400);

  const decoder = new TextDecoder();
  let raw = '';
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maximumBytes) {
        await reader.cancel();
        throw new HttpError('Request body is too large.', 413);
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return { raw, value: JSON.parse(raw) as unknown };
  } catch {
    throw new HttpError('Request body must be valid JSON.', 400);
  }
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(`Server configuration is missing ${name}.`, 503);
  return value;
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('origin');
  const allowedOrigin = Deno.env.get('APP_ORIGIN');
  if (origin && allowedOrigin && origin !== allowedOrigin) {
    throw new HttpError('Request origin is not allowed.', 403);
  }
  if (origin && !allowedOrigin) {
    throw new HttpError('APP_ORIGIN must be configured for browser checkout requests.', 503);
  }
  return {
    ...(origin && allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function paystackSignature(rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(requiredEnv('PAYSTACK_SECRET_KEY')),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(rawBody)
  );
  return bytesToHex(new Uint8Array(signature));
}

function constantTimeEqualHex(left: string, right: string): boolean {
  if (!/^[0-9a-f]{128}$/i.test(left) || !/^[0-9a-f]{128}$/i.test(right)) return false;
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  let difference = 0;
  for (let index = 0; index < normalizedLeft.length; index += 1) {
    difference |= normalizedLeft.charCodeAt(index) ^ normalizedRight.charCodeAt(index);
  }
  return difference === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getSupabaseAdmin() {
  return createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function confirmPayment(
  reference: string,
  providerReference: string,
  amountInMinorUnits: number,
  currency: string
) {
  if (!Number.isSafeInteger(amountInMinorUnits) || amountInMinorUnits <= 0 || currency !== 'GHS') {
    throw new HttpError('Payment amount or currency is invalid.', 409);
  }

  const admin = getSupabaseAdmin();
  const { data: payment, error: paymentError } = await admin
    .from('marketplace_order_payments')
    .select('order_id, amount, currency')
    .eq('transaction_ref', reference)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment || Math.round(Number(payment.amount) * 100) !== amountInMinorUnits
    || payment.currency !== currency) {
    throw new HttpError('Payment metadata does not match the order ledger.', 409);
  }

  const { data: confirmation, error: confirmationError } = await admin.rpc(
    'confirm_marketplace_payment',
    {
      p_transaction_ref: reference,
      p_provider_reference: providerReference,
      p_amount: amountInMinorUnits / 100,
      p_currency: currency
    }
  );
  if (confirmationError) throw confirmationError;
  if (!Array.isArray(confirmation) || confirmation.length !== 1
    || confirmation[0].order_id !== payment.order_id
    || confirmation[0].payment_status !== 'paid') {
    throw new Error('Database did not confirm the payment ledger update.');
  }

  await notifyOrderBySms(payment.order_id);
  return payment.order_id as string;
}

async function handlePaystackWebhook(request: Request, raw: string, parsed: unknown) {
  const suppliedSignature = request.headers.get('x-paystack-signature') || '';
  const expectedSignature = await paystackSignature(raw);
  if (!constantTimeEqualHex(expectedSignature, suppliedSignature)) {
    return jsonResponse({ error: 'Invalid Paystack signature.' }, 401);
  }

  if (!isRecord(parsed) || typeof parsed.event !== 'string') {
    throw new HttpError('Paystack event payload is invalid.', 400);
  }
  if (parsed.event !== 'charge.success') {
    return jsonResponse({ received: true, ignored: true }, 200);
  }

  const data = parsed.data;
  if (!isRecord(data) || !isRecord(data.metadata)) {
    throw new HttpError('Paystack payment metadata is missing.', 400);
  }

  const reference = data.reference;
  const amount = data.amount;
  const currency = data.currency;
  const providerId = data.id;
  const orderId = data.metadata.order_id;
  if (data.status !== 'success'
    || typeof reference !== 'string'
    || !TRANSACTION_REFERENCE_PATTERN.test(reference)
    || typeof amount !== 'number'
    || !Number.isSafeInteger(amount)
    || typeof currency !== 'string'
    || (typeof providerId !== 'number' && typeof providerId !== 'string')
    || typeof orderId !== 'string'
    || !UUID_PATTERN.test(orderId)) {
    throw new HttpError('Paystack success event has invalid transaction metadata.', 400);
  }

  const admin = getSupabaseAdmin();
  const { data: payment, error: paymentError } = await admin
    .from('marketplace_order_payments')
    .select('order_id')
    .eq('transaction_ref', reference)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment || payment.order_id !== orderId) {
    throw new HttpError('Paystack reference does not match an order.', 404);
  }

  await confirmPayment(reference, String(providerId), amount, currency);
  return jsonResponse({ received: true, payment_status: 'paid' }, 200);
}

function validateCheckoutRequest(value: unknown): CheckoutRequest {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length < 1
    || value.items.length > 50) {
    throw new HttpError('Checkout request has an invalid shape.', 400);
  }

  const idempotencyKey = value.idempotency_key;
  if (typeof idempotencyKey !== 'string' || !UUID_PATTERN.test(idempotencyKey)) {
    throw new HttpError('A valid idempotency key is required.', 400);
  }

  const items = value.items.map((item): CheckoutItem => {
    if (!isRecord(item) || typeof item.inventory_id !== 'string'
      || !UUID_PATTERN.test(item.inventory_id)
      || typeof item.quantity !== 'number' || !Number.isSafeInteger(item.quantity)
      || item.quantity < 1
      || Number(item.quantity) > 100_000) {
      throw new HttpError('Cart contains an invalid product or quantity.', 400);
    }
    return { inventory_id: item.inventory_id, quantity: Number(item.quantity) };
  });

  return {
    items,
    idempotency_key: idempotencyKey
  };
}

async function handlePaystackVerification(
  admin: ReturnType<typeof getSupabaseAdmin>,
  customerId: string,
  reference: string
) {
  if (!TRANSACTION_REFERENCE_PATTERN.test(reference)) {
    throw new HttpError('Invalid payment reference.', 400);
  }

  const { data: payment, error: paymentError } = await admin
    .from('marketplace_order_payments')
    .select('order_id, amount, currency, payment_status')
    .eq('transaction_ref', reference)
    .eq('customer_id', customerId)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment) throw new HttpError('Payment reference was not found.', 404);
  if (payment.payment_status === 'paid') {
    await notifyOrderBySms(payment.order_id);
    return { status: 'paid', reference };
  }

  const response = await fetch(
    `${PAYSTACK_API_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${requiredEnv('PAYSTACK_SECRET_KEY')}` },
      signal: AbortSignal.timeout(15_000)
    }
  );
  if (!response.ok) {
    console.error('Paystack verification failed with HTTP status', response.status);
    throw new HttpError('Paystack could not verify the transaction.', 502);
  }

  const result: unknown = await response.json();
  if (!isRecord(result) || !isRecord(result.data) || result.status !== true) {
    throw new HttpError('Paystack returned an invalid verification response.', 502);
  }
  const transaction = result.data;
  if (transaction.status !== 'success') {
    return { status: 'pending', reference };
  }

  const metadataOrderId = isRecord(transaction.metadata) ? transaction.metadata.order_id : null;
  if (transaction.reference !== reference
    || typeof transaction.currency !== 'string'
    || transaction.currency !== payment.currency
    || typeof transaction.amount !== 'number'
    || !Number.isSafeInteger(transaction.amount)
    || Math.round(Number(payment.amount) * 100) !== transaction.amount
    || metadataOrderId !== payment.order_id
    || (typeof transaction.id !== 'number' && typeof transaction.id !== 'string')) {
    throw new HttpError('Paystack transaction details do not match the order.', 409);
  }

  await confirmPayment(reference, String(transaction.id), transaction.amount, transaction.currency);
  return { status: 'paid', reference };
}

async function handleCheckout(request: Request, parsed: unknown, headers: HeadersInit) {
  const authorization = request.headers.get('authorization') || '';
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return jsonResponse({ error: 'Authentication is required.' }, 401, headers);

  const supabaseUrl = requiredEnv('SUPABASE_URL');
  const supabaseAnonKey = requiredEnv('SUPABASE_ANON_KEY');
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(tokenMatch[1]);
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Authentication token is invalid or expired.' }, 401, headers);
  }

  const admin = getSupabaseAdmin();
  if (isRecord(parsed) && parsed.action === 'verify') {
    if (typeof parsed.reference !== 'string') {
      throw new HttpError('Payment reference is required.', 400);
    }
    return jsonResponse(
      await handlePaystackVerification(admin, userData.user.id, parsed.reference),
      200,
      headers
    );
  }

  if (!userData.user.email) {
    throw new HttpError('Your account needs an email address before checkout.', 422);
  }
  const checkout = validateCheckoutRequest(parsed);
  const { data: orders, error: orderError } = await admin.rpc(
    'create_marketplace_checkout_order',
    {
      p_customer_id: userData.user.id,
      p_items: checkout.items,
      p_payment_method: 'Paystack',
      p_idempotency_key: checkout.idempotency_key
    }
  );
  if (orderError) throw orderError;
  if (!Array.isArray(orders) || orders.length !== 1) {
    throw new Error('Database did not create or retrieve the checkout order.');
  }

  const order = orders[0] as CheckoutOrder;
  if (order.payment_status === 'paid') {
    return jsonResponse({
      status: 'paid',
      reference: order.transaction_ref,
      order_number: order.order_number
    }, 200, headers);
  }
  if (order.authorization_url) {
    return jsonResponse({
      status: 'pending',
      reference: order.transaction_ref,
      order_number: order.order_number,
      payment_url: order.authorization_url
    }, 202, headers);
  }

  const amount = Math.round(Number(order.total) * 100);
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new HttpError('The calculated payment amount is invalid.', 409);
  }

  const appOrigin = new URL(requiredEnv('APP_ORIGIN'));
  if (appOrigin.protocol !== 'https:' || appOrigin.username || appOrigin.password
    || appOrigin.pathname !== '/' || appOrigin.search || appOrigin.hash) {
    throw new HttpError('APP_ORIGIN must be an HTTPS origin without a path.', 503);
  }

  const paystackResponse = await fetch(`${PAYSTACK_API_URL}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requiredEnv('PAYSTACK_SECRET_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: userData.user.email,
      amount,
      currency: 'GHS',
      reference: order.transaction_ref,
      channels: ['mobile_money'],
      callback_url: appOrigin.origin,
      metadata: {
        order_id: order.order_id,
        order_number: order.order_number,
        idempotency_key: checkout.idempotency_key
      }
    }),
    signal: AbortSignal.timeout(15_000)
  });
  if (!paystackResponse.ok) {
    console.error('Paystack initialization failed with HTTP status', paystackResponse.status);
    throw new HttpError('Paystack could not start the transaction.', 502);
  }

  const paystackResult: unknown = await paystackResponse.json();
  if (!isRecord(paystackResult) || paystackResult.status !== true || !isRecord(paystackResult.data)
    || paystackResult.data.reference !== order.transaction_ref
    || typeof paystackResult.data.authorization_url !== 'string') {
    console.error('Paystack returned an invalid initialization response.');
    throw new HttpError('Paystack returned an invalid transaction response.', 502);
  }

  const checkoutUrl = new URL(paystackResult.data.authorization_url);
  if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== PAYSTACK_CHECKOUT_HOST) {
    throw new HttpError('Paystack returned an untrusted checkout URL.', 502);
  }

  const { data: savedPayment, error: updateError } = await admin
    .from('marketplace_order_payments')
    .update({ authorization_url: checkoutUrl.toString() })
    .eq('transaction_ref', order.transaction_ref)
    .eq('customer_id', userData.user.id)
    .eq('payment_status', 'pending')
    .select('id')
    .maybeSingle();
  if (updateError) throw updateError;
  if (!savedPayment) throw new Error('Could not persist the Paystack checkout reference.');

  return jsonResponse({
    status: 'pending',
    reference: order.transaction_ref,
    order_number: order.order_number,
    payment_url: checkoutUrl.toString()
  }, 202, headers);
}

Deno.serve(async request => {
  let headers: HeadersInit;
  try {
    headers = corsHeaders(request);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 403;
    const message = error instanceof Error ? error.message : 'Request origin is not allowed.';
    return jsonResponse({ error: message }, status);
  }

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, headers);
  }
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json.' }, 415, headers);
  }

  try {
    const isPaystackWebhook = request.headers.has('x-paystack-signature');
    const { raw, value } = await readJsonBody(
      request,
      isPaystackWebhook ? MAX_WEBHOOK_BODY_BYTES : MAX_CHECKOUT_BODY_BYTES
    );
    if (isPaystackWebhook) return await handlePaystackWebhook(request, raw, value);
    return await handleCheckout(request, value, headers);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Checkout could not be completed.';
    console.error('Marketplace checkout request failed:', message);
    return jsonResponse({
      error: status >= 500 ? 'Checkout could not be completed. Please try again or contact support.' : message
    }, status, headers);
  }
});
