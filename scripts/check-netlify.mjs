import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const configPath = resolve(root, 'netlify.toml');
const config = readFileSync(configPath, 'utf8');
const requiredFiles = ['netlify.toml', 'netlify/functions/supply-bridge.mjs', 'netlify/functions/operations-webhook.mjs'];

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) throw new Error(`Missing Netlify file: ${file}`);
}

if (!/^\[build\]/m.test(config) || !/^\s*publish\s*=\s*"\."\s*$/m.test(config) || !/^\s*functions\s*=\s*"netlify\/functions"\s*$/m.test(config)) {
  throw new Error('netlify.toml must publish the repository root and netlify/functions');
}

if (!process.env.NETLIFY_SITE_ID) {
  console.log('Netlify connection pending: set NETLIFY_SITE_ID after linking the site, then run npm run check:netlify again.');
  process.exit(0);
}

if (!/^[a-z0-9-]+$/i.test(process.env.NETLIFY_SITE_ID)) {
  throw new Error('NETLIFY_SITE_ID must be a Netlify site ID or site slug');
}

console.log(`Netlify configuration check passed for site ${process.env.NETLIFY_SITE_ID}`);