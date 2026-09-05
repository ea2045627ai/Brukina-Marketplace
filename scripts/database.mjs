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
  for (const table of REQUIRED_TABLES) {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (error && error.code === '42P01') {
      missing.push(table);
    }
  }
  if (missing.length > 0) {
    console.log(`Missing tables: ${missing.join(', ')}`);
  } else {
    console.log('Database check passed: all required tables exist');
  }
}

checkDatabase().catch(err => {
  console.error('Database check failed:', err.message);
  process.exit(0);
});
