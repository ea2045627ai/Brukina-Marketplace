import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());

app.use('/api/webhooks/paystack', express.raw({ type: 'application/json' }));
app.use(express.json());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseKey || 'placeholder_token');

// 1. PAYSTACK PAYMENT INITIALIZATION
app.post('/api/payments/initialize', async (req, res) => {
  try {
    const { amount, email, userId } = req.body;
    const amountInSubunits = Math.round(parseFloat(amount) * 100);
    const response = await fetch('https://paystack.co', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, amount: amountInSubunits, metadata: { custom_fields: [{ display_name: 'User ID', variable_name: 'user_id', value: userId }] } })
    });
    const data = await response.json();
    return res.json({ url: data.data.authorization_url });
  } catch (error) { return res.status(500).json({ error: 'Initialization failure' }); }
});

// 2. PAYSTACK SECURE WEBHOOK
app.post('/api/webhooks/paystack', async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(req.body).digest('hex');
    if (hash !== signature) return res.status(401).json({ error: 'Invalid signature' });
    const event = JSON.parse(req.body.toString());
    if (event.event === 'charge.success') {
      const trx = event.data;
      const userId = trx.metadata?.custom_fields?.find(f => f.variable_name === 'user_id')?.value;
      if (userId) { await supabaseAdmin.from('momo_deposits').insert([{ user_id: userId, amount: trx.amount / 100, reference: trx.reference, status: 'success' }]); }
    }
    return res.status(200).json({ received: true });
  } catch (error) { return res.status(500).json({ error: 'Webhook failure' }); }
});

// 3. CORRECTED ARKESEL OTP GENERATE & SEND (WITH PLACEHOLDER)
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    // Arkesel OTP generate expects explicit template mapping with the %otp_code% token string
    const response = await fetch('https://arkesel.com', {
      method: 'POST',
      headers: { 
        'api-key': process.env.ARKESEL_API_KEY || '', 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        expiry: 5, 
        length: 6, 
        medium: 'sms', 
        number: phoneNumber.trim(), 
        sender: 'BrukinaHub',
        message: 'Your Brukina Marketplace verification code is %otp_code%. Valid for 5 minutes.'
      })
    });
    
    const data = await response.json();
    console.log('[ARKESEL GATEWAY RAW LOG]:', data);

    if (data.code !== '1000' && data.status !== 'success') {
      return res.status(400).json({ error: data.message || 'Gateway rejected data framework' });
    }
    return res.status(200).json({ success: true });
  } catch (error) { return res.status(500).json({ error: 'Arkesel system connection error' }); }
});

// 4. ARKESEL OTP VERIFY
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;
    const response = await fetch('https://arkesel.com', {
      method: 'POST',
      headers: { 'api-key': process.env.ARKESEL_API_KEY || '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, number: phoneNumber })
    });
    const data = await response.json();
    if (data.code === '1100' || data.message === 'Successful') return res.status(200).json({ authenticated: true });
    return res.status(400).json({ error: 'Invalid verification token pin number' });
  } catch (error) { return res.status(500).json({ error: 'Validation process error' }); }
});

app.listen(3000, () => { console.log('[RAILWAY SERVER ACTIVE] Port 3000'); });