import { getPortalPool } from '../services/cloudSql.js';
import { getLocalDb, saveLocalDb, isPortalGcp, id, now, hash } from './localDb.js';

export async function getPortalUserByEmail(email) {
  if (isPortalGcp()) {
    try { const pool = await getPortalPool(); const [rows] = await pool.execute(
      "SELECT id, name, email, password, role, mfa_enabled, mfa_secret_encrypted, mfa_recovery_codes, mfa_verified_at, created_at, updated_at FROM portal_users WHERE email = ?",
      [String(email).trim().toLowerCase()]
    );
    return rows[0] || null;
    } catch (error) { if (process.env.NODE_ENV === 'production' || process.env.AUTH_LOCAL_FALLBACK !== 'true') throw error; }
  }
  
  const db = await getLocalDb();
  if (!db.portal_users) db.portal_users = [];
  return db.portal_users.find(u => u.email === String(email).toLowerCase()) || null;
}

export async function getPortalUserById(userId) {
  if (isPortalGcp()) {
    const pool = await getPortalPool();
    const [rows] = await pool.execute(
      "SELECT id, name, email, password, role, mfa_enabled, mfa_secret_encrypted, mfa_recovery_codes, mfa_verified_at, created_at, updated_at FROM portal_users WHERE id = ?",
      [userId]
    );
    return rows[0] || null;
  }
  const db = await getLocalDb();
  return (db.portal_users || []).find(user => user.id === userId) || null;
}

export async function savePortalUserMfa(userId, values) {
  const updatedAt = now();
  if (isPortalGcp()) {
    const pool = await getPortalPool();
    await pool.execute(
      'UPDATE portal_users SET mfa_enabled=?, mfa_secret_encrypted=?, mfa_recovery_codes=?, mfa_verified_at=?, updated_at=? WHERE id=?',
      [values.enabled ? 1 : 0, values.secret || null, JSON.stringify(values.recoveryCodes || []), values.verifiedAt || null, updatedAt, userId]
    );
    return;
  }
  const db = await getLocalDb();
  const user = (db.portal_users || []).find(item => item.id === userId);
  if (!user) throw new Error('Portal user not found.');
  Object.assign(user, { mfa_enabled: Boolean(values.enabled), mfa_secret_encrypted: values.secret || null, mfa_recovery_codes: values.recoveryCodes || [], mfa_verified_at: values.verifiedAt || null, updated_at: updatedAt });
  await saveLocalDb(db);
}

export async function consumePortalRecoveryCode(userId, code, matches) {
  if (isPortalGcp()) {
    const pool = await getPortalPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [[user]] = await connection.execute('SELECT mfa_recovery_codes FROM portal_users WHERE id=? FOR UPDATE', [userId]);
      const hashes = JSON.parse(user?.mfa_recovery_codes || '[]');
      const index = hashes.findIndex(hashValue => matches(code, hashValue));
      if (index < 0) { await connection.rollback(); return false; }
      hashes.splice(index, 1);
      await connection.execute('UPDATE portal_users SET mfa_recovery_codes=?, updated_at=? WHERE id=?', [JSON.stringify(hashes), now(), userId]);
      await connection.commit();
      return true;
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }
  const db = await getLocalDb();
  const user = (db.portal_users || []).find(item => item.id === userId);
  const hashes = Array.isArray(user?.mfa_recovery_codes) ? user.mfa_recovery_codes : JSON.parse(user?.mfa_recovery_codes || '[]');
  const index = hashes.findIndex(hashValue => matches(code, hashValue));
  if (index < 0) return false;
  hashes.splice(index, 1);
  user.mfa_recovery_codes = hashes;
  user.updated_at = now();
  await saveLocalDb(db);
  return true;
}

export async function createPortalUser(name, email, password) {
  const created = now();
  const user = { 
    id: id(), 
    name, 
    email: String(email).toLowerCase(), 
    password: hash(password), 
    role: "resident", 
    created_at: created, 
    updated_at: created 
  };

  if (isPortalGcp()) {
    const pool = await getPortalPool();
    await pool.execute(
      "INSERT INTO portal_users (id, name, email, password, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [user.id, user.name, user.email, user.password, user.role, user.created_at, user.updated_at]
    );
    return user;
  }
  
  const db = await getLocalDb();
  if (!db.portal_users) db.portal_users = [];
  if (db.portal_users.find(u => u.email === user.email)) {
    const error = new Error("Duplicate entry");
    error.code = "ER_DUP_ENTRY";
    throw error;
  }
  db.portal_users.push(user);
  await saveLocalDb(db);
  return user;
}


