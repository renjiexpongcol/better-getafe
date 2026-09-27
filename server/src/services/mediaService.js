import crypto from 'node:crypto';
import { getCmsPool } from './cloudSql.js';
import { audit } from './authorizationService.js';
import { getPostgresRuntime } from '../repositories/postgresRuntime.js';
import { getMediaById, getMediaByStoragePath, deleteMediaRecord, listExpiredPendingUploads, deletePendingUpload } from '../repositories/mediaRepository.js';
import { getNewsArticles } from '../repositories/newsRepository.js';
import { getBarangays } from '../repositories/barangaysRepository.js';
import { getOfficials } from '../repositories/officialsRepository.js';
import { deleteObject, isStorageNotFoundError, getObjectMetadata, validateObjectKey, storageIsLocal, localObjectExists } from './storage.js';

const MEDIA_ID_PATTERN = /^[a-f0-9-]{36}$/i;
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{0,254}$/i;

export class MediaDeletionError extends Error {
  constructor(code, publicMessage, status, details = {}) {
    super(publicMessage);
    this.name = 'MediaDeletionError';
    this.code = code;
    this.publicMessage = publicMessage;
    this.status = status;
    Object.assign(this, details);
  }
}

function validateMediaId(mediaId) {
  if (typeof mediaId !== 'string' || !MEDIA_ID_PATTERN.test(mediaId)) {
    throw new MediaDeletionError('INVALID_MEDIA_ID', 'The media identifier is invalid.', 422);
  }
  return mediaId;
}

function validateStorageRecord(item) {
  const objectKey = typeof item?.storage_path === 'string' ? item.storage_path.trim() : '';
  const bucket = item?.storage_bucket == null ? '' : String(item.storage_bucket).trim();
  // The object key is read from the trusted media row. These checks only stop
  // malformed legacy data from becoming a filesystem traversal or an unsafe
  // cross-bucket operation; the browser never supplies either value.
  if (!objectKey || objectKey.length > 1024 || objectKey.startsWith('/') || objectKey.includes('\\') || objectKey.split('/').includes('..') || /[\0\r\n]/.test(objectKey)) {
    throw new MediaDeletionError('INVALID_MEDIA_STORAGE_RECORD', 'This media record has an invalid storage reference.', 422);
  }
  if (bucket && !BUCKET_PATTERN.test(bucket)) {
    throw new MediaDeletionError('INVALID_MEDIA_STORAGE_RECORD', 'This media record has an invalid storage bucket.', 422);
  }
  return { objectKey, bucket: bucket || undefined };
}

function recordAudit(actorId, action, targetId, previousValue, newValue, correlationId) {
  return getPostgresRuntime('database')
    .then((db) => audit(db, actorId, action, 'media', targetId, previousValue, newValue, correlationId))
    .catch((error) => console.error('Media deletion audit failed:', error.message));
}

const referenceRoleLabel = (role) => {
  const value = String(role || '').trim().toLowerCase();
  if (value.includes('gallery')) return 'Article gallery';
  if (value.includes('featured')) return 'Featured image';
  if (value.includes('cover')) return 'Cover image';
  if (value.includes('background')) return 'Background image';
  if (value.includes('attachment')) return 'Attachment';
  if (value.includes('photo') || value.includes('profile')) return 'Profile image';
  if (value.includes('content')) return 'Page content';
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : 'Media reference';
};

function addReference(references, { contentType, contentId, title, role }) {
  const normalizedType = String(contentType || 'other').trim().toLowerCase() || 'other';
  const normalizedId = String(contentId || '').trim();
  const normalizedTitle = String(title || 'Untitled content').trim() || 'Untitled content';
  const normalizedRole = referenceRoleLabel(role);
  const existing = references.find((reference) =>
    reference.content_type === normalizedType
    && (normalizedId ? reference.content_id === normalizedId : reference.title === normalizedTitle)
  );
  if (existing) {
    if (!existing.roles.includes(normalizedRole)) existing.roles.push(normalizedRole);
    return;
  }
  references.push({
    content_type: normalizedType,
    content_id: normalizedId || null,
    title: normalizedTitle,
    roles: [normalizedRole],
  });
}

function inspectOfficialGroup(value, groupLabel, objectKey, references) {
  if (Array.isArray(value)) {
    value.forEach((item) => inspectOfficialGroup(item, groupLabel, objectKey, references));
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (value.photo === objectKey) addReference(references, {
    contentType: 'official',
    contentId: value.id,
    title: value.name || groupLabel,
    role: 'Profile image',
  });
  Object.entries(value).forEach(([key, child]) => {
    if (key !== 'photo' && child && typeof child === 'object') inspectOfficialGroup(child, groupLabel, objectKey, references);
  });
}

function replaceMediaReference(value, objectKey) {
  if (typeof value === 'string') return value.split(objectKey).join('');
  if (Array.isArray(value)) return value.map((item) => replaceMediaReference(item, objectKey));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceMediaReference(child, objectKey)]));
  }
  return value;
}

