import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const token = process.env.NETLIFY_AUTH_TOKEN;
const siteId = process.env.NETLIFY_SITE_ID;

function pending(message) {
  console.log(`Netlify validation PENDING: ${message}`);
  console.log('Set NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID, then run npm run check:netlify again.');
}

if (!token || !siteId) {
  pending('Netlify is not connected in this environment.');
  process.exit(0);
}

const response = await fetch(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}`, {
  headers: { Authorization: `Bearer ${token}` }
});

if (!response.ok) {
  throw new Error(`Netlify API returned ${response.status}. Check NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN.`);
}

const site = await response.json();
if (!site.url) throw new Error('Netlify site response did not include a deploy URL.');

const config = await readFile(resolve(root, 'netlify.toml'), 'utf8');
if (!config.includes('publish = "."') || !config.includes('functions = "netlify/functions"')) {
  throw new Error('netlify.toml does not match the expected publish and functions directories.');
}

const deployed = await fetch(site.url, { redirect: 'follow' });
if (!deployed.ok) throw new Error(`Deployed site probe returned ${deployed.status}: ${site.url}`);

console.log(`Netlify validation passed: ${site.name || siteId} at ${site.url}`);
