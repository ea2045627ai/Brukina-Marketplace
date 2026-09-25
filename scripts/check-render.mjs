import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// FIXED: Evaluated the root path directory using stable fileURLToPath parameters for maximum runtime safety
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

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

// Verify the presence of every mission-critical module cleanly
for (const file of requiredFiles) {
  const absolutePath = resolve(root, file);
  if (!existsSync(absolutePath)) {
    throw new Error(`🔴 Structural Validation Failure: Missing required file path context: ${file}`);
  }
}

// Inspect structural entry hooks inside index.html
const htmlPath = resolve(root, 'index.html');
const html = readFileSync(htmlPath, 'utf8');

if (!html.includes('id="root"')) {
  throw new Error('🔴 Structural Validation Failure: index.html is missing a target id="root" div element for React hydration.');
}
if (!html.includes('/src/main.jsx')) {
  throw new Error('🔴 Structural Validation Failure: index.html does not point to the main React compilation entry script (/src/main.jsx).');
}

console.log('✅ Structure Verification Passed: All 16 core panels and target configuration files are fully resolved.');
