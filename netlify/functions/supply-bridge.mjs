const allowedTypes = new Set(['INSERT']);

export default async function handler(request) {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { Allow: 'POST', 'Content-Type': 'application/json' } });
  try {
    const event = await request.json();
    if (event.table !== 'sourcing_requests' || !allowedTypes.has(event.type) || !event.record || typeof event.record !== 'object') throw new Error('Invalid sourcing event');
    const partnerUrl = process.env.SUPPLY_PARTNER_WEBHOOK_URL;
    if (partnerUrl) {
      const forwarded = await fetch(partnerUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brukina-Event': 'sourcing_request.created' }, body: JSON.stringify(event) });
      if (!forwarded.ok) throw new Error(`Supply partner returned ${forwarded.status}`);
    }
    return new Response(JSON.stringify({ accepted: true, forwarded: Boolean(partnerUrl), table: event.table, type: event.type }), { status: 202, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ accepted: false, error: error.message || 'Invalid sourcing event' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}
