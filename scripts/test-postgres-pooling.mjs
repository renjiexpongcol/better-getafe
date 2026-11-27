import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

const pools = [];
class Pool {
  constructor(options) { this.options = options; this.closed = false; pools.push(this); }
  query() { assert.equal(this.closed, false); return Promise.resolve({ rows: [{ ok: 1 }] }); }
  async end() { assert.equal(this.closed, false); this.closed = true; }
}
mock.module('pg', { defaultExport: { Pool } });
mock.module('../server/src/config/deployment.js', { namedExports: { deployment: { serverless: true } } });
const { acquirePostgresPool } = await import('../server/src/services/postgresPool.js');

test('CMS, resident and settings leases share bounded connections without premature shutdown', async () => {
  const options = { connectionString: 'postgresql://fixture.invalid', ssl: { rejectUnauthorized: true } };
  const cms = acquirePostgresPool({ ...options, max: 100 });
  const resident = acquirePostgresPool({ ...options, application_name: 'resident' });
  const settings = acquirePostgresPool(options);
  assert.equal(pools.length, 1);
  assert.equal(cms.options.max, 2);
  assert.equal(cms.options.connectionTimeoutMillis, 5000);
  await cms.end();
  await cms.end();
  assert.equal((await resident.query('SELECT 1')).rows[0].ok, 1);
  await resident.end();
  assert.equal(pools[0].closed, false);
  await settings.end();
  assert.equal(pools[0].closed, true);
  const replacement = acquirePostgresPool(options);
  assert.equal(pools.length, 2);
  await replacement.end();
});
