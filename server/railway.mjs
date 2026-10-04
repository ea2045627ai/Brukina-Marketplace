import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import https from 'https';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl
  = process.env.NEXT_PUBLIC_SUPABASE_URL
  || 'https://ttwezetyljpvtdlvgyxr.supabase.co';
const supabaseKey = process.env.SUPABASE_SERFICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseKey || 'placeholder_token');

app.post('/api/payments/initialize', async (req, res) => {
  try {
    const { amount, email, userId } = req.body;
    const subunits = Math.round(parseFloat(amount) * 100);
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, amount: subunits, metadata: { custom_fields: [{ display_name: 'User ID', variable_name: 'user_id', value: userId }] } })
    });
    const data = await response.json();
    if (data && data.status) return res.json({ url: data.data.authorization_url });
    return res.status(400).json({ error: 'Payment initialization failure' });
  } catch (err) { return res.status(500).json({ error: 'Payment initializatiom failure' }); }
});

app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'Phone number required' });
    const payload = JSON.stringify({
      expiry: 5,
      length: 6,
      medium: 'sms',
      number: phoneNumber.trim(),
      sender: 'BrukinaHub',
      message: 'Your Brukina Marketplace verification code is %otp_code%. Valid for 5 minutes.'
    });
    const options = {
      hostname: 'sms.arkesel.com',
      port: 443,
      path: '/api/v2/otp/generate',
      method: 'POST',
      headers: {
        'api-key': process.env.ARKESEL_API_KEY || '',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const request = https.request(options, (response) => {
      let body = '';
      response.on('data', (chunk) => body += chunk);
      response.on('end', () => {
        try {
          const data = JSON.parse(body);
          console.log('[ARKESEL RUNTIME RESPONSE]:', data);
          if (data && (data.code === 1000 || data.code === '1000' || data.status === 'success')) {
            return res.status(200).json({ success: true });
          }
          return res.status(400).json({ error: data.message || 'Gateway rejection' });
        } catch (e) { return res.status(500).json({ error: 'Gateway empty response' }); }
      });    });
    request.on('error', (err) => { res.status(500).json({ error: 'Network request error' }); });
    request.write(payload);
    request.end();
  } catch (err) { return res.status(500).json({ error: 'Arkesel connection crash' }); }
});

app.listen(3000, () => { console.log('[RAILWAY SERVER ACTIVE] Port 3000'); });