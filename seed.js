import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://ttwezetyljpvtdlvgyxr.supabase.co', 
  'sb_publishable_rwhXMUxNgN6r01HRLxwsdg_TmIOmy92'
);

async function addTestOrderRow() {
  console.log('Connecting to Supabase transaction infrastructure...');
  
  const testRecord = {
    reference: 'TRX_TST_' + Math.floor(Math.random() * 100000),
    user_id: 'dev_user_01',
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
