import { S3Client, HeadBucketCommand, HeadObjectCommand, DeleteObjectCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
let client; let bucketName; let localRoot;
export async function buildStorage(values) {
  if (values['storage.provider'] === 'local') { localRoot = path.resolve(values['storage.localPath'] || process.env.LOCAL_STORAGE_PATH || 'data/uploads'); await fs.mkdir(localRoot, { recursive: true }); return { local: true, root: localRoot }; }
  if (values['storage.provider'] !== 'backblaze') throw new Error('Only Backblaze B2 or local storage is supported.');
  const endpoint = values['storage.endpoint'] || process.env.B2_ENDPOINT; const keyId = values['storage.keyId'] || process.env.B2_KEY_ID; const applicationKey = values['storage.applicationKey'] || process.env.B2_APPLICATION_KEY; bucketName = values['storage.bucket'];
  if (!endpoint || !keyId || !applicationKey || !bucketName) throw new Error('Backblaze B2 endpoint, key ID, application key and bucket name are required.');
  const resource = new S3Client({ endpoint, region: values['storage.region'] || process.env.B2_REGION || 'us-east-005', forcePathStyle: true, credentials: { accessKeyId: keyId, secretAccessKey: applicationKey } });
  try { await resource.send(new HeadBucketCommand({ Bucket: bucketName })); } catch { throw new Error('Backblaze B2 storage test failed. Check the endpoint, bucket and application key.'); }
  return { client: resource, bucket: bucketName };
}
export function activateStorage(resource) { client = resource?.client || null; bucketName = resource?.bucket || bucketName; localRoot = resource?.local ? resource.root : null; }
export async function initializeStorage() { const resource = await buildStorage(config.values); activateStorage(resource); return resource; }
export async function createUploadUrl(objectPath, contentType, fileSize) { if (localRoot) { await fs.mkdir(path.dirname(path.join(localRoot, objectPath)), { recursive: true }); return `/uploads/${objectPath.replaceAll('\\', '/')}`; } if (!client) throw new Error('Backblaze storage is not initialized.'); return getSignedUrl(client, new PutObjectCommand({ Bucket: bucketName, Key: objectPath, ContentType: contentType }), { expiresIn: config.get('storage.signedUrlMinutes') * 60 }); }
export async function uploadObject(objectPath, body, contentType) { if (!client) throw new Error('Backblaze storage is not initialized.'); await client.send(new PutObjectCommand({ Bucket: bucketName, Key: objectPath, Body: body, ContentType: contentType })); }

export function imageSignatureMatches(bytes, contentType) {
  if (!Buffer.isBuffer(bytes)) return false
  if (contentType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (contentType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (contentType === 'image/webp') return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  return false
}
export async function createDownloadUrl(objectPath, targetBucket = bucketName) { if (!objectPath) return null; if (localRoot && !/^https?:\/\//.test(objectPath)) return `/uploads/${objectPath.replace(/^\/+/, '').replaceAll('\\', '/')}`; if (!client || /^https?:\/\//.test(objectPath)) return objectPath; if (config.get('storage.visibility') === 'public' && config.get('storage.publicBaseUrl')) return `${config.get('storage.publicBaseUrl').replace(/\/$/, '')}/${objectPath.split('/').map(encodeURIComponent).join('/')}`; return getSignedUrl(client, new GetObjectCommand({ Bucket: targetBucket || bucketName, Key: objectPath }), { expiresIn: config.get('storage.signedUrlMinutes') * 60 }); }
export async function getObjectMetadata(objectPath, targetBucket = bucketName) { if (!client) throw new Error('Backblaze storage is not initialized.'); try { return await client.send(new HeadObjectCommand({ Bucket: targetBucket || bucketName, Key: objectPath })); } catch { return null; } }
export async function objectExists(objectPath) { return Boolean(await getObjectMetadata(objectPath)); }
export async function deleteObject(objectPath, targetBucket = bucketName) { if (localRoot) return fs.rm(path.resolve(localRoot, objectPath), { force: true }).catch(() => {}); if (!client) throw new Error('Backblaze storage is not initialized.'); await client.send(new DeleteObjectCommand({ Bucket: targetBucket || bucketName, Key: objectPath })); }

function privateLocalPath(key) {
  // Citizen uploads live outside the directory exposed by /uploads. Object
  // prefixes become folders in B2 and remain private in local development.
  const privateKey = key.startsWith('citizen-private/')
  const root = `${path.resolve(localRoot)}-citizen-private`
  const relativeKey = privateKey ? key.slice('citizen-private/'.length) : key
  const target = path.resolve(root, relativeKey)
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Invalid document path.')
  return target
}
export async function writeCitizenFile(key, bytes, contentType) {
  if (localRoot) { const target = privateLocalPath(key); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes); return }
  if (!client) throw new Error('Document storage is unavailable.')
  if (config.get('storage.visibility') === 'public') throw new Error('Private document storage is required.')
  await client.send(new PutObjectCommand({ Bucket: bucketName, Key: key, Body: bytes, ContentType: contentType }))
}
export async function deleteCitizenFile(key) {
  if (localRoot) return fs.rm(privateLocalPath(key), { force: true })
  return deleteObject(key)
}
export async function readCitizenFile(key) {
  if (localRoot) return fs.readFile(privateLocalPath(key))
  if (!client) throw new Error('Document storage is unavailable.')
  const result = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }))
  return Buffer.from(await result.Body.transformToByteArray())
}
