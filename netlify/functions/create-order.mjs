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
    const userResponse = await fetch(`${config.url}/auth/v1/user`, { headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` } });
    if (!userResponse.ok) return json({ error: 'Authentication required' }, 401);
    const user = await userResponse.json();
    const body = await request.json();
    const quantity = Number(body.quantity);
    if (!body.inventory_id || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return json({ error: 'A valid inventory item and quantity are required' }, 400);
    const headers = { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, 'Content-Type': 'application/json' };
    const inventoryResponse = await fetch(`${config.url}/rest/v1/marketplace_inventory?id=eq.${encodeURIComponent(body.inventory_id)}&active=eq.true&select=id,vendor_id,price,stock_quantity,minimum_order_quantity`, { headers });
    const inventory = await inventoryResponse.json();
    const item = inventory[0];
    if (!inventoryResponse.ok || !item) return json({ error: 'Inventory item is no longer available' }, 409);
    if (quantity < item.minimum_order_quantity || quantity > item.stock_quantity) return json({ error: `Quantity must be at least ${item.minimum_order_quantity} and within available stock` }, 400);
    const orderNumber = `BK-${Date.now().toString(36).toUpperCase()}`;
    const orderResponse = await fetch(`${config.url}/rest/v1/orders`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ order_number: orderNumber, customer_id: user.id, vendor_id: item.vendor_id, total: Number(item.price) * quantity, status: 'pending' }) });
    const order = (await orderResponse.json())[0];
    if (!orderResponse.ok || !order) return json({ error: 'Order could not be created' }, 500);
    const itemResponse = await fetch(`${config.url}/rest/v1/order_items`, { method: 'POST', headers, body: JSON.stringify({ order_id: order.id, inventory_id: item.id, quantity, unit_price: item.price }) });
    if (!itemResponse.ok) return json({ error: 'Order item could not be recorded' }, 500);
    return json({ accepted: true, order_id: order.id, order_number: order.order_number }, 201);
  } catch (error) { return json({ error: error.message || 'Order service unavailable' }, 500); }
}