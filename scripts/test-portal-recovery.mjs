import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activateDatabase, closeCloudSql } from '../server/src/services/cloudSql.js';
import { consumePortalRecoveryCode, getPortalUserByEmail } from '../server/src/repositories/portalUserRepository.js';

test('PostgreSQL recovery codes consume decoded JSONB arrays and legacy JSON exactly once', async () => {
  for (const encoded of [false, true]) {
    let hashes = ['hashed-code'], commits = 0, rollbacks = 0, releases = 0;
    const connection = {
      beginTransaction: async () => {},
      execute: async (sql, params) => {
        if (sql.startsWith('SELECT')) return [[{ mfa_recovery_codes: encoded ? JSON.stringify(hashes) : hashes }]];
        hashes = JSON.parse(params[0]); return [[]];
      },
      commit: async () => { commits++; }, rollback: async () => { rollbacks++; }, release: () => { releases++; },
    };
    activateDatabase('portalDatabase', { users: 0, getConnection: async () => ({ ...connection }), pool: { end: async () => {} } });
    const matches = (code, stored) => code === 'valid-code' && stored === 'hashed-code';
    assert.equal(await consumePortalRecoveryCode('fixture', 'valid-code', matches), true);
    assert.equal(await consumePortalRecoveryCode('fixture', 'valid-code', matches), false);
    assert.deepEqual(hashes, []); assert.equal(commits, 1); assert.equal(rollbacks, 1); assert.equal(releases, 2);
  }
  await closeCloudSql();
});

test('production PostgreSQL lookup failures propagate without falling back to a user or invalid credentials', async () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const failure = Object.assign(new Error('Database unavailable'), { code: 'ECONNREFUSED' });
  activateDatabase('portalDatabase', { users: 0, execute: async () => { throw failure; }, pool: { end: async () => {} } });
  try { await assert.rejects(getPortalUserByEmail('fixture@example.invalid'), error => error === failure); }
  finally {
    await closeCloudSql();
    if (original === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original;
  }
});
