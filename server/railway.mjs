import cors from 'cors';
import express from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { triggerArkeselVoiceCall } from '../lib/arkesel.mjs';

const app = express();
const port = Number(process.env.PORT || 3000);
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const webhookSecret = process.env.RAILWAY_WEBHOOK_SECRET;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.text({ limit: '100kb', type: ['text/*', 'application/*+json'] }));
app.use(express.static('.'));

function parsePayload(body) {
  if (typeof body === 'string') return JSON.parse(body || '{}');
  return body || {};
}

function requireWebhookSecret(request, response) {
  if (!webhookSecret) return true;
  if (request.get('x-railway-webhook-secret') === webhookSecret) return true;
  response.status(401).json({ error: 'Webhook authentication required' });
  return false;
}

function verifyPaystackSignature(request) {
  const signature = request.get('x-paystack-signature');
  if (!signature || !process.env.PAYSTACK_SECRET_KEY || typeof request.body !== 'object' || !request.body) return false;
  const expected = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(JSON.stringify(request.body)).digest('hex');
  const supplied = Buffer.from(signature, 'utf8');
  const calculated = Buffer.from(expected, 'utf8');
  return supplied.length === calculated.length && timingSafeEqual(supplied, calculated);
}

app.get('/health', (request, response) => response.json({ ok: true, service: 'brukina-railway' }));

app.post('/api/v1/operations-webhook', async (request, response) => {
  if (!requireWebhookSecret(request, response)) return;
  try {
    const payload = parsePayload(request.body);
    const { record, type, table } = payload;
    if (!record || typeof record !== 'object' || !['dispatch_providers', 'telephony_calls'].includes(table) || !['INSERT', 'UPDATE'].includes(type)) return response.status(400).json({ error: 'Invalid operations event' });
    if (table === 'dispatch_providers' && record.is_available === false) {
      const { error } = await supabase.from('telephony_calls').insert({ call_status: 'system_alert', detected_native_language: 'English', metadata: { event: 'provider_outage', action_taken: 'fallback_to_brukina_backup' } });
      if (error) throw error;
    }
    if (table === 'telephony_calls' && type === 'INSERT') {
      console.log(`[TELEPHONY] Call queued in ${record.detected_native_language || 'unknown'} language`);
      await triggerArkeselVoiceCall(record);
    }
    return response.status(202).json({ accepted: true, table, type });
  } catch (error) {
    console.error('[OPERATIONS ERROR]', error.message);
    return response.status(400).json({ accepted: false, error: 'Invalid operations event' });
  }
});

app.post('/api/v1/supply-bridge', async (request, response) => {
  if (!requireWebhookSecret(request, response)) return;
  try {
    const payload = parsePayload(request.body);
    if (payload.table !== 'sourcing_requests' || payload.type !== 'INSERT' || !payload.record?.id) return response.status(400).json({ error: 'Invalid sourcing event' });
    const partnerUrl = process.env.SUPPLY_PARTNER_WEBHOOK_URL;
    if (partnerUrl) {
      const forwarded = await fetch(partnerUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brukina-Event': 'sourcing_request.created' }, body: JSON.stringify(payload) });
      if (!forwarded.ok) throw new Error(`Supply partner returned ${forwarded.status}`);
    }
    return response.status(202).json({ accepted: true, forwarded: Boolean(partnerUrl) });
  } catch (error) {
    return response.status(400).json({ accepted: false, error: error.message || 'Invalid sourcing event' });
  }
});

app.post('/api/v1/paystack-webhook', async (request, response) => {
  if (!verifyPaystackSignature(request)) return response.status(401).json({ error: 'Invalid Paystack signature' });
  try {
    const payload = parsePayload(request.body);
    if (payload.event !== 'charge.success' || !payload.data?.reference) return response.status(400).json({ error: 'Unsupported payment event' });
    console.log(`[PAYMENT] Verified event received: ${payload.data.reference}`);
    return response.json({ received: true });
  } catch (error) {
    return response.status(400).json({ error: 'Invalid payment event' });
  }
});

app.post('/api/v1/generate-invoice', (request, response) => {
  if (!requireWebhookSecret(request, response)) return;
  try {
    const payload = parsePayload(request.body);
    if (payload.table !== 'marketplace_orders' || payload.record?.order_status !== 'paid') return response.status(400).json({ error: 'A paid marketplace order is required' });
    return response.status(202).json({ accepted: true, invoice_complete: false, message: 'Invoice generation queued for implementation' });
  } catch {
    return response.status(400).json({ error: 'Invalid invoice event' });
  }
});

app.listen(port, '0.0.0.0', () => console.log(`[RAILWAY SERVER ACTIVE] Port ${port}`));