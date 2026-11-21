import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { createSessionEndpoint } from '../server/src/services/sessionEndpoint.js';
import { verifySessionToken } from '../server/src/services/sessionToken.js';
import { requestJson } from '../src/services/apiTransport.js';

const secret = 'session-test-secret';
const user = { id: 'fixture', name: 'Staff', email: 'staff@example.test', role: 'staff', updated_at: 'version', password: 'NEVER_RETURN', mfa_secret: 'NEVER_RETURN', recovery_codes: ['NEVER_RETURN'] };
function signed(patch = {}) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, sid: 'fixture-session', kind: 'cms', role: user.role, updatedAt: 'version', iat: Date.now() - 1000, exp: Date.now() + 60000, ...patch })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}
async function request(token, overrides = {}) {
  let lookups = 0;
  const endpoint = createSessionEndpoint({
    authenticated: () => verifySessionToken(token || '', secret, { sessionMinutes: 60, rememberDays: 30 }),
    readCookies: () => token ? { getafe_session: token } : {}, SESSION_COOKIE: 'getafe_session',
    config: { get: key => key === 'authentication.sessionWarningMinutes' ? 5 : false },
    clearSessionCookie: res => { res.cleared = true; }, tokenIsRevoked: async () => false,
    getCmsUserById: async () => { lookups++; return user; }, getPortalUserById: async () => ({ ...user, role: 'resident' }),
    sessionUpdatedAt: account => account.updated_at,
    effectiveAccessFor: async () => ({ groups: [{ id: 'support', name: 'Support', secret: 'NEVER_RETURN' }], permissions: [{ id: 'content.read', allowed: true }, { id: 'users.manage', allowed: false }] }),
    googleOnboarding: async () => ({ setupRequired: false }), logApiFailure: () => {}, ...overrides,
  });
  const response = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await endpoint({ headers: {} }, response);
  assert.match(response.headers['Cache-Control'], /no-store/);
  return { ...response, lookups };
}
test('missing, malformed, forged and expired sessions return 401 without an account lookup', async () => {
  for (const token of [undefined, 'invalid', signed() + 'forged', signed({ exp: Date.now() - 1 }), signed({ iat: Date.now() - 3600001 })]) {
    const response = await request(token);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.user, null);
    assert.equal(response.lookups, 0);
    assert.equal(Boolean(response.cleared), Boolean(token));
  }
});
test('valid sessions return only allowlisted account and access fields', async () => {
  const response = await request(signed());
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.user.id, user.id);
  assert.deepEqual(response.body.user.permissions, ['content.read']);
  assert.deepEqual(response.body.user.groups, [{ id: 'support', name: 'Support' }]);
  assert.doesNotMatch(JSON.stringify(response.body), /NEVER_RETURN|password|mfa_secret|recovery_codes/);
});
test('revoked, idle-expired, missing-account and changed-account sessions return 401', async () => {
  for (const overrides of [
    { tokenIsRevoked: async () => true },
    { tokenIsRevoked: async session => { session.idleExpiresAt = Date.now() - 1; return true; } },
    { getCmsUserById: async () => null },
    { getCmsUserById: async () => ({ ...user, role: 'resident' }) },
    { getCmsUserById: async () => ({ ...user, updated_at: 'changed' }) },
  ]) assert.equal((await request(signed(), overrides)).statusCode, 401);
});
test('session registry outages remain 503 rather than signing out a valid account', async () => {
  const response = await request(signed(), { tokenIsRevoked: async () => { throw Error('private dependency detail'); } });
  assert.equal(response.statusCode, 503);
  assert.equal(response.cleared, undefined);
  assert.doesNotMatch(JSON.stringify(response.body), /private dependency/);
});
test('a session 401 is not retried or redirected and public API access continues', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls = [];
  globalThis.fetch = async path => { calls.push(path); return path.includes('auth/me') ? Response.json({ user: null }, { status: 401 }) : Response.json({ news: [] }); };
  await assert.rejects(requestJson('/api/auth/me'), error => error.status === 401);
  assert.deepEqual(await requestJson('/api/news'), { news: [] });
  assert.deepEqual(calls, ['/api/auth/me', '/api/news']);
});
