import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseKey || 'placeholder_token');

// 1. PAYSTACK TRANSACTION INITIALIZATION
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

// 2. LOCAL REBUILT OTP TRANSMISSION (BYPASSES ARKESEL GATEWAY)
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'Phone number required' });

    const cleanPhone = phoneNumber.trim();
    // Simulate generation locally for seamless testing
    const fallbackMockCode = '123456';

    // Store/Update verification state directly inside your Supabase ledger
    const { error } = await supabaseAdmin
      .from('phone_verifications')
      .upsert(
        { phone_number: cleanPhone, is_verified: false, updated_at: new Date() },
        { onConflict: 'phone_number' }
      );

    if (error) {
      console.error('[SUPABASE DATABASE ERROR]:', error);
      return res.status(500).json({ error: 'Database record rebuild failed' });
    }

    console.log(`[LOCAL PORTAL SIMULATION]: Code [${fallbackMockCode}] generated for phone ${cleanPhone}`);
    return res.status(200).json({ success: true, message: 'Local data state initialized successfully' });

  } catch (err) {
    return res.status(500).json({ error: 'Data rebuild process execution failure' });
  }
});

// 3. DATABASE OTP VERIFICATION ROUTE
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;
    if (!phoneNumber || !code) return res.status(400).json({ error: 'Missing parameters' });

    // Validate the development verification code bypass option
    if (code === '123456') {
      await supabaseAdmin
        .from('phone_verifications')
        .update({ is_verified: true, updated_at: new Date() })
        .eq('phone_number', phoneNumber.trim());

      return res.status(200).json({ authenticated: true });
    }

    return res.status(400).json({ error: 'Invalid verification pin number' });
  } catch (err) { return res.status(500).json({ error: 'Validation process error' }); }
});

app.listen(3000, () => { console.log('[RAILWAY SERVER ACTIVE] Port 3000'); });
