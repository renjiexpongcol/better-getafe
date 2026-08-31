import { getCmsPool } from '../services/cloudSql.js';
import { getLocalDb, saveLocalDb, isGcp, id, now } from './localDb.js';

export async function getMedia() {
  if (isGcp()) {
    const pool = await getCmsPool();
    const [rows] = await pool.execute('SELECT * FROM media');
    return rows;
  } else {
    const db = await getLocalDb();
    return db.media;
  }
}

export async function getMediaById(mediaId) {
  const allMedia = await getMedia();
  return allMedia.find(m => m.id === mediaId) || null;
}

export async function createMediaRecord(filename, filepath, filetype, filesize, uploaded_by) {
  const item = {
    id: id(),
    filename: filename.replace(/[^a-zA-Z0-9._-]/g, "_"),
    filepath,
    filetype,
    filesize,
    uploaded_by,
    created_at: now(),
  };

  if (isGcp()) {
    const pool = await getCmsPool();
    await pool.execute(
      "INSERT INTO media (id, filename, filepath, filetype, filesize, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [item.id, item.filename, item.filepath, item.filetype, item.filesize, item.uploaded_by, item.created_at]
    );
  } else {
    const db = await getLocalDb();
    db.media.unshift(item);
    await saveLocalDb(db);
  }
  return item;
}

export async function deleteMediaRecord(mediaId) {
  if (isGcp()) {
    const pool = await getCmsPool();
    await pool.execute("DELETE FROM media WHERE id=?", [mediaId]);
  } else {
    const db = await getLocalDb();
    const index = db.media.findIndex(m => m.id === mediaId);
    if (index >= 0) {
      db.media.splice(index, 1);
      await saveLocalDb(db);
    }
  }
}
