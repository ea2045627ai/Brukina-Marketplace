const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

function requireConfig() {
  const config = {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    paystackSecret: process.env.PAYSTACK_SECRET_KEY
  };

  if (!config.url || !config.anonKey || !config.serviceKey || !config.paystackSecret) {
    throw new Error('Payment service is not configured');
  }

  return config;
}

function createReference() {
  return `BK-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

async function updatePaymentIntent(config, reference, checkoutUrl, metadata) {
  const response = await fetch(
    `${config.url}/rest/v1/payment_intents?reference=eq.${encodeURIComponent(reference)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        checkout_url: checkoutUrl,
        metadata
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Payment intent update failed: ${await response.text()}`);
  }
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const config = requireConfig();

    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) {
      return json({ error: 'Authentication required' }, 401);
    }

    const userResponse = await fetch(`${config.url}/auth/v1/user`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${token}`
      }
    });

    if (!userResponse.ok) {
      console.error('[PAYMENT] Supabase auth verification failed', {
        status: userResponse.status
      });
      return json({ error: 'Authentication required' }, 401);
    }

    const user = await userResponse.json();

    console.log('[PAYMENT] Authenticated user verified', {
      user_id: user?.id || null,
      email_present: Boolean(user?.email)
    });

    if (!user?.id || !user?.email) {
      return json({ error: 'Authenticated user email is required' }, 400);
    }

    const body = await request.json();
    console.log('[PAYMENT] Request body received', {
      amount_present: body?.amount !== undefined
    });

    const amountGhs = Number(body.amount);

    if (!Number.isFinite(amountGhs) || amountGhs <= 0 || amountGhs > 1000000) {
      return json({ error: 'Enter a valid deposit amount.' }, 400);
    }

    const normalizedAmount = Number(amountGhs.toFixed(2));
    const amountSubunit = Math.round(normalizedAmount * 100);
    const reference = createReference();

    // Create the pending intent before contacting Paystack.
    const intentResponse = await fetch(
      `${config.url}/rest/v1/rpc/create_payment_intent`,
      {
        method: 'POST',
        headers: {
          apikey: config.serviceKey,
          Authorization: `Bearer ${config.serviceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_user_id: user.id,
          p_amount: normalizedAmount.toFixed(2),
          p_reference: reference,
          p_checkout_url: null,
          p_metadata: {
            user_email: user.email,
            provider: 'paystack'
          }
        })
      }
    );

    if (!intentResponse.ok) {
      const intentError = await intentResponse.text();
      console.error('[PAYMENT] Failed to create payment intent', {
        status: intentResponse.status,
        error: intentError
      });
      return json({ error: 'Payment intent could not be created.' }, 500);
    }

    const paymentIntentId = await intentResponse.json();

    console.log('[PAYMENT] Payment intent created', {
      payment_intent_created: Boolean(paymentIntentId)
    });

    const paystackResponse = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.paystackSecret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: user.email,
          amount: String(amountSubunit),
          currency: 'GHS',
          reference,
          channels: ['card', 'mobile_money', 'bank_transfer', 'ussd'],
          metadata: {
            user_id: user.id,
            payment_intent_id: paymentIntentId,
            wallet_deposit: true
          }
        })
      }
    );

    const paystackResult = await paystackResponse.json();

    if (
      !paystackResponse.ok ||
      !paystackResult?.status ||
      !paystackResult?.data?.authorization_url
    ) {
      console.error('[PAYMENT] Paystack initialization failed', {
        status: paystackResponse.status,
        paystack_status: paystackResult?.status ?? null,
        message: paystackResult?.message ?? null,
        authorization_url_present: Boolean(paystackResult?.data?.authorization_url)
      });
      return json({ error: 'Unable to initialize payment.' }, 502);
    }

    console.log('[PAYMENT] Paystack checkout initialized', {
      authorization_url_present: true,
      access_code_present: Boolean(paystackResult?.data?.access_code)
    });

    await updatePaymentIntent(
      config,
      reference,
      paystackResult.data.authorization_url,
      {
        user_email: user.email,
        provider: 'paystack',
        payment_intent_id: paymentIntentId,
        paystack_access_code: paystackResult.data.access_code
      }
    );

    return json({
      accepted: true,
      payment_intent_id: paymentIntentId,
      reference,
      authorization_url: paystackResult.data.authorization_url,
      access_code: paystackResult.data.access_code
    }, 201);
  } catch (error) {
    console.error('[PAYMENT] Initialization error:', error);
    return json(
      { error: error.message || 'Payment initialization failed' },
      500
    );
  }
}
