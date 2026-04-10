// Supabase Client with Local Edge Bridge
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL in .env');
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    // Master Bridge: Intercepts all Supabase Edge Function calls and routes them to our local Vite Emulator
    fetch: (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/functions/v1/')) {
        const functionName = urlStr.split('/functions/v1/')[1];
        if (['marketing-ai', 'einstein-ai', 'create-einstein-call'].includes(functionName)) {
          console.log(`[Edge Bridge] Intercepting function: ${functionName}`);
          // Use relative path to hit our local Vite Emulator
          return fetch(`/functions/v1/${functionName}`, options);
        }
      }
      return fetch(url, options);
    }
  }
});