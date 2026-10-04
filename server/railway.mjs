import express from 'express';
import cors from 'cors';
import https from 'https';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());

// CRUCIAL: Webhook routes MUST capture the raw request binary stream body to verify cryptographic signatures from Paystack
app.use('/api/webhooks/paystack', express.raw({ type: 'application/json' }));
app.use(express.json());

// HARDCODED SECURE PROJECTS LAYOUT CONTRACT
const supabaseUrl = 'https://supabase.co';
const supabaseKey = 'sb_publishable_rwhXMUxNgN6r01HRLxwsdg_TmIOmy92';
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

// 1. SECURE PAYSTACK INITIALIZATION ROUTE (NATIVE HTTPS IMPLEMENTATION)
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
          return res.status(500).json({ error: 'Gateway returned non-JSON structure' });
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

// 2. LIVE PAYSTACK WEBHOOK EVENT LISTENER
app.post('/api/webhooks/paystack', async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    
    // Hash the incoming raw data body using your Paystack Secret Key to authenticate it genuinely came from Paystack
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(req.body)
      .digest('hex');

    if (hash !== signature) {
      console.warn('[WEBHOOK SECURITY WARNING]: Invalid signature fingerprint rejected!');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const event = JSON.parse(req.body.toString());
    console.log('[PAYSTACK WEBHOOK CAPTURED]: Event Type:', event.event);

    if (event.event === 'charge.success') {
      const trx = event.data;
      const userId = trx.metadata?.custom_fields?.find(f => f.variable_name === 'user_id')?.value;
      
      console.log(`[PAYSTACK WEBHOOK]: Payment Successful! Ref: ${trx.reference}, Amount: GHS ${trx.amount / 100}, User ID: ${userId}`);

      if (userId) {
        // Automatically insert confirmed success logs into your Supabase database table row data
        const { error } = await supabaseAdmin.from('momo_deposits').insert([
          { 
            user_id: userId, 
            amount: trx.amount / 100, 
            reference: trx.reference, 
            status: 'success' 
          }
        ]);
        if (error) console.error('[SUPABASE WEBHOOK WRITE ERROR]:', error.message);
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[WEBHOOK PROCESS FAILURE]:', err);
    return res.status(500).json({ error: 'Webhook signature processor failure' });
  }
});

// 3. UNIVERSAL ORDERS FETCHING ENGINE FOR DASHBOARDS
app.get('/api/orders/:userId', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('momo_deposits').select('*').eq('user_id', req.params.userId);
    if (error) throw error;
    return res.json(data);
  } catch (err) { return res.status(500).json({ error: 'Failed to fetch items ordered' }); }
});

app.listen(3000, () => { console.log('[RAILWAY SERVER ACTIVE] Port 3000'); });
