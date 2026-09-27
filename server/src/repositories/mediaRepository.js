import { getCmsPool } from '../services/cloudSql.js';
import crypto from 'crypto';
import { getLocalDb, saveLocalDb, isGcp } from './postgresCompatibility.js';

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString().slice(0, 23).replace('T', ' ');

export async function getMedia() {
  if (!isGcp()) {
    const db = await getLocalDb();
    return db.media || [];
  }
  const pool = await getCmsPool();
  const [rows] = await pool.execute(
    `SELECT m.*, COUNT(cm.media_id)::INTEGER AS usage_count
     FROM media m
     LEFT JOIN content_media cm ON cm.media_id = m.id
     GROUP BY m.id
     ORDER BY m.created_at DESC`,
  );
  return rows;
}

const mediaSorts = Object.freeze({
  newest: 'm.created_at DESC',
  oldest: 'm.created_at ASC',
  'name-asc': 'LOWER(m.original_filename) ASC',
  'name-desc': 'LOWER(m.original_filename) DESC',
  largest: 'm.file_size DESC',
  smallest: 'm.file_size ASC',
});

function mediaPageOptions(options = {}) {
  const page = Math.max(1, Number.parseInt(options.page, 10) || 1);
  const limit = [10, 20, 50, 100].includes(Number(options.limit)) ? Number(options.limit) : 20;
  const search = String(options.search || '').trim().slice(0, 120);
  const usage = ['all', 'used', 'unused', 'broken'].includes(options.usage) ? options.usage : 'all';
  const sort = mediaSorts[options.sort] ? options.sort : 'newest';
  return { page, limit, search, usage, sort };
}

function filterLocalMedia(items, options) {
  const query = options.search.toLowerCase();
  const filtered = items.filter(item => {
    const name = String(item.original_filename || item.name || '').toLowerCase();
    const type = String(item.content_type || '').toLowerCase();
    if (query && !name.includes(query) && !type.includes(query)) return false;
    const count = Number(item.usage_count || 0);
    if (options.usage === 'used' && count <= 0) return false;
    if (options.usage === 'unused' && count > 0) return false;
    return true;
  });
  filtered.sort((left, right) => {
    if (options.sort === 'oldest') return new Date(left.created_at || 0) - new Date(right.created_at || 0);
    if (options.sort === 'name-asc') return String(left.original_filename || left.name || '').localeCompare(String(right.original_filename || right.name || ''));
    if (options.sort === 'name-desc') return String(right.original_filename || right.name || '').localeCompare(String(left.original_filename || left.name || ''));
    if (options.sort === 'largest') return Number(right.file_size || 0) - Number(left.file_size || 0);
    if (options.sort === 'smallest') return Number(left.file_size || 0) - Number(right.file_size || 0);
    return new Date(right.created_at || 0) - new Date(left.created_at || 0);
  });
  return filtered;
}

