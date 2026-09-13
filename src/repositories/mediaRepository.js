import { getCmsPool } from '../services/cloudSql.js';
import crypto from 'crypto';
import { getLocalDb, saveLocalDb, isGcp } from './localDb.js';

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString().slice(0, 23).replace('T', ' ');

export async function getMedia() {
  if (!isGcp()) {
    const db = await getLocalDb();
    return db.media || [];
  }
  const pool = await getCmsPool();
  const [rows] = await pool.execute('SELECT * FROM media ORDER BY created_at DESC');
  return rows;
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

export async function finalizePendingUpload(upload, media) {
  if (!isGcp()) {
    const db = await getLocalDb();
    const existing = (db.media || []).find((item) => item.storage_path === media.storagePath);
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
      await connection.commit();
      return existing[0];
    }
    await connection.execute(
      `INSERT INTO media
        (id, original_filename, storage_bucket, storage_path, content_type, file_size, uploaded_by, related_record_id, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [media.id, media.originalFilename, media.storageBucket, media.storagePath, media.contentType, media.fileSize, media.uploadedBy, media.relatedRecordId, media.createdAt]
    );
    await connection.execute(
      "UPDATE media_uploads SET status = 'completed', completed_at = UTC_TIMESTAMP(3) WHERE storage_path = ? AND uploaded_by = ? AND status = 'pending'",
      [upload.storagePath, upload.uploadedBy]
    );
    await connection.commit();
    return media;
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
