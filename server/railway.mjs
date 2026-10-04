import express from 'express';
import cors from 'cors';
import https from 'https';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

// HARDCODED SECURE PROJECTS LAYOUT CONTRACT
const supabaseUrl = 'https://supabase.co';
const supabaseKey = 'sb_publishable_rwhXMUxNgN6r01HRLxwsdg_TmIOmy92';
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

// 1. FIXED PAYSTACK INITIALIZATION ROUTE (NATIVE HTTPS IMPLEMENTATION)
app.post('/api/payments/initialize', async (req, res) => {
  try {
    const { amount, email, userId } = req.body;
    const subunits = Math.round(parseFloat(amount) * 100);
    console.log('[PAYSTACK ENGINE]: Initializing charge subunit amount via HTTPS:', subunits);

    const payload = JSON.stringify({
      email: email || 'customer@brukina-marketplace.com',
      amount: subunits,
      metadata: {
        custom_fields: [
          { display_name: 'User ID', variable_name: 'user_id', value: userId }
        ]
      }
    });

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: '/transaction/initialize',
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
      paystackRes.on('data', (chunk) => body += chunk);
      paystackRes.on('end', () => {
        try {
          const data = JSON.parse(body);
          console.log('[PAYSTACK API RESPONSE LOG]:', data);
          if (data && data.status) {
            return res.json({ url: data.data.authorization_url });
          }
          return res.status(400).json({ error: data.message || 'Gateway initialization rejected' });
        } catch (e) {
          return res.status(500).json({ error: 'Gateway returned non-JSON structure', raw: body });
        }
      });
    });

    request.on('error', (err) => {
      console.error('[HTTPS CONNECTION ERROR]:', err);
      res.status(500).json({ error: 'Paystack socket connection failure' });
    });

    request.write(payload);
    request.end();

  } catch (err) {
    console.error('[INTERNAL PAYSTACK EXCEPTION ERROR]:', err);
    return res.status(500).json({ error: 'Payment initialization failure', details: err.message });
  }
});

// 2. UNIVERSAL ORDERS FETCHING ENGINE FOR DASHBOARDS
app.get('/api/orders/:userId', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('momo_deposits').select('*').eq('user_id', req.params.userId);
    if (error) throw error;
    return res.json(data);
  } catch (err) { return res.status(500).json({ error: 'Failed to fetch items ordered' }); }
});

app.listen(3000, () => { console.log('[RAILWAY SERVER ACTIVE] Port 3000'); });
