import {
  S3Client,
  HeadBucketCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  GetBucketAclCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { config } from '../config/index.js';
import { createBackblazeHttpsAgent } from './b2HttpAgent.js';

const MAX_ATTEMPTS = 3;
const CONNECTION_TIMEOUT_MS = 8_000;
const REQUEST_TIMEOUT_MS = 20_000;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
let activeStorage = { provider: null, client: null, bucket: null, root: null, endpoint: null, region: null };
const defaultClientFactory = options => new S3Client(options);
let clientFactory = defaultClientFactory;
let presign = (client, command, options) => getSignedUrl(client, command, options);
export function setStorageClientFactoryForTests(factory) { clientFactory = factory || defaultClientFactory; }
export function setStoragePresignerForTests(factory) { presign = factory || ((client, command, options) => getSignedUrl(client, command, options)); }

function errorCode(error) {
  return error?.Code || error?.code || error?.name || 'UnknownError';
}

function storageError(operation, key, error) {
  console.error(JSON.stringify({ event: 'storage_operation', provider: activeStorage.provider === 'backblaze' ? 'backblaze-b2' : activeStorage.provider, operation, key: key || null, result: 'failed', errorCode: errorCode(error), status: error?.$metadata?.httpStatusCode || null }));
}

function retryable(error) {
  const status = Number(error?.$metadata?.httpStatusCode || error?.statusCode || 0);
  const name = errorCode(error);
  return RETRYABLE_STATUS.has(status) || ['TimeoutError', 'RequestTimeout', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'NetworkingError', 'InternalError', 'SlowDown'].includes(name) || name.startsWith('NetworkingError:');
}

async function send(operation, key, command) {
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await activeStorage.client.send(command);
      console.info(JSON.stringify({ event: 'storage_operation', provider: 'backblaze-b2', operation, key: key || null, result: 'ok', attempt }));
      return result;
    } catch (error) {
      if (attempt < MAX_ATTEMPTS && retryable(error)) {
        await new Promise(resolve => setTimeout(resolve, 100 * (2 ** (attempt - 1))));
        continue;
      }
      storageError(operation, key, error);
      throw error;
    }
  }
}

function validObjectKey(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= 1024 && !key.startsWith('/') && !key.includes('\\') && !/[\0-\x1f\x7f]/.test(key) && !key.split('/').some(part => !part || part === '.' || part === '..');
}

function localPath(key, root = activeStorage.root) {
  if (!validObjectKey(key)) throw new Error('Invalid storage object key.');
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, key);
  if (!target.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('Invalid storage object key.');
  return target;
}

function localSettings(values) {
  return values['storage.localPath'] || process.env.LOCAL_STORAGE_PATH || 'data/uploads';
}

async function buildLocalStorage(values) {
  const root = path.resolve(localSettings(values));
  await fs.mkdir(root, { recursive: true });
  return { provider: 'local', root };
}

