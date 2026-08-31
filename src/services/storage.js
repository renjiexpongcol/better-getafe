import { Storage } from "@google-cloud/storage";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let gcsBucket;

export async function initializeStorage() {
  if ((process.env.CMS_MEDIA_PROVIDER || "local") !== "gcp") {
    if (process.env.NODE_ENV === 'production') throw new Error("Local fallback is disabled. Application startup aborted.");
    return;
  }
  const storage = new Storage({ projectId: process.env.GCP_PROJECT_ID });
  const bucketName = process.env.GCS_BUCKET_NAME || process.env.GCS_BUCKET;
  if (!bucketName) {
    throw new Error("Missing GCS_BUCKET for Google Cloud Storage initialization");
  }
  gcsBucket = storage.bucket(bucketName);
  
  const [exists] = await gcsBucket.exists();
  if (!exists) {
    throw new Error(`Cloud Storage bucket '${bucketName}' does not exist or access is denied.`);
  }
  return gcsBucket;
}

export async function uploadMedia(fileBuffer, filename, mimeType, folder = 'media') {
  if ((process.env.CMS_MEDIA_PROVIDER || "local") === "gcp") {
    if (!gcsBucket) throw new Error("Cloud storage is not initialized.");
    const fullPath = `${folder}/${filename}`;
    const file = gcsBucket.file(fullPath);
    await file.save(fileBuffer, { contentType: mimeType });
    return fullPath; // Store internal GCS object path instead of public URL
  } else {
    if (process.env.NODE_ENV === 'production') throw new Error("Local fallback disabled");
    const uploadsDir = path.join(__dirname, "..", "..", "uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, filename), fileBuffer);
    return `/uploads/${filename}`;
  }
}

export async function deleteMedia(filepath) {
  if ((process.env.CMS_MEDIA_PROVIDER || "local") === "gcp") {
    if (!gcsBucket) return;
    try {
      await gcsBucket.file(filepath).delete();
    } catch (e) {
      console.warn(`Warning: Failed to delete media ${filepath} from Cloud Storage:`, e.message);
    }
  } else {
    if (process.env.NODE_ENV === 'production') return;
    const file = path.join(__dirname, "..", "..", filepath);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

export async function getSignedUrl(filepath) {
  if (!filepath || filepath.startsWith('/uploads')) return filepath; // local fallback
  if ((process.env.CMS_MEDIA_PROVIDER || "local") === "gcp") {
    if (!gcsBucket) return filepath;
    try {
      const options = {
        version: 'v4',
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      };
      const [url] = await gcsBucket.file(filepath).getSignedUrl(options);
      return url;
    } catch (error) {
      console.error(`Error generating signed URL for ${filepath}:`, error);
      return filepath;
    }
  }
  return filepath;
}
