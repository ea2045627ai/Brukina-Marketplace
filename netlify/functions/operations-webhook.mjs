const allowedTables = new Set(['dispatch_providers', 'telephony_calls']);
const allowedTypes = new Set(['UPDATE', 'INSERT']);

export default async function handler(request) {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { Allow: 'POST', 'Content-Type': 'application/json' } });
  try {
    const event = await request.json();
    if (!allowedTables.has(event.table) || !allowedTypes.has(event.type) || !event.record || typeof event.record !== 'object') throw new Error('Invalid operations event');
    if (event.table === 'dispatch_providers' && (!event.record.provider_name || typeof event.record.is_available !== 'boolean')) throw new Error('dispatch_providers requires provider_name and boolean is_available');
    if (event.table === 'telephony_calls' && (!event.record.detected_native_language || !event.record.call_status)) throw new Error('telephony_calls requires detected_native_language and call_status');
    return new Response(JSON.stringify({ accepted: true, table: event.table, type: event.type, message: 'Event validated. Connect a trusted Supabase or telephony worker to process it.' }), { status: 202, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ accepted: false, error: error.message || 'Invalid request' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}
