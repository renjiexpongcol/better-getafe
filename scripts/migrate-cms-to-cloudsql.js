import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { Connector, IpAddressTypes, AuthTypes } from "@google-cloud/cloud-sql-connector";
import { Storage } from "@google-cloud/storage";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const mysqlDateTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date value: ${value}`);
  return date.toISOString().slice(0, 23).replace('T', ' ');
};

async function migrate() {
  console.log("Starting CMS Migration to Cloud SQL and Cloud Storage...");
  const dataPath = path.join(__dirname, "..", "data", "cms.json");
  if (!fs.existsSync(dataPath)) {
    console.error("Local data/cms.json not found. Nothing to migrate.");
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

  const instanceConnectionName = process.env.CMS_CLOUD_SQL_INSTANCE || process.env.INSTANCE_CONNECTION_NAME;
  if (!instanceConnectionName) {
    console.error("CMS_CLOUD_SQL_INSTANCE or INSTANCE_CONNECTION_NAME is not defined in .env");
    process.exit(1);
  }

  // Initialize Cloud SQL
  console.log("Connecting to Cloud SQL...");
  const connector = new Connector();
  const options = await connector.getOptions({
    instanceConnectionName,
    ipType: process.env.PRIVATE_IP === "true" ? IpAddressTypes.PRIVATE : IpAddressTypes.PUBLIC,
    authType: process.env.CMS_IAM_AUTH === "true" ? AuthTypes.IAM : AuthTypes.PASSWORD,
  });

  const pool = mysql.createPool({
    ...options,
    user: process.env.CMS_DB_USER || process.env.DB_USER,
    password: process.env.CMS_DB_PASSWORD || process.env.DB_PASS,
    database: process.env.CMS_DB_NAME || process.env.DB_NAME,
  });

  // Initialize Cloud Storage
  console.log("Initializing Cloud Storage...");
  let bucket;
  const bucketName = process.env.GCS_BUCKET_NAME || process.env.GCS_BUCKET;
  if (bucketName) {
    const storage = new Storage({ projectId: process.env.GCP_PROJECT_ID });
    bucket = storage.bucket(bucketName);
    const [exists] = await bucket.exists();
    if (!exists) throw new Error(`Bucket ${bucketName} does not exist.`);
  } else {
    console.log("No GCS_BUCKET_NAME or GCS_BUCKET provided, skipping media upload migration.");
  }

  // 1. Migrate Users
  console.log(`Migrating ${data.users?.length || 0} users...`);
  for (const user of data.users || []) {
    try {
      await pool.execute(
        "INSERT INTO users (id, name, email, password, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [user.id, user.name, user.email, user.password, user.role, mysqlDateTime(user.created_at), mysqlDateTime(user.updated_at)]
      );
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') console.log(`User ${user.email} already exists, skipping.`);
      else throw e;
    }
  }

  // 2. Migrate Categories
  console.log(`Migrating ${data.categories?.length || 0} categories...`);
  for (const cat of data.categories || []) {
    try {
      await pool.execute(
        "INSERT INTO categories (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [cat.id, cat.name, cat.slug, mysqlDateTime(cat.created_at), mysqlDateTime(cat.updated_at)]
      );
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') console.log(`Category ${cat.slug} already exists, skipping.`);
      else throw e;
    }
  }

  // 3. Migrate Media
  console.log(`Migrating ${data.media?.length || 0} media files...`);
  for (const media of data.media || []) {
    const oldPath = media.filepath || media.path || '';
    const originalFilename = media.filename || media.original_filename || path.basename(oldPath);
    const localFile = oldPath.startsWith('/uploads/')
      ? path.join(__dirname, "..", oldPath)
      : oldPath ? path.join(__dirname, "..", oldPath.replace(/^\/+/, '')) : '';
    const extension = path.extname(originalFilename).toLowerCase().replace('.', '') || 'bin';
    const destination = `media/migrated/${media.id}.${extension}`;
    let newFilepath = destination;
    if (bucket && localFile) {
      if (fs.existsSync(localFile)) {
        const [alreadyUploaded] = await bucket.file(destination).exists();
        if (!alreadyUploaded) {
          await bucket.upload(localFile, {
            destination,
            metadata: { contentType: media.filetype || 'application/octet-stream' },
          });
          console.log(`Uploaded ${originalFilename} to Cloud Storage.`);
        }
      } else {
        console.warn(`Local file ${localFile} not found.`);
      }
    }

    try {
      await pool.execute(
        "INSERT INTO media (id, original_filename, storage_bucket, storage_path, content_type, file_size, uploaded_by, related_record_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)",
        [media.id, originalFilename, bucketName, newFilepath, media.filetype || 'application/octet-stream', media.filesize || 0, media.uploaded_by, media.related_record_id || null, mysqlDateTime(media.created_at)]
      );
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') console.log(`Media ${originalFilename} already exists, skipping.`);
      else throw e;
    }
  }

  // 4. Migrate News
  console.log(`Migrating ${data.news?.length || 0} news articles...`);
  for (const news of data.news || []) {
    // Map old media paths to new raw paths if applicable
    let updatedFeaturedImage = news.featured_image;
    if (bucket && updatedFeaturedImage && updatedFeaturedImage.startsWith('/uploads/')) {
      const oldMediaRecord = data.media?.find(m => m.filepath === updatedFeaturedImage);
      if (oldMediaRecord) {
        const originalFilename = oldMediaRecord.filename || oldMediaRecord.original_filename || path.basename(updatedFeaturedImage);
        const extension = path.extname(originalFilename).toLowerCase().replace('.', '') || 'bin';
        updatedFeaturedImage = `media/migrated/${oldMediaRecord.id}.${extension}`;
      }
    }

    try {
      await pool.execute(
        "INSERT INTO news (id, title, slug, excerpt, content, featured_image, category_id, author_id, status, published_at, created_at, updated_at, is_important, content_type, event_start_at, event_end_at, show_in_news, show_in_upcoming, show_in_events, show_on_homepage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [news.id, news.title, news.slug, news.excerpt, news.content, updatedFeaturedImage, news.category_id, news.author_id, news.status, mysqlDateTime(news.published_at), mysqlDateTime(news.created_at), mysqlDateTime(news.updated_at), Boolean(news.is_important), news.content_type || 'news', mysqlDateTime(news.event_start_at), mysqlDateTime(news.event_end_at), news.show_in_news !== false, Boolean(news.show_in_upcoming), Boolean(news.show_in_events), news.show_on_homepage !== false]
      );
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') console.log(`News ${news.slug} already exists, skipping.`);
      else throw e;
    }
  }

  console.log("Migration completed successfully!");
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
