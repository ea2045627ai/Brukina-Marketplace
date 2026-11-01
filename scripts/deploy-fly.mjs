import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { loadEnv } from 'vite';

const root = process.cwd();
const dryRun = process.argv.includes('--dry-run');
const appName = process.env.FLY_APP_NAME || 'brukina-marketplace-ttwezetyljpvtdlvgyxr';
const config = loadEnv('production', root, '');
const getConfig = name => process.env[name] || config[name] || '';

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(appName)) {
  fail('FLY_APP_NAME must be a valid lowercase Fly app name.');
}

const supabaseUrl = getConfig('VITE_SUPABASE_URL');
const supabaseAnonKey = getConfig('VITE_SUPABASE_ANON_KEY');
if (!supabaseUrl || !supabaseAnonKey
  || /your_|paste_|placeholder/i.test(supabaseUrl)
  || /your_|paste_|placeholder/i.test(supabaseAnonKey)) {
  fail('Configure real VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY values in a Vite production env file.');
}

try {
  const parsedUrl = new URL(supabaseUrl);
  if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname.endsWith('.supabase.co')) {
    fail('VITE_SUPABASE_URL must be an HTTPS Supabase project URL.');
  }
} catch (error) {
  if (error instanceof TypeError && error.message.includes('Invalid URL')) {
    fail('VITE_SUPABASE_URL must be a valid URL.');
  }
  throw error;
}

function run(command, args, label, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env });
  if (result.error) fail(`Could not run ${label}: ${result.error.message}`);
  if (result.status !== 0) fail(`${label} failed.`);
}

function runCapture(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env
  });
  if (result.error) fail(`Could not run ${label}: ${result.error.message}`);
  if (result.status !== 0) fail(`${label} failed.`);
  return result.stdout;
}

if (process.env.FLY_API_TOKEN) {
  run('flyctl', ['auth', 'whoami'], 'Fly.io authentication check', {
    ...process.env,
    FLY_API_TOKEN: process.env.FLY_API_TOKEN
  });
} else if (!dryRun) {
  run('flyctl', ['auth', 'whoami'], 'Fly.io authentication check');
}

console.log('Checking and building the production application...');
run('npm', ['run', 'check'], 'ESLint');
run('npm', ['run', 'build'], 'production build');

for (const asset of [
  'dist/index.html',
  'dist/manifest.webmanifest',
  'dist/sw.js',
  'dist/icon.svg',
  'dist/icon-192.png',
  'dist/icon-512.png'
]) {
  try {
    const { stat } = await import('node:fs/promises');
    const file = await stat(asset);
    if (!file.isFile() || file.size === 0) fail(`Required build asset is missing or empty: ${asset}`);
  } catch (error) {
    if (error?.code === 'ENOENT') fail(`Required build asset is missing: ${asset}`);
    throw error;
  }
}

if (dryRun) {
  console.log(`Dry run complete for Fly app ${appName}; no app or machine was created.`);
  process.exit(0);
}

const appsOutput = runCapture('flyctl', ['apps', 'list', '--json'], 'Fly.io app listing');
let apps;
try {
  const parsed = JSON.parse(appsOutput);
  apps = Array.isArray(parsed) ? parsed : parsed.apps;
} catch {
  fail('Could not parse Fly.io app listing; update flyctl and retry.');
}

if (!Array.isArray(apps)) fail('Fly.io returned an invalid app listing.');
const appExists = apps.some(app => (app.Name || app.name) === appName);
if (!appExists) {
  console.log(`Creating Fly.io app ${appName} in your personal organization...`);
  run('flyctl', ['apps', 'create', appName, '--org', 'personal', '--yes'], 'Fly.io app creation');
}

console.log(`Deploying to Fly.io app ${appName} in region jnb...`);
run('flyctl', [
  'deploy',
  '--remote-only',
  '--config',
  'fly.toml',
  '--app',
  appName
], 'Fly.io deployment');