function explainConfiguration(candidate) {
  const missing = Object.entries(candidate).filter(([, value]) => !String(value || '').trim()).map(([name]) => ({ endpoint: 'B2_ENDPOINT', region: 'B2_REGION', bucket: 'B2_BUCKET_NAME', keyId: 'B2_KEY_ID', applicationKey: 'B2_APPLICATION_KEY' })[name]);
  if (missing.length) throw new Error(`Backblaze B2 storage configuration is incomplete. Missing: ${missing.join(', ')}`);
  let endpoint;
  const cleanEndpoint = String(candidate.endpoint || '').trim();
  if (/["']/.test(cleanEndpoint)) throw new Error('B2_ENDPOINT must not contain quote characters.');
  try { endpoint = new URL(cleanEndpoint); } catch { throw new Error('B2_ENDPOINT must be a valid HTTPS S3-compatible endpoint.'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
    throw new Error('B2_ENDPOINT must be the HTTPS S3-compatible service endpoint for the configured bucket region.');
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,62}$/i.test(candidate.bucket)) throw new Error('B2_BUCKET_NAME is invalid.');
  if (!/^[a-z0-9-]+$/i.test(candidate.region)) throw new Error('B2_REGION is invalid.');
  const expectedHost = `s3.${candidate.region}.backblazeb2.com`;
  if (endpoint.hostname.toLowerCase() !== expectedHost.toLowerCase()) throw new Error(`B2_ENDPOINT region does not match B2_REGION. Expected https://${expectedHost}.`);
  return endpoint.origin;
}

function classifyInitializationError(error) {
  const name = errorCode(error);
  const status = Number(error?.$metadata?.httpStatusCode || error?.statusCode || 0);
  if (name === 'TimeoutError' || name === 'ETIMEDOUT' || name === 'RequestTimeout') return 'Backblaze B2 connection timed out (NETWORK).';
  if (name === 'ENOTFOUND' || name === 'EAI_AGAIN') return 'Backblaze B2 endpoint could not be resolved (DNS).';
  if (name === 'ECONNREFUSED') return 'Backblaze B2 connection was refused (NETWORK).';
  if (['CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED'].includes(name)) return 'TLS connection to Backblaze B2 failed (TLS).';
  if (name === 'InvalidAccessKeyId' || name === 'UnrecognizedClientException' || name === 'InvalidToken') return 'Backblaze B2 credentials were rejected (AUTHENTICATION).';
  if (name === 'SignatureDoesNotMatch') return 'Backblaze B2 request signature was rejected. Check endpoint, region, credentials and signed headers (AUTHENTICATION).';
  if (name === 'NoSuchBucket') return 'Configured Backblaze B2 bucket was not found (BUCKET).';
  if (name === 'NotFound') return 'Backblaze B2 bucket or diagnostic object was not found (BUCKET).';
  if (['AccessDenied', 'Forbidden'].includes(name) || status === 403) return 'Backblaze B2 access denied. Check application-key permissions (PERMISSION).';
  if (['PermanentRedirect', 'AuthorizationHeaderMalformed', 'IncorrectEndpoint'].includes(name)) return 'Backblaze B2 endpoint/region does not match the bucket (REGION).';
  if (['ECONNRESET', 'NetworkingError', 'EHOSTUNREACH', 'ENETUNREACH'].includes(name)) return `Backblaze B2 network request failed (${name}, NETWORK).`;
  return `Backblaze B2 storage health check failed (${name}${status ? `, HTTP ${status}` : ''}).`;
}

function probeConnection({ address, family, secure, hostname }) {
  return new Promise(resolve => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(error ? { ok: false, code: error.code || error.name || 'UnknownError' } : { ok: true });
    };
    const socket = secure
      ? tls.connect({ host: address, port: 443, family, servername: hostname, rejectUnauthorized: true })
      : net.connect({ host: address, port: 443, family });
    const timer = setTimeout(() => finish(Object.assign(new Error('probe timed out'), { code: 'ETIMEDOUT' })), secure ? 6_000 : 4_000);
    socket.once(secure ? 'secureConnect' : 'connect', () => finish());
    socket.once('error', finish);
  });
}

async function diagnoseEndpoint(endpoint, region, bucket, credentialsConfigured) {
  const hostname = new URL(endpoint).hostname;
  console.info('[Storage] Provider: Backblaze B2');
  console.info(`[Storage] Endpoint: ${endpoint}`);
  console.info(`[Storage] Region: ${region}`);
  console.info(`[Storage] Bucket: ${bucket}`);
  console.info(`[Storage] Credentials configured: ${credentialsConfigured ? 'yes' : 'no'}`);
  console.info('[Storage] Configuration variables: B2_ENDPOINT=configured, B2_REGION=configured, B2_BUCKET_NAME=configured, B2_KEY_ID=configured, B2_APPLICATION_KEY=configured');
  console.info('[Storage] Connection test: starting...');
  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: false });
    console.info(`[Storage] DNS: OK (${addresses.length} address${addresses.length === 1 ? '' : 'es'})`);
    console.info(`[Storage] DNS IPv4: ${addresses.filter(address => address.family === 4).map(address => address.address).join(', ') || 'none'}`);
    console.info(`[Storage] DNS IPv6: ${addresses.filter(address => address.family === 6).map(address => address.address).join(', ') || 'none'}`);
  } catch (error) {
    console.info(`[Storage] DNS: FAILED (${error.code || error.name || 'UnknownError'})`);
    throw error;
  }
  const representatives = [4, 6].map(family => addresses.find(address => address.family === family)).filter(Boolean);
  let tcpResult;
  for (const address of representatives) {
    tcpResult = await probeConnection({ address: address.address, family: address.family, secure: false, hostname });
    if (tcpResult.ok) break;
  }
  console.info(`[Storage] TCP 443: ${tcpResult?.ok ? 'OK' : `FAILED (${tcpResult?.code || 'UnknownError'})`}`);
  if (!tcpResult?.ok) throw Object.assign(new Error('Backblaze B2 TCP connection failed.'), { code: tcpResult?.code || 'ETIMEDOUT' });
  let tlsResult;
  for (const address of representatives) {
    tlsResult = await probeConnection({ address: address.address, family: address.family, secure: true, hostname });
    if (tlsResult.ok) break;
  }
  console.info(`[Storage] TLS: ${tlsResult?.ok ? 'OK' : `FAILED (${tlsResult?.code || 'UnknownError'})`}`);
  if (!tlsResult?.ok) throw Object.assign(new Error('Backblaze B2 TLS connection failed.'), { code: tlsResult?.code || 'ETIMEDOUT' });
}

export async function buildStorage(values) {
  const provider = values['storage.provider'];
  if (provider === 'local') return buildLocalStorage(values);
  if (provider !== 'backblaze') throw new Error(`Unsupported storage provider: ${provider || '(empty)'}.`);

  const candidate = {
    endpoint: values['storage.endpoint'],
    region: values['storage.region'],
    bucket: values['storage.bucket'],
    keyId: values['storage.keyId'],
    applicationKey: values['storage.applicationKey'],
  };
  const missing = Object.entries(candidate).filter(([, value]) => !String(value || '').trim()).map(([name]) => ({ endpoint: 'B2_ENDPOINT', region: 'B2_REGION', bucket: 'B2_BUCKET_NAME', keyId: 'B2_KEY_ID', applicationKey: 'B2_APPLICATION_KEY' })[name]);
  if (missing.length) throw new Error(`Backblaze B2 storage configuration is incomplete. Missing: ${missing.join(', ')}`);
  const endpoint = explainConfiguration(candidate);
  if (clientFactory === defaultClientFactory) {
    try { await diagnoseEndpoint(endpoint, candidate.region, candidate.bucket, Boolean(candidate.keyId && candidate.applicationKey)); }
    catch (error) { throw new Error(classifyInitializationError(error), { cause: error }); }
  }
  console.info(`[Storage] S3 client configuration: ${JSON.stringify({ endpoint, region: candidate.region, bucket: candidate.bucket, forcePathStyle: true, maxAttempts: MAX_ATTEMPTS })}`);
  const resource = clientFactory({
    endpoint,
    region: candidate.region,
    forcePathStyle: true,
    credentials: { accessKeyId: candidate.keyId, secretAccessKey: candidate.applicationKey },
    maxAttempts: MAX_ATTEMPTS,
    requestHandler: new NodeHttpHandler({ connectionTimeout: CONNECTION_TIMEOUT_MS, requestTimeout: REQUEST_TIMEOUT_MS, httpsAgent: createBackblazeHttpsAgent() }),
  });
  try {
    // Use HeadBucket for the startup check. A bucket-scoped B2 key can be
    // allowed to read existing objects while lacking list permission; in
    // that case HeadObject on a guaranteed-absent key returns 403 even though
    // the bucket and credentials are valid.
    try {
      console.info('[Storage] S3 request: HeadBucket startup bucket-access check');
      await resource.send(new HeadBucketCommand({ Bucket: candidate.bucket }));
      console.info('[Storage] S3 request: OK');
    } catch (error) {
      throw error;
    }
    console.info('[Storage] Authentication: OK');
    console.info('[Storage] Bucket access: OK');
    console.info(JSON.stringify({ event: 'storage_health', provider: 'backblaze-b2', status: 'healthy', bucket: candidate.bucket, region: candidate.region }));
    return { provider: 'backblaze', client: resource, bucket: candidate.bucket, endpoint, region: candidate.region };
  } catch (error) {
    resource.destroy();
    console.error(`[Storage] S3 request: FAILED (${errorCode(error)}${error?.$metadata?.httpStatusCode ? `, HTTP ${error.$metadata.httpStatusCode}` : ''})`);
    console.error(JSON.stringify({ event: 'storage_health', provider: 'backblaze-b2', status: 'degraded', bucket: candidate.bucket, region: candidate.region, errorCode: errorCode(error), httpStatus: error?.$metadata?.httpStatusCode || null }));
    throw new Error(classifyInitializationError(error), { cause: error });
  }
}

export function activateStorage(resource) {
  const previous = activeStorage;
  activeStorage = resource || { provider: null, client: null, bucket: null, root: null, endpoint: null, region: null };
  if (previous.client && previous.client !== activeStorage.client) previous.client.destroy();
}
export function storageIsLocal() { return activeStorage.provider === 'local'; }

