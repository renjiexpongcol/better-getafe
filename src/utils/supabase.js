import { createClient } from '@supabase/supabase-js'

let cachedClient

export function getSupabaseClient() {
  if (cachedClient) return cachedClient

  const url = (import.meta.env.MY_PREFIX_VITE_SUPABASE_URLSUPABASE_URL || import.meta.env.VITE_SUPABASE_URL)?.trim()
  const key = (import.meta.env.MY_PREFIX_VITE_SUPABASE_URLSUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)?.trim()
  if (!url || !key) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
  }

  cachedClient = createClient(url, key)
  return cachedClient
}
