import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { getCmsPool } from './database.js';
import { listStorageObjectsPage, getObjectMetadata, readObject, storageLocation, validateImageUpload } from './storage.js';

const allowedContentTypes = new Map([['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp']]);
const safePrefix = value => String(value || '').replace(/^\/+|\/+$/g, '');
const checksum = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function findPending(pool, key, provider, bucket) {
  const [rows] = await pool.execute(
    `SELECT * FROM media_uploads
     WHERE storage_path = ? AND status IN ('pending', 'completed')
       AND (storage_provider = ? OR storage_provider IS NULL)
       AND (storage_bucket = ? OR storage_bucket IS NULL)
     ORDER BY CASE WHEN status = 'completed' THEN 0 ELSE 1 END, created_at DESC
     LIMIT 1`,
    [key, provider, bucket],
  );
  return rows[0] || null;
}

async function findReferences(pool, key) {
  const [news] = await pool.execute(
    `SELECT id, title FROM news
     WHERE featured_image = ? OR gallery_images::text LIKE ?
     ORDER BY title LIMIT 20`,
    [key, `%${key}%`],
  );
  const [destinations] = await pool.execute(
    'SELECT id, title FROM destinations WHERE featured_image = ? ORDER BY title LIMIT 20',
    [key],
  );
  return [
    ...news.map(item => ({ type: 'news', id: item.id, title: item.title })),
    ...destinations.map(item => ({ type: 'destination', id: item.id, title: item.title })),
  ];
}

async function restoreRelationships(connection, key) {
  const [articles] = await connection.execute(
    `SELECT id, featured_image, gallery_images FROM news
     WHERE featured_image = ? OR gallery_images::text LIKE ?`,
    [key, `%${key}%`],
  );
  for (const article of articles) {
    if (article.featured_image === key) {
      await connection.execute(
        `INSERT INTO content_media
          (content_type, content_id, media_id, role, position, alt_text, caption, created_at, updated_at)
         SELECT 'news', ?, id, 'featured', 0, '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM media WHERE storage_path = ?
         ON CONFLICT (content_type, content_id, media_id, role) DO NOTHING`,
        [article.id, key],
      );
    }
    for (const [index, image] of (Array.isArray(article.gallery_images) ? article.gallery_images : []).entries()) {
      if (image?.storage_path !== key) continue;
      await connection.execute(
        `INSERT INTO content_media
          (content_type, content_id, media_id, role, position, alt_text, caption, created_at, updated_at)
         SELECT 'news', ?, id, 'gallery', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         FROM media WHERE storage_path = ?
         ON CONFLICT (content_type, content_id, media_id, role) DO UPDATE SET
           position = EXCLUDED.position, alt_text = EXCLUDED.alt_text,
           caption = EXCLUDED.caption, updated_at = CURRENT_TIMESTAMP`,
        [article.id, Number.isInteger(image.position) ? image.position : index, String(image.alt || '').slice(0, 5000), String(image.caption || '').slice(0, 5000), key],
      );
    }
  }
  const [destinations] = await connection.execute('SELECT id, featured_image, image_alt FROM destinations WHERE featured_image = ?', [key]);
  for (const destination of destinations) {
    await connection.execute(
      `INSERT INTO content_media
        (content_type, content_id, media_id, role, position, alt_text, caption, created_at, updated_at)
       SELECT 'destination', ?, id, 'featured', 0, ?, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       FROM media WHERE storage_path = ?
       ON CONFLICT (content_type, content_id, media_id, role) DO UPDATE SET alt_text = EXCLUDED.alt_text, updated_at = CURRENT_TIMESTAMP`,
      [destination.id, destination.image_alt || '', key],
    );
  }
}

