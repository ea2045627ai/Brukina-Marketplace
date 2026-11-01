import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { loadEnv } from 'vite';

const root = process.cwd();
const fail = message => {
  console.error(`ERROR: ${message}`);
  process.exit(1);
};

const config = loadEnv('production', root, '');
const getConfig = name => process.env[name] || config[name] || '';

const supabaseUrl = getConfig('VITE_SUPABASE_URL');
const supabaseAnonKey = getConfig('VITE_SUPABASE_ANON_KEY');
const appOrigin = getConfig('APP_ORIGIN');
const deployToken = process.env.NETLIFY_AUTH_TOKEN;

if (!supabaseUrl || !supabaseAnonKey) {
  fail('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.production or the environment.');
}

if (deployToken && /^(your_|paste_|placeholder)/i.test(deployToken)) {
  fail('NETLIFY_AUTH_TOKEN contains a placeholder value.');
}

if (!appOrigin) {
  fail('Set APP_ORIGIN to the deployed HTTPS origin in .env.production or the environment.');
}

let appUrl;
let projectUrl;
try {
  appUrl = new URL(appOrigin);
  projectUrl = new URL(supabaseUrl);
} catch {
  fail('APP_ORIGIN and VITE_SUPABASE_URL must be valid URLs.');
}

if (appUrl.protocol !== 'https:' || appUrl.origin !== appOrigin || appUrl.pathname !== '/'
  || appUrl.search || appUrl.hash || appUrl.username || appUrl.password) {
  fail('APP_ORIGIN must be an HTTPS origin without a path, query, credentials, or fragment.');
}

if (projectUrl.protocol !== 'https:' || projectUrl.username || projectUrl.password) {
  fail('VITE_SUPABASE_URL must be a valid HTTPS Supabase project URL.');
}

let siteId = process.env.NETLIFY_SITE_ID;
if (!siteId) {
  try {
    const linkedSite = JSON.parse(await readFile(resolve(root, '.netlify/state.json'), 'utf8'));
    siteId = linkedSite.siteId;
  } catch {
    fail('Set NETLIFY_SITE_ID or link this repository to its Netlify site first.');
  }
}

if (typeof siteId !== 'string' || !/^[0-9a-f-]{36}$/i.test(siteId)) {
  fail('NETLIFY_SITE_ID must be a valid Netlify site ID.');
}

console.log('Checking and building the production application...');
for (const args of [['run', 'check'], ['run', 'build']]) {
  const result = spawnSync('npm', args, { cwd: root, stdio: 'inherit' });
  if (result.error) fail(`Could not run npm ${args.join(' ')}: ${result.error.message}`);
  if (result.status !== 0) fail(`npm ${args.join(' ')} failed.`);
}

for (const asset of [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'icon.svg',
  'icon-192.png',
  'icon-512.png'
]) {
  try {
    const content = await readFile(resolve(root, 'dist', asset));
    if (content.length === 0) fail(`Required production asset is empty: dist/${asset}`);
  } catch (error) {
    if (error?.code === 'ENOENT') fail(`Required production asset is missing: dist/${asset}`);
    throw error;
  }
}

console.log(`Publishing verified build to ${appUrl.origin}...`);
const deploy = spawnSync(
  'npx',
  [
    '--yes',
    'netlify-cli',
    'deploy',
    '--prod',
    '--dir=dist',
    `--site=${siteId}`,
    '--message=Publish Brukina Marketplace'
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  }
);

if (deploy.error) fail(`Could not start the Netlify CLI: ${deploy.error.message}`);
if (deploy.status !== 0) {
  fail('Netlify rejected the production deploy. Check team billing, deploy permissions, and CLI output.');
}

console.log(`Deployment command completed for ${appUrl.origin}.`);
