import '../src/config/bootstrap.js';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
import { config } from '../src/config/index.js';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { createBackblazeHttpsAgent } from '../src/services/b2HttpAgent.js';

const lifecycle = process.argv.includes('--lifecycle');
const values = config.values;
const endpointValue = String(values['storage.endpoint'] || '').trim();
const region = String(values['storage.region'] || '').trim();
const bucket = String(values['storage.bucket'] || '').trim();
const accessKeyId = values['storage.keyId'];
const secretAccessKey = values['storage.applicationKey'];

function summarizeProxy(value) {
  if (!value) return 'not configured';
  try {
    const proxy = new URL(value);
    return `configured (${proxy.protocol}//${proxy.hostname}${proxy.port ? `:${proxy.port}` : ''}; credentials ${proxy.username || proxy.password ? 'present' : 'absent'})`;
  } catch { return 'configured (details hidden; invalid URL)'; }
}

function httpsProbe(hostname, address, family) {
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const request = https.request({ hostname: address, servername: hostname, headers: { Host: hostname }, family, path: '/', method: 'HEAD', timeout: 10_000 }, response => {
      const remoteAddress = response.socket.remoteAddress;
      const remoteFamily = response.socket.remoteFamily;
      response.resume();
      finish({ ok: true, status: response.statusCode, remoteAddress, remoteFamily });
    });
    const timer = setTimeout(() => request.destroy(Object.assign(new Error('HTTPS probe timed out'), { code: 'ETIMEDOUT' })), 10_000);
    request.once('error', error => finish({ ok: false, code: error.code || error.name || 'UnknownError' }));
    request.end();
  });
}

function reportSdkFailure(operation, error) {
  const details = [];
  for (let cause = error; cause && details.length < 4; cause = cause.cause) {
    details.push({ name: cause.name || null, code: cause.Code || cause.code || null, syscall: cause.syscall || null, address: cause.address || null, port: cause.port || null });
  }
  console.error(`${operation}: FAILED (name ${error.name || 'n/a'}, code ${error.Code || error.code || 'n/a'}, HTTP ${error.$metadata?.httpStatusCode || 'n/a'}, attempts ${error.$metadata?.attempts || 'n/a'}, total retry delay ${error.$metadata?.totalRetryDelay ?? 'n/a'}ms, cause ${JSON.stringify(details)})`);
}

