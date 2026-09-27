import { getCmsPool } from '../services/cloudSql.js';
import { isGcp } from './postgresCompatibility.js';

const uniquePaths = (featuredImage, galleryImages) => [...new Set([
  featuredImage,
  ...(Array.isArray(galleryImages) ? galleryImages.map((image) => image?.storage_path) : []),
].filter((value) => typeof value === 'string' && value.trim()))];

const cleanText = (value) => typeof value === 'string' ? value.trim().slice(0, 5000) : '';

export async function getContentMedia(contentType, contentId) {
  if (!isGcp() || !contentType || !contentId) return [];
  const pool = await getCmsPool();
  const [rows] = await pool.execute(
    `SELECT cm.*, m.storage_path, m.storage_bucket, m.original_filename, m.content_type, m.file_size
     FROM content_media cm
     JOIN media m ON m.id = cm.media_id
     WHERE cm.content_type = ? AND cm.content_id = ?
     ORDER BY cm.role, cm.position, cm.created_at`,
    [contentType, contentId],
  );
  return rows;
}

export async function getMediaUsageCounts() {
  if (!isGcp()) return new Map();
  const pool = await getCmsPool();
  const [rows] = await pool.execute(
    `SELECT media_id, COUNT(DISTINCT content_type || ':' || content_id)::INTEGER AS usage_count
     FROM content_media
     GROUP BY media_id`,
  );
  return new Map(rows.map((row) => [row.media_id, Number(row.usage_count || 0)]));
}

export async function deleteContentMediaForContent(connection, contentType, contentId) {
  if (!isGcp() || !contentType || !contentId) return;
  await connection.execute(
    'DELETE FROM content_media WHERE content_type = ? AND content_id = ?',
    [contentType, contentId],
  );
}

export async function syncContentMediaWithConnection(connection, contentType, contentId, { featuredImage = '', galleryImages = [] } = {}) {
  if (!isGcp() || !contentType || !contentId) return;
  const paths = uniquePaths(featuredImage, galleryImages);
  const mediaByPath = new Map();
  if (paths.length) {
    const [media] = await connection.execute(
      'SELECT id, storage_path FROM media WHERE storage_path = ANY(?)',
      [paths],
    );
    media.forEach((item) => mediaByPath.set(item.storage_path, item));
  }

  await deleteContentMediaForContent(connection, contentType, contentId);

  const now = new Date().toISOString();
  const rows = [];
  const featured = mediaByPath.get(featuredImage);
  if (featured) rows.push([contentType, contentId, featured.id, 'featured', 0, '', '']);

  (Array.isArray(galleryImages) ? galleryImages : []).forEach((image, index) => {
    const media = mediaByPath.get(image?.storage_path);
    if (!media) return;
    rows.push([
      contentType,
      contentId,
      media.id,
      'gallery',
      Number.isInteger(image.position) ? image.position : index,
      cleanText(image.alt),
      cleanText(image.caption),
    ]);
  });

  for (const row of rows) {
    await connection.execute(
      `INSERT INTO content_media
        (content_type, content_id, media_id, role, position, alt_text, caption, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (content_type, content_id, media_id, role) DO UPDATE SET
         position = EXCLUDED.position,
         alt_text = EXCLUDED.alt_text,
         caption = EXCLUDED.caption,
         updated_at = EXCLUDED.updated_at`,
      [...row, now, now],
    );
  }
}

export async function syncContentMedia(contentType, contentId, values) {
  if (!isGcp()) return;
  const pool = await getCmsPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await syncContentMediaWithConnection(connection, contentType, contentId, values);
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}
