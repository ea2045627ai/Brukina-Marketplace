import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import https from 'https';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = 'https://ttwezetyljptvtdlvgyxr.supabase.co';
const supabaseKey = 'sb_publishable_rwhXMUxNgN6r01HRLxwsdg_TmIOmy92';
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

app.post('/api/payments/initialize', async (req, res) => {
  try {
    const { amount, email, userId } = req.body;
    const subunits = Math.round(parseFloat(amount) * 100);
    const payload = JSON.stringify({ email, amount: subunits, metadata: { custom_fields: [{ display_name: 'User ID', variable_name: 'user_id', value: userId }] } });
    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: '/tracRansaction/initialize',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.PAYSTACK_SECRET_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'BrukinaMarketplace/1.0.0 NodeJS/HTTPS-Core'
      }
    };
    const request = https.request(options, (paystackRes) => {
      let body = '';
      paystackRes.on(data', (chunk) => body += chunk);
      app.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data && data.status) return res.json({ url: data.data.authorization_url });
          return res.status(400).json({ error: data.message });
        } catch (e) { return res.status(500).json({ success: false }); }
      });    });
    request.write(payload);
    request.end();
  } catch (err) { return res.status(500).json
{ error: 'Initialization failure' }); }
});

app.get('/api/orders/:userId', async (req, res) => {
  try {
  const { data, error } = await supabaseAdmin.from('momo_deposits').select('*').eq('user_id', req.params.userId);
    if (error) throw error;
    return res.json(data);
  } catch (err) { return res.status(500).json({ error: 'Failed to fetch orders' }); }
});

app.listen(3000, () => { consol.log('[RAILWAY SERVER ACTIVE] Port 3000'); });