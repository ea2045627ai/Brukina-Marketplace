const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MOCK_REFERENCE_PATTERN = /^MOCK-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function jsonResponse(body: Record<string, unknown>, status: number, headers: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function corsHeaders(request: Request): HeadersInit {
  const allowedOrigin = Deno.env.get('APP_ORIGIN');
  const origin = request.headers.get('origin');
  if (!allowedOrigin) throw new HttpError('Staging APP_ORIGIN is not configured.', 503);
  if (origin && origin !== allowedOrigin) throw new HttpError('Request origin is not allowed.', 403);

  return {
    ...(origin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > 16 * 1024) throw new HttpError('Request body is too large.', 413);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 16 * 1024) {
    throw new HttpError('Request body is too large.', 413);
  }

  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError('Request body must be valid JSON.', 400);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError('Request body must be a JSON object.', 400);
  }
  return value as Record<string, unknown>;
}

function mockPayment(body: Record<string, unknown>): Record<string, unknown> {
  if (body.action === 'verify') {
    if (typeof body.reference !== 'string' || !MOCK_REFERENCE_PATTERN.test(body.reference)) {
      throw new HttpError('A valid mock payment reference is required.', 400);
    }
    return {
      mode: 'mock',
      status: 'pending',
      reference: body.reference,
      message: 'Mock payment is never captured or marked paid.'
    };
  }

  if (body.action !== 'checkout'
    || !Array.isArray(body.items)
    || body.items.length < 1
    || body.items.length > 50
    || typeof body.idempotency_key !== 'string'
    || !ORDER_ID_PATTERN.test(body.idempotency_key)) {
    throw new HttpError('Mock checkout request is invalid.', 400);
  }

  for (const item of body.items) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new HttpError('Mock checkout item is invalid.', 400);
    }
    const checkoutItem = item as Record<string, unknown>;
    if (typeof checkoutItem.inventory_id !== 'string'
      || !ORDER_ID_PATTERN.test(checkoutItem.inventory_id)
      || typeof checkoutItem.quantity !== 'number'
      || !Number.isSafeInteger(checkoutItem.quantity)
      || checkoutItem.quantity < 1) {
      throw new HttpError('Mock checkout item is invalid.', 400);
    }
  }

  return {
    mode: 'mock',
    status: 'pending',
    reference: `MOCK-${crypto.randomUUID()}`,
    payment_url: null,
    message: 'Staging only: no payment was initiated or recorded.'
  };
}

function mockSms(body: Record<string, unknown>): Record<string, unknown> {
  if (typeof body.order_id !== 'string' || !ORDER_ID_PATTERN.test(body.order_id)) {
    throw new HttpError('A valid order_id is required.', 400);
  }
  return {
    mode: 'mock',
    simulated: true,
    sent: false,
    message: 'Staging only: no SMS was sent.'
  };
}

Deno.serve(async request => {
  let headers: HeadersInit;
  try {
    headers = corsHeaders(request);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Staging request failed.'
    }, status, {});
  }

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, headers);
  }
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json.' }, 415, headers);
  }

  try {
    const body = await readJson(request);
    if (body.action === 'sms') {
      return jsonResponse(mockSms(body), 200, headers);
    }
    return jsonResponse(mockPayment(body), 200, headers);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Staging request failed.'
    }, status, headers);
  }
});
