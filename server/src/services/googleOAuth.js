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
  const requestOrigin = `${protocol || 'http'}://${host || 'localhost'}`;
  const hasRequestOrigin = Boolean(protocol || host);
  let localRequest = false;
  try { localRequest = hasRequestOrigin && LOCAL_HOSTS.has(new URL(requestOrigin).hostname); } catch { /* Validate the selected URI below. */ }
  // The local browser and API share the Vite origin. Do not send a local
  // sign-in through a configured production origin: that would set the OAuth
  // state and session cookies on a different host from the open portal tab.
  const fallbackOrigin = !production && localRequest
    ? 'http://localhost:5173'
    : normalizeGoogleRedirectUri(publicSiteUrl) || requestOrigin;
  const redirectUri = !production && localRequest
    ? normalizeGoogleRedirectUri(configuredUri) || 'http://localhost:5173/auth/callback'
    : configuredUri || `${fallbackOrigin.replace(/\/$/, '')}/auth/callback`;
  let parsed;

  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new Error('Google OAuth redirect URI must be a valid URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash
    || parsed.search || parsed.pathname !== '/auth/callback') {
    throw new Error('Google OAuth redirect URI must use the browser callback path /auth/callback without query parameters.');
  }
  if (production && parsed.protocol !== 'https:') {
    throw new Error('Google OAuth requires an HTTPS redirect URI in production.');
  }
  if (parsed.protocol === 'http:' && !LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error('Google OAuth only permits HTTP callbacks on localhost during development.');
  }

  return redirectUri;
}

export function googleRedirectFromState({ redirectUri, configured, publicSiteUrl, protocol, host, production = false }) {
  if (typeof redirectUri === 'string' && redirectUri) {
    const selected = normalizeGoogleRedirectUri(redirectUri);
    let parsed;
    try { parsed = new URL(selected); } catch { throw new Error('Google OAuth redirect URI must be a valid URL.'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash || parsed.search
      || (production && parsed.protocol !== 'https:')
      || (!production && parsed.protocol === 'http:' && !local)
      || parsed.pathname !== '/auth/callback') {
      throw new Error('Google OAuth redirect URI changed during sign-in.');
    }
    return selected;
  }
  return getGoogleRedirectUri({ configured, publicSiteUrl, protocol, host, production });
}
