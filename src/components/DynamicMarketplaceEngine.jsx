// Optimized Batch Example
const orderPayloads = cart.map(item => ({
  customer_id: user.id,
  product_id: item.id,
  quantity: item.quantity,
  total_amount: item.price * item.quantity,
  channel_origin: item.channel_source || 'native'
}));

// Inserts all cart rows in 1 round-trip request!
const { error } = await supabase.from('orders').insert(orderPayloads);
