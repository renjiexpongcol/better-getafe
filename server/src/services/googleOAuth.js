import crypto from 'node:crypto';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function createPkcePair(verifier = crypto.randomBytes(32).toString('base64url')) {
  return {
    verifier,
    challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
  };
}

export function normalizeGoogleRedirectUri(value) {
  let redirectUri = String(value || '').trim();
  if ((redirectUri.startsWith('"') && redirectUri.endsWith('"')) || (redirectUri.startsWith("'") && redirectUri.endsWith("'"))) {
    redirectUri = redirectUri.slice(1, -1).trim();
  }
  return redirectUri;
}

export function getGoogleRedirectUri({ configured, publicSiteUrl, protocol, host, production = false }) {
  const configuredUri = normalizeGoogleRedirectUri(configured);
  const fallbackOrigin = normalizeGoogleRedirectUri(publicSiteUrl) || `${protocol || 'http'}://${host || 'localhost'}`;
  const redirectUri = configuredUri || `${fallbackOrigin.replace(/\/$/, '')}/api/auth/google/callback`;
  let parsed;

  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new Error('Google OAuth redirect URI must be a valid URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
    throw new Error('Google OAuth redirect URI must be a secure HTTP(S) URL.');
  }
  if (production && parsed.protocol !== 'https:') {
    throw new Error('Google OAuth requires an HTTPS redirect URI in production.');
  }
  if (parsed.protocol === 'http:' && !LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error('Google OAuth only permits HTTP callbacks on localhost during development.');
  }

  return redirectUri;
}
