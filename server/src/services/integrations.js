import { config } from '../config/index.js';
export async function integrationRequest(resource, payload) {
  if (!config.get('integrations.enabled')) throw new Error('Integration is disabled.');
  const base = config.get('integrations.baseUrl');
  if (!base) throw new Error('Integration URL is not configured.');
  const url = new URL(resource, `${base.replace(/\/$/, '')}/`);
  if (url.origin !== new URL(base).origin) throw new Error('Integration resource must use the configured origin.');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('Integration credentials require HTTPS.');
  const headers = { 'Content-Type': 'application/json' };
  if (config.get('integrations.apiKey')) headers.Authorization = `Bearer ${config.get('integrations.apiKey')}`;
  else if (config.get('integrations.clientId')) headers.Authorization = `Basic ${Buffer.from(`${config.get('integrations.clientId')}:${config.get('integrations.clientSecret') || config.get('integrations.oauthClientSecret')}`).toString('base64')}`;
  const response = await fetch(url, { method: payload === undefined ? 'GET' : 'POST', headers, body: payload === undefined ? undefined : JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Integration request failed.');
  return response;
}
