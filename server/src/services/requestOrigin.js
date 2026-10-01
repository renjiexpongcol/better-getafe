export const originOf = value => {
  try { return value ? new URL(value).origin : ''; } catch { return ''; }
};
export function effectiveRequestOrigin(req, isTrustedProxy = () => false) {
  const forwarded = isTrustedProxy(req.socket?.remoteAddress) ? req.get('x-forwarded-host') : '';
  const authority = forwarded || req.get('host');
  // Accept one effective authority from the known proxy, never a raw URL/list.
  if (!authority || /[\s,/@\\?#]/.test(authority)) return '';
  return originOf(`${req.protocol}://${authority}`);
}
export function checkRequestOrigin(req, configuredOrigin, { isTrustedProxy, environment = process.env.NODE_ENV } = {}) {
  const source = originOf(req.get('origin') || req.get('referer'));
  const configured = typeof configuredOrigin === 'function' ? configuredOrigin() : configuredOrigin;
  const allowed = [configured, process.env.PUBLIC_SITE_URL, ...(process.env.API_CORS_ORIGINS || '').split(',')].map(originOf).filter(Boolean);
  const effective = effectiveRequestOrigin(req, isTrustedProxy);
  const localDev = environment !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1):5173$/.test(source);
  const sameOrigin = !!source && source !== 'null' && source === effective;
  return { source, effective, allowed: !!source && source !== 'null' && (sameOrigin || allowed.includes(source) || localDev), reason: sameOrigin ? 'same_origin' : allowed.includes(source) ? 'configured_origin' : localDev ? 'local_dev_origin' : 'untrusted_origin' };
}