let client;
let key;
let failure;
let uploaded = false;
try {
  if (!endpointValue || !region || !bucket || !accessKeyId || !secretAccessKey) throw new Error('B2_ENDPOINT, B2_REGION, B2_BUCKET_NAME, B2_KEY_ID and B2_APPLICATION_KEY must all be configured.');
  const endpoint = new URL(endpointValue);
  const expectedHost = `s3.${region}.backblazeb2.com`;
  if (endpoint.protocol !== 'https:' || endpoint.hostname.toLowerCase() !== expectedHost.toLowerCase() || endpoint.pathname !== '/' || endpoint.search || endpoint.hash || endpoint.username || endpoint.password) throw new Error(`Configured B2 endpoint must be https://${expectedHost}.`);

  console.log('[Storage] Provider: Backblaze B2');
  console.log(`[Storage] Region: ${region}`);
  console.log(`[Storage] Bucket: ${bucket}`);
  console.log(`[Storage] Endpoint: ${endpoint.origin}`);
  console.log('[Storage] Credentials: configured');
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY']) {
    const value = process.env[name] || process.env[name.toLowerCase()];
    console.log(`[Storage] ${name}: ${name === 'NO_PROXY' ? (value ? 'configured' : 'not configured') : summarizeProxy(value)}`);
  }

  let ipv4 = [];
  let ipv6 = [];
  try { ipv4 = await dns.resolve4(endpoint.hostname); } catch {}
  try { ipv6 = await dns.resolve6(endpoint.hostname); } catch {}
  if (!ipv4.length && !ipv6.length) throw Object.assign(new Error('B2 endpoint DNS lookup failed.'), { code: 'ENOTFOUND' });
  console.log('[Storage] DNS: OK');
  console.log(`[Storage] DNS IPv4: ${ipv4.length ? ipv4.join(', ') : 'none'}`);
  console.log(`[Storage] DNS IPv6: ${ipv6.length ? ipv6.join(', ') : 'none'}`);

  for (const [family, records] of [[4, ipv4], [6, ipv6]]) {
    if (!records.length) {
      console.log(`[Storage] IPv${family}: FAILED (no address records)`);
      continue;
    }
    const address = records[0];
    const tcp = await new Promise(resolve => {
      const socket = net.connect({ host: address, port: 443, family });
      const timer = setTimeout(() => socket.destroy(Object.assign(new Error('TCP probe timed out'), { code: 'ETIMEDOUT' })), 5_000);
      socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve({ ok: true }); });
      socket.once('error', error => { clearTimeout(timer); resolve({ ok: false, code: error.code || error.name || 'UnknownError' }); });
    });
    const rawHttps = await httpsProbe(endpoint.hostname, address, family);
    console.log(`[Storage] IPv${family} TCP 443: ${tcp.ok ? 'OK' : `FAILED (${tcp.code})`}`);
    console.log(`[Storage] IPv${family} HTTPS: ${rawHttps.ok ? `OK (HTTP ${rawHttps.status}, remote IPv${rawHttps.remoteFamily === 'IPv6' ? '6' : '4'})` : `FAILED (${rawHttps.code})`}`);
  }

  console.log(`[Storage] S3 client configuration: ${JSON.stringify({ endpoint: endpoint.origin, region, bucket, forcePathStyle: true, maxAttempts: 3 })}`);
  client = new S3Client({
    endpoint: endpoint.origin,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 3,
    requestHandler: new NodeHttpHandler({ connectionTimeout: 8_000, requestTimeout: 20_000, httpsAgent: createBackblazeHttpsAgent({ onAddress: selected => console.log(`[Storage] SDK DNS selection: IPv${selected.family} ${selected.address}`) }) }),
  });
  try {
    const headBucket = await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`[Storage] S3 HeadBucket: OK (attempts ${headBucket.$metadata?.attempts || 1}, total retry delay ${headBucket.$metadata?.totalRetryDelay || 0}ms)`);
    console.log('[Storage] S3 authentication: OK');
    console.log('[Storage] Bucket access: OK');
  } catch (error) {
    reportSdkFailure('[Storage] S3 HeadBucket', error);
    throw error;
  }

  if (lifecycle) {
    key = `health-tests/${crypto.randomUUID()}.txt`;
    const body = Buffer.from(`Getafe B2 lifecycle diagnostic ${crypto.randomUUID()}\n`, 'utf8');
    uploaded = true;
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'text/plain' }));
    console.log('[Storage] PutObject: PASS');
    const metadata = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (metadata.ContentLength !== body.length) throw new Error('HeadObject returned unexpected object metadata.');
    console.log('[Storage] HeadObject: PASS');
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!Buffer.from(await object.Body.transformToByteArray()).equals(body)) throw new Error('GetObject content did not match the uploaded test object.');
    console.log('[Storage] GetObject: PASS');
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    uploaded = false;
    console.log('[Storage] DeleteObject: PASS');
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      throw new Error('Deleted test object is still present.');
    } catch (error) {
      if (error.message === 'Deleted test object is still present.' || !(error.name === 'NotFound' || error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404)) throw error;
    }
    console.log('[Storage] Confirm deletion: PASS');
  }
} catch (error) {
  failure = error;
  console.error(`[Storage] Diagnostic failed: ${error.message || error.name || 'unknown error'}`);
} finally {
  if (client && uploaded && key) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      console.log('[Storage] Lifecycle cleanup: PASS');
    } catch (error) {
      console.error(`[Storage] Lifecycle cleanup: FAILED (${error.name || 'UnknownError'})`);
      failure ||= error;
    }
  }
  client?.destroy();
}

if (failure) process.exitCode = 1;
else console.log('[Storage] Status: READY');
