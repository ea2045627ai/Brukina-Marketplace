import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const netlifyConfig = resolve(root, 'netlify.toml');
const functionsDirectory = resolve(root, 'netlify/functions');

if (!existsSync(netlifyConfig)) throw new Error('Missing netlify.toml');
if (!existsSync(functionsDirectory)) throw new Error('Missing netlify/functions directory');

const config = readFileSync(netlifyConfig, 'utf8');
for (const required of ['publish = "."', 'command = "npm run check"', 'functions = "netlify/functions"']) {
  if (!config.includes(required)) throw new Error(`Netlify configuration is missing: ${required}`);
}

const siteUrl = process.env.NETLIFY_SITE_URL?.replace(/\/$/, '');
if (!siteUrl) {
  console.log('Netlify configuration check passed');
  console.log('PENDING: set NETLIFY_SITE_URL to the connected site URL to run the remote health check.');
  process.exit(0);
}

let url;
try {
  url = new URL('/.netlify/functions/operations-webhook', siteUrl);
} catch {
  throw new Error('NETLIFY_SITE_URL must be a valid absolute URL');
}

const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ table: 'telephony_calls', type: 'INSERT', record: { detected_native_language: 'Twi', call_status: 'queued' } })
});

if (response.status !== 202) throw new Error(`Netlify operations webhook returned ${response.status}`);
console.log(`Netlify remote health check passed: ${url}`);