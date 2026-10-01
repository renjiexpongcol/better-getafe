import { getCmsPool } from '../services/cloudSql.js';
import { getLocalDb, saveLocalDb, isGcp, now, id } from './postgresCompatibility.js';
import { hashPassword } from '../services/passwordHashing.js';

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
      await pool.execute('INSERT INTO users (id,name,email,password,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', [userId, values.name, values.email, await hashPassword(values.password), values.role, updated, updated]);
    }
  } else {
    const db = await getLocalDb();
    if (userId) {
      const user = db.users.find(item => item.id === userId);
      if (!user) throw new Error('Account unavailable.');
      Object.assign(user, { name: values.name, role: values.role, updated_at: updated });
    } else {
      userId = id();
      db.users.push({ id: userId, name: values.name, email: values.email, password: await hashPassword(values.password), role: values.role, created_at: updated, updated_at: updated });
    }
    await saveLocalDb(db);
  }
  return userId;
}

export async function saveCmsAvatar(userId, avatarStoragePath) {
  if (isGcp()) {
    const pool = await getCmsPool();
    await pool.execute('UPDATE users SET avatar_storage_path=? WHERE id=?', [avatarStoragePath, userId]);
  } else {
    const db = await getLocalDb();
    const user = db.users.find(item => item.id === userId);
    if (!user) throw new Error('Account unavailable.');
    user.avatar_storage_path = avatarStoragePath;
    await saveLocalDb(db);
  }
}

export async function getCmsUserById(userId) {
  if (isGcp()) {
    const [rows] = await (await getCmsPool()).execute('SELECT * FROM users WHERE id=?', [userId]);
    return rows[0] || null;
  }
  const users = await getCmsUsers();
  return users.find(u => u.id === userId) || null;
}

// Disabled accounts use the existing disabled role. There is no separate username
// column: email is the account login identifier.
export async function searchDepartmentStaff(query, limit = 10, offset = 0) {
  const roles = ['staff', 'admin', 'super_admin', 'it_support'];
  if (isGcp()) {
    const [rows] = await (await getCmsPool()).execute(
      "SELECT id,name,email FROM users WHERE role IN ('staff','admin','super_admin','it_support') AND (strpos(lower(name),lower(?))>0 OR strpos(lower(email),lower(?))>0 OR strpos(lower(id),lower(?))>0) ORDER BY lower(name),id LIMIT ? OFFSET ?",
      [query, query, query, limit + 1, offset],
    );
    return { items: rows.slice(0, limit), has_more: rows.length > limit };
  }
  const rows = (await getLocalDb()).users
    .filter(user => roles.includes(user.role) && [user.name, user.email, user.id].some(value => String(value || '').toLowerCase().includes(query.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .slice(offset, offset + limit + 1);
  return { items: rows.slice(0, limit).map(({ id, name, email }) => ({ id, name, email })), has_more: rows.length > limit };
}

export async function getCmsUserByEmail(email) {
  const users = await getCmsUsers();
  return users.find(u => u.email === String(email).trim().toLowerCase()) || null;
}
