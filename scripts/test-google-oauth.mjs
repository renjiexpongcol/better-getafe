import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createPkcePair, getGoogleRedirectUri, normalizeGoogleRedirectUri } from '../server/src/services/googleOAuth.js';

test('quoted redirect URIs are normalized before authorization', () => {
  const quoted = '"http://localhost:5173/auth/callback"';
  assert.equal(normalizeGoogleRedirectUri(quoted), 'http://localhost:5173/auth/callback');
  assert.equal(getGoogleRedirectUri({ configured: quoted }), 'http://localhost:5173/auth/callback');
});

test('production OAuth callbacks require HTTPS', () => {
  assert.equal(getGoogleRedirectUri({ configured: 'https://getafe.gov.ph/auth/callback', production: true }), 'https://getafe.gov.ph/auth/callback');
  assert.throws(() => getGoogleRedirectUri({ configured: 'http://getafe.gov.ph/auth/callback', production: true }), /HTTPS/);
});

test('PKCE pairs use an S256 challenge and a high-entropy verifier', () => {
  const { verifier, challenge } = createPkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(challenge, crypto.createHash('sha256').update(verifier).digest('base64url'));
  assert.notEqual(challenge, verifier);
});
