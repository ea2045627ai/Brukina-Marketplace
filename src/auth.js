import { supabase } from './supabaseClient.js';

const oauthProviders = new Set(['google', 'apple']);

function getClient() {
  if (!supabase) {
    throw new Error('Authentication is unavailable because Supabase is not configured.');
  }
  return supabase;
}

function getDashboardRedirectUrl() {
  if (typeof window === 'undefined') {
    throw new Error('Authentication redirects are only available in a browser.');
  }

  const redirectUrl = new URL(import.meta.env.BASE_URL || '/', window.location.origin);
  if (redirectUrl.origin !== window.location.origin) {
    throw new Error('Authentication redirects must stay on this site.');
  }

  return redirectUrl.toString();
}

function normalizePhone(phone) {
  const normalizedPhone = phone.trim().replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
    throw new Error('Enter a valid phone number in international format, such as +233XXXXXXXXX.');
  }
  return normalizedPhone;
}

function requireOAuthProvider(provider) {
  const normalizedProvider = provider.toLowerCase();
  if (!oauthProviders.has(normalizedProvider)) {
    throw new Error('Only Google and Apple sign-in are enabled.');
  }
  return normalizedProvider;
}

export async function signUpWithPassword({ email, password, fullName = '' }) {
  const { data, error } = await getClient().auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: getDashboardRedirectUrl(),
      data: { full_name: fullName.trim() }
    }
  });
  if (error) throw error;
  return data;
}

export async function signInWithPassword({ email, password }) {
  const { data, error } = await getClient().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });
  if (error) throw error;
  return data;
}

export async function signInWithOAuth(provider) {
  const { data, error } = await getClient().auth.signInWithOAuth({
    provider: requireOAuthProvider(provider),
    options: { redirectTo: getDashboardRedirectUrl() }
  });
  if (error) throw error;
  return data;
}

export async function signInWithOtp(phone) {
  const { data, error } = await getClient().auth.signInWithOtp({
    phone: normalizePhone(phone),
    options: { shouldCreateUser: true, channel: 'sms' }
  });
  if (error) throw error;
  return data;
}

export async function verifyPhoneOtp(phone, token) {
  const { data, error } = await getClient().auth.verifyOtp({
    phone: normalizePhone(phone),
    token: token.trim(),
    type: 'sms'
  });
  if (error) throw error;
  return data;
}

export async function linkIdentityWithOAuth(provider) {
  const { data, error } = await getClient().auth.linkIdentity({
    provider: requireOAuthProvider(provider),
    options: { redirectTo: getDashboardRedirectUrl() }
  });
  if (error) throw error;
  return data;
}

export async function linkPhoneWithOtp(phone) {
  const { data, error } = await getClient().auth.updateUser({ phone: normalizePhone(phone) });
  if (error) throw error;
  return data;
}

export async function verifyLinkedPhoneOtp(phone, token) {
  const { data, error } = await getClient().auth.verifyOtp({
    phone: normalizePhone(phone),
    token: token.trim(),
    type: 'phone_change'
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await getClient().auth.signOut();
  if (error) throw error;
}
