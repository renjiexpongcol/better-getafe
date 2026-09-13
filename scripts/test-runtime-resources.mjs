import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
const values = { 'database.provider': 'mysql', 'portalDatabase.provider': 'local', 'storage.provider': 'gcp', 'storage.bucket': 'first', 'storage.signedUrlMinutes': 15, 'storage.visibility': 'private', 'google.projectId': 'project' };
let fail = false;
const pools = [];
mock.module('../src/config/index.js', { namedExports: { config: { values, get: key => values[key] } } });
mock.module('mysql2/promise', { defaultExport: { createPool: options => {
 const pool = { options, ended: false, execute: async () => { if (fail) throw Object.assign(new Error('private password should not leak'), { code: 'ER_ACCESS_DENIED_ERROR' }); return [[{ id: 'admin', role: 'admin' }]]; }, getConnection: async () => ({ release() {}, execute: async () => [[]] }), end: async () => { pool.ended = true; } };
 pools.push(pool); return pool;
} } });
let lastBucket;
mock.module('@google-cloud/storage', { namedExports: { Storage: class {
 bucket(name) {
  const bucket = { name, storage: this, getMetadata: async () => [{ location: 'ASIA' }], iam: { testPermissions: async required => [Object.fromEntries(required.map(key => [key, true]))] }, file: path => ({ getSignedUrl: async options => { lastBucket = { name, path, options }; return [`signed:${name}:${path}`]; } }) };
  return bucket;
 }
} } });
const db = await import('../src/services/cloudSql.js');
const storage = await import('../src/services/storage.js');
test('controlled pool swap preserves leased transactions and rejects bad candidate without affecting active pool', async () => {
 const first = await db.buildDatabase(values, 'database', { id: 'admin' });
 db.activateDatabase('database', first);
 const facade = await db.getCmsPool();
 const lease = await facade.getConnection();
 const second = await db.buildDatabase({ ...values, 'database.name': 'second' }, 'database', { id: 'admin' });
 db.activateDatabase('database', second);
 assert.equal(pools[0].ended, false);
 lease.release();
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(pools[0].ended, true);
 fail = true;
 await assert.rejects(db.buildDatabase(values, 'database'), error => !error.message.includes('private password'));
 assert.equal(pools[1].ended, false);
 assert.equal(pools[2].ended, true);
 fail = false;
 await facade.execute('SELECT 1');
 await db.closeCloudSql();
 assert.equal(pools[1].ended, true);
});
test('storage applies bucket swap and URL lifetime; historic bucket can still be read', async () => {
 storage.activateStorage(await storage.buildStorage(values));
 assert.equal(await storage.createUploadUrl('file.png', 'image/png'), 'signed:first:file.png');
 values['storage.bucket'] = 'second'; values['storage.signedUrlMinutes'] = 60;
 storage.activateStorage(await storage.buildStorage(values));
 const before = Date.now();
 assert.equal(await storage.createUploadUrl('file.png', 'image/png'), 'signed:second:file.png');
 assert.ok(lastBucket.options.expires >= before + 3600000);
 assert.equal(await storage.createDownloadUrl('old.png', 'first'), 'signed:first:old.png');
});
