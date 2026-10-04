import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseKey || 'placeholder_token');

// 1. SECURE PAYSTACK TRANSACTION INITIALIZATION
app.post('/api/payments/initialize', async (req, res) => {
  try {
    const { amount, email, userId } = req.body;
    const subunits = Math.round(parseFloat(amount) * 100);
    const response = await fetch('https://paystack.co', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, amount: subunits, metadata: { custom_fields: [{ display_name: 'User ID', variable_name: 'user_id', value: userId }] } })
    });
    const data = await response.json();
    if (!data.status) return res.status(400).json({ error: data.message });
    return res.json({ url: data.data.authorization_url });
  } catch (err) { return res.status(500).json({ error: 'Payment initialization failure' }); }
});

// 2. ARKESEL BULK SMS GATEWAY TRANSMISSION (FIXED SCHEMA MAPPING)
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'Phone number required' });

    console.log('[LOCAL SERVER TARGET]: Preparing to contact Arkesel Gateway for number:', phoneNumber);

    const arkeselResponse = await fetch('https://arkesel.com', {
      method: 'POST',
      headers: {
        'api-key': process.env.ARKESEL_API_KEY || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        expiry: 5,
        length: 6,
        medium: 'SMS', // Strictly capitalized to satisfy v2 core gateway profiles
        number: phoneNumber.trim(),
        sender: 'Arkesel',
        message: 'Your Brukina Marketplace verification code is %otp_code%. Valid for 5 minutes.'
      })
    });

    // Capture response as raw text first to inspect it before parsing
    const rawBody = await arkeselResponse.text();
    console.log('[ARKESEL GATEWAY RAW LOG]:', rawBody);

    const data = JSON.parse(rawBody);
    console.log('[ARKESEL RUNTIME RESPONSE]:', data);

    if (data.code === 1000 || data.code === '1000' || data.status === 'success') {
      return res.status(200).json({ success: true });
    }
    return res.status(400).json({ error: data.message || 'Gateway rejection' });

  } catch (err) {
    console.error('[REAL ARKESEL ERROR NETWORK TRACE]:', err);
    return res.status(500).json({ 
      error: 'Arkesel connection framework failure', 
      details: err.message 
    });
  }
});

app.listen(3000, () => { console.log('[RAILWAY SERVER ACTIVE] Port 3000'); });
