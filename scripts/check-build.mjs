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
  '_headers'
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) throw new Error(`Missing required file: ${file}`);
}

const html = readFileSync(resolve(root, 'index.html'), 'utf8');
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

for (const anchor of ['product-grid', 'search-input', 'auth-form', 'dispatch-request']) {
  if (!html.includes(`id="${anchor}"`)) throw new Error(`Missing required page anchor: ${anchor}`);
}

console.log('Marketplace structure check passed');
