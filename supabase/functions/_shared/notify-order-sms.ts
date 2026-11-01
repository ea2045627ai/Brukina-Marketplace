function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Server configuration is missing ${name}.`);
  return value;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value)
  );
  return bytesToHex(new Uint8Array(signature));
}

export async function notifyOrderBySms(orderId: string): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await hmacSha256Hex(
    requiredEnv('SMS_INTERNAL_SECRET'),
    `${timestamp}.${orderId}`
  );
  const supabaseUrl = requiredEnv('SUPABASE_URL').replace(/\/+$/, '');
  const response = await fetch(`${supabaseUrl}/functions/v1/send-order-sms`, {
    method: 'POST',
    headers: {
      apikey: requiredEnv('SUPABASE_ANON_KEY'),
      Authorization: `Bearer ${requiredEnv('SUPABASE_ANON_KEY')}`,
      'Content-Type': 'application/json',
      'X-Marketplace-Timestamp': timestamp,
      'X-Marketplace-Signature': signature
    },
    body: JSON.stringify({ order_id: orderId }),
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    console.error('Order SMS worker returned HTTP status', response.status);
    throw new Error('Order SMS notification could not be dispatched.');
  }
}
