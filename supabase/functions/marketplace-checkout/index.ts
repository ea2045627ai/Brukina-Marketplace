import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_CHECKOUT_BODY_BYTES = 16 * 1024;
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;
const SUPPORTED_NETWORKS = new Set(['MTN', 'Telecel', 'AT']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE_PATTERN = /^(?:\+233|0)\d{9}$/;

type CheckoutItem = {
  inventory_id: string;
  quantity: number;
};

type CheckoutRequest = {
  items: CheckoutItem[];
  payment: {
    phone_number: string;
    network_provider: string;
  };
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
};

const jsonResponse = (body: Record<string, unknown>, status: number, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });

async function readJsonBody(request: Request, maximumBytes: number): Promise<{ raw: string; value: unknown }> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Request body is required.');

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
        throw new Error('Request body is too large.');
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
    throw new Error('Request body must be valid JSON.');
  }
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Server configuration is missing ${name}.`);
  return value;
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('origin');
  const allowedOrigin = Deno.env.get('APP_ORIGIN');
  if (origin && allowedOrigin && origin !== allowedOrigin) {
    throw new Error('Request origin is not allowed.');
  }
  if (origin && !allowedOrigin) {
    throw new Error('APP_ORIGIN must be configured for browser checkout requests.');
  }
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': allowedOrigin! } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-gateway-signature, x-gateway-timestamp',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(signature));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
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

async function handleWebhook(request: Request, raw: string, parsed: unknown) {
  const timestamp = request.headers.get('x-gateway-timestamp') || '';
  const suppliedSignature = (request.headers.get('x-gateway-signature') || '').toLowerCase();
  const timestampSeconds = Number(timestamp);
  if (!/^\d{10}$/.test(timestamp) || !Number.isSafeInteger(timestampSeconds)
    || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) {
    return jsonResponse({ error: 'Invalid or expired webhook timestamp.' }, 401);
  }

  const expectedSignature = await hmacHex(
    requiredEnv('PAYMENT_GATEWAY_WEBHOOK_SECRET'),
    `${timestamp}.${raw}`
  );
  if (!/^[0-9a-f]{64}$/.test(suppliedSignature)
    || !constantTimeEqual(expectedSignature, suppliedSignature)) {
    return jsonResponse({ error: 'Invalid webhook signature.' }, 401);
  }

  if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.metadata)) {
    return jsonResponse({ error: 'Invalid payment event metadata.' }, 400);
  }

  const event = parsed.event;
  const metadata = parsed.data;
  if (event !== 'payment.succeeded' || metadata.status !== 'paid') {
    return jsonResponse({ received: true, ignored: true }, 200);
  }

  const reference = metadata.reference;
  const providerReference = metadata.provider_reference;
  const amount = Number(metadata.amount);
  const currency = metadata.currency;
  const orderId = metadata.metadata.order_id;
  if (typeof reference !== 'string' || typeof providerReference !== 'string'
    || !Number.isFinite(amount) || typeof currency !== 'string'
    || typeof orderId !== 'string' || !UUID_PATTERN.test(orderId)) {
    return jsonResponse({ error: 'Payment event is missing required metadata.' }, 400);
  }

  const admin = getSupabaseAdmin();
  const { data: payment, error: paymentError } = await admin
    .from('marketplace_order_payments')
    .select('order_id, amount, currency')
    .eq('transaction_ref', reference)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment || payment.order_id !== orderId) {
    return jsonResponse({ error: 'Payment reference metadata does not match an order.' }, 404);
  }
  if (Number(payment.amount) !== amount || payment.currency !== currency) {
    return jsonResponse({ error: 'Payment amount or currency does not match the order.' }, 409);
  }

  const { data: confirmation, error: confirmationError } = await admin.rpc(
    'confirm_marketplace_payment',
    {
      p_transaction_ref: reference,
      p_provider_reference: providerReference,
      p_amount: amount,
      p_currency: currency
    }
  );
  if (confirmationError) throw confirmationError;
  if (!Array.isArray(confirmation) || confirmation.length !== 1
    || confirmation[0].payment_status !== 'paid') {
    throw new Error('Database did not confirm the payment ledger update.');
  }

  return jsonResponse({ received: true, payment_status: 'paid' }, 200);
}

function validateCheckoutRequest(value: unknown): CheckoutRequest {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length < 1
    || value.items.length > 50 || !isRecord(value.payment)) {
    throw new Error('Checkout request has an invalid shape.');
  }

  const idempotencyKey = value.idempotency_key;
  const phoneNumber = value.payment.phone_number;
  const networkProvider = value.payment.network_provider;
  if (typeof idempotencyKey !== 'string' || !UUID_PATTERN.test(idempotencyKey)) {
    throw new Error('A valid idempotency key is required.');
  }
  if (typeof phoneNumber !== 'string' || !PHONE_PATTERN.test(phoneNumber)) {
    throw new Error('Enter a valid Ghanaian mobile money number.');
  }
  if (typeof networkProvider !== 'string' || !SUPPORTED_NETWORKS.has(networkProvider)) {
    throw new Error('Select a supported mobile money network.');
  }

  const items = value.items.map((item): CheckoutItem => {
    if (!isRecord(item) || typeof item.inventory_id !== 'string'
      || !UUID_PATTERN.test(item.inventory_id)
      || !Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1
      || Number(item.quantity) > 100_000) {
      throw new Error('Cart contains an invalid product or quantity.');
    }
    return { inventory_id: item.inventory_id, quantity: Number(item.quantity) };
  });

  return {
    items,
    payment: { phone_number: phoneNumber, network_provider: networkProvider },
    idempotency_key: idempotencyKey
  };
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

  const checkout = validateCheckoutRequest(parsed);
  const admin = getSupabaseAdmin();
  const { data: orders, error: orderError } = await admin.rpc(
    'create_marketplace_checkout_order',
    {
      p_customer_id: userData.user.id,
      p_items: checkout.items,
      p_payment_method: checkout.payment.network_provider,
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

  const gatewayUrl = new URL(requiredEnv('PAYMENT_GATEWAY_URL'));
  if (gatewayUrl.protocol !== 'https:') {
    throw new Error('PAYMENT_GATEWAY_URL must use HTTPS.');
  }

  const gatewayBody = JSON.stringify({
    amount: Number(order.total),
    currency: 'GHS',
    reference: order.transaction_ref,
    customer: {
      id: userData.user.id,
      email: userData.user.email || null,
      phone_number: checkout.payment.phone_number
    },
    payment_method: checkout.payment.network_provider,
    metadata: {
      order_id: order.order_id,
      order_number: order.order_number,
      idempotency_key: checkout.idempotency_key
    }
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await hmacHex(
    requiredEnv('PAYMENT_GATEWAY_SIGNING_SECRET'),
    `${timestamp}.${gatewayBody}`
  );

  const gatewayResponse = await fetch(gatewayUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${requiredEnv('PAYMENT_GATEWAY_API_KEY')}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': order.transaction_ref,
      'X-Marketplace-Timestamp': timestamp,
      'X-Marketplace-Signature': signature
    },
    body: gatewayBody,
    signal: AbortSignal.timeout(15_000)
  });

  if (!gatewayResponse.ok) {
    console.error('Payment gateway initialization failed with HTTP status', gatewayResponse.status);
    return jsonResponse({ error: 'Payment provider could not start the transaction.' }, 502, headers);
  }

  const gatewayResult: unknown = await gatewayResponse.json();
  if (!isRecord(gatewayResult) || gatewayResult.status !== 'pending'
    || gatewayResult.reference !== order.transaction_ref
    || typeof gatewayResult.provider_reference !== 'string'
    || gatewayResult.provider_reference.length < 1
    || gatewayResult.provider_reference.length > 200) {
    console.error('Payment gateway returned an invalid initialization response.');
    return jsonResponse({ error: 'Payment provider returned an invalid transaction response.' }, 502, headers);
  }

  const { error: updateError } = await admin
    .from('marketplace_order_payments')
    .update({ provider_reference: gatewayResult.provider_reference })
    .eq('transaction_ref', order.transaction_ref)
    .eq('customer_id', userData.user.id)
    .eq('payment_status', 'pending');
  if (updateError) throw updateError;

  return jsonResponse({
    status: 'pending',
    reference: order.transaction_ref,
    order_number: order.order_number
  }, 202, headers);
}

Deno.serve(async request => {
  let headers: HeadersInit;
  try {
    headers = corsHeaders(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request origin is not allowed.';
    return jsonResponse({ error: message }, 403);
  }

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, headers);
  }
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json.' }, 415, headers);
  }

  try {
    const isWebhook = request.headers.has('x-gateway-signature')
      || request.headers.has('x-gateway-timestamp');
    const { raw, value } = await readJsonBody(
      request,
      isWebhook ? MAX_WEBHOOK_BODY_BYTES : MAX_CHECKOUT_BODY_BYTES
    );

    if (isWebhook) return await handleWebhook(request, raw, value);
    return await handleCheckout(request, value, headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Checkout could not be completed.';
    console.error('Marketplace checkout request failed:', message);
    const status = /configuration is missing|must be configured/.test(message) ? 503 : 400;
    return jsonResponse({ error: status === 503
      ? 'Checkout is not configured. Please contact support.'
      : message }, status, headers);
  }
});
