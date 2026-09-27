import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { HeadBucketCommand, HeadObjectCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../server/src/config/index.js';
import { activateStorage, buildStorage, createDownloadUrl, createUploadUrl, deleteObject, getObjectMetadata, imageSignatureMatches, readObject, readPrivateFile, setStorageClientFactoryForTests, setStoragePresignerForTests, storageIsLocal, uploadObject, writePrivateFile } from '../server/src/services/storage.js';

const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'getafe-storage-'));
const bucketConfig = {
  'storage.provider': 'backblaze',
  'storage.endpoint': 'https://s3.us-test-001.backblazeb2.com',
  'storage.region': 'us-test-001',
  'storage.bucket': 'portal-test-bucket',
  'storage.keyId': 'test-key-id',
  'storage.applicationKey': 'test-application-key',
  'storage.signedUrlMinutes': 15,
  'storage.visibility': 'private',
  'storage.publicBaseUrl': '',
  'storage.localPath': path.join(testRoot, 'uploads'),
};

let failure;
let object;
let clientOptions;
const signedCommands = [];
const commands = [];
class FakeClient {
  constructor(options) { clientOptions = options; }
  async send(command) {
    commands.push(command);
    if (failure) { if (failure.sequence?.length) { const next = failure.sequence.shift(); if (next) throw next; } else throw failure; }
    if (command instanceof HeadBucketCommand) return {};
    if (command instanceof HeadObjectCommand) {
      if (!object) { const error = new Error('missing object'); error.name = 'NotFound'; error.$metadata = { httpStatusCode: 404 }; throw error; }
      return { ContentLength: object.Body.length, ContentType: object.ContentType };
    }
    if (command instanceof PutObjectCommand) { object = { Body: command.input.Body, ContentType: command.input.ContentType }; return {}; }
    if (command instanceof GetObjectCommand) return { Body: { transformToByteArray: async () => object.Body } };
    if (command instanceof DeleteObjectCommand) { object = null; return {}; }
    throw new Error(`Unexpected S3 command ${command.constructor.name}`);
  }
  destroy() {}
}
setStorageClientFactoryForTests(options => new FakeClient(options));
setStoragePresignerForTests(async (client, command, options) => {
  signedCommands.push({ command, options });
  return `https://s3.us-test-001.backblazeb2.com/${command.input.Bucket}/${command.input.Key}?signed=1`;
});
const prior = { ...config.values };
try {
  const resource = await buildStorage(bucketConfig);
  activateStorage(resource);
  assert.equal(resource.provider, 'backblaze');
  assert.equal(clientOptions.endpoint, bucketConfig['storage.endpoint']);
  assert.equal(clientOptions.region, bucketConfig['storage.region']);
  assert.equal(clientOptions.credentials.accessKeyId, bucketConfig['storage.keyId']);

  const key = `news/${crypto.randomUUID()}.jpg`;
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  assert.equal(imageSignatureMatches(bytes, 'image/jpeg'), true);
  assert.equal(imageSignatureMatches(bytes, 'image/png'), false);
  const signed = await createUploadUrl(key, 'image/jpeg', bytes.length);
  assert.match(signed, /^https:\/\//);
  assert.equal(signedCommands[0].command.input.ContentType, 'image/jpeg');
  assert.equal(signedCommands[0].options.expiresIn, 900);
  await uploadObject(key, bytes, 'image/jpeg');
  assert.deepEqual(await getObjectMetadata(key), { ContentLength: bytes.length, ContentType: 'image/jpeg' });
  assert.deepEqual(await readObject(key), bytes, 'remote object can be retrieved through the storage service');
  const download = await createDownloadUrl(key);
  assert.match(download, /^https:\/\//);
  assert.equal(signedCommands[1].command.input.Key, key);
  config.values['storage.visibility'] = 'public';
  config.values['storage.publicBaseUrl'] = 'https://media.example.gov.ph';
  assert.equal(await createDownloadUrl(key), `https://media.example.gov.ph/${key}`);
  config.values['storage.visibility'] = 'private';
  config.values['storage.publicBaseUrl'] = '';
  await deleteObject(key);
  assert.equal(await getObjectMetadata(key), null);

  const incomplete = { ...bucketConfig, 'storage.bucket': '', 'storage.keyId': '', 'storage.applicationKey': '', 'storage.endpoint': '', 'storage.region': '' };
  await assert.rejects(() => buildStorage(incomplete), /Missing: B2_ENDPOINT, B2_REGION, B2_BUCKET_NAME, B2_KEY_ID, B2_APPLICATION_KEY/);
  await assert.rejects(() => buildStorage({ ...bucketConfig, 'storage.endpoint': 'https://console.backblaze.com' }), /region does not match/);
  const timeoutError = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
  failure = timeoutError;
  await assert.rejects(() => buildStorage(bucketConfig), error => error.message.includes('connection timed out') && error.cause === timeoutError);
  failure = null;

  failure = Object.assign(new Error('access denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } });
  await assert.rejects(() => buildStorage(bucketConfig), /access denied.*PERMISSION/);
  failure = null;
  const temporary = Object.assign(new Error('temporary backend'), { name: 'ServiceUnavailable', $metadata: { httpStatusCode: 503 } });
  temporary.sequence = [temporary, null];
  failure = temporary;
  await uploadObject('news/retry.jpg', bytes, 'image/jpeg');
  assert.equal(commands.filter(command => command instanceof PutObjectCommand).length, 3, 'transient B2 failures retry and then succeed');
  failure = null;

  activateStorage(await buildStorage({ ...bucketConfig, 'storage.provider': 'local' }));
  assert.equal(storageIsLocal(), true);
  await uploadObject('local/test.jpg', bytes, 'image/jpeg');
  assert.equal((await getObjectMetadata('local/test.jpg')).ContentLength, bytes.length);
  assert.deepEqual(await readObject('local/test.jpg'), bytes);
  await deleteObject('local/test.jpg');
  await writePrivateFile('admin-avatars/admin/one.jpg', bytes, 'image/jpeg');
  assert.deepEqual(await readPrivateFile('admin-avatars/admin/one.jpg'), bytes);
  await deleteObject('admin-avatars/admin/one.jpg');
  console.log('Storage service checks passed.');
} finally {
  activateStorage(null);
  setStorageClientFactoryForTests(null);
  setStoragePresignerForTests(null);
  await fs.rm(testRoot, { recursive: true, force: true });
  Object.assign(config.values, prior);
}
