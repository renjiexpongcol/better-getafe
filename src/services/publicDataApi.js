const headers = { 'X-Requested-With': 'GetafeCitizenPortal', Accept: 'application/json' };

export async function publicData(path, options = {}) {
  const response = await fetch(`/api/public-data${path}`, { ...options, headers: { ...headers, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(payload.error || 'The public data service is unavailable.'); error.status = response.status; error.code = payload.code; throw error; }
  return payload;
}
export const apiData = value => value?.data ?? value ?? {};
export const collection = value => {
  const candidate = Array.isArray(value) ? value : value?.items || value?.datasets || value?.results || value?.data;
  return Array.isArray(candidate) ? candidate : [];
};
export const label = item => item?.label || item?.name || item?.title || item?.code || item?.id || 'Untitled';
