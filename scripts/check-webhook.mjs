import { spawn } from 'node:child_process';

const server = spawn(process.execPath, ['server/operations-webhook.mjs'], { stdio: 'ignore' });
const baseUrl = 'http://127.0.0.1:8888';

try {
  await new Promise(resolve => setTimeout(resolve, 250));
  const health = await fetch(`${baseUrl}/health`);
  if (!health.ok) throw new Error(`Health check returned ${health.status}`);
  const response = await fetch(`${baseUrl}/api/v1/operations-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: 'telephony_calls', type: 'INSERT', record: { detected_native_language: 'Twi', call_status: 'queued' } })
  });
  if (response.status !== 202) throw new Error(`Webhook check returned ${response.status}`);
  console.log('Operations webhook check passed');
} finally {
  server.kill();
}
