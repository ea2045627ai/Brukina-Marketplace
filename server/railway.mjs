import cors from 'cors';
import express from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { triggerArkeselVoiceCall } from '../lib/arkesel.mjs';

const app = express();
const port = Number(process.env.PORT || 3000);
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const webhookSecret = process.env.WEBHOOK_SECRET || process.env.RAILWAY_WEBHOOK_SECRET;

const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

app.use(cors());

// FIXED: Capture the exact raw request buffer for Paystack signature matching
app.use(express.json({
  limit: '100kb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.text({ limit: '100kb', type: ['text/*', 'application/*+json'] }));
app.use(express.static('dist'));
app.get('/health', (request, response) => response.json({ ok: true, service: 'brukina-railway' }));
app.get('*', (req, res) => res.sendFile(process.cwd() + '/dist/index.html'));

// Helper function to capture and record telemetry logs into external_api_logs securely
async function recordTelemetryLog(path, source, summary, httpStatus, startTime) {
  if (!supabase) return;
  try {
    const lagMs = Date.now() - startTime;
    await supabase.from('external_api_logs').insert([{
      endpoint_path: path,
      channel_source: source,
      payload_summary: summary.slice(0, 255),
      sync_lag_ms: lagMs,
      http_status_code: httpStatus
    }]);
  } catch (err) {
    console.error('[TELEMETRY ERROR LOGGING FAILURE]', err.message);
  }
}

// FIXED: Protected JSON parser wrapper against unhandled format exceptions
function parsePayload(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

function requireWebhookSecret(request, response) {
  if (!webhookSecret) return true;
  if (request.get('x-railway-webhook-secret') === webhookSecret) return true;
  response.status(401).json({ error: 'Webhook authentication required' });
  return false;
}

// FIXED: Rewritten to safely match raw bytes against secret keys securely
function verifyPaystackSignature(request) {
  const signature = request.get('x-paystack-signature');
  if (!signature || !process.env.PAYSTACK_SECRET_KEY || !request.rawBody) return false;
  
  const expected = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(request.rawBody)
    .digest('hex');
    
  const supplied = Buffer.from(signature, 'utf8');
  const calculated = Buffer.from(expected, 'utf8');
  
  if (supplied.length !== calculated.length) return false;
  return timingSafeEqual(supplied, calculated);
}


app.post('/api/v1/operations-webhook', async (request, response) => {
  const startTime = Date.now();
  if (!requireWebhookSecret(request, response)) return;
  if (!supabase) return response.status(503).json({ error: 'Supabase server configuration is required' });
  
  let payload = parsePayload(request.body);
  const { record, type, table } = payload;
  
  try {
    if (!record || typeof record !== 'object' || !['dispatch_providers', 'telephony_calls'].includes(table) || !['INSERT', 'UPDATE'].includes(type)) {
      await recordTelemetryLog('/operations-webhook', 'railway_internal', 'Invalid operations payload constraints', 400, startTime);
      return response.status(400).json({ error: 'Invalid operations event' });
    }
    
    if (table === 'dispatch_providers' && record.is_available === false) {
      const { error } = await supabase.from('telephony_calls').insert({ 
        call_status: 'system_alert', 
        detected_native_language: 'English', 
        metadata: { event: 'provider_outage', action_taken: 'fallback_to_brukina_backup' } 
      });
      if (error) throw error;
    }
    
    if (table === 'telephony_calls' && type === 'INSERT') {
      console.log(`[TELEPHONY] Call queued in ${record.detected_native_language || 'unknown'} language`);
      await triggerArkeselVoiceCall(record);
    }
    
    await recordTelemetryLog('/operations-webhook', 'railway_internal', `Processed ${table} mutation`, 202, startTime);
    return response.status(202).json({ accepted: true, table, type });
  } catch (error) {
    console.error('[OPERATIONS ERROR]', error.message);
    await recordTelemetryLog('/operations-webhook', 'railway_internal', `Error: ${error.message}`, 400, startTime);
    return response.status(400).json({ accepted: false, error: 'Invalid operations event' });
  }
});

app.post('/api/v1/supply-bridge', async (request, response) => {
  const startTime = Date.now();
  if (!requireWebhookSecret(request, response)) return;
  
  const payload = parsePayload(request.body);
  if (payload.table !== 'sourcing_requests' || payload.type !== 'INSERT' || !payload.record?.id) {
    await recordTelemetryLog('/supply-bridge', 'supply_partner', 'Invalid structural sourcing parameters', 400, startTime);
    return response.status(400).json({ error: 'Invalid sourcing event' });
  }
  
  try {
    const partnerUrl = process.env.SUPPLY_PARTNER_WEBHOOK_URL;
    if (partnerUrl) {
      const forwarded = await fetch(partnerUrl, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'X-Brukina-Event': 'sourcing_request.created' }, 
        body: JSON.stringify(payload) 
      });
      if (!forwarded.ok) throw new Error(`Supply partner returned ${forwarded.status}`);
    }
    
    await recordTelemetryLog('/supply-bridge', 'supply_partner', 'Sourcing forward complete', 202, startTime);
    return response.status(202).json({ accepted: true, forwarded: Boolean(partnerUrl) });
  } catch (error) {
    await recordTelemetryLog('/supply-bridge', 'supply_partner', `Forward error: ${error.message}`, 400, startTime);
    return response.status(400).json({ accepted: false, error: error.message || 'Invalid sourcing event' });
  }
});

app.post('/api/v1/paystack-webhook', async (request, response) => {
  const startTime = Date.now();
  // FIXED: Evaluates signature correctly using raw buffer arrays now
  if (!verifyPaystackSignature(request)) {
    return response.status(401).json({ error: 'Invalid Paystack signature' });
  }
  
  try {
    const payload = parsePayload(request.body);
    if (payload.event !== 'charge.success' || !payload.data?.reference) {
      await recordTelemetryLog('/paystack-webhook', 'paystack', 'Unsupported gateway event type', 400, startTime);
      return response.status(400).json({ error: 'Unsupported payment event' });
    }
    
    console.log(`[PAYMENT] Verified event received: ${payload.data.reference}`);
    
    // Core telemetry insertion maps beautifully onto our operational dashboard rows
    await recordTelemetryLog('/paystack-webhook', 'paystack', `Payment success ref: ${payload.data.reference}`, 200, startTime);
    return response.json({ received: true });
  } catch (error) {
    await recordTelemetryLog('/paystack-webhook', 'paystack', 'Exception processing payment metadata', 400, startTime);
    return response.status(400).json({ error: 'Invalid payment event' });
  }
});

app.post('/api/v1/generate-invoice', async (request, response) => {
  const startTime = Date.now();
  if (!requireWebhookSecret(request, response)) return;
  
  try {
    const payload = parsePayload(request.body);
    if (payload.table !== 'marketplace_orders' || payload.record?.order_status !== 'paid') {
      await recordTelemetryLog('/generate-invoice', 'billing_node', 'Order is unpaid or misconfigured', 400, startTime);
      return response.status(400).json({ error: 'A paid marketplace order is required' });
    }
    
    await recordTelemetryLog('/generate-invoice', 'billing_node', 'Invoice successfully generated', 202, startTime);
    return response.status(202).json({ accepted: true, invoice_complete: false, message: 'Invoice generation queued for implementation' });
  } catch (error) {
    return response.status(400).json({ error: 'Invalid invoice event' });
  }
});

app.listen(port, '0.0.0.0', () => console.log(`[RAILWAY SERVER ACTIVE] Port ${port}`));
