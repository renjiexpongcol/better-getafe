import { Storage } from "@google-cloud/storage";

let gcsBucket;

export async function initializeStorage() {
  if ((process.env.CMS_MEDIA_PROVIDER || "local") !== "gcp") {
    return;
  }
  const storage = new Storage({ projectId: process.env.GCP_PROJECT_ID });
  const bucketName = process.env.GCS_BUCKET_NAME || process.env.GCS_BUCKET;
  if (!bucketName) {
    throw new Error("Missing GCS_BUCKET_NAME for Google Cloud Storage initialization");
  }
  gcsBucket = storage.bucket(bucketName);
  
  // Verify bucket access by checking existence
  const [exists] = await gcsBucket.exists();
  if (!exists) {
    throw new Error(`Cloud Storage bucket '${bucketName}' does not exist or access is denied.`);
  }
  return gcsBucket;
}

export function getStorageBucket() {
  return gcsBucket;
}

export async function uploadMedia(fileBuffer, filename, mimeType, folder = 'media') {
  if (!gcsBucket) {
    throw new Error("Cloud storage is not initialized.");
  }
  const fullPath = `${folder}/${filename}`;
  const file = gcsBucket.file(fullPath);
  await file.save(fileBuffer, { contentType: mimeType });
  const publicBaseUrl = process.env.GCS_PUBLIC_BASE_URL || `https://storage.googleapis.com/${gcsBucket.name}`;
  return `${publicBaseUrl}/${fullPath}`;
}

export async function deleteMedia(filepath) {
  if (!gcsBucket) return;
  // Filepath is the full public URL, we need to extract the path inside the bucket.
  const publicBaseUrl = process.env.GCS_PUBLIC_BASE_URL || `https://storage.googleapis.com/${gcsBucket.name}`;
  let bucketPath = filepath;
  if (filepath.startsWith(publicBaseUrl)) {
    bucketPath = filepath.substring(publicBaseUrl.length + 1);
  }
  
  try {
    await gcsBucket.file(bucketPath).delete();
  } catch (e) {
    console.warn(`Warning: Failed to delete media ${bucketPath} from Cloud Storage:`, e.message);
  }
}
