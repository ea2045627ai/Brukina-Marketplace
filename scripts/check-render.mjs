import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requiredFiles = [
  'render.yaml',
  'vite.config.js',
  'index.html',
  'src/main.jsx',
  'src/App.jsx',
  'src/styles.css',
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
  'src/components/OrderChatComponent.jsx'
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) throw new Error(`Missing required file: ${file}`);
}

const html = readFileSync(resolve(root, 'index.html'), 'utf8');
if (!html.includes('id="root"')) throw new Error('index.html must contain a root div for React');
if (!html.includes('/src/main.jsx')) throw new Error('index.html must reference /src/main.jsx');

console.log('Render deployment check passed');
