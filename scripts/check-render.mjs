import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const blueprint = readFileSync(resolve(root, 'render.yaml'), 'utf8');
const requiredEntries = [
  'type: web',
  'name: brukina-marketplace',
  'runtime: node',
  'buildCommand: npm install && npm run build',
  'startCommand: npm start',
  'healthCheckPath: /health',
  'databases:',
  'name: brukina-marketplace-db',
  'property: connectionString'
];

for (const entry of requiredEntries) {
  if (!blueprint.includes(entry)) throw new Error(`Render blueprint is missing: ${entry}`);
}

console.log('Render blueprint check passed');
