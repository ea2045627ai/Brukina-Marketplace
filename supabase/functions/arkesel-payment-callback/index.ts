import { createClient } from 'npm:@supabase/supabase-js@2';
import { notifyOrderBySms } from '../_shared/notify-order-sms.ts';

const MAX_BODY_BYTES = 64 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const PHONE_PATTERN = /^(?:\+?[1-9]\d{7,14}|0\d{9})$/;

type ArkeselWebhook = {
  transaction_id: string;
  status: 'success' | 'failed';
  amount: number;
  reference: string;
  customer_phone?: string;
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
  const allowedOrigin = Deno.env.get('APP_ORIGIN');
  if (origin && (!allowedOrigin || origin !== allowedOrigin)) {
    throw new HttpError('Request origin is not allowed.', 403);
  }

  return {
    ...(origin && allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Access-Control-Allow-Headers': 'content-type, x-arkesel-signature',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

async function readRawBody(request: Request): Promise<string> {
  if (!request.body) throw new HttpError('Request body is required.', 400);
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let rawBody = '';
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError('Webhook body is too large.', 413);
      }
      rawBody += decoder.decode(value, { stream: true });
    }
    return rawBody + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message)
  );
  return bytesToHex(new Uint8Array(signature));
}

function constantTimeHexEqual(expected: string, supplied: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(expected) || !/^[0-9a-f]{64}$/i.test(supplied)) {
    return false;
  }
  const normalizedExpected = expected.toLowerCase();
  const normalizedSupplied = supplied.toLowerCase();
  let difference = 0;
  for (let index = 0; index < normalizedExpected.length; index += 1) {
    difference |= normalizedExpected.charCodeAt(index) ^ normalizedSupplied.charCodeAt(index);
  }
  return difference === 0;
}

function parseWebhook(rawBody: string): ArkeselWebhook {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    throw new HttpError('Webhook body must be valid JSON.', 400);
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new HttpError('Webhook payload must be a JSON object.', 400);
  }

  const value = payload as Record<string, unknown>;
  if (typeof value.transaction_id !== 'string'
    || !TRANSACTION_ID_PATTERN.test(value.transaction_id)
    || (value.status !== 'success' && value.status !== 'failed')
    || typeof value.amount !== 'number'
    || !Number.isFinite(value.amount)
    || value.amount <= 0
    || value.amount > 9_999_999_999.99
    || Math.round(value.amount * 100) / 100 !== value.amount
    || typeof value.reference !== 'string'
    || !UUID_PATTERN.test(value.reference)) {
    throw new HttpError('Webhook payload does not match the required transaction schema.', 400);
  }

  if (value.customer_phone !== undefined
    && (typeof value.customer_phone !== 'string' || !PHONE_PATTERN.test(value.customer_phone))) {
    throw new HttpError('Webhook customer phone is invalid.', 400);
  }

  return {
    transaction_id: value.transaction_id,
    status: value.status,
    amount: value.amount,
    reference: value.reference,
    ...(typeof value.customer_phone === 'string' ? { customer_phone: value.customer_phone } : {})
  };
}

function getSupabaseAdmin() {
  return createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function processCallback(payload: ArkeselWebhook): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: payment, error: paymentError } = await supabase
    .from('marketplace_order_payments')
    .select('order_id, transaction_ref, amount, currency, payment_status, payment_method, provider_reference')
    .eq('order_id', payload.reference)
    .maybeSingle();

  if (paymentError) throw paymentError;
  if (!payment || payment.payment_method !== 'Arkesel') {
    throw new HttpError('No Arkesel payment matches the supplied order reference.', 404);
  }
  if (Number(payment.amount) !== payload.amount || payment.currency !== 'GHS') {
    throw new HttpError('Webhook amount or currency does not match the payment ledger.', 409);
  }
  if (payment.provider_reference && payment.provider_reference !== payload.transaction_id) {
    throw new HttpError('Arkesel transaction ID does not match the payment ledger.', 409);
  }

  const rpcName = payload.status === 'success'
    ? 'confirm_marketplace_payment'
    : 'fail_marketplace_payment';
  const rpcArgs = payload.status === 'success'
    ? {
      p_transaction_ref: payment.transaction_ref,
      p_provider_reference: payload.transaction_id,
      p_amount: payload.amount,
      p_currency: payment.currency
    }
    : {
      p_order_id: payload.reference,
      p_provider_reference: payload.transaction_id,
      p_amount: payload.amount,
      p_currency: payment.currency
    };

  const { data: result, error: updateError } = await supabase.rpc(rpcName, rpcArgs);
  if (updateError) throw updateError;
  if (!Array.isArray(result) || result.length !== 1
    || result[0].order_id !== payload.reference
    || result[0].payment_status !== payload.status.replace('success', 'paid')) {
    throw new Error('Database did not confirm the requested payment state transition.');
  }
}

Deno.serve(async request => {
  let headers: HeadersInit;
  try {
    headers = getCorsHeaders(request);
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
    const rawBody = await readRawBody(request);
    const suppliedSignature = request.headers.get('x-arkesel-signature') || '';
    const expectedSignature = await hmacSha256Hex(
      requiredEnv('ARKESEL_WEBHOOK_SECRET'),
      rawBody
    );
    if (!constantTimeHexEqual(expectedSignature, suppliedSignature)) {
      return jsonResponse({ error: 'Invalid Arkesel webhook signature.' }, 401, headers);
    }

    const payload = parseWebhook(rawBody);
    await processCallback(payload);
    if (payload.status === 'success') {
      await notifyOrderBySms(payload.reference);
    }
    return jsonResponse({ received: true, processed: payload.status }, 200, headers);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Webhook processing failed.';
    console.error('Arkesel callback failed:', message);
    return jsonResponse({
      error: status >= 500 ? 'Webhook processing failed. Retry later.' : message
    }, status, headers);
  }
});