export async function findMediaReferences(objectKey) {
  const references = [];
  const articles = await getNewsArticles();
  articles.forEach((article) => {
    const baseReference = { contentType: 'news', contentId: article.id, title: article.title || 'Untitled article' };
    if (article.featured_image === objectKey) addReference(references, { ...baseReference, role: 'Featured image' });
    if (Array.isArray(article.gallery_images) && article.gallery_images.some((image) => image.storage_path === objectKey)) addReference(references, { ...baseReference, role: 'Article gallery' });
    if (typeof article.content === 'string' && article.content.includes(objectKey)) addReference(references, { ...baseReference, role: 'Page content' });
  });

  const barangays = await getBarangays();
  barangays.forEach((barangay) => {
    const baseReference = { contentType: 'barangay', contentId: barangay.id, title: barangay.name || 'Barangay' };
    if (barangay.cover_image === objectKey) addReference(references, { ...baseReference, role: 'Cover image' });
    if (typeof barangay.more_information === 'string' && barangay.more_information.includes(objectKey)) addReference(references, { ...baseReference, role: 'Page content' });
  });

  const officials = await getOfficials();
  ['mayor', 'viceMayor', 'abcPresident', 'sbMembers', 'punongBarangays', 'deptHeads'].forEach((group) => {
    inspectOfficialGroup(officials?.[group], group, objectKey, references);
  });

  const pool = await getCmsPool();
  const [canonicalReferences] = await pool.execute(
    `SELECT cm.content_type, cm.role, cm.content_id, n.title AS news_title, d.title AS destination_title
     FROM content_media cm
     JOIN media m ON m.id = cm.media_id
     LEFT JOIN news n ON cm.content_type = 'news' AND n.id = cm.content_id
     LEFT JOIN destinations d ON cm.content_type = 'destination' AND d.id = cm.content_id
     WHERE m.storage_path = ?`,
    [objectKey],
  );
  canonicalReferences.forEach((item) => {
    addReference(references, {
      contentType: item.content_type,
      contentId: item.content_id,
      title: item.news_title || item.destination_title || item.content_id,
      role: item.role,
    });
  });
  const [destinations] = await pool.execute('SELECT id, title FROM destinations WHERE featured_image = ?', [objectKey]);
  destinations.forEach(item => addReference(references, { contentType: 'destination', contentId: item.id, title: item.title, role: 'Featured image' }));
  const [pages] = await pool.execute('SELECT slug FROM site_pages WHERE content LIKE ?', [`%${objectKey}%`]);
  pages.forEach((page) => {
    if (!['barangays', 'officials'].includes(page.slug)) addReference(references, { contentType: 'page', contentId: page.slug, title: page.slug || 'CMS page', role: 'Page content' });
  });
  return references;
}

export async function clearMediaReferences(objectKey) {
  const pool = await getCmsPool();
  const connection = await pool.getConnection();
  let cleared = 0;
  try {
    await connection.beginTransaction();
    await connection.execute("UPDATE destinations SET featured_image = '', published = FALSE, updated_at = CURRENT_TIMESTAMP WHERE featured_image = ?", [objectKey]);
    const [newsResult] = await connection.execute('UPDATE news SET featured_image = ?, updated_at = CURRENT_TIMESTAMP WHERE featured_image = ?', ['', objectKey]);
    cleared += newsResult.rowCount || newsResult.affectedRows || 0;

    const [galleryRows] = await connection.execute('SELECT id, gallery_images FROM news WHERE gallery_images::text LIKE ? FOR UPDATE', [`%${objectKey}%`]);
    for (const article of galleryRows) {
      const images = (Array.isArray(article.gallery_images) ? article.gallery_images : []).filter((image) => image.storage_path !== objectKey);
      if (images.length === article.gallery_images.length) continue;
      await connection.execute('UPDATE news SET gallery_images = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [JSON.stringify(images.map((image, index) => ({ ...image, position: index }))), article.id]);
      cleared += 1;
    }

    const [pages] = await connection.execute('SELECT slug, content FROM site_pages WHERE content LIKE ? FOR UPDATE', [`%${objectKey}%`]);
    for (const page of pages) {
      const rawContent = String(page.content || '');
      let content = rawContent;
      try {
        const parsed = JSON.parse(rawContent);
        const replaced = replaceMediaReference(parsed, objectKey);
        content = JSON.stringify(replaced);
      } catch {
        content = rawContent.split(objectKey).join('');
      }
      if (content === rawContent) continue;
      await connection.execute('UPDATE site_pages SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?', [content, page.slug]);
      cleared += 1;
    }
    const [canonicalResult] = await connection.execute(
      `DELETE FROM content_media
       WHERE media_id IN (SELECT id FROM media WHERE storage_path = ?)`,
      [objectKey],
    );
    cleared += canonicalResult.rowCount || canonicalResult.affectedRows || 0;
    await connection.commit();
    return cleared;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteMediaAsset({ mediaId, force = false, actorId }) {
  const id = validateMediaId(mediaId);
  if (typeof force !== 'boolean') throw new MediaDeletionError('INVALID_DELETE_REQUEST', 'The media deletion request is invalid.', 422);

  const item = await getMediaById(id);
  if (!item) throw new MediaDeletionError('MEDIA_NOT_FOUND', 'Media not found.', 404);
  const storage = validateStorageRecord(item);
  const references = await findMediaReferences(storage.objectKey);
  const correlationId = crypto.randomUUID();

  if (references.length && !force) {
    await recordAudit(actorId, 'MEDIA_DELETE_BLOCKED', id, item, { reason: 'referenced', references }, correlationId);
    throw new MediaDeletionError('MEDIA_REFERENCED', 'This media is currently used by portal content.', 409, { references });
  }

  if (references.length && force) {
    try {
      await clearMediaReferences(storage.objectKey);
    } catch (error) {
      await recordAudit(actorId, 'MEDIA_DELETE_FAILED', id, item, { reason: 'reference_cleanup_failed' }, correlationId);
      console.error('Media reference cleanup failed:', { mediaId: id, objectKey: storage.objectKey, error: error.message });
      throw new MediaDeletionError('MEDIA_REFERENCE_CLEANUP_FAILED', 'The media references could not be cleared. No storage object or Media Library record was deleted.', 500);
    }
  }

  let storageStatus = 'deleted';
  try {
    await deleteObject(storage.objectKey, storage.bucket);
  } catch (error) {
    if (isStorageNotFoundError(error)) {
      storageStatus = 'already_missing';
    } else {
      await recordAudit(actorId, 'MEDIA_DELETE_FAILED', id, item, { reason: 'storage_delete_failed', storage_status: 'not_deleted' }, correlationId);
      console.error('Media storage deletion failed:', {
        mediaId: id,
        objectKey: storage.objectKey,
        bucket: storage.bucket || null,
        error: error.message,
        code: error.name || error.code || null,
        status: error.$metadata?.httpStatusCode || error.statusCode || null,
      });
      throw new MediaDeletionError('MEDIA_STORAGE_DELETE_FAILED', 'Unable to delete media. The file could not be removed from storage. No Media Library record was deleted.', 502);
    }
  }

  try {
    await deleteMediaRecord(id);
  } catch (error) {
    await recordAudit(actorId, 'MEDIA_DELETE_FAILED', id, item, { reason: 'database_delete_failed', storage_status: storageStatus }, correlationId);
    console.error('Media database deletion failed:', { mediaId: id, objectKey: storage.objectKey, error: error.message });
    throw new MediaDeletionError('MEDIA_DATABASE_DELETE_FAILED', 'The file was removed from storage, but the Media Library record could not be cleaned up. Contact an administrator.', 500);
  }

  await recordAudit(actorId, 'MEDIA_DELETED', id, item, { storage_status: storageStatus, references_cleared: references.length }, correlationId);
  return { id, original_filename: item.original_filename, storage_status: storageStatus, references_cleared: references.length };
}

export async function cleanupExpiredPendingUploads({ limit = 100 } = {}) {
  const pending = await listExpiredPendingUploads(limit);
  let removed = 0;
  for (const upload of pending) {
    const key = upload.storage_path;
    if (!key || !validateObjectKey(key) || !/^[a-zA-Z0-9_\/-]+\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(key)) {
      console.error(JSON.stringify({ event: 'storage_orphan_cleanup', operation: 'skip_invalid_key', key: key || null, result: 'failed' }));
      continue;
    }
    try {
      if (await getMediaByStoragePath(key)) continue;
      if (storageIsLocal()) {
        if (await localObjectExists(key)) await deleteObject(key);
      } else {
        const metadata = await getObjectMetadata(key);
        if (metadata) await deleteObject(key);
      }
      await deletePendingUpload(key);
      removed++;
      console.info(JSON.stringify({ event: 'storage_orphan_cleanup', operation: 'delete_expired_upload', key, result: 'ok' }));
    } catch (error) {
      console.error(JSON.stringify({ event: 'storage_orphan_cleanup', operation: 'delete_expired_upload', key, result: 'failed', errorCode: error.name || error.code || 'UnknownError' }));
    }
  }
  return { scanned: pending.length, removed };
}

export function mediaErrorPayload(error, id) {
  return {
    id,
    success: false,
    code: error.code || 'MEDIA_DELETE_FAILED',
    error: error.publicMessage || 'Unable to delete media. No Media Library record was deleted.',
    ...(error.references ? { references: error.references } : {}),
  };
}
