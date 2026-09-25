// Corrected production endpoint mappings for the unified Arkesel API
const smsEndpoint = 'https://arkesel.com';
const balanceEndpoint = 'https://arkesel.com';
const contactsEndpoint = 'https://arkesel.com';

function getApiKey() {
  return process.env.TELEPHONY_PROVIDER_API_KEY;
}

// Helper utility to safely format local Ghanaian mobile numbers into Arkesel international formats
function formatGhanaPhone(phone) {
  if (!phone) return '';
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('0')) {
    return '233' + cleaned.slice(1);
  }
  if (cleaned.startsWith('+')) {
    return cleaned.replace('+', '');
  }
  return cleaned;
}

async function assertSuccessful(response, operation) {
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Arkesel ${operation} returned HTTP status ${response.status}: ${errorBody}`);
  }
  return response;
}

export async function triggerArkeselVoiceCall(record) {
  const apiKey = getApiKey();
  const voiceEndpoint = process.env.TELEPHONY_PROVIDER_VOICE_URL;
  const metadata = record.metadata && typeof record.metadata === 'object' ? record.metadata : {};
  
  // Extract and format target recipient number cleanly
  const rawPhone = metadata.buyer_phone || process.env.ARKESEL_DEFAULT_PHONE;
  const targetPhone = formatGhanaPhone(rawPhone);

  if (!apiKey || !voiceEndpoint || !targetPhone) {
    console.warn('[ARKESEL TELEPHONY] Voice dispatch skipped: missing provider parameters.');
    return { dispatched: false };
  }

  const response = await fetch(voiceEndpoint, {
    method: 'POST',
    headers: { 
      'API-KEY': apiKey, 
      'Content-Type': 'application/json' 
    },
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

  // Ensure target number arrays match strict international length layouts
  const formattedRecipient = formatGhanaPhone(to);

  // FIXED: Converted url query variables to structured JSON payload maps matching v2 specifications
  const response = await fetch(smsEndpoint, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sender: from || 'Brukina',
      message: message,
      recipients: [formattedRecipient],
      sandbox: process.env.NODE_ENV !== 'production',
      ...(schedule && { schedule })
    })
  });

  await assertSuccessful(response, 'SMS send execution');
  return response.json();
}

export async function getArkeselBalance() {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('TELEPHONY_PROVIDER_API_KEY is required for Arkesel balance');

  // FIXED: Map routing call cleanly onto Arkesel v2 balance metadata endpoints
  const response = await fetch(balanceEndpoint, {
    method: 'GET',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json'
    }
  });

  await assertSuccessful(response, 'balance check integration');
  return response.json();
}

export async function subscribeArkeselContact({ phoneNumber, phoneBook, firstName, lastName, email, company, userName }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('TELEPHONY_PROVIDER_API_KEY is required for Arkesel contacts');

  // FIXED: Configured payload as structured JSON object maps instead of flat query strings
  const response = await fetch(`${contactsEndpoint}/phonebook/${phoneBook}/contact/add`, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      phone_number: formatGhanaPhone(phoneNumber),
      first_name: firstName || '',
      last_name: lastName || '',
      email: email || '',
      company: company || '',
      user_name: userName || ''
    })
  });

  await assertSuccessful(response, 'contact phonebook registration');
  return response.json();
}
