import '../src/config/bootstrap.js';
import crypto from 'node:crypto';
import { config } from '../src/config/index.js';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { activateStorage, buildStorage, storageHealth } from '../src/services/storage.js';

const lifecycle = process.argv.includes('--lifecycle');
let storage;
let key;
let failure;

try {
  storage = await buildStorage(config.values);
  console.info('[Storage test] Startup connection and authenticated bucket-access check: PASS');
  activateStorage(storage);
  const health = storageHealth();
  if (health.status !== 'healthy' || health.provider !== 'backblaze-b2') throw new Error('Storage health did not report a healthy Backblaze B2 provider.');
  console.info(`[Storage test] Storage health: ${JSON.stringify(health)}`);
  if (lifecycle) {
    key = `health-tests/${crypto.randomUUID()}.txt`;
    const body = Buffer.from(`Getafe B2 lifecycle check ${crypto.randomUUID()}\n`, 'utf8');
    const client = storage.client;
    const bucket = storage.bucket;
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'text/plain' }));
    console.info('[Storage test] PutObject: PASS');
    const metadata = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (metadata.ContentLength !== body.length) throw new Error('HeadObject returned unexpected object metadata.');
    console.info('[Storage test] HeadObject: PASS');
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const received = Buffer.from(await result.Body.transformToByteArray());
    if (!received.equals(body)) throw new Error('GetObject content did not match the uploaded test object.');
    console.info('[Storage test] GetObject: PASS');
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    console.info('[Storage test] DeleteObject: PASS');
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      throw new Error('Deleted test object is still present.');
    } catch (error) {
      if (error.message === 'Deleted test object is still present.' || !(error.name === 'NotFound' || error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404)) throw error;
    }
    console.info('[Storage test] Confirm deletion: PASS');
  }
} catch (error) {
  failure = error;
  console.error(`[Storage test] FAILED: ${error.message}`);
} finally {
  if (storage?.client && key) {
    try {
      await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }));
      console.info('[Storage test] Cleanup: PASS');
    } catch (error) {
      console.error(`[Storage test] Cleanup: FAILED (${error.name || 'UnknownError'})`);
      failure ||= error;
    }
  }
  if (storage) activateStorage(null);
}

if (failure) process.exitCode = 1;
else if (!lifecycle) console.info('[Storage test] Run with --lifecycle to upload, read, and delete a temporary health-tests object.');
