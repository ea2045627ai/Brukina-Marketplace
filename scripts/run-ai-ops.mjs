import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

console.log('🛡️  Initiating Mandatory Pre-Deployment Security Enforcement Audit...');

/**
 * 1. CRITICAL POLICY FILES CHECK
 */
const mandatorySecurityFiles = [
  'scripts/security-enforcer.mjs',
  'lib/validation.mjs',
  'manifest.webmanifest'
];

for (const file of mandatorySecurityFiles) {
  if (!existsSync(resolve(root, file))) {
    console.error(`🚨 SECURITY COMPLIANCE FAILURE: Mandatory protection module missing: ${file}`);
    process.exit(1); // Aborts deployment instantly
  }
}

/**
 * 2. DATABASE SCHEMAS & RLS HARDENING AUDIT
 */
const sqlMigrationPaths = [
  'supabase/schema.sql',
  'supabase/production.sql'
];

let rlsVerifiedCount = 0;
for (const sqlPath of sqlMigrationPaths) {
  const fullSqlPath = resolve(root, sqlPath);
  if (existsSync(fullSqlPath)) {
    const sqlContent = readFileSync(fullSqlPath, 'utf8');
    
    // Check if developers explicitly enabled Row-Level Security strings
    const matchRLS = sqlContent.match(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi);
    if (matchRLS) {
      rlsVerifiedCount += matchRLS.length;
    }
    
    // Enforce that nobody dropped the administrator validation helper function
    if (!sqlContent.includes('public.is_platform_admin')) {
      console.error(`🚨 SECURITY COMPLIANCE FAILURE: Unsafe schema mod detected in ${sqlPath}. Administrative function "is_platform_admin" was altered or removed.`);
      process.exit(1);
    }
  }
}

if (rlsVerifiedCount === 0) {
  console.error('🚨 SECURITY COMPLIANCE FAILURE: Deployment blocked. No Row-Level Security (RLS) activation rules found inside your database migrations.');
  process.exit(1);
}

/**
 * 3. CODE SHIELDS & XSS SANITIZATION CHECK
 */
const serverlessFunctions = [
  'netlify/functions/supply-bridge.mjs',
  'netlify/functions/operations-webhook.mjs',
  'netlify/functions/create-order.mjs'
];

for (const func of serverlessFunctions) {
  const fullFuncPath = resolve(root, func);
  if (existsSync(fullFuncPath)) {
    const codeContent = readFileSync(fullFuncPath, 'utf8');
    
    // Enforce that developers are explicitly validating the request signature
    const hasSecretCheck = codeContent.includes('WEBHOOK_SECRET') || codeContent.includes('verifyPaystackSignature');
    if (!hasSecretCheck) {
      console.error(`🚨 SECURITY COMPLIANCE FAILURE: Serverless file "${func}" contains an unauthenticated public route. You must implement secret verification signatures.`);
      process.exit(1);
    }
    
    // Warn or block if raw un-sanitized client string ingestion patterns are detected
    if (codeContent.includes('request.json') && !codeContent.includes('sanitize') && func.includes('create-order')) {
      console.warn(`⚠️  [SECURITY WARNING]: Ingestion parameters in "${func}" should loop through "sanitizeString" to protect database views.`);
    }
  }
}

/**
 * 4. LEAKED SECRET DETECTOR
 */
const sourceCheckFiles = [
  'src/lib/supabaseClient.js',
  'vite.config.js'
];

for (const sourceFile of sourceCheckFiles) {
  const fullSourcePath = resolve(root, sourceFile);
  if (existsSync(fullSourcePath)) {
    const sourceContent = readFileSync(fullSourcePath, 'utf8');
    
    // Ensure nobody hardcoded raw text keys (like "sbp_..." or "sk_live_...") into git code files
    if (/(?:sbp_|sk_live_|pk_live_)[a-zA-Z0-9]{20,}/.test(sourceContent)) {
      console.error(`🚨 CRITICAL EXPOSURE DETECTED: Hardcoded private production API keys found inside file: ${sourceFile}. Deployment terminated.`);
      process.exit(1);
    }
  }
}

console.log('✅ SECURITY COMPLIANCE PASSED: All code, schemas, and configurations follow your project security rules.');
process.exit(0);
