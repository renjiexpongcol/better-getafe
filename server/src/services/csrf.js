import crypto from 'node:crypto';
const cookie = (req, name) => {
  const entry = String(req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`));
  if (!entry) return '';
  try { return decodeURIComponent(entry.slice(name.length + 1)); } catch { return ''; }
};
const binding = req => cookie(req, 'getafe_session') || cookie(req, 'getafe_password_reset') || '';
export function createCsrfProtection(secret, { now = Date.now } = {}) {
  const digest = (payload, req) => crypto.createHmac('sha256', secret).update(`csrf:${payload}:${binding(req)}`).digest('base64url');
  return {
    issue(req) {
      const payload = `${now() + 15 * 60 * 1000}.${crypto.randomBytes(24).toString('base64url')}`;
      return `${payload}.${digest(payload, req)}`;
    },
    verify(req) {
      const token = String(req.get('X-CSRF-Token') || '');
      if (token.length > 200) return false;
      const [expires, nonce, signature, extra] = token.split('.');
      if (extra || !/^\d{13}$/.test(expires || '') || !/^[\w-]{32}$/.test(nonce || '') || !/^[\w-]{43}$/.test(signature || '') || Number(expires) <= now() || Number(expires) > now() + 15 * 60 * 1000) return false;
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest(`${expires}.${nonce}`, req)));
    },
    requiresToken(req, policy) { return policy.access !== 'PUBLIC' && Boolean(binding(req)) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method); },
  };
}
