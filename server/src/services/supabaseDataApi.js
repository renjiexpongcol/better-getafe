const projectRef = 'wrgbfwexraarwxpoqzpv';
const defaultEndpoint = `https://${projectRef}.supabase.co/rest/v1/`;
const pageSize = 100;

function usesProject(connectionString, hostname) {
  if (!connectionString) return false;
  const connection = new URL(connectionString);
  if (connection.pathname !== '/postgres') return false;
  const ref = hostname.split('.')[0];
  return connection.hostname === `db.${hostname}` ||
    (connection.hostname.endsWith('.pooler.supabase.com') &&
      decodeURIComponent(connection.username).endsWith(`.${ref}`));
}

export async function getDataApiCategories(connectionString, env = process.env, request = fetch) {
  const key = env.SUPABASE_DATA_API_PUBLISHABLE_KEY?.trim();
  if (!key) return null;

  const endpoint = new URL(env.SUPABASE_DATA_API_URL || defaultEndpoint);
  if (endpoint.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(endpoint.host) ||
      endpoint.pathname !== '/rest/v1/' || endpoint.username || endpoint.password ||
      endpoint.search || endpoint.hash || !key.startsWith('sb_publishable_')) {
    throw new Error('Invalid Supabase Data API configuration.');
  }
  if (!usesProject(connectionString, endpoint.hostname)) return null;

  const url = new URL('categories', endpoint);
  url.searchParams.set('select', 'id,name,slug');
  url.searchParams.set('order', 'id.asc');
  url.searchParams.set('limit', String(pageSize));
  const categories = [];
  const signal = AbortSignal.timeout(2500);
  for (let after; ; ) {
    if (after !== undefined) url.searchParams.set('id', `gt.${after}`);
    const response = await request(url, {
      headers: { apikey: key, 'Accept-Profile': 'portal_api' },
      redirect: 'error',
      signal,
    });
    if (!response.ok) throw new Error(`Supabase category request failed (HTTP ${response.status}).`);
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.some(row =>
      typeof row?.id !== 'string' || typeof row.name !== 'string' || typeof row.slug !== 'string')) {
      throw new Error('Invalid Supabase category response.');
    }
    if (!rows.length) return categories;
    const lastId = rows.at(-1).id;
    if (lastId === after) throw new Error('Supabase category pagination did not advance.');
    categories.push(...rows);
    after = lastId;
  }
}
