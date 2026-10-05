const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });

function requireConfig() {
  const config = {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  };

  if (!config.url || !config.anonKey || !config.serviceKey) {
    throw new Error('Order service is not configured');
  }

  return config;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const config = requireConfig();

    const token = request.headers
      .get('authorization')
      ?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return json({ error: 'Authentication required' }, 401);
    }

    // Resolve the customer from the supplied Supabase access token.
    const userResponse = await fetch(`${config.url}/auth/v1/user`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${token}`
      }
    });

    if (!userResponse.ok) {
      return json({ error: 'Authentication required' }, 401);
    }

    const user = await userResponse.json();

    if (!user?.id || !isUuid(user.id)) {
      return json({
        error: 'Authenticated user could not be resolved'
      }, 401);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON request body' }, 400);
    }

    const inventoryId = String(body?.inventory_id || '').trim();
    const quantity = Number(body?.quantity);

    if (
      !inventoryId ||
      !isUuid(inventoryId) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 1000
    ) {
      return json({
        error: 'A valid inventory item and quantity are required'
      }, 400);
    }

    const orderNumber =
      `BK-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID()
        .slice(0, 8)
        .toUpperCase()}`;

    const serviceHeaders = {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      'Content-Type': 'application/json'
    };

    // IMPORTANT:
    // This is the secure paid-order transaction.
    //
    // It atomically:
    //   1. verifies inventory
    //   2. verifies wallet balance
    //   3. debits wallet
    //   4. creates the order
    //   5. creates the order item
    //   6. reduces inventory
    //   7. records the wallet payment
    //   8. creates the delivery
    //
    // All of those operations occur in one PostgreSQL transaction.
    const rpcResponse = await fetch(
      `${config.url}/rest/v1/rpc/place_paid_marketplace_order_transaction`,
      {
        method: 'POST',
        headers: serviceHeaders,
        body: JSON.stringify({
          p_order_number: orderNumber,
          p_customer_id: user.id,
          p_inventory_id: inventoryId,
          p_quantity: quantity
        })
      }
    );

    const resultText = await rpcResponse.text();

    let result = {};

    try {
      result = resultText ? JSON.parse(resultText) : {};
    } catch {
      result = {};
    }

    if (!rpcResponse.ok) {
      const message =
        result?.message ||
        result?.error ||
        result?.details ||
        'Payment or order transaction was rejected.';

      console.error('[ORDER SERVICE]', {
        status: rpcResponse.status,
        message
      });

      const lowerMessage = String(message).toLowerCase();

      if (
        lowerMessage.includes('insufficient wallet') ||
        lowerMessage.includes('wallet balance') ||
        lowerMessage.includes('required: gh₵')
      ) {
        return json(
          {
            accepted: false,
            payment_required: true,
            error: message
          },
          402
        );
      }

      if (
        lowerMessage.includes('inventory item') ||
        lowerMessage.includes('insufficient stock') ||
        lowerMessage.includes('minimum order quantity')
      ) {
        return json(
          {
            accepted: false,
            inventory_error: true,
            error: message
          },
          409
        );
      }

      return json(
        {
          accepted: false,
          error: message
        },
        rpcResponse.status >= 400 ? rpcResponse.status : 409
      );
    }

    return json(
      {
        accepted: true,
        paid: true,
        processing: true,
        order_id: result?.order_id,
        order_number: result?.order_number || orderNumber,
        delivery_id: result?.delivery_id,
        wallet_transaction_id: result?.wallet_transaction_id,
        amount_paid: result?.amount_paid,
        remaining_wallet_balance: result?.remaining_wallet_balance
      },
      201
    );
  } catch (error) {
    console.error('[ORDER SERVICE]', error);

    return json(
      {
        accepted: false,
        error: error?.message || 'Order service unavailable'
      },
      500
    );
  }
}
