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

function bundle() {
  const content = migrations.map(file => {
    const path = resolve(sqlDirectory, file);
    if (!existsSync(path)) throw new Error(`Missing database migration: supabase/${file}`);
    return `-- BEGIN supabase/${file}\n${readFileSync(path, 'utf8').trim()}\n-- END supabase/${file}`;
  }).join('\n\n');
  writeFileSync(bundlePath, `${content}\n`, 'utf8');
  console.log(`Database bundle created: supabase/project_database.sql (${migrations.length} migrations)`);
}

function check() {
  for (const file of [...migrations, 'project_database.sql']) {
    if (!existsSync(resolve(sqlDirectory, file))) throw new Error(`Missing database file: supabase/${file}`);
  }
  console.log('Database files and migration order are ready.');
  if (!process.env.DATABASE_URL) console.log('Database action pending: set DATABASE_URL to apply the bundle.');
}

function apply() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Use the Supabase Postgres connection string; never commit it.');
  if (!existsSync(bundlePath)) bundle();
  try {
    execFileSync('psql', ['--set', 'ON_ERROR_STOP=1', '--dbname', process.env.DATABASE_URL, '--file', bundlePath], { stdio: 'inherit' });
  } catch (error) {
    throw new Error(`Database apply failed. Ensure psql is installed and DATABASE_URL is valid. ${error.message}`);
  }
  console.log('Brukina Marketplace database applied successfully.');
}

const action = process.argv[2];
if (action === '--bundle') bundle();
else if (action === '--apply') apply();
else if (action === '--check') check();
else throw new Error('Usage: node scripts/database.mjs --bundle|--apply|--check');