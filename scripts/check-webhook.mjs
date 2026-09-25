import { spawn } from 'node:child_process';

// FIXED: Pass standard process streams forward so any startup syntax/import errors print to the console
const server = spawn(process.execPath, ['server/operations-webhook.mjs'], { stdio: 'inherit' });
const baseUrl = 'http://127.0.0.1:8888';

// Safe programmatic cleanup utility to avoid orphaned zombie container threads
function cleanup() {
  try {
    server.kill('SIGTERM');
  } catch {
    // Suppress secondary cleanup exceptions safely
  }
}

// FIXED: Added an exponential polling mechanism to securely wait until the server socket is fully ready
async function waitForServerReady(url, maxRetries = 5, initialDelay = 100) {
  let delay = initialDelay;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (err) {
      // Catch network connection errors and continue polling securely
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay *= 2; // Progressively back off to accommodate slow runner environments
  }
  throw new Error('Server socket failed to respond within target boot allocation window.');
}

try {
  // Gracefully verify socket readiness prior to injecting event records
  await waitForServerReady(`${baseUrl}/health`);

  const response = await fetch(`${baseUrl}/api/v1/operations-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table: 'telephony_calls',
      type: 'INSERT',
      record: { 
        detected_native_language: 'Twi', 
        call_status: 'queued' 
      }
    })
  });

  if (response.status !== 202) {
    throw new Error(`Webhook check returned unexpected status code: ${response.status}`);
  }

  console.log('✅ Operations integration testing loop completed with normal parameters.');
} catch (error) {
  console.error('🔴 Integration validation failed:', error.message);
  process.exitCode = 1; // Mark step as a failure in your GitHub Actions / Railway execution logs
} finally {
  cleanup();
}