function storageUnavailable() { return Object.assign(new Error('Media storage is temporarily unavailable.'), { code: 'STORAGE_UNAVAILABLE', status: 503 }); }
export function localObjectExists(objectKey) { return fs.stat(localPath(objectKey)).then(stat => stat.isFile()).catch(error => { if (error.code === 'ENOENT') return false; throw error; }); }
export function storageProvider() { return activeStorage.provider; }
export function storageHealth() { return { status: activeStorage.provider && activeStorage.provider !== 'degraded' ? 'healthy' : 'degraded', provider: activeStorage.provider === 'backblaze' ? 'backblaze-b2' : activeStorage.provider || 'unknown' }; }
export async function initializeStorage() { const resource = await buildStorage(config.values); activateStorage(resource); return resource; }

export async function createUploadUrl(objectKey, contentType, fileSize) {
  if (!validObjectKey(objectKey)) throw new Error('Invalid storage object key.');
  if (!contentType || !Number.isSafeInteger(Number(fileSize)) || Number(fileSize) < 1) throw new Error('Invalid upload metadata.');
  if (storageIsLocal()) {
    const target = localPath(objectKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    return `/uploads/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
  }
  if (!activeStorage.client) throw storageUnavailable();
  const expiresIn = Math.min(900, Math.max(60, Number(config.get('storage.signedUrlMinutes') || 15) * 60));
  return presign(activeStorage.client, new PutObjectCommand({ Bucket: activeStorage.bucket, Key: objectKey, ContentType: contentType }), { expiresIn });
}
export function validateObjectKey(objectKey) { return validObjectKey(objectKey); }

export async function uploadObject(objectKey, body, contentType) {
  if (!validObjectKey(objectKey)) throw new Error('Invalid storage object key.');
  if (!Buffer.isBuffer(body) || !body.length || !contentType) throw new Error('Invalid upload content.');
  if (storageIsLocal()) {
    const target = localPath(objectKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body, { flag: 'w' });
    return;
  }
  if (!activeStorage.client) throw storageUnavailable();
  return send('upload', objectKey, new PutObjectCommand({ Bucket: activeStorage.bucket, Key: objectKey, Body: body, ContentType: contentType }));
}

export function imageSignatureMatches(bytes, contentType) {
  if (!Buffer.isBuffer(bytes)) return false;
  if (contentType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === 'image/webp') return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
}
export function validateImageUpload(bytes, contentType, maxBytes) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(contentType) || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maxBytes || !imageSignatureMatches(bytes, contentType)) return false;
  return true;
}

export async function createDownloadUrl(objectKey, targetBucket = activeStorage.bucket) {
  if (!objectKey) return null;
  if (/^https?:\/\//i.test(objectKey)) return objectKey;
  if (!validObjectKey(objectKey)) throw new Error('Invalid storage object key.');
  if (storageIsLocal()) return `/uploads/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
  if (!activeStorage.client) throw storageUnavailable();
  if (config.get('storage.visibility') === 'public') {
    const baseUrl = config.get('storage.publicBaseUrl');
    if (baseUrl) return `${baseUrl.replace(/\/$/, '')}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
    return `${activeStorage.endpoint}/${encodeURIComponent(targetBucket || activeStorage.bucket)}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
  }
  const expiresIn = Math.min(900, Math.max(60, Number(config.get('storage.signedUrlMinutes') || 15) * 60));
  return presign(activeStorage.client, new GetObjectCommand({ Bucket: targetBucket || activeStorage.bucket, Key: objectKey }), { expiresIn });
}

export async function getObjectMetadata(objectKey, targetBucket = activeStorage.bucket) {
  if (!validObjectKey(objectKey)) throw new Error('Invalid storage object key.');
  if (storageIsLocal()) return statLocalObject(objectKey);
  if (!activeStorage.client) {
    throw storageUnavailable();
  }
  try {
    return await send('metadata', objectKey, new HeadObjectCommand({ Bucket: targetBucket || activeStorage.bucket, Key: objectKey }));
  } catch (error) { if (isStorageNotFoundError(error)) return null; throw error; }
}
async function statLocalObject(objectKey) {
  try { const stat = await fs.stat(localPath(objectKey)); return { ContentLength: stat.size, LastModified: stat.mtime, ContentType: 'application/octet-stream' }; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function objectExists(objectKey) { return Boolean(await getObjectMetadata(objectKey)); }
export function isStorageNotFoundError(error) {
  const code = errorCode(error);
  return ['ENOENT', 'NoSuchKey', 'NotFound', 'ObjectNotFound', 'NoSuchObject'].includes(code) || (code === '404' && error?.$metadata?.httpStatusCode === 404);
}

export async function deleteObject(objectKey, targetBucket = activeStorage.bucket) {
  if (!validObjectKey(objectKey)) throw new Error('Invalid storage object key.');
  if (storageIsLocal()) return fs.rm(localPath(objectKey), { force: true });
  if (!activeStorage.client) throw storageUnavailable();
  try { await send('delete', objectKey, new DeleteObjectCommand({ Bucket: targetBucket || activeStorage.bucket, Key: objectKey })); }
  catch (error) { if (!isStorageNotFoundError(error)) throw error; }
}
export async function readObject(objectKey, targetBucket = activeStorage.bucket) {
  if (!validObjectKey(objectKey)) throw new Error('Invalid storage object key.');
  if (storageIsLocal()) return fs.readFile(localPath(objectKey));
  if (!activeStorage.client) throw storageUnavailable();
  const result = await send('download', objectKey, new GetObjectCommand({ Bucket: targetBucket || activeStorage.bucket, Key: objectKey }));
  return Buffer.from(await result.Body.transformToByteArray());
}

function privateLocalPath(key, suffix) {
  if (!validObjectKey(key)) throw new Error('Invalid private storage key.');
  const root = `${path.resolve(activeStorage.root)}${suffix}`;
  return localPath(key, root);
}
export async function writeCitizenFile(key, bytes, contentType) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error('Invalid file content.');
  if (storageIsLocal()) { const target = privateLocalPath(key, '-citizen-private'); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes); return; }
  if (!activeStorage.client) throw storageUnavailable();
  return send('upload-private', key, new PutObjectCommand({ Bucket: activeStorage.bucket, Key: key, Body: bytes, ContentType: contentType }));
}
// Backblaze ACLs are bucket-wide. Random keys alone cannot make a public bucket
// private. E-service uploads fail closed unless the bucket ACL is private.
export async function ensureCitizenStoragePrivate() {
  if (storageIsLocal()) return;
  if (!activeStorage.client) throw storageUnavailable();
  const acl = await send('private-bucket-check', null, new GetBucketAclCommand({ Bucket: activeStorage.bucket }));
  if (!acl.Owner?.ID || !Array.isArray(acl.Grants) || acl.Grants.some(grant => grant.Grantee?.Type === 'Group' || (grant.Grantee?.ID && grant.Grantee.ID !== acl.Owner.ID))) {
    const error = new Error('Private document storage is unavailable.');
    error.code = 'PRIVATE_BUCKET_REQUIRED';
    throw error;
  }
}
export async function writeEserviceFile(key,bytes,contentType) {
  const resource = activeStorage;
  await ensureCitizenStoragePrivate();
  if (resource !== activeStorage) throw storageUnavailable();
  return writeCitizenFile(key,bytes,contentType);
}
export async function deleteCitizenFile(key) { if (storageIsLocal()) return fs.rm(privateLocalPath(key, '-citizen-private'), { force: true }); return deleteObject(key); }
export async function readCitizenFile(key) {
  if (storageIsLocal()) return fs.readFile(privateLocalPath(key, '-citizen-private'));
  if (!activeStorage.client) throw storageUnavailable();
  const result = await send('download-private', key, new GetObjectCommand({ Bucket: activeStorage.bucket, Key: key }));
  return Buffer.from(await result.Body.transformToByteArray());
}
export async function writePrivateFile(key, bytes, contentType) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error('Invalid file content.');
  if (storageIsLocal()) { const target = privateLocalPath(key, '-private'); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes); return; }
  if (!activeStorage.client) throw storageUnavailable();
  return send('upload-private', key, new PutObjectCommand({ Bucket: activeStorage.bucket, Key: key, Body: bytes, ContentType: contentType }));
}
export async function deletePrivateFile(key) { if (storageIsLocal()) return fs.rm(privateLocalPath(key, '-private'), { force: true }); return deleteObject(key); }
export async function readPrivateFile(key) {
  if (storageIsLocal()) return fs.readFile(privateLocalPath(key, '-private'));
  if (!activeStorage.client) throw storageUnavailable();
  const result = await send('download-private', key, new GetObjectCommand({ Bucket: activeStorage.bucket, Key: key }));
  return Buffer.from(await result.Body.transformToByteArray());
}
