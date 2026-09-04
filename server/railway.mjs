import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { triggerArkeselVoiceCall } from '../lib/arkesel.mjs';

const app = express();
const port = Number(process.env.PORT || 3000);
const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const staticRoot = path.join(projectRoot, 'dist');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const webhookSecret = process.env.WEBHOOK_SECRET || process.env.RAILWAY_WEBHOOK_SECRET;

const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.text({ limit: '100kb', type: ['text/*', 'application/*+json'] }));
app.use(express.static(staticRoot));

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

app.post('/api/v1/orders', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Supabase server configuration is required' });
  const token = request.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return response.status(401).json({ error: 'Authentication required' });
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return response.status(401).json({ error: 'Authentication required' });
    const inventoryId = request.body?.inventory_id;
    const quantity = Number(request.body?.quantity);
    const idempotencyKey = request.get('idempotency-key') || request.body?.idempotency_key || randomUUID();
    if (idempotencyKey.length > 100) return response.status(400).json({ error: 'The idempotency key is too long' });
    if (!inventoryId || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return response.status(400).json({ error: 'A valid inventory item and quantity are required' });
    const { data: replayOrder, error: replayError } = await supabase.from('orders').select('id, order_number, status').eq('customer_id', userData.user.id).eq('idempotency_key', idempotencyKey).maybeSingle();
    if (replayError) throw replayError;
    if (replayOrder) return response.json({ accepted: true, replayed: true, order_id: replayOrder.id, order_number: replayOrder.order_number, status: replayOrder.status });
    const { data: item, error: inventoryError } = await supabase.from('marketplace_inventory').select('id, vendor_id, price, stock_quantity, minimum_order_quantity').eq('id', inventoryId).eq('active', true).single();
    if (inventoryError || !item) return response.status(409).json({ error: 'Inventory item is no longer available' });
    if (quantity < item.minimum_order_quantity || quantity > item.stock_quantity) return response.status(400).json({ error: 'Quantity is outside the available stock limits' });
    const orderNumber = `BK-${Date.now().toString(36).toUpperCase()}`;
    const { data: order, error: orderError } = await supabase.from('orders').insert({ order_number: orderNumber, customer_id: userData.user.id, vendor_id: item.vendor_id, idempotency_key: idempotencyKey, total: Number(item.price) * quantity, status: 'pending' }).select('id, order_number').single();
    if (orderError) throw orderError;
    const { error: itemError } = await supabase.from('order_items').insert({ order_id: order.id, inventory_id: item.id, quantity, unit_price: item.price });
    if (itemError) throw itemError;
    const { data: reservedItem, error: stockError } = await supabase.from('marketplace_inventory').update({ stock_quantity: item.stock_quantity - quantity }).eq('id', item.id).eq('stock_quantity', item.stock_quantity).select('id').maybeSingle();
    if (stockError) throw stockError;
    if (!reservedItem) return response.status(409).json({ error: 'Inventory could not be reserved' });
    return response.status(201).json({ accepted: true, order_id: order.id, order_number: order.order_number });
  } catch (error) {
    return response.status(500).json({ error: error.message || 'Order could not be created' });
  }
});

app.post('/api/v1/couriers/location', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Supabase server configuration is required' });
  const token = request.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return response.status(401).json({ error: 'Authentication required' });
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const latitude = Number(request.body?.latitude);
    const longitude = Number(request.body?.longitude);
    if (userError || !userData.user) return response.status(401).json({ error: 'Authentication required' });
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return response.status(400).json({ error: 'Valid latitude and longitude are required' });
    const { error } = await supabase.from('local_couriers').update({ current_lat: latitude, current_lng: longitude, is_online: true }).eq('user_id', userData.user.id);
    if (error) throw error;
    return response.json({ updated: true });
  } catch (error) {
    return response.status(500).json({ error: error.message || 'Courier location could not be saved' });
  }
});

app.post('/api/v1/operations-webhook', async (request, response) => {
  if (!requireWebhookSecret(request, response)) return;
  if (!supabase) return response.status(503).json({ error: 'Supabase server configuration is required' });
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
    const partnerUrl = process.env.SKILLBRIDGE_WEBHOOK_URL || process.env.SUPPLY_PARTNER_WEBHOOK_URL;
    if (partnerUrl) {
      const parsedUrl = new URL(partnerUrl);
      if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) throw new Error('SkillBridge endpoint must be an HTTPS URL without embedded credentials');
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
    if (!supabase) return response.status(503).json({ error: 'Supabase server configuration is required' });
    if (payload.event !== 'charge.success' || !payload.data?.reference) return response.status(400).json({ error: 'Unsupported payment event' });
    const providerEventId = String(payload.data.id || payload.data.reference);
    const { data: existingEvent, error: lookupError } = await supabase.from('payment_events').select('id, reference').eq('provider', 'paystack').eq('provider_event_id', providerEventId).maybeSingle();
    if (lookupError) throw lookupError;
    if (existingEvent) return response.json({ received: true, duplicate: true, reference: existingEvent.reference });
    const { error: insertError } = await supabase.from('payment_events').insert({ provider: 'paystack', provider_event_id: providerEventId, event_type: payload.event, reference: payload.data.reference, amount: Number(payload.data.amount || 0) / 100, currency: payload.data.currency || 'GHS', payload });
    if (insertError) {
      if (insertError.code === '23505') return response.json({ received: true, duplicate: true, reference: payload.data.reference });
      throw insertError;
    }
    console.log(`[PAYMENT] Verified event recorded: ${payload.data.reference}`);
    return response.status(202).json({ received: true, duplicate: false, reference: payload.data.reference });
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

// Serve the SPA shell for direct browser visits to client-side routes.
app.get(/^\/(?!api(?:\/|$)|health(?:\/|$)).*/, (request, response) => {
  response.sendFile(path.join(staticRoot, 'index.html'));
});

app.listen(port, '0.0.0.0', () => console.log(`[RAILWAY SERVER ACTIVE] Port ${port}`));