import { Storage } from '@google-cloud/storage';
import { config } from '../config/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
let gcsBucket;
let localRoot;
export async function buildStorage(values) {
  if (values['storage.provider'] !== 'gcp') {
    localRoot = path.resolve(values['storage.localPath'] || process.env.LOCAL_STORAGE_PATH || 'data/uploads');
    await fs.mkdir(localRoot, { recursive: true });
    return { local: true, root: localRoot };
  }
  if (!values['storage.bucket']) throw new Error('Bucket name is required.');
  try {
    const bucket = new Storage({ projectId: values['google.projectId'] || undefined }).bucket(values['storage.bucket']);
    const [metadata] = await bucket.getMetadata();
    if (values['storage.region'] && metadata.location.toLowerCase() !== values['storage.region'].toLowerCase()) throw new Error('region');
    // These are the operations the application actually performs. Avoid IAM
    // testPermissions here because it requires an extra bucket IAM permission
    // that Cloud Run service accounts often do not have.
    await bucket.file('__connection_test__').getSignedUrl({ version: 'v4', action: 'write', expires: Date.now() + 60000, contentType: 'image/png' });
    if (values['storage.visibility'] === 'public') {
      const [policy] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 });
      if (!policy.bindings?.some(binding => binding.role === 'roles/storage.objectViewer' && binding.members?.includes('allUsers') && !binding.condition)) throw new Error('public');
    }
    return bucket;
  } catch { throw new Error('Storage test failed. Check ADC authentication, bucket region, object permissions, signing permission and public access policy.'); }
}
export function activateStorage(bucket) { gcsBucket = bucket?.local ? null : bucket; if (bucket?.local) localRoot = bucket.root; }
export async function initializeStorage() { const resource = await buildStorage(config.values); activateStorage(resource); return resource; }
export async function createUploadUrl(path, contentType) {
  if (localRoot) { await fs.mkdir(pathModule(path).dir, { recursive: true }); return `/uploads/${path.replaceAll('\\', '/')}`; }
  if (!gcsBucket) throw new Error('Cloud storage is not initialized.');
  const [url] = await gcsBucket.file(path).getSignedUrl({ version: 'v4', action: 'write', expires: Date.now() + config.get('storage.signedUrlMinutes') * 60000, contentType });
  return url;
}
const pathModule = value => ({ dir: path.dirname(path.join(localRoot || '', value)) });
export async function createDownloadUrl(path, bucketName) {
  if (!path) return null;
  // Local uploads are stored as relative paths, but browsers need the
  // public /uploads route to resolve them.
  if (localRoot && !/^https?:\/\//.test(path)) return `/uploads/${path.replace(/^\/+/, '').replaceAll('\\', '/')}`;
  if (!gcsBucket || /^https?:\/\//.test(path)) return path;
  const bucket = bucketName && bucketName !== gcsBucket.name ? gcsBucket.storage.bucket(bucketName) : gcsBucket;
  if (config.get('storage.visibility') === 'public' && bucket === gcsBucket) return `${config.get('storage.publicBaseUrl') || `https://storage.googleapis.com/${bucket.name}`}/${path.split('/').map(encodeURIComponent).join('/')}`;
  try { return (await bucket.file(path).getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + config.get('storage.signedUrlMinutes') * 60000 }))[0]; }
  catch { return null; }
}
export async function getObjectMetadata(path) {
  if (!gcsBucket) throw new Error('Cloud storage is not initialized.');
  try { return (await gcsBucket.file(path).getMetadata())[0]; } catch { return null; }
}
export async function objectExists(path) { if (!gcsBucket) throw new Error('Cloud storage is not initialized.'); return (await gcsBucket.file(path).exists())[0]; }
export async function deleteObject(storagePath, bucketName) {
  if (localRoot) {
    await fs.rm(path.resolve(localRoot, storagePath), { force: true }).catch(() => {});
    return;
  }
  if (!gcsBucket) throw new Error('Cloud storage is not initialized.');
  const bucket = bucketName ? gcsBucket.storage.bucket(bucketName) : gcsBucket;
  await bucket.file(storagePath).delete({ ignoreNotFound: true });
}
