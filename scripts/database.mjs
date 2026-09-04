import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sqlDirectory = resolve(root, 'supabase');
const bundlePath = resolve(sqlDirectory, 'project_database.sql');
const migrations = [
  'schema.sql',
  'dispatch.sql',
  'operations.sql',
  'sourcing.sql',
  'production.sql',
  'complete_repair.sql',
  'supply_bridge.sql'
];

function buildContent() {
  return migrations.map(file => {
    const path = resolve(sqlDirectory, file);
    if (!existsSync(path)) throw new Error(`Missing database migration: supabase/${file}`);
    return `-- BEGIN supabase/${file}\n${readFileSync(path, 'utf8').trim()}\n-- END supabase/${file}`;
  }).join('\n\n');
}

function bundle() {
  const content = buildContent();
  writeFileSync(bundlePath, `${content}\n`, 'utf8');
  console.log(`Database bundle created: supabase/project_database.sql (${migrations.length} migrations)`);
}

function check() {
  for (const file of [...migrations, 'project_database.sql']) {
    if (!existsSync(resolve(sqlDirectory, file))) throw new Error(`Missing database file: supabase/${file}`);
  }
  if (readFileSync(bundlePath, 'utf8') !== `${buildContent()}\n`) {
    throw new Error('supabase/project_database.sql is stale; run npm run db:bundle');
  }
  console.log('Database files and migration order are ready.');
  if (!process.env.DATABASE_URL) console.log('Database action pending: set DATABASE_URL to apply the bundle.');
}

function connectionUrl() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Use the Supabase Postgres connection string; never commit it.');
  let url;
  try { url = new URL(process.env.DATABASE_URL); } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error('DATABASE_URL must use postgres:// or postgresql://');
  if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');
  return url.toString();
}

function runPsql(args) {
  try {
    execFileSync('psql', args, { env: { ...process.env, PGSSLMODE: 'require' }, stdio: 'inherit' });
  } catch (error) {
    throw new Error(`PostgreSQL command failed. Ensure psql is installed and DATABASE_URL is valid. ${error.message}`);
  }
}

function verify() {
  runPsql(['--no-password', '--dbname', connectionUrl(), '--command', 'select current_database(), current_user;']);
  console.log('Brukina Marketplace PostgreSQL connection verified.');
}

function apply() {
  const url = connectionUrl();
  if (!existsSync(bundlePath)) bundle();
  runPsql(['--no-password', '--single-transaction', '--set', 'ON_ERROR_STOP=1', '--dbname', url, '--file', bundlePath]);
  console.log('Brukina Marketplace database applied successfully.');
}

const action = process.argv[2];
if (action === '--bundle') bundle();
else if (action === '--apply') apply();
else if (action === '--verify') verify();
else if (action === '--check') check();
else throw new Error('Usage: node scripts/database.mjs --bundle|--apply|--verify|--check');