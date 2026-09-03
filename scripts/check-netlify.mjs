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
if (!existsSync(resolve(root, 'netlify/functions/supply-bridge.mjs'))) {
  throw new Error('Netlify supply bridge function is missing');
}

if (!connected) {
  console.log('Netlify check pending: connect this repository to Netlify, then run npm run check again.');
  process.exit(0);
}

if (process.env.CONTEXT && !['deploy-preview', 'branch-deploy', 'production', 'dev'].includes(process.env.CONTEXT)) {
  throw new Error(`Unsupported Netlify deploy context: ${process.env.CONTEXT}`);
}

console.log(`Netlify configuration check passed${process.env.CONTEXT ? ` for ${process.env.CONTEXT}` : ''}.`);
if (!process.env.SUPPLY_PARTNER_WEBHOOK_URL) {
  console.log('Netlify action pending: set SUPPLY_PARTNER_WEBHOOK_URL only when a verified supply partner endpoint is ready.');
}