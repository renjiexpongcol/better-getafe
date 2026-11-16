import crypto from 'node:crypto';
import https from 'node:https';
import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export class HubError extends Error {
  constructor(code, status = 422, retryable = false) { super(code); this.code = code; this.status = status; this.retryable = retryable; }
}

// Keys are supplied by the deployment secret store, never generated or persisted here.
export class CredentialVault {
  constructor(env = process.env) { this.env = env; }
  keys() {
    try {
      const keys = JSON.parse(this.env.INTEGRATION_VAULT_KEYS || '{}');
      for (const value of Object.values(keys)) if (Buffer.from(value, 'base64').length !== 32) throw new Error();
      if (!keys[this.env.INTEGRATION_VAULT_VERSION]) throw new Error();
      return keys;
    } catch { throw new HubError('vault_unavailable', 503); }
  }
  seal(id, value) {
    const version = this.env.INTEGRATION_VAULT_VERSION, key = this.keys()[version], iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
    cipher.setAAD(Buffer.from(`getafe-integrations:${id}:${version}`));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return { version, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  }
  open(id, envelope) {
    try {
      const key = this.keys()[envelope.version];
      if (!key) throw new Error();
      const cipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), Buffer.from(envelope.iv, 'base64'));
      cipher.setAAD(Buffer.from(`getafe-integrations:${id}:${envelope.version}`));
      cipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      return JSON.parse(Buffer.concat([cipher.update(Buffer.from(envelope.ciphertext, 'base64')), cipher.final()]).toString());
    } catch { throw new HubError('credential_unavailable', 503); }
  }
}

export function publicAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
export function approvedUrl(value, allowedHosts = []) {
  let url;
  try { url = new URL(value); } catch { throw new HubError('invalid_endpoint'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hash || !allowedHosts.includes(url.hostname.toLowerCase()) || ipaddr.isValid(url.hostname)) throw new HubError('endpoint_not_approved');
  return url;
}

// DNS is checked for every connection and pinned into the TLS socket's lookup.
// Redirects are never followed, including redirects to the same host.
export async function safeRequest(value, { allowedHosts, method = 'GET', headers = {}, body, timeoutMs = 10000, maxBytes = 1024 * 1024, signal, resolve = dns.lookup, transport = https.request } = {}) {
  const url = approvedUrl(value, allowedHosts);
  const deadline = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
  if (deadline.aborted) throw new HubError('provider_timeout', 504, true);
  const addresses = await Promise.race([
    resolve(url.hostname, { all: true, family: 4 }).catch(() => { throw new HubError('provider_network', 502, true); }),
    new Promise((_, reject) => { deadline.addEventListener('abort', () => reject(new HubError('provider_timeout', 504, true)), { once: true }); }),
  ]);
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new HubError('unsafe_endpoint');
  if (deadline.aborted) throw new HubError('provider_timeout', 504, true);
  return new Promise((resolveResponse, reject) => {
    const request = transport(url, { method, headers, agent: false, rejectUnauthorized: true, signal: deadline,
      lookup: (_host, options, callback) => options.all ? callback(null, [addresses[0]]) : callback(null, addresses[0].address, 4),
    }, response => {
      let bytes = 0; const chunks = [];
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) { reject(new HubError('response_too_large')); response.destroy(); request.destroy(); } else chunks.push(chunk);
      });
      response.on('error', () => reject(new HubError(deadline.aborted ? 'provider_timeout' : 'provider_network', 502, true)));
      response.on('end', () => {
        const status = response.statusCode;
        if (status < 200 || status >= 300) {
          const after = response.headers?.['retry-after'];
          const delay = after ? Math.max(0, /^\d+$/.test(after) ? Number(after) * 1000 : Date.parse(after) - Date.now()) : 0;
          const retryable = (status === 429 || status >= 500) && !(delay > 604800000);
          return reject(Object.assign(new HubError(status === 429 ? 'provider_rate_limit' : [401, 403].includes(status) ? 'provider_authentication' : status >= 500 ? 'provider_unavailable' : 'provider_rejected', 422, retryable), { providerStatus: status, retryAfterMs: Number.isFinite(delay) ? delay : 0 }));
        }
        resolveResponse({ status, bytes, text: Buffer.concat(chunks).toString('utf8') });
      });
    });
    request.on('error', error => reject(error instanceof HubError ? error : new HubError(deadline.aborted ? 'provider_timeout' : 'provider_network', 502, true)));
    request.end(body);
  });
}

export function retryDelay(attempt, random = Math.random) { return Math.min(300000, 1000 * 2 ** Math.min(attempt, 8)) + Math.floor(random() * 1000); }
export function safeCode(error) { return error instanceof HubError ? error.code : 'integration_unavailable'; }
export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
