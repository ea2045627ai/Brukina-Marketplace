import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requiredFiles = [
  'index.html',
  'src/styles.css',
  'public/sw.js',
  'manifest.webmanifest',
  'icon.svg',
  'netlify.toml',
  '_headers',
  'README.md',
  'ROADMAP.md',
  '.env.example',
  'vite.config.js',
  'render.yaml',
  'scripts/check-netlify.mjs',
  'scripts/check-render.mjs',
  'scripts/database.mjs',
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
  'netlify/functions/supply-bridge.mjs',
  'netlify/functions/create-order.mjs',
  'src/main.jsx',
  'src/App.jsx',
  'src/lib/supabaseClient.js',
  'src/hooks/useRealtimeCatalog.js',
  'src/components/DynamicMarketplaceEngine.jsx',
  'src/components/VendorInventoryPanel.jsx',
  'src/components/RiderTrackPanel.jsx',
  'src/components/WalletPanel.jsx',
  'src/components/AdminLedgerPanel.jsx',
  'src/components/AdminPriceController.jsx',
  'src/components/AdminTerminalPanel.jsx',
  'src/components/AdminApiLogger.jsx',
  'src/components/AdminCategoryPanel.jsx',
  'src/components/RiderWithdrawalPanel.jsx',
  'src/components/OrderChatComponent.jsx',
  'lib/validation.mjs'
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) throw new Error(`Missing required file: ${file}`);
}

const html = readFileSync(resolve(root, 'index.html'), 'utf8');
if (!html.includes('id="root"')) throw new Error('index.html must contain a root div for React');
if (!html.includes('/src/main.jsx')) throw new Error('index.html must reference /src/main.jsx');

const localReferences = [...html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)]
  .map(match => match[1])
  .filter(reference => !reference.startsWith('http://') && !reference.startsWith('https://'));

for (const reference of localReferences) {
  if (reference.startsWith('/src/') || reference.startsWith('/public/')) continue;
  if (!existsSync(resolve(root, reference))) throw new Error(`Missing local asset: ${reference}`);
}

const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.webmanifest'), 'utf8'));
if (!manifest.name || !manifest.start_url || !manifest.icons?.length) {
  throw new Error('Manifest is missing required PWA fields');
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
