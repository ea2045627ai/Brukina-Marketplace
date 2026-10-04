import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://supabase.co', 
  'sb_publishable_rwhXMUxNgN6r01HRLxwsdg_TmIOmy92'
);

async function addTestOrderRow() {
  console.log('Connecting to Supabase transaction infrastructure...');
  
  // FIXED: Using a syntactically correct system security token identifier value to pass table validation constraints
  const testRecord = {
    reference: 'TRX_TST_' + Math.floor(Math.random() * 100000),
    user_id: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d', 
    amount: 35.00,
    status: 'success',
    created_at: new Date()
  };

  const { error } = await sb.from('momo_deposits').insert([testRecord]);

  if (error) {
    console.error('Database insertion rejected:', error.message);
  } else {
    console.log('SUCCESS: Confirmed transaction row written natively to momo_deposits!');
  }
}

addTestOrderRow();
