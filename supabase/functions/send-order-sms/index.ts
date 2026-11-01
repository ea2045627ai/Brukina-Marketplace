import { createClient } from 'npm:@supabase/supabase-js@2';

const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ORDER_STATUSES = new Set([
  'confirmed',
  'processing',
  'packed',
  'out_for_delivery',
  'delivered'
]);
const ARKESEL_SMS_URL = 'https://sms.arkesel.com/api/v2/sms/send';

type OrderNotificationRequest = {
  order_id: string;
};

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  headers: HeadersInit = {}
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(`Server configuration is missing ${name}.`, 503);
  return value;
}

function getCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('origin');
  const appOrigin = Deno.env.get('APP_ORIGIN');
  if (origin && (!appOrigin || origin !== appOrigin)) {
    throw new HttpError('Request origin is not allowed.', 403);
  }

  return {
    ...(origin && appOrigin ? { 'Access-Control-Allow-Origin': appOrigin } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function getSupabaseAdmin() {
  return createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function normalizeGhanaPhone(phone: string): string {
  const normalized = phone.replace(/[\s()-]/g, '');
  if (/^0\d{9}$/.test(normalized)) return `233${normalized.slice(1)}`;
  if (/^\+233\d{9}$/.test(normalized)) return normalized.slice(1);
  if (/^233\d{9}$/.test(normalized)) return normalized;
  throw new HttpError('The verified account phone number is not a valid Ghanaian number.', 422);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function authenticateUser(request: Request) {
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) throw new HttpError('Authentication is required.', 401);

  const authClient = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_ANON_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data, error } = await authClient.auth.getUser(bearer);
  if (error || !data.user) throw new HttpError('Authentication token is invalid or expired.', 401);
  return data.user;
}

async function parseRequest(request: Request): Promise<OrderNotificationRequest> {
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > 4096) throw new HttpError('Request body is too large.', 413);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError('Request body must be valid JSON.', 400);
  }
  if (!isRecord(body) || typeof body.order_id !== 'string' || !ORDER_ID_PATTERN.test(body.order_id)) {
    throw new HttpError('A valid order_id is required.', 400);
  }
  return { order_id: body.order_id };
}

async function claimNotification(
  admin: ReturnType<typeof getSupabaseAdmin>,
  orderId: string
): Promise<string> {
  const { data, error } = await admin.rpc('claim_marketplace_order_sms', {
    p_order_id: orderId
  });
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1 || typeof data[0].notification_id !== 'string') {
    throw new HttpError('An SMS notification for this order is already being processed or was sent.', 409);
  }
  return data[0].notification_id;
}

async function updateNotification(
  admin: ReturnType<typeof getSupabaseAdmin>,
  notificationId: string,
  status: 'sent' | 'failed',
  providerReference: string | null,
  errorMessage: string | null
): Promise<void> {
  const { data, error } = await admin
    .from('marketplace_order_notifications')
    .update({
      status,
      provider_reference: providerReference,
      error_message: errorMessage
    })
    .eq('id', notificationId)
    .eq('status', 'sending')
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Notification ledger state changed unexpectedly.');
}

Deno.serve(async request => {
  let cors: HeadersInit;
  try {
    cors = getCorsHeaders(request);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 403;
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Request origin is not allowed.'
    }, status);
  }

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, cors);
  }

  let notificationId: string | null = null;
  let admin: ReturnType<typeof getSupabaseAdmin> | null = null;

  try {
    const [{ order_id: orderId }, user] = await Promise.all([
      parseRequest(request),
      authenticateUser(request)
    ]);

    admin = getSupabaseAdmin();
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, order_number, customer_id, status, total')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order || order.customer_id !== user.id) {
      throw new HttpError('Order was not found for the authenticated customer.', 404);
    }
    if (!ALLOWED_ORDER_STATUSES.has(order.status)) {
      throw new HttpError('SMS notifications are only sent for confirmed, paid orders.', 409);
    }

    const { data: payment, error: paymentError } = await admin
      .from('marketplace_order_payments')
      .select('payment_status')
      .eq('order_id', orderId)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment || payment.payment_status !== 'paid') {
      throw new HttpError('Order payment has not been confirmed.', 409);
    }

    const { data: account, error: accountError } = await admin.auth.admin.getUserById(user.id);
    if (accountError) throw accountError;
    if (!account.user?.phone || !account.user.phone_confirmed_at) {
      throw new HttpError('A verified phone number is required for SMS notifications.', 422);
    }
    const recipient = normalizeGhanaPhone(account.user.phone);

    const { data: orderItems, error: itemsError } = await admin
      .from('order_items')
      .select('inventory_id, quantity')
      .eq('order_id', orderId);
    if (itemsError) throw itemsError;
    if (!orderItems?.length) throw new HttpError('Order does not contain any items.', 409);

    const inventoryIds = [...new Set(orderItems.map(item => item.inventory_id))];
    const { data: products, error: productsError } = await admin
      .from('marketplace_inventory')
      .select('id, is_wholesale, tags')
      .in('id', inventoryIds);
    if (productsError) throw productsError;
    if (!products || products.length !== inventoryIds.length) {
      throw new Error('Order catalog details are incomplete.');
    }

    const productMap = new Map(products.map(product => [product.id, product]));
    const isWholesale = orderItems.some(item => {
      const product = productMap.get(item.inventory_id);
      return product?.is_wholesale === true || product?.tags?.includes('wholesale') === true;
    });
    const orderType = isWholesale ? 'wholesale' : 'retail';
    const message = `Brukina: Your ${orderType} order ${order.order_number} is confirmed. Total: GHS ${Number(order.total).toFixed(2)}. Thank you.`;

    notificationId = await claimNotification(admin, orderId);

    const providerResponse = await fetch(ARKESEL_SMS_URL, {
      method: 'POST',
      headers: {
        'api-key': requiredEnv('ARKESEL_API_KEY'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: requiredEnv('ARKESEL_SENDER_ID'),
        message,
        recipients: [recipient]
      }),
      signal: AbortSignal.timeout(15_000)
    });

    if (!providerResponse.ok) {
      console.error('Arkesel SMS request failed with HTTP status', providerResponse.status);
      await updateNotification(admin, notificationId, 'failed', null, `Provider HTTP ${providerResponse.status}`);
      return jsonResponse({ error: 'SMS provider could not accept the notification.' }, 502, cors);
    }

    const result: unknown = await providerResponse.json();
    if (!isRecord(result) || result.status !== 'success') {
      await updateNotification(admin, notificationId, 'failed', null, 'Provider returned an unsuccessful response.');
      return jsonResponse({ error: 'SMS provider returned an unsuccessful response.' }, 502, cors);
    }

    const providerReference = typeof result.message_id === 'string'
      ? result.message_id
      : typeof result.id === 'string'
        ? result.id
        : null;
    await updateNotification(admin, notificationId, 'sent', providerReference, null);
    return jsonResponse({
      sent: true,
      order_id: orderId,
      notification_type: orderType
    }, 200, cors);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Order SMS notification failed.';
    console.error('Order SMS notification failed:', message);

    if (admin && notificationId) {
      try {
        await updateNotification(admin, notificationId, 'failed', null, 'Notification processing failed.');
      } catch (updateError) {
        console.error(
          'Could not mark SMS notification as failed:',
          updateError instanceof Error ? updateError.message : 'Unknown database error.'
        );
      }
    }

    return jsonResponse({
      error: status >= 500 ? 'Order SMS notification failed. Please retry later.' : message
    }, status, cors);
  }
});
