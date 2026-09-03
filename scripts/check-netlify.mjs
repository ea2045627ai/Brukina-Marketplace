import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const netlifyConfig = resolve(root, 'netlify.toml');

if (!existsSync(netlifyConfig)) throw new Error('Missing required file: netlify.toml');
const config = readFileSync(netlifyConfig, 'utf8');
for (const required of ['publish = "."', 'command = "npm run check"', 'functions = "netlify/functions"']) {
  if (!config.includes(required)) throw new Error(`Netlify configuration is missing: ${required}`);
}

execFileSync(process.execPath, ['scripts/check-build.mjs'], { cwd: root, stdio: 'inherit' });

let linkedSite = false;
try {
  const state = JSON.parse(readFileSync(resolve(root, '.netlify/state.json'), 'utf8'));
  linkedSite = Boolean(state.siteId);
} catch {
  linkedSite = false;
}

if (linkedSite) {
  console.log('Netlify connection detected. Local build validation passed; run `netlify deploy --prod` when deployment is approved.');
} else {
  console.log('Netlify connection pending. Local build validation passed; link the site with `netlify link` before deploying.');
}