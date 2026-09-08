import { createClient } from '@supabase/supabase-js';

// Retrieve values directly out of the project configuration environment properties
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail gracefully instead of crashing if variables are empty during deployment pipelines
export const supabaseConfigMissing = !supabaseUrl || !supabaseAnonKey;

export const supabase = !supabaseConfigMissing 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;