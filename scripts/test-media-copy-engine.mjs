import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

let target;
mock.module('@azure/storage-blob', { namedExports: { BlobServiceClient: class { getContainerClient() { return target; } } } });
mock.module('../server/src/services/azureStorageTest.js', { namedExports: { azureCredential: () => ({}) } });
const { migrateMediaToAzure } = await import('../server/src/services/azureMediaCopy.js');
const settings = {
  'storage.endpoint': 'https://s3.us-west-004.backblazeb2.com', 'storage.region': 'us-west-004', 'storage.bucket': 'legacy',
  'storage.keyId': 'fixture-key', 'storage.applicationKey': 'fixture-secret', 'storage.azureAccount': 'lgumedia',
  'storage.azureContainer': 'portal-media', 'storage.azureAuthentication': 'connection-string',
};
function fixture(sourceBodies, destinationBodies) {
  const destination = new Map(Object.entries(destinationBodies).map(([name, body]) => [name, { body, properties: { contentLength: body.length, contentType: 'image/jpeg' }, metadata: { caption: 'preserved' } }]));
  let writes = 0, destroyed = false;
  target = {
    async getProperties() { return {}; },
    async *listBlobsFlat() { for (const [name, blob] of destination) yield { name, properties: blob.properties, metadata: blob.metadata }; },
    getBlobClient(name) { return {
      async getProperties() { const blob = destination.get(name); return { ...blob.properties, metadata: blob.metadata }; },
      async download() { return { readableStreamBody: Readable.from([destination.get(name).body]) }; },
    }; },
    getBlockBlobClient(name) { return { async uploadStream(stream, _chunkSize, _concurrency, options) {
      assert.deepEqual(options.conditions, { ifNoneMatch: '*' });
      assert.equal(destination.has(name), false, 'never overwrite a destination object');
      const parts = []; for await (const chunk of stream) parts.push(chunk);
      const body = Buffer.concat(parts);
      destination.set(name, { body, properties: { contentLength: body.length, contentType: options.blobHTTPHeaders.blobContentType }, metadata: options.metadata });
      writes++;
    } }; },
  };
  const source = {
    async send(command) {
      if (command.constructor.name === 'ListObjectsV2Command') return { Contents: Object.entries(sourceBodies).map(([Key, body]) => ({ Key, Size: body.length })) };
      return { Body: Readable.from([sourceBodies[command.input.Key]]), ContentType: 'image/jpeg', Metadata: { caption: 'preserved' } };
    },
    destroy() { destroyed = true; },
  };
  return { source, destination, get writes() { return writes; }, get destroyed() { return destroyed; } };
}

test('extracted migration engine inventories without writes and distinguishes collisions/missing objects', async () => {
  const data = fixture({ 'media/same.jpg': Buffer.from('same'), 'media/new.jpg': Buffer.from('new'), 'media/collision.jpg': Buffer.from('old') }, {
    'media/same.jpg': Buffer.from('same'), 'media/collision.jpg': Buffer.from('bad'), 'media/azure-only.jpg': Buffer.from('retained'),
  });
  const records = [];
  const result = await migrateMediaToAzure({}, { settings, ClientFactory: () => data.source, onRecord: async row => records.push(row) });
  assert.equal(data.writes, 0);
  assert.equal(data.destroyed, true);
  assert.equal(result.totals.verified, 1);
  assert.equal(result.totals.missing, 1);
  assert.deepEqual(new Set(records.map(row => row.status)), new Set(['verified', 'missing_in_azure', 'collision_or_mismatch', 'azure_only']));
  assert.equal(data.destination.get('media/collision.jpg').body.toString(), 'bad');
});

test('copying preserves bytes/metadata, verifies checksum and uses collision-safe creation', async () => {
  const data = fixture({ 'media/new.jpg': Buffer.from('new') }, {});
  const result = await migrateMediaToAzure({ copy: true }, { settings, ClientFactory: () => data.source });
  assert.equal(data.writes, 1);
  assert.equal(data.destination.get('media/new.jpg').body.toString(), 'new');
  assert.deepEqual(data.destination.get('media/new.jpg').metadata, { caption: 'preserved' });
  assert.equal(result.totals.copied, 1);
  assert.equal(result.totals.verified, 1);
  assert.equal(result.totals.unresolved, 0);
  assert.equal(result.verifiedKeys.has('media/new.jpg'), true);
  assert.equal(data.destroyed, true);
});
