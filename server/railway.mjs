import express from 'express';
import cors from 'cors';
import https from 'https';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());

// Webhook parsing requires raw text binary stream signatures to verify tokens from Paystack securely
app.use('/api/webhooks/paystack', express.raw({ type: 'application/json' }));
app.use(express.json());

// FIXED: INFRASTRUCTURE CORE DATABASE CONNECTION CONTRACTS
const supabaseUrl = 'https://supabase.co';
const supabaseKey = 'sb_publishable_rwhXMUxNgN6r01HRLxwsdg_TmIOmy92';
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

// 1. PRODUCTION PAYSTACK TRANSACTION INITIALIZATION ROUTE
app.post('/api/payments/initialize', async (req, res) => {
  try {
    const { amount, email, userId } = req.body;
    const subunits = Math.round(parseFloat(amount) * 100);
    console.log('[PAYSTACK ENGINE]: Initializing charge subunit amount via HTTPS:', subunits);

    const payload = JSON.stringify({
      email: email || 'customer@brukina-marketplace.com',
      amount: subunits,
      metadata: { custom_fields: [{ display_name: 'User ID', variable_name: 'user_id', value: userId || 'dev_user_01' }] }
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
          if (data && data.status) return res.json({ url: data.data.authorization_url });
          return res.status(400).json({ error: data.message || 'Gateway initialization rejected' });
        } catch (e) { return res.status(500).json({ error: 'Gateway returned non-JSON structure' }); }
      });
    });

    request.on('error', (err) => { res.status(500).json({ error: 'Paystack socket connection failure' }); });
    request.write(payload);
    request.end();

  } catch (err) { return res.status(500).json({ error: 'Payment initialization failure', details: err.message }); }
});

// 2. LIVE WEBHOOK INTERCEPTOR FOR TRANSFERS
app.post('/api/webhooks/paystack', async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(req.body).digest('hex');

    if (hash !== signature) return res.status(401).json({ error: 'Invalid webhook signature' });

    const event = JSON.parse(req.body.toString());
    if (event.event === 'charge.success') {
      const trx = event.data;
      const userId = trx.metadata?.custom_fields?.find(f => f.variable_name === 'user_id')?.value || 'dev_user_01';
      
      console.log(`[PAYSTACK WEBHOOK CONFIRMED]: GHS ${trx.amount / 100} captured for ${userId}`);

      // FIXED: SYNCED CONFIRMED RECEIPT LOG DATA ROW DIRECTLY INTO YOUR SINGULAR SCHEMA TABLE
      await supabaseAdmin.from('momo_deposit').upsert({
        user_id: userId,
        amount: trx.amount / 100,
        reference: trx.reference,
        status: 'success',
        created_at: new Date()
      }, { onConflict: 'reference' });
    }
    return res.status(200).json({ received: true });
  } catch (err) { return res.status(500).json({ error: 'Webhook sync engine crash' }); }
});

// 3. UNIVERSAL ORDERS FETCHING ENGINE FOR REBUILT VIEW CARDS
app.get('/api/orders/:userId', async (req, res) => {
  try {
    // FIXED: SCAN PIPELINES READ FROM CHOSEN SINGULAR momo_deposit GRID TABLE SCHEMAS
    const { data, error } = await supabaseAdmin.from('momo_deposit').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (err) { return res.status(500).json({ error: 'Failed to fetch items ordered' }); }
});

app.listen(3000, () => { console.log('[RAILWAY SERVER ACTIVE] Port 3000'); });
