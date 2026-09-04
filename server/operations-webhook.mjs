import { appendFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { triggerArkeselVoiceCall } from '../lib/arkesel.mjs';

const port = Number(process.env.PORT || 8888);
const eventsFile = resolve(dirname(fileURLToPath(import.meta.url)), '../.data/operations-events.ndjson');
const allowedTables = new Set(['dispatch_providers', 'telephony_calls']);
const allowedTypes = new Set(['UPDATE', 'INSERT']);

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  if (raw.length > 100_000) throw new Error('Request body is too large');
  return JSON.parse(raw || '{}');
}

function validateEvent(event) {
  if (!allowedTables.has(event.table)) throw new Error('Unsupported table');
  if (!allowedTypes.has(event.type)) throw new Error('Unsupported event type');
  if (!event.record || typeof event.record !== 'object' || Array.isArray(event.record)) throw new Error('record must be an object');
  if (event.table === 'dispatch_providers' && (!event.record.provider_name || typeof event.record.is_available !== 'boolean')) throw new Error('dispatch_providers requires provider_name and boolean is_available');
  if (event.table === 'telephony_calls' && (!event.record.detected_native_language || !event.record.call_status)) throw new Error('telephony_calls requires detected_native_language and call_status');
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') return send(response, 200, { ok: true, service: 'operations-webhook' });
  if (request.method !== 'POST' || request.url !== '/api/v1/operations-webhook') return send(response, 404, { error: 'Not found' });
  try {
    const event = await readJson(request);
    validateEvent(event);
    if (event.table === 'telephony_calls' && event.type === 'INSERT') await triggerArkeselVoiceCall(event.record);
    const stored = { received_at: new Date().toISOString(), ...event };
    await mkdir(dirname(eventsFile), { recursive: true });
    await appendFile(eventsFile, `${JSON.stringify(stored)}\n`);
    return send(response, 202, { accepted: true, table: event.table, type: event.type });
  } catch (error) {
    return send(response, 400, { accepted: false, error: error.message || 'Invalid request' });
  }
});

server.listen(port, '127.0.0.1', () => console.log(`Operations webhook listening on http://localhost:${port}`));
