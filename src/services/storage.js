import { Storage } from "@google-cloud/storage";

let gcsBucket;

export async function initializeStorage() {
  const storage = new Storage({ projectId: process.env.GCP_PROJECT_ID });
  const bucketName = process.env.GCS_BUCKET_NAME || process.env.GCS_BUCKET;
  if (!bucketName) {
    throw new Error("Missing GCS_BUCKET_NAME for Google Cloud Storage initialization");
  }
  gcsBucket = storage.bucket(bucketName);

  const [exists] = await gcsBucket.exists();
  if (!exists) {
    throw new Error(`Cloud Storage bucket '${bucketName}' does not exist or access is denied.`);
  }
  return gcsBucket;
}

export async function createUploadUrl(path, contentType, maxBytes = null) {
  if (!gcsBucket) throw new Error("Cloud storage is not initialized.");

  const options = {
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    contentType,
  };

  const [url] = await gcsBucket.file(path).getSignedUrl(options);
  return url;
}

export async function createDownloadUrl(path) {
  if (!gcsBucket) throw new Error("Cloud storage is not initialized.");
  if (!path) return null;

  const options = {
    version: 'v4',
    action: 'read',
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
  };

  try {
    const [url] = await gcsBucket.file(path).getSignedUrl(options);
    return url;
  } catch (error) {
    console.error(`Error generating signed read URL for ${path}:`, error);
    return null;
  }
}

export async function getObjectMetadata(path) {
  if (!gcsBucket) throw new Error("Cloud storage is not initialized.");
  try {
    const [metadata] = await gcsBucket.file(path).getMetadata();
    return metadata;
  } catch (e) {
    return null;
  }
}

export async function objectExists(path) {
  if (!gcsBucket) throw new Error("Cloud storage is not initialized.");
  const [exists] = await gcsBucket.file(path).exists();
  return exists;
}

export async function deleteObject(path) {
  if (!gcsBucket) throw new Error("Cloud storage is not initialized.");
  await gcsBucket.file(path).delete({ ignoreNotFound: true });
}
