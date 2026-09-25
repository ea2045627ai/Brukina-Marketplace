/**
 * BRUKINA MARKETPLACE - DATABASE ENGINE INITIALIZATION WRAPPER
 * Path: src/lib/supabaseClient.js
 * Exposes a unified client connector to coordinate multi-tenant data syncs securely.
 */

import { createClient } from '@supabase/supabase-js';

// Extract keys securely from Vite's production environment metadata properties
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// FIXED: Guarded initialization parameters with clear strings to prevent unhandled build-breaking runtime errors
const fallbackUrl = SUPABASE_URL || 'https://supabase.co';
const fallbackKey = SUPABASE_ANON_KEY || 'placeholder-anon-key-string';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '⚠️ CRITICAL WARNING: Supabase infrastructure connection parameters are unconfigured. ' +
    'Please double-check the environment variable secret panels inside your hosting control desk dashboard.'
  );
}

// Instantiate the secure client connector cluster safely
export const supabase = createClient(fallbackUrl, fallbackKey);
