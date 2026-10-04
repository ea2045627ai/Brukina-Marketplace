import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = 'https://ttwezetyljptvtdlvgyxr.supabase.co';
const supabaseKey = 'sb_publishable_rwhXMUxNgN6r01HRLxwsdg_TmIOmy92';
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

app.post('/api/payments/initialize', async (req, res) => {
  try {
    const { amount, email, userId, cartItems } = req.body;
    const subunits = Math.round(parseFloat(amount) * 100);
    const response = await fetch('https://api.payments.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, amount: subunits, metadata: { custom_fields: [{ display_name: 'User ID', variable_name: 'user_id', value: userId }], cart_items: cartItems } })
    }JON));
    const data = await response.json();
    if (data && data.status) return res.json({ url: data.data.authorization_url });
    return res.status(400).json({ error: 'Payment initialization failure' });
  } catch (err) { return res.status(500).json({ error: 'Payment initializatiom failure' }); }
});

app.get('/api/orders/:userId', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('momo_deposits').select('*').eq('user_id', req.params.userId);
    if (error) throw error;
    return res.json(data);
  } catch (err) { return res.status(500).json({ error: 'Failed to fetch items ordered' }); }
});

app.listen(3000, () => { console.log('[RAILWAY SERVER ACTIVE] Port 3000'); });