export async function getMediaPage(rawOptions = {}) {
  const options = mediaPageOptions(rawOptions);
  if (!isGcp()) {
    const db = await getLocalDb();
    const filtered = filterLocalMedia(db.media || [], options);
    const total = filtered.length;
    const start = (options.page - 1) * options.limit;
    return {
      items: filtered.slice(start, start + options.limit),
      pagination: { page: options.page, limit: options.limit, total, pages: Math.max(1, Math.ceil(total / options.limit)) },
    };
  }

  const pool = await getCmsPool();
  const where = [];
  const params = [];
  if (options.search) {
    where.push(`(LOWER(COALESCE(m.original_filename, '')) LIKE LOWER(?) OR LOWER(COALESCE(m.content_type, '')) LIKE LOWER(?))`);
    const term = `%${options.search}%`;
    params.push(term, term);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const havingSql = options.usage === 'used' ? 'HAVING COUNT(cm.media_id) > 0' : options.usage === 'unused' ? 'HAVING COUNT(cm.media_id) = 0' : '';
  const countParams = [...params];
  const [countRows] = await pool.execute(
    `SELECT COUNT(*)::INTEGER AS total FROM (
       SELECT m.id
       FROM media m
       LEFT JOIN content_media cm ON cm.media_id = m.id
       ${whereSql}
       GROUP BY m.id
       ${havingSql}
     ) filtered_media`,
    countParams,
  );
  const total = Number(countRows[0]?.total || 0);
  const offset = (options.page - 1) * options.limit;
  const [items] = await pool.execute(
    `SELECT m.*, COUNT(cm.media_id)::INTEGER AS usage_count
     FROM media m
     LEFT JOIN content_media cm ON cm.media_id = m.id
     ${whereSql}
     GROUP BY m.id
     ${havingSql}
     ORDER BY ${mediaSorts[options.sort]}, m.id
     LIMIT ? OFFSET ?`,
    [...params, options.limit, offset],
  );
  return {
    items,
    pagination: { page: options.page, limit: options.limit, total, pages: Math.max(1, Math.ceil(total / options.limit)) },
  };
}

export async function getMediaById(mediaId) {
  if (!isGcp()) {
    const db = await getLocalDb();
    return (db.media || []).find((item) => item.id === mediaId) || null;
  }
  const pool = await getCmsPool();
  const [rows] = await pool.execute('SELECT * FROM media WHERE id = ?', [mediaId]);
  return rows[0] || null;
}

export async function getMediaByStoragePath(storagePath) {
  if (!isGcp()) {
    const db = await getLocalDb();
    return (db.media || []).find((item) => item.storage_path === storagePath) || null;
  }
  const pool = await getCmsPool();
  const [rows] = await pool.execute('SELECT * FROM media WHERE storage_path = ?', [storagePath]);
  return rows[0] || null;
}

export async function getMediaByChecksum(checksumSha256) {
  if (!checksumSha256) return null;
  if (!isGcp()) {
    const db = await getLocalDb();
    return (db.media || []).find((item) => item.checksum_sha256 === checksumSha256) || null;
  }
  const pool = await getCmsPool();
  const [rows] = await pool.execute('SELECT * FROM media WHERE checksum_sha256 = ?', [checksumSha256]);
  return rows[0] || null;
}

export async function createPendingUpload(upload) {
  if (!isGcp()) {
    const db = await getLocalDb();
    const pending = {
      id: upload.id,
      storage_path: upload.storagePath,
      original_filename: upload.originalFilename,
      content_type: upload.contentType,
      file_size: upload.fileSize,
      uploaded_by: upload.uploadedBy,
      context: upload.context,
      status: 'pending',
      expires_at: new Date(upload.expiresAt).toISOString(),
      created_at: new Date(upload.createdAt).toISOString(),
    };
    db.media_uploads = (db.media_uploads || []).filter((item) => item.storage_path !== upload.storagePath);
    db.media_uploads.push(pending);
    await saveLocalDb(db);
    return upload;
  }
  const pool = await getCmsPool();
  await pool.execute(
    `INSERT INTO media_uploads
      (id, storage_path, original_filename, content_type, file_size, uploaded_by, context, status, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [upload.id, upload.storagePath, upload.originalFilename, upload.contentType, upload.fileSize, upload.uploadedBy, upload.context, upload.expiresAt, upload.createdAt]
  );
  return upload;
}

export async function getPendingUpload(storagePath, uploadedBy) {
  if (!isGcp()) {
    const db = await getLocalDb();
    const pending = (db.media_uploads || []).find((item) => item.storage_path === storagePath && item.uploaded_by === uploadedBy && item.status === 'pending' && new Date(item.expires_at).getTime() > Date.now());
    return pending || null;
  }
  const pool = await getCmsPool();
  const [rows] = await pool.execute(
    "SELECT * FROM media_uploads WHERE storage_path = ? AND uploaded_by = ? AND status = 'pending' AND expires_at > UTC_TIMESTAMP(3)",
    [storagePath, uploadedBy]
  );
  return rows[0] || null;
}

export async function deletePendingUpload(storagePath) {
  if (!isGcp()) {
    const db = await getLocalDb();
    db.media_uploads = (db.media_uploads || []).filter((item) => item.storage_path !== storagePath);
    await saveLocalDb(db);
    return;
  }
  const pool = await getCmsPool();
  await pool.execute("DELETE FROM media_uploads WHERE storage_path = ? AND status = 'pending'", [storagePath]);
}

export async function listExpiredPendingUploads(limit = 100) {
  if (!isGcp()) {
    const db = await getLocalDb();
    return (db.media_uploads || []).filter(item => item.status === 'pending' && new Date(item.expires_at).getTime() <= Date.now()).slice(0, limit);
  }
  const pool = await getCmsPool();
  const safeLimit = Math.max(1, Math.min(500, Number.parseInt(limit, 10) || 100));
  const [rows] = await pool.execute(`SELECT * FROM media_uploads WHERE status = 'pending' AND expires_at <= CURRENT_TIMESTAMP ORDER BY expires_at LIMIT ${safeLimit}`);
  return rows;
}

export async function finalizePendingUpload(upload, media) {
  if (!isGcp()) {
    const db = await getLocalDb();
    const existing = (db.media || []).find((item) => item.storage_path === media.storagePath);
    const sameFile = media.checksumSha256 && (db.media || []).find((item) => item.checksum_sha256 === media.checksumSha256);
    if (sameFile) {
      db.media_uploads = (db.media_uploads || []).filter((pending) => pending.storage_path !== media.storagePath);
      await saveLocalDb(db);
      return { ...sameFile, reused: true };
    }
    if (existing) {
      db.media_uploads = (db.media_uploads || []).filter((pending) => pending.storage_path !== media.storagePath);
      await saveLocalDb(db);
      return existing;
    }
    const item = {
      id: media.id,
      original_filename: media.originalFilename,
      storage_bucket: media.storageBucket || null,
      storage_path: media.storagePath,
      content_type: media.contentType,
      file_size: media.fileSize,
      uploaded_by: media.uploadedBy,
      related_record_id: media.relatedRecordId,
      checksum_sha256: media.checksumSha256 || null,
      status: 'active',
      created_at: media.createdAt,
    };
    db.media = [...(db.media || []), item];
    db.media_uploads = (db.media_uploads || []).filter((pending) => pending.storage_path !== media.storagePath);
    await saveLocalDb(db);
    return item;
  }
  const pool = await getCmsPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute('SELECT * FROM media WHERE storage_path = ? FOR UPDATE', [media.storagePath]);
    if (existing[0]) {
      await connection.execute(
        "UPDATE media_uploads SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE storage_path = ? AND uploaded_by = ? AND status = 'pending'",
        [upload.storagePath, upload.uploadedBy],
      );
      await connection.commit();
      return { ...existing[0], reused: true };
    }
    if (media.checksumSha256) {
      const [sameFile] = await connection.execute('SELECT * FROM media WHERE checksum_sha256 = ? FOR UPDATE', [media.checksumSha256]);
      if (sameFile[0]) {
        await connection.execute(
          "UPDATE media_uploads SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE storage_path = ? AND uploaded_by = ? AND status = 'pending'",
          [upload.storagePath, upload.uploadedBy],
        );
        await connection.commit();
        return { ...sameFile[0], reused: true };
      }
    }
    const [inserted] = await connection.execute(
      `INSERT INTO media
        (id, original_filename, storage_bucket, storage_path, content_type, file_size, uploaded_by, related_record_id, checksum_sha256, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
        ON CONFLICT DO NOTHING
        RETURNING *`,
      [media.id, media.originalFilename, media.storageBucket, media.storagePath, media.contentType, media.fileSize, media.uploadedBy, media.relatedRecordId, media.checksumSha256 || null, media.createdAt]
    );
    if (!inserted[0]) {
      const [raced] = await connection.execute(
        'SELECT * FROM media WHERE storage_path = ? OR (checksum_sha256 IS NOT NULL AND checksum_sha256 = ?) ORDER BY CASE WHEN storage_path = ? THEN 0 ELSE 1 END LIMIT 1',
        [media.storagePath, media.checksumSha256 || '', media.storagePath],
      );
      if (!raced[0]) throw new Error('The media record could not be finalized.');
      await connection.commit();
      return { ...raced[0], reused: true };
    }
    await connection.execute(
      "UPDATE media_uploads SET status = 'completed', completed_at = UTC_TIMESTAMP(3) WHERE storage_path = ? AND uploaded_by = ? AND status = 'pending'",
      [upload.storagePath, upload.uploadedBy]
    );
    await connection.commit();
    return inserted[0];
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function createMediaRecord(originalFilename, storageBucket, storagePath, contentType, fileSize, uploadedBy, relatedRecordId = null) {
  const item = {
    id: id(),
    original_filename: originalFilename,
    storage_bucket: storageBucket,
    storage_path: storagePath,
    content_type: contentType,
    file_size: fileSize,
    uploaded_by: uploadedBy,
    related_record_id: relatedRecordId,
    status: 'active',
    created_at: now(),
  };

  const pool = await getCmsPool();
  await pool.execute(
    "INSERT INTO media (id, original_filename, storage_bucket, storage_path, content_type, file_size, uploaded_by, related_record_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [item.id, item.original_filename, item.storage_bucket, item.storage_path, item.content_type, item.file_size, item.uploaded_by, item.related_record_id, item.status, item.created_at]
  );

  return item;
}

export async function deleteMediaRecord(mediaId) {
  if (!isGcp()) {
    const db = await getLocalDb();
    db.media = (db.media || []).filter((item) => item.id !== mediaId);
    await saveLocalDb(db);
    return;
  }
  const pool = await getCmsPool();
  await pool.execute("DELETE FROM media WHERE id = ?", [mediaId]);
}
