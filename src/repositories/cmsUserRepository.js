import { getCmsPool } from '../services/cloudSql.js';
import { getLocalDb, saveLocalDb, isGcp, now, id, hash } from './postgresCompatibility.js';

export async function getCmsUsers() {
  if (isGcp()) {
    try {
      const pool = await getCmsPool();
      const [rows] = await pool.execute('SELECT * FROM users');
      return rows;
    } catch (error) {
      if (process.env.NODE_ENV === 'production' || process.env.AUTH_LOCAL_FALLBACK !== 'true') throw error;
      console.warn('Cloud SQL unavailable; using local development accounts.');
      return (await getLocalDb()).users;
    }
  } else {
    const db = await getLocalDb();
    return db.users;
  }
}

export async function saveCmsAccount(values, userId) {
  const updated = now();
  if (isGcp()) {
    const pool = await getCmsPool();
    if (userId) await pool.execute('UPDATE users SET name=?, role=?, updated_at=? WHERE id=?', [values.name, values.role, updated, userId]);
    else {
      userId = id();
      await pool.execute('INSERT INTO users (id,name,email,password,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', [userId, values.name, values.email, hash(values.password), values.role, updated, updated]);
    }
  } else {
    const db = await getLocalDb();
    if (userId) {
      const user = db.users.find(item => item.id === userId);
      if (!user) throw new Error('Account unavailable.');
      Object.assign(user, { name: values.name, role: values.role, updated_at: updated });
    } else {
      userId = id();
      db.users.push({ id: userId, name: values.name, email: values.email, password: hash(values.password), role: values.role, created_at: updated, updated_at: updated });
    }
    await saveLocalDb(db);
  }
  return userId;
}

export async function getCmsUserById(userId) {
  const users = await getCmsUsers();
  return users.find(u => u.id === userId) || null;
}

export async function getCmsUserByEmail(email) {
  const users = await getCmsUsers();
  return users.find(u => u.email === String(email).trim().toLowerCase()) || null;
}