async function applyCandidate({ pool, item, existing, pending, provider, bucket, bytes, metadata }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (existing) {
      await connection.execute(
        `UPDATE media SET storage_provider = ?, storage_bucket = ?
         WHERE id = ? AND storage_path = ?`,
        [provider, bucket, existing.id, item.key],
      );
    } else {
      await connection.execute(
        `INSERT INTO media
          (id, original_filename, storage_provider, storage_bucket, storage_path, content_type, file_size,
           uploaded_by, related_record_id, checksum_sha256, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'active', ?)
         ON CONFLICT (storage_path) DO NOTHING`,
        [
          pending.id, pending.original_filename, provider, bucket, item.key,
          metadata.ContentType, Number(metadata.ContentLength), pending.uploaded_by,
          checksum(bytes), item.lastModified || pending.created_at || new Date(),
        ],
      );
      await connection.execute(
        `UPDATE media_uploads SET storage_provider = ?, storage_bucket = ?, status = 'completed',
           completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
         WHERE id = ?`,
        [provider, bucket, pending.id],
      );
    }
    await restoreRelationships(connection, item.key);
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

export async function reconcileB2Media({ apply = false, adminId } = {}) {
  const { provider, bucket } = storageLocation();
  if (provider !== 'backblaze' || !bucket) throw new Error('Media recovery requires the configured Backblaze B2 provider and bucket.');
  const prefix = safePrefix(config.get('storage.prefix'));
  if (!prefix || prefix.includes('..') || prefix.includes('\\')) throw new Error('The configured media prefix is invalid.');
  const objectPrefix = `${prefix}/`;
  const pool = await getCmsPool();
  const [adminRows] = await pool.execute("SELECT id FROM users WHERE id = ? AND role IN ('admin', 'super_admin')", [adminId || '']);
  if (!adminRows.length) throw new Error('Media reconciliation requires the ID of an existing admin or super_admin account.');
  const [providerRows] = await pool.execute('SELECT storage_provider, storage_bucket, COUNT(*)::INTEGER AS count FROM media GROUP BY storage_provider, storage_bucket ORDER BY count DESC');
  const report = { provider: 'backblaze', bucket, prefix: objectPrefix, databaseProviders: providerRows, scanned: 0, alreadyRegistered: 0, wouldRegister: [], wouldRelink: [], registered: [], relinked: [], skipped: [] };
  const keyPattern = new RegExp(`^${objectPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d{4}\\/\\d{2}\\/[0-9a-f-]{36}\\.(?:jpg|jpeg|png|webp)$`, 'i');
  let continuationToken;

  do {
    const page = await listStorageObjectsPage({ prefix: objectPrefix, continuationToken });
    for (const object of page.objects) {
      report.scanned++;
      if (!keyPattern.test(object.key)) {
        report.skipped.push({ key: object.key, reason: 'Object key does not match the application media naming pattern; ownership or purpose is unclear.' });
        continue;
      }
      const extension = object.key.slice(object.key.lastIndexOf('.')).toLowerCase();
      const expectedType = allowedContentTypes.get(extension);
      const [registeredRows] = await pool.execute('SELECT * FROM media WHERE storage_path = ? LIMIT 1', [object.key]);
      const existing = registeredRows[0] || null;
      if (existing?.storage_provider === provider && existing.storage_bucket === bucket) {
        report.alreadyRegistered++;
        continue;
      }

      const metadata = await getObjectMetadata(object.key, bucket);
      if (!metadata) {
        report.skipped.push({ key: object.key, reason: 'Object disappeared during reconciliation.' });
        continue;
      }
      const type = String(metadata.ContentType || '').toLowerCase();
      const size = Number(metadata.ContentLength || 0);
      if (!expectedType || type !== expectedType || size <= 0 || size > Number(config.get('storage.maxUploadMb')) * 1024 * 1024) {
        report.skipped.push({ key: object.key, reason: 'Object metadata does not match an allowed image type or configured size limit.' });
        continue;
      }
      const bytes = await readObject(object.key, bucket);
      if (!validateImageUpload(bytes, type, Number(config.get('storage.maxUploadMb')) * 1024 * 1024)) {
        report.skipped.push({ key: object.key, reason: 'Object bytes do not match the declared image type.' });
        continue;
      }

      if (existing) {
        const candidate = { key: object.key, previousProvider: existing.storage_provider || 'unknown', previousBucket: existing.storage_bucket, mediaId: existing.id };
        if (apply) {
          await applyCandidate({ pool, item: object, existing, provider, bucket, bytes, metadata });
          report.relinked.push(candidate);
        } else report.wouldRelink.push(candidate);
        continue;
      }

      const pending = await findPending(pool, object.key, provider, bucket);
      if (!pending?.uploaded_by || !pending.original_filename || !['media', 'news'].includes(pending.context)) {
        report.skipped.push({ key: object.key, reason: 'No upload ownership record exists; review before registering.', references: await findReferences(pool, object.key) });
        continue;
      }
      const [ownerRows] = await pool.execute('SELECT id FROM users WHERE id = ?', [pending.uploaded_by]);
      if (!ownerRows.length) {
        report.skipped.push({ key: object.key, reason: 'The recorded uploader no longer exists; review before registering.' });
        continue;
      }
      const candidate = { key: object.key, originalFilename: pending.original_filename, mediaId: pending.id, purpose: pending.context, size };
      if (apply) {
        await applyCandidate({ pool, item: object, existing: null, pending, provider, bucket, bytes, metadata });
        report.registered.push(candidate);
      } else report.wouldRegister.push(candidate);
    }
    continuationToken = page.continuationToken;
  } while (continuationToken);

  return { mode: apply ? 'apply' : 'dry-run', ...report };
}
