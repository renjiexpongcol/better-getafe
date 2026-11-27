import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const values = { 'storage.signedUrlMinutes': 15, 'storage.visibility': 'private' };
let databaseBuilds = 0;
mock.module('../server/src/services/database.js', { namedExports: {
  buildDatabase: async () => { databaseBuilds++; return {}; }, activateDatabase: () => {}, discardDatabase: async () => {},
} });
mock.module('../server/src/services/email.js', { namedExports: { buildEmail: async () => null, activateEmail: () => {} } });
mock.module('../server/src/config/index.js', { namedExports: { config: { values, get: key => values[key] } } });
mock.module('../server/src/services/mediaWriteGate.js', { namedExports: { withBackblazeWrite: operation => operation(), maxDirectUploadSeconds: 900 } });
mock.module('../server/src/services/azureStorageTest.js', { namedExports: { azureCredential: () => ({}), testAzureStorage: async () => { throw Error('startup must not write test blobs'); } } });
let propertiesCalls = 0, azureFailure, b2Calls = 0;
const operations = [];
const container = {
  url: 'https://lgumedia.blob.core.windows.net/portal-media',
  async getProperties() { propertiesCalls++; if (azureFailure) throw azureFailure; return {}; },
  getBlockBlobClient(key) { return {
    async uploadData(bytes) { operations.push(['upload', key, bytes.toString()]); },
    async downloadToBuffer() { operations.push(['download', key]); return Buffer.from('fixture'); },
    async generateSasUrl(options) { operations.push(['url', key, options]); return 'https://fixture.invalid/signed'; },
    async getProperties() { return { contentLength: 7 }; },
  }; },
  listBlobsByHierarchy() { return { byPage: () => ({ next: async () => ({ value: { segment: { blobPrefixes: [{ name: 'news/' }], blobItems: [] } } }) }) }; },
};
mock.module('@azure/storage-blob', { namedExports: {
  BlobServiceClient: class { getContainerClient() { return container; } },
  BlobSASPermissions: { parse: value => value },
} });
const storage = await import('../server/src/services/storage.js');
const selection = await import('../server/src/services/storageSelection.js');
const { prepareRuntime, systemStatus } = await import('../server/src/services/runtimeConfiguration.js');
const azureValues = { 'storage.provider': 'azure', 'storage.azureAccount': 'lgumedia', 'storage.azureContainer': 'portal-media', 'storage.azureAuthentication': 'connection-string' };
test('Azure activation verifies the container and all operations use that container without B2 fallback', async () => {
  storage.setStorageClientFactoryForTests(() => { b2Calls++; throw Error('unexpected B2'); });
  assert.equal(storage.storageHealth().status, 'degraded');
  const resource = await storage.buildStorage(azureValues, { verifiedCutover: true, startupCheck: true });
  assert.equal(propertiesCalls, 1);
  storage.activateStorage(resource);
  assert.deepEqual(storage.storageHealth(), { provider: 'azure', status: 'healthy' });
  await storage.uploadObject('news/test.png', Buffer.from('fixture'), 'image/png');
  assert.equal((await storage.readObject('news/test.png')).toString(), 'fixture');
  await storage.createDownloadUrl('news/test.png', 'portal-media', 'azure');
  assert.deepEqual((await storage.listAzureMediaFolder('')).folders, ['news']);
  assert.equal((await storage.getObjectMetadata('news/test.png')).ContentLength, 7);
  assert.deepEqual(operations.map(item => item[0]), ['upload', 'download', 'url']);
  await assert.rejects(storage.createDownloadUrl('news/test.png', 'old-bucket', 'backblaze'), error => error.status === 503);
  assert.equal(b2Calls, 0);
  const upload = await storage.createUploadUrl('news/new.png', 'image/png', 7);
  assert.equal(upload, 'https://fixture.invalid/signed');
  const options = operations.at(-1)[2];
  assert.equal(options.permissions, 'c');
  assert.equal(options.protocol, 'https');
  assert.ok(options.expiresOn.getTime() - Date.now() <= 900000);
});
test('storage health checks are cached, coalesced and report Azure unavailable without switching providers', async () => {
  const before = propertiesCalls;
  await storage.refreshStorageHealth();
  assert.equal(propertiesCalls, before);
  azureFailure = Object.assign(Error('private'), { statusCode: 403 });
  await Promise.all([storage.refreshStorageHealth(Date.now() + 61000), storage.refreshStorageHealth(Date.now() + 61000)]);
  assert.equal(propertiesCalls, before + 1);
  assert.deepEqual(storage.storageHealth(), { status: 'degraded', provider: 'azure' });
  await assert.rejects(storage.buildStorage(azureValues, { verifiedCutover: true, startupCheck: true }));
  assert.equal(b2Calls, 0);
  azureFailure = undefined;
  await storage.refreshStorageHealth(Date.now() + 122000);
  assert.equal(storage.storageHealth().status, 'healthy');
});
test('unreadable cutover journals block activation and pending cutover acceptance still freezes writes', async () => {
  await selection.refreshStorageSelection({ execute: async () => { throw Object.assign(Error(), { code: 'ECONNREFUSED' }); } });
  await assert.rejects(storage.buildStorage(azureValues, { verifiedCutover: true, startupCheck: true }), /journal unavailable/);
  await selection.refreshStorageSelection({ execute: async () => [[{ status: 'active' }]] });
  assert.throws(() => storage.runMediaWrite(() => {}), error => error.code === 'MEDIA_WRITES_PAUSED');
  selection.setVerifiedAzureStatus('accepted');
  assert.equal(storage.runMediaWrite(() => 'ok'), 'ok');
  selection.setVerifiedAzureStatus(undefined);
});
test('runtime follows a committed Azure selection during failure and recovery while reusing database resources', async () => {
  selection.setVerifiedAzureStatus('accepted');
  azureFailure = Object.assign(Error('private'), { statusCode: 403 });
  const previous = { ...azureValues, 'storage.provider': 'backblaze' };
  (await prepareRuntime(azureValues, previous, { initializing: true })).activate();
  assert.equal(databaseBuilds, 2);
  assert.equal(systemStatus.storage.provider, 'azure');
  assert.equal(systemStatus.storage.status, 'degraded');
  assert.equal(storage.storageLocation().provider, 'azure');
  await assert.rejects(storage.createUploadUrl('news/test.png', 'image/png', 7), error => error.status === 503);
  azureFailure = undefined;
  (await prepareRuntime(azureValues, azureValues)).activate();
  assert.equal(databaseBuilds, 2);
  assert.deepEqual(storage.storageHealth(), { provider: 'azure', status: 'healthy' });
  assert.equal(b2Calls, 0);
  selection.setVerifiedAzureStatus(undefined);
});
