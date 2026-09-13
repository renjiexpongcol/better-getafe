import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPoolManager } from '../src/services/poolManager.js';
function fixture(overrides = {}, behavior = {}) {
  const counts = { created: 0, closed: 0, ended: 0 };
  let options;
  const env = { CMS_DATABASE_PROVIDER: 'gcp', CMS_CLOUD_SQL_INSTANCE: 'test', ...overrides };
  const manager = createPoolManager({ env, ipTypes: {}, authTypes: {},
    createConnector: () => { counts.created++; return { getOptions: async () => { await behavior.options?.(); return {}; }, close: () => counts.closed++ }; },
    createPool: value => { options = value; return { end: async () => { counts.ended++; await behavior.end?.(); } }; },
  });
  return { manager, counts, options: () => options };
}
test('concurrent callers share a pool, limits apply, shutdown is idempotent', async () => {
  const f = fixture({ CMS_DB_CONNECTION_LIMIT: '12', CMS_DB_QUEUE_LIMIT: '0', CMS_DB_CONNECT_TIMEOUT_MS: '2500' });
  const pools = await Promise.all(Array.from({ length: 20 }, () => f.manager.get('CMS')));
  assert.ok(pools.every(pool => pool === pools[0]));
  assert.equal(f.counts.created, 1);
  assert.equal(f.options().connectionLimit, 12);
  assert.equal(f.options().queueLimit, 0);
  assert.equal(f.options().connectTimeout, 2500);
  await Promise.all([f.manager.close(), f.manager.close()]);
  assert.deepEqual(f.counts, { created: 1, closed: 1, ended: 1 });
  await assert.rejects(f.manager.get('CMS'), /shutting down/);
});
test('failed initialization closes connector and can retry', async () => {
  let fail = true;
  const f = fixture({}, { options: () => { if (fail) throw new Error('offline'); } });
  await assert.rejects(f.manager.get('CMS'), /offline/);
  fail = false;
  await f.manager.get('CMS');
  await f.manager.close();
  assert.deepEqual(f.counts, { created: 2, closed: 2, ended: 1 });
});
test('shutdown waits for initialization and closes connector even when pool end fails', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({}, { options: () => gate, end: () => { throw new Error('end failed'); } });
  const start = f.manager.get('CMS');
  const stop = f.manager.close();
  release();
  await start;
  await assert.rejects(stop, /shutdown failed/);
  assert.equal(f.counts.closed, 1);
});
test('invalid limits fail before opening connector; local mode stays offline', async () => {
  for (const value of ['0', '-1', '1.5', 'NaN']) {
    const f = fixture({ CMS_DB_CONNECTION_LIMIT: value });
    await assert.rejects(f.manager.get('CMS'), /CMS_DB_CONNECTION_LIMIT/);
    assert.equal(f.counts.created, 0);
  }
  const f = fixture({ CMS_DATABASE_PROVIDER: 'local' });
  assert.equal(await f.manager.get('CMS'), null);
  await f.manager.close();
  assert.equal(f.counts.created, 0);
});
