const voiceEndpoint = process.env.TELEPHONY_PROVIDER_VOICE_URL;
const smsEndpoint = 'https://sms.arkesel.com/sms/api';
const contactsEndpoint = 'https://sms.arkesel.com/contacts/api';

function getApiKey() {
  return process.env.TELEPHONY_PROVIDER_API_KEY;
}

async function assertSuccessful(response, operation) {
  if (!response.ok) throw new Error(`Arkesel ${operation} returned ${response.status}`);
  return response;
}

export async function triggerArkeselVoiceCall(record) {
  const apiKey = getApiKey();
  const metadata = record.metadata && typeof record.metadata === 'object' ? record.metadata : {};
  const targetPhone = metadata.buyer_phone || process.env.ARKESEL_DEFAULT_PHONE;

  if (!apiKey || !voiceEndpoint || !targetPhone) {
    console.warn('[ARKESEL TELEPHONY] Voice dispatch skipped: provider URL, API key, or recipient is missing.');
    return { dispatched: false };
  }

  const response = await fetch(voiceEndpoint, {
    method: 'POST',
    headers: { 'API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: targetPhone,
      voice_file_url: null,
      text: metadata.message || 'Brukina dispatcher aduru wo kurom, bra be gye wo nneɛma.',
      voice_id: metadata.voice_id || 'alice',
      language: metadata.language || 'en'
    })
  });
  await assertSuccessful(response, 'voice dispatch');
  console.log(`[ARKESEL TELEPHONY] Voice dispatch accepted for ${targetPhone}.`);
  return { dispatched: true };
}

export async function sendArkeselSms({ to, from, message, schedule }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('TELEPHONY_PROVIDER_API_KEY is required for Arkesel SMS');
  const params = new URLSearchParams({ action: 'send-sms', api_key: apiKey, to, from, sms: message });
  if (schedule) params.set('schedule', schedule);
  const response = await fetch(`${smsEndpoint}?${params}`);
  await assertSuccessful(response, 'SMS');
  return response.json();
}

export async function getArkeselBalance() {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('TELEPHONY_PROVIDER_API_KEY is required for Arkesel balance');
  const response = await fetch(`${smsEndpoint}?${new URLSearchParams({ action: 'check-balance', api_key: apiKey, response: 'json' })}`);
  await assertSuccessful(response, 'balance check');
  return response.json();
}

export async function subscribeArkeselContact({ phoneNumber, phoneBook, firstName, lastName, email, company, userName }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('TELEPHONY_PROVIDER_API_KEY is required for Arkesel contacts');
  const params = new URLSearchParams({ action: 'subscribe-us', api_key: apiKey, phone_book: phoneBook, phone_number: phoneNumber });
  for (const [key, value] of Object.entries({ first_name: firstName, last_name: lastName, email, company, user_name: userName })) {
    if (value) params.set(key, value);
  }
  const response = await fetch(`${contactsEndpoint}?${params}`);
  await assertSuccessful(response, 'contact subscription');
  return response.json();
}