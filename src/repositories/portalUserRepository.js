import { getPortalPool } from '../services/cloudSql.js';
import { getLocalDb, saveLocalDb, isPortalGcp, id, now, hash } from './localDb.js';

export async function getPortalUserByEmail(email) {
  if (isPortalGcp()) {
    try { const pool = await getPortalPool(); const [rows] = await pool.execute(
      "SELECT id, name, email, password, role, created_at, updated_at FROM portal_users WHERE email = ?",
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
      "SELECT id, name, email, password, role, created_at, updated_at FROM portal_users WHERE id = ?",
      [userId]
    );
    return rows[0] || null;
  }
  const db = await getLocalDb();
  return (db.portal_users || []).find(user => user.id === userId) || null;
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


