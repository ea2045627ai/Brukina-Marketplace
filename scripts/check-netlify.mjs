import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// FIXED: Evaluated the root path directory using universally safe URL path resolution parameters
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

const netlifyConfigPath = resolve(root, 'netlify.toml');
if (!existsSync(netlifyConfigPath)) {
  throw new Error('🔴 Structural Validation Failure: netlify.toml is missing from your project root.');
}

const netlifyConfig = readFileSync(netlifyConfigPath, 'utf8');
const connected = process.env.NETLIFY === 'true' || Boolean(process.env.NETLIFY_SITE_ID);

// Verify building command sequences
if (!netlifyConfig.includes('command = "npm run check"')) {
  throw new Error('🔴 Configuration Mismatch: Netlify build command configuration in netlify.toml must run: npm run check');
}
if (!netlifyConfig.includes('functions = "netlify/functions"')) {
  throw new Error('🔴 Configuration Mismatch: Netlify configuration file must define functions target as: netlify/functions');
}

// Ensure serverless cloud functions are in place
for (const functionFile of ['supply-bridge.mjs', 'create-order.mjs']) {
  const functionPath = resolve(root, `netlify/functions/${functionFile}`);
  if (!existsSync(functionPath)) {
    throw new Error(`🔴 Structural Validation Failure: Netlify serverless function is missing: netlify/functions/${functionFile}`);
  }
}

if (!connected) {
  console.log('⚠️ Netlify check pending: Connect this repository to Netlify, then run npm run check again.');
  process.exit(0);
}

// Validate deploy lifecycle contextual tags
if (process.env.CONTEXT && !['deploy-preview', 'branch-deploy', 'production', 'dev'].includes(process.env.CONTEXT)) {
  throw new Error(`🔴 Runtime Error: Unsupported Netlify deploy context parameter: ${process.env.CONTEXT}`);
}

// Evaluate environment payload credentials
const missingServerConfig = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter(name => !process.env[name]);
if (missingServerConfig.length) {
  throw new Error(`🔴 Security Error: Connected Netlify environment is missing target secrets: ${missingServerConfig.join(', ')}`);
}

console.log(`✅ Netlify configuration check passed${process.env.CONTEXT ? ` for \${process.env.CONTEXT}` : ''}.`);

const partnerWebhookUrl = process.env.SUPPLY_PARTNER_WEBHOOK_URL;
if (!partnerWebhookUrl) {
  console.log('ℹ️ Netlify action pending: Set SUPPLY_PARTNER_WEBHOOK_URL only when a verified supply partner endpoint is ready.');
} else {
  let parsedUrl;
  try {
    parsedUrl = new URL(partnerWebhookUrl);
  } catch {
    throw new Error('🔴 Validation Failure: SUPPLY_PARTNER_WEBHOOK_URL must be a valid formatting URL string.');
  }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
    throw new Error('🔴 Validation Failure: SUPPLY_PARTNER_WEBHOOK_URL must be an explicit HTTPS endpoint without embedded user credentials.');
  }
  console.log('✅ Supply partner webhook configuration parameters verified successfully.');
}
