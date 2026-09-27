import crypto from 'node:crypto';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

function requireConfig() {
  const config = {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    paystackSecret: process.env.PAYSTACK_SECRET_KEY
  };

  if (!config.url || !config.serviceKey || !config.paystackSecret) {
    throw new Error('Payment webhook is not configured');
  }

  return config;
}

function isValidSignature(rawBody, signature, secret) {
  if (!signature) return false;

  const expected = crypto
    .createHmac('sha512', secret)
    .update(rawBody)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(signature, 'utf8');

  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

async function settlePayment(config, payload) {
  const data = payload?.data;

  if (!data?.reference || payload?.event !== 'charge.success') {
    return { accepted: true, ignored: true };
  }

  const amountGhs = Number(data.amount) / 100;
  const currency = String(data.currency || '').toUpperCase();

  if (!Number.isFinite(amountGhs) || amountGhs <= 0 || currency !== 'GHS') {
    throw new Error('Invalid Paystack payment payload');
  }

  const response = await fetch(
    `${config.url}/rest/v1/rpc/settle_paystack_deposit`,
    {
      method: 'POST',
      headers: {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_reference: data.reference,
        p_provider_amount: amountGhs,
        p_currency: currency,
        p_event_type: payload.event,
        p_payload: payload
      })
    }
  );

  const resultText = await response.text();

  if (!response.ok) {
    throw new Error(`Payment settlement failed: ${resultText}`);
  }

  let result;
  try {
    result = JSON.parse(resultText);
  } catch {
    result = resultText;
  }

  return result;
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const config = requireConfig();
    const rawBody = await request.text();
    const signature = request.headers.get('x-paystack-signature');

    if (!isValidSignature(rawBody, signature, config.paystackSecret)) {
      console.error('[PAYSTACK WEBHOOK] Invalid signature');
      return json({ error: 'Unauthorized' }, 401);
    }

    let payload;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json({ error: 'Invalid JSON payload' }, 400);
    }

    const result = await settlePayment(config, payload);

    console.log('[PAYSTACK WEBHOOK] Processed', {
      event: payload?.event,
      reference: payload?.data?.reference,
      result
    });

    return json({
      accepted: true,
      result
    }, 200);
  } catch (error) {
    console.error('[PAYSTACK WEBHOOK] Error:', error);
    return json({
      accepted: false,
      error: error.message || 'Webhook processing failed'
    }, 500);
  }
}
