import { normalizePublicError } from './publicError.js';
const headers = { 'X-Requested-With': 'GetafeCitizenPortal', Accept: 'application/json' };

export async function publicData(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api/public-data${path}`, { ...options, headers: { ...headers, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  } catch (cause) {
    const publicError = normalizePublicError(cause, 'services');
    const error = new Error(publicError.message);
    error.status = 0;
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const publicError = normalizePublicError({ status: response.status, body: payload }, 'services');
    const error = new Error(publicError.message);
    error.status = response.status;
    error.body = payload;
    error.referenceId = publicError.referenceId;
    throw error;
  }
  return payload;
}
export const apiData = value => value?.data ?? value ?? {};
export const collection = value => {
  const candidate = Array.isArray(value) ? value : value?.items || value?.datasets || value?.results || value?.data;
  return Array.isArray(candidate) ? candidate : [];
};
export const label = item => item?.label || item?.name || item?.title || item?.code || item?.id || 'Untitled';
