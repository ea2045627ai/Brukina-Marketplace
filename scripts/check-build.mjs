import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requiredFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'sw.js',
  'manifest.webmanifest',
  'icon.svg',
  'netlify.toml',
  '_headers',
  'README.md',
  'ROADMAP.md',
  '.env.example',
  'scripts/check-netlify.mjs',
  'railway.toml',
  'server/railway.mjs',
  'supabase/production.sql',
  'supabase/supply_bridge.sql',
  'netlify/functions/supply-bridge.mjs',
  'netlify/functions/create-order.mjs'
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) throw new Error(`Missing required file: ${file}`);
}

const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) throw new Error(`Duplicate HTML ids: ${[...new Set(duplicateIds)].join(', ')}`);
const localReferences = [...html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)]
  .map(match => match[1])
  .filter(reference => !reference.startsWith('http://') && !reference.startsWith('https://'));

for (const reference of localReferences) {
  if (!existsSync(resolve(root, reference))) throw new Error(`Missing local asset: ${reference}`);
}

const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.webmanifest'), 'utf8'));
if (!manifest.name || !manifest.start_url || !manifest.icons?.length) {
  throw new Error('Manifest is missing required PWA fields');
}

for (const anchor of ['product-grid', 'search-input', 'auth-form', 'dispatch-request', 'vendor-b2b-leads', 'wallet-balance', 'wallet-transactions', 'tracking-order-label', 'delivery-status']) {
  if (!html.includes(`id="${anchor}"`)) throw new Error(`Missing required page anchor: ${anchor}`);
}

const productionSql = readFileSync(resolve(root, 'supabase/production.sql'), 'utf8');
for (const table of ['support_preferences', 'support_callback_requests', 'support_conversations']) {
  if (!productionSql.includes(`public.${table}`)) throw new Error(`Missing production support table: ${table}`);
}

const bridgeSql = readFileSync(resolve(root, 'supabase/supply_bridge.sql'), 'utf8');
for (const required of ['route_to_supply_partners', 'tr_sourcing_request_insert', 'vault.decrypted_secrets', 'net.http_post']) {
  if (!bridgeSql.includes(required)) throw new Error(`Supply bridge migration is missing: ${required}`);
}

console.log('Marketplace structure check passed');
