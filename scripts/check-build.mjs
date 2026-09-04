import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requiredFiles = [
  'index.html',
  'src/main.jsx',
  'src/App.jsx',
  'src/styles.css',
  'manifest.webmanifest',
  'public/sw.js',
  'icon.svg',
  'netlify.toml',
  '_headers',
  'README.md',
  'ROADMAP.md',
  '.env.example',
  'scripts/check-netlify.mjs',
  'railway.toml',
  'Procfile',
  'app.json',
  'server/railway.mjs',
  'server/operations-webhook.mjs',
  'netlify/functions/operations-webhook.mjs',
  'supabase/production.sql',
  'supabase/schema.sql',
  'supabase/dispatch.sql',
  'supabase/operations.sql',
  'supabase/sourcing.sql',
  'supabase/supply_bridge.sql',
  'supabase/complete_repair.sql',
  'supabase/project_database.sql',
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
  const projectReference = reference.replace(/^\/+/, '');
  if (!existsSync(resolve(root, projectReference))) throw new Error(`Missing local asset: ${reference}`);
}

const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.webmanifest'), 'utf8'));
if (!manifest.name || !manifest.start_url || !manifest.icons?.length) {
  throw new Error('Manifest is missing required PWA fields');
}

for (const anchor of ['id="root"', 'src/main.jsx']) {
  if (!html.includes(anchor)) throw new Error(`Missing React application anchor: ${anchor}`);
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
