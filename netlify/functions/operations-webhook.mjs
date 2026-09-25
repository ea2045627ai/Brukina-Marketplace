import { triggerArkeselVoiceCall } from '../../lib/arkesel.mjs';

const allowedTables = new Set(['dispatch_providers', 'telephony_calls']);
const allowedTypes = new Set(['UPDATE', 'INSERT']);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || process.env.RAILWAY_WEBHOOK_SECRET;

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405, 
      headers: { Allow: 'POST', 'Content-Type': 'application/json' } 
    });
  }

  try {
    // SECURITY GUARD: Enforce explicit webhook signature handshakes to protect API token credits
    if (WEBHOOK_SECRET) {
      const incomingSecret = request.headers.get('x-railway-webhook-secret') || request.headers.get('x-webhook-secret');
      if (incomingSecret !== WEBHOOK_SECRET) {
        return new Response(JSON.stringify({ error: 'Unauthorized webhook access denied.' }), { 
          status: 401, 
          headers: { 'Content-Type': 'application/json' } 
        });
      }
    }

    const event = await request.json();
    
    // Evaluate operational format payloads cleanly
    if (!allowedTables.has(event.table) || !allowedTypes.has(event.type) || !event.record || typeof event.record !== 'object') {
      throw new Error('Invalid operations event structure');
    }
    
    if (event.table === 'dispatch_providers' && (!event.record.provider_name || typeof event.record.is_available !== 'boolean')) {
      throw new Error('dispatch_providers missing provider_name or explicit is_available flag');
    }
    
    if (event.table === 'telephony_calls' && (!event.record.detected_native_language || !event.record.call_status)) {
      throw new Error('telephony_calls missing detected_native_language or call_status values');
    }

    // FIXED: Formally block the serverless response loop until the network handshake fully resolves
    if (event.table === 'telephony_calls' && event.type === 'INSERT') {
      console.log(`[NETLIFY FUNCTION] Syncing voice trigger alert for record: ${event.record.id || 'unknown'}`);
      await triggerArkeselVoiceCall(event.record);
    }

    return new Response(JSON.stringify({ 
      accepted: true, 
      table: event.table, 
      type: event.type, 
      message: 'Operations event successfully processed and completed.' 
    }), { 
      status: 202, 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error('[NETLIFY OPERATIONS ERROR]', error.message);
    return new Response(JSON.stringify({ 
      accepted: false, 
      error: error.message || 'Invalid processing request parameter context' 
    }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}
