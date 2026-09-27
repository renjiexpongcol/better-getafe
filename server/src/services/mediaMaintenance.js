import crypto from 'node:crypto';
import { getCmsPool } from './cloudSql.js';
import { deleteObject, readObject } from './storage.js';
import { getMedia } from '../repositories/mediaRepository.js';

const checksum = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

async function migrateLegacyReferences(connection, duplicatePath, canonicalPath) {
  await connection.execute('UPDATE news SET featured_image = ?, updated_at = CURRENT_TIMESTAMP WHERE featured_image = ?', [canonicalPath, duplicatePath]);
  const [articles] = await connection.execute('SELECT id, gallery_images FROM news WHERE gallery_images::text LIKE ?', [`%${duplicatePath}%`]);
  for (const article of articles) {
    const gallery = Array.isArray(article.gallery_images) ? article.gallery_images : [];
    const updated = gallery.map((image) => image?.storage_path === duplicatePath ? { ...image, storage_path: canonicalPath } : image);
    if (JSON.stringify(updated) !== JSON.stringify(gallery)) {
      await connection.execute('UPDATE news SET gallery_images = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [JSON.stringify(updated), article.id]);
    }
  }
  await connection.execute('UPDATE destinations SET featured_image = ?, updated_at = CURRENT_TIMESTAMP WHERE featured_image = ?', [canonicalPath, duplicatePath]);
  const [pages] = await connection.execute('SELECT slug, content FROM site_pages WHERE content LIKE ?', [`%${duplicatePath}%`]);
  for (const page of pages) {
    await connection.execute('UPDATE site_pages SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?', [String(page.content || '').split(duplicatePath).join(canonicalPath), page.slug]);
  }
}

async function mergeCanonicalRelationships(connection, duplicateId, canonicalId) {
  await connection.execute(
    `INSERT INTO content_media (content_type, content_id, media_id, role, position, alt_text, caption, created_at, updated_at)
     SELECT content_type, content_id, ?, role, position, alt_text, caption, created_at, updated_at
     FROM content_media WHERE media_id = ?
     ON CONFLICT (content_type, content_id, media_id, role) DO NOTHING`,
    [canonicalId, duplicateId],
  );
  await connection.execute('DELETE FROM content_media WHERE media_id = ?', [duplicateId]);
}

export async function reconcileMedia({ apply = false } = {}) {
  const pool = await getCmsPool();
  const media = await getMedia();
  const report = { scanned: media.length, hashed: 0, updated: 0, duplicates: [], skipped: [] };

  for (const item of media) {
    try {
      const bytes = await readObject(item.storage_path, item.storage_bucket);
      const hash = checksum(bytes);
      report.hashed++;
      const [matches] = await pool.execute(
        'SELECT id, storage_path, created_at FROM media WHERE checksum_sha256 = ? AND id <> ?',
        [hash, item.id],
      );
      const candidates = [{ id: item.id, storage_path: item.storage_path, created_at: item.created_at }, ...matches]
        .sort((left, right) => new Date(left.created_at) - new Date(right.created_at) || String(left.id).localeCompare(String(right.id)));
      const canonical = candidates[0];
      if (canonical.id === item.id) {
        if (apply && item.checksum_sha256 !== hash) {
          await pool.execute('UPDATE media SET checksum_sha256 = ? WHERE id = ?', [hash, item.id]);
          report.updated++;
        }
        continue;
      }

      const duplicate = { id: item.id, storage_path: item.storage_path, checksum_sha256: hash, canonical_id: canonical.id, canonical_path: canonical.storage_path };
      report.duplicates.push(duplicate);
      if (!apply) continue;

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await migrateLegacyReferences(connection, item.storage_path, canonical.storage_path);
        await mergeCanonicalRelationships(connection, item.id, canonical.id);
        await connection.execute('DELETE FROM media WHERE id = ?', [item.id]);
        await connection.commit();
      } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
      } finally {
        connection.release();
      }
      await deleteObject(item.storage_path, item.storage_bucket);
      report.updated++;
    } catch (error) {
      report.skipped.push({ id: item.id, storage_path: item.storage_path, error: error.message });
    }
  }
  return report;
}
