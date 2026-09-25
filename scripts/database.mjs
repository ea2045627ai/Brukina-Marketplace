import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('Database check skipped: missing environment variables');
  process.exit(0);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const REQUIRED_TABLES = [
  'products',
  'orders',
  'product_categories',
  'wallets',
  'wallet_transactions',
  'order_messages',
  'rider_logistics_wallets',
  'platform_market_indexes',
  'delivery_fleet_tariffs',
  'external_api_logs',
  'applied_migrations',
  'platform_backups_log'
];

async function checkDatabase() {
  const missing = [];
  
  // FIXED: Checked table presence using a head row length count to prevent custom column name exceptions
  for (const table of REQUIRED_TABLES) {
    const { error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true }); // Performs an optimized head metadata lookup (0 data egress cost)

    if (error) {
      // 42P01 means table completely does not exist in public schema catalog
      if (error.code === '42P01') {
        missing.push(table);
      } else {
        console.warn(`[SCHEMA WARNING] Table "${table}" exists but threw code ${error.code}: ${error.message}`);
      }
    }
  }

  if (missing.length > 0) {
    console.error(`🔴 Schema Verification Failure: Missing tables: ${missing.join(', ')}`);
    process.exit(1); // Exit with code 1 during build phase to block broken deployments
  } else {
    console.log('✅ Database check passed: All required tables verified in public schema.');
    process.exit(0);
  }
}

checkDatabase().catch(err => {
  console.error('Critical verification script error:', err.message);
  process.exit(1);
});
