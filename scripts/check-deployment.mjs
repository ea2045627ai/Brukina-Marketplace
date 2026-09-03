import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const netlifyConfig = readFileSync(resolve(root, 'netlify.toml'), 'utf8');
const requiredFiles = [
  'netlify.toml',
  'netlify/functions/operations-webhook.mjs',
  'netlify/functions/supply-bridge.mjs',
  'README.md',
  'ROADMAP.md'
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) throw new Error(`Missing deployment file: ${file}`);
}

for (const setting of ['publish = "."', 'command = "npm run check"', 'functions = "netlify/functions"']) {
  if (!netlifyConfig.includes(setting)) throw new Error(`Netlify configuration is missing: ${setting}`);
}

const deploymentUrl = process.env.NETLIFY_DEPLOY_URL?.replace(/\/$/, '');
if (!deploymentUrl) {
  console.log('Netlify deployment check: local contract passed; remote check PENDING.');
  console.log('Set NETLIFY_DEPLOY_URL after connecting the site, then run this command again.');
  process.exit(0);
}

let parsedUrl;
try {
  parsedUrl = new URL(deploymentUrl);
} catch {
  throw new Error('NETLIFY_DEPLOY_URL must be a valid URL');
}
if (parsedUrl.protocol !== 'https:') throw new Error('NETLIFY_DEPLOY_URL must use HTTPS');

const appResponse = await fetch(deploymentUrl);
if (!appResponse.ok) throw new Error(`Deployed app returned ${appResponse.status}`);

const webhookResponse = await fetch(`${deploymentUrl}/.netlify/functions/operations-webhook`, { method: 'GET' });
if (webhookResponse.status !== 405) throw new Error(`Operations function method check returned ${webhookResponse.status}, expected 405`);

console.log(`Netlify deployment check passed: ${deploymentUrl}`);