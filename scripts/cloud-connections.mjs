// Build-time allowlist: service-role keys, JWT secrets and database passwords
// must never become browser configuration, even when a provider supplies them.
export function publicSupabaseConfiguration(env = process.env) {
  const first = names => names.map(name => String(env[name] || '').trim()).find(Boolean) || '';
  const url = first(['MY_PREFIX_VITE_SUPABASE_URLSUPABASE_URL', 'VITE_SUPABASE_URL', 'MY_PREFIX_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
  const publishableKey = first(['MY_PREFIX_VITE_SUPABASE_URLSUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'MY_PREFIX_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']);
  if (publishableKey && !publishableKey.startsWith('sb_publishable_')) throw new Error('The Supabase browser configuration requires a publishable key. Server credentials are not accepted.');
  if (url) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.origin !== url) throw new Error('The Supabase browser URL must be an exact HTTPS origin.');
  }
  return { url, publishableKey };
}
