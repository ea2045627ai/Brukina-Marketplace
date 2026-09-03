import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const netlifyConfig = readFileSync(resolve(root, 'netlify.toml'), 'utf8');
const connected = process.env.NETLIFY === 'true' || Boolean(process.env.NETLIFY_SITE_ID);

if (!netlifyConfig.includes('command = "npm run check"')) {
  throw new Error('Netlify build command must run npm run check');
}
if (!netlifyConfig.includes('functions = "netlify/functions"')) {
  throw new Error('Netlify functions directory is not configured');
}
for (const functionFile of ['supply-bridge.mjs', 'create-order.mjs']) {
  if (!existsSync(resolve(root, `netlify/functions/${functionFile}`))) {
    throw new Error(`Netlify function is missing: ${functionFile}`);
  }
}

if (!connected) {
  console.log('Netlify check pending: connect this repository to Netlify, then run npm run check again.');
  process.exit(0);
}

if (process.env.CONTEXT && !['deploy-preview', 'branch-deploy', 'production', 'dev'].includes(process.env.CONTEXT)) {
  throw new Error(`Unsupported Netlify deploy context: ${process.env.CONTEXT}`);
}

const missingServerConfig = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter(name => !process.env[name]);
if (missingServerConfig.length) {
  throw new Error(`Connected Netlify deployment is missing: ${missingServerConfig.join(', ')}`);
}

console.log(`Netlify configuration check passed${process.env.CONTEXT ? ` for ${process.env.CONTEXT}` : ''}.`);
const partnerWebhookUrl = process.env.SUPPLY_PARTNER_WEBHOOK_URL;
if (!partnerWebhookUrl) {
  console.log('Netlify action pending: set SUPPLY_PARTNER_WEBHOOK_URL only when a verified supply partner endpoint is ready.');
} else {
  let parsedUrl;
  try {
    parsedUrl = new URL(partnerWebhookUrl);
  } catch {
    throw new Error('SUPPLY_PARTNER_WEBHOOK_URL must be a valid HTTPS URL');
  }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
    throw new Error('SUPPLY_PARTNER_WEBHOOK_URL must be an HTTPS URL without embedded credentials');
  }
  console.log('Supply partner webhook configuration passed.');
}