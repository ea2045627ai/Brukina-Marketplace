const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function requireConfig() {
  const config = { url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY };
  if (!config.url || !config.anonKey || !config.serviceKey) throw new Error('Order service is not configured');
  return config;
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  
  try {
    const config = requireConfig();
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Authentication required' }, 401);
    
    // Validate current user session identity context
    const userResponse = await fetch(`${config.url}/auth/v1/user`, { 
      headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` } 
    });
    if (!userResponse.ok) return json({ error: 'Authentication required' }, 401);
    const user = await userResponse.json();
    
    const body = await request.json();
    const quantity = Number(body.quantity);
    
    if (!body.inventory_id || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      return json({ error: 'A valid inventory item and quantity are required' }, 400);
    }

    const orderNumber = `BK-${Date.now().toString(36).toUpperCase()}`;
    const headers = { 
      apikey: config.serviceKey, 
      Authorization: `Bearer ${config.serviceKey}`, 
      'Content-Type': 'application/json' 
    };

    // FIXED: Consolidate data operations into an atomic database procedure to prevent race conditions and stock drift
    const rpcResponse = await fetch(`${config.url}/rest/v1/rpc/place_marketplace_order_transaction`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_order_number: orderNumber,
        p_customer_id: user.id,
        p_inventory_id: body.inventory_id,
        p_quantity: quantity
      })
    });

    const result = await rpcResponse.json();

    if (!rpcResponse.ok) {
      return json({ error: result.message || 'Order processing transaction rejected.' }, rpcResponse.status);
    }

    return json({ 
      accepted: true, 
      order_id: result.order_id, 
      order_number: orderNumber 
    }, 201);

  } catch (error) { 
    return json({ error: error.message || 'Order service unavailable' }, 500); 
  }
}
