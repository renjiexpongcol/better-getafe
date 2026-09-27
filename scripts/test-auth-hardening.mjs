import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { passwordMeetsPolicy } from '../server/src/services/passwordPolicy.js';
import { hashPassword, verifyPassword } from '../server/src/services/passwordHashing.js';
import { assertSessionRegistryAvailable } from '../server/src/services/sessionRegistry.js';
import { safeUser } from '../server/src/services/authPayload.js';
import { safeReturnPath } from '../src/authNavigation.js';

test('password policy enforces the configured minimum, composition, common-password deny list, and max size', () => {
  assert.equal(passwordMeetsPolicy('Valid-Pass9', 8), true);
  assert.equal(passwordMeetsPolicy('Valid-Pass9', 12), false);
  assert.equal(passwordMeetsPolicy('password1', 8), false);
  assert.equal(passwordMeetsPolicy('Password9', 8), false);
  assert.equal(passwordMeetsPolicy('Valid-Pass9'.repeat(94), 8), false);
  assert.equal(passwordMeetsPolicy(null, 8), false);
});

test('new versioned scrypt hashes verify and legacy hashes remain valid for lazy upgrade', async () => {
  const password = 'Correct-horse9-battery';
  const dummy = await hashPassword('not-a-real-user-password');
  const current = await hashPassword(password);
  assert.match(current, /^scrypt\$16384\$8\$5\$/);
  assert.equal(current.includes(password), false);
  assert.deepEqual(await verifyPassword(password, current, dummy), { valid: true, needsRehash: false });
  assert.deepEqual(await verifyPassword('wrong-password', current, dummy), { valid: false, needsRehash: false });
  assert.deepEqual(await verifyPassword('x'.repeat(1025), current, dummy), { valid: false, needsRehash: false });

  const legacySalt = crypto.randomBytes(16).toString('hex');
  const legacyDigest = crypto.scryptSync(password, legacySalt, 64).toString('hex');
  assert.deepEqual(await verifyPassword(password, `${legacySalt}:${legacyDigest}`, dummy), { valid: true, needsRehash: true });
  assert.deepEqual(await verifyPassword('wrong-password', `${legacySalt}:${legacyDigest}`, dummy), { valid: false, needsRehash: false });
});

test('production sessions require a ready registry while development can use its fallback', () => {
  assert.doesNotThrow(() => assertSessionRegistryAvailable(true, true));
  assert.throws(() => assertSessionRegistryAvailable(false, true), error => error.code === 'AUTH_SESSION_REGISTRY_UNAVAILABLE');
  assert.doesNotThrow(() => assertSessionRegistryAvailable(false, false));
});

test('public auth user payloads exclude password, MFA, recovery, and session secrets', () => {
  const payload = safeUser({
    id: 'user-1', name: 'Resident', email: 'resident@example.test', role: 'resident', mfa_enabled: true,
    password: 'salt:hash', mfa_secret_encrypted: 'encrypted-secret', mfa_recovery_codes: ['recovery-hash'],
    resetToken: 'reset-token', sid: 'raw-session-id',
  });
  assert.deepEqual(Object.keys(payload).sort(), ['avatar_url', 'email', 'id', 'mfaEnabled', 'name', 'role']);
  assert.equal(payload.mfaEnabled, true);
  assert.equal(JSON.stringify(payload).includes('salt:hash'), false);
  assert.equal(JSON.stringify(payload).includes('encrypted-secret'), false);
  assert.equal(JSON.stringify(payload).includes('raw-session-id'), false);
});

test('return paths stay on-site and avoid authentication loops', () => {
  const origin = 'https://portal.example';
  assert.equal(safeReturnPath('/app/services?category=permits#top', origin), '/app/services?category=permits#top');
  for (const candidate of ['https://attacker.example', '//attacker.example/path', '/\\attacker.example', '/auth/login', '/%5c%5cevil.example', '/%0d%0aLocation:x', 'x']) {
    assert.equal(safeReturnPath(candidate, origin), null, `rejected unsafe return path: ${candidate}`);
  }
  assert.equal(safeReturnPath('/authentic', origin), '/authentic', 'routes sharing only the /auth prefix remain valid');
  assert.equal(safeReturnPath(`/${'a'.repeat(2048)}`, origin), null);
});
