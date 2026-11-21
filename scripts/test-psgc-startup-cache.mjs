import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
const queries = [];
mock.module('../server/src/services/database.js', { namedExports: { getCmsPool: async () => ({
  execute: async sql => {
    queries.push(sql);
    if (sql.includes('FROM psgc_sync_state')) return [[{ source_version: 'Q3_2026', record_count: 24 }]];
    if (sql.includes('FROM psgc_barangay_reference')) return [[{ count: 24 }]];
    throw Error('unexpected write or lookup');
  },
}) } });
mock.module('../server/src/services/cacheService.js', { namedExports: { cacheService: {} } });
mock.module('../server/src/config/index.js', { namedExports: { config: { get: key => key.endsWith('Token') ? 'fixture-token' : 'Q3_2026' } } });
const { syncGetafePsgc } = await import('../server/src/services/psgcSyncService.js');
test('valid saved PSGC snapshots avoid external requests and writes across repeated startup syncs', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = () => { throw Error('unexpected external request'); };
  for (let i = 0; i < 2; i++) {
    const result = await syncGetafePsgc();
    assert.equal(result.cached, true);
    assert.equal(result.recordCount, 24);
  }
  assert.equal(queries.length, 4);
  assert.ok(queries.every(sql => sql.startsWith('SELECT')));
});
