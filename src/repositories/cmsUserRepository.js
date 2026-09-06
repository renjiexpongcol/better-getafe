import { getCmsPool } from '../services/cloudSql.js';
import { getLocalDb, isGcp } from './localDb.js';

export async function getCmsUsers() {
  if (isGcp()) {
    const pool = await getCmsPool();
    const [rows] = await pool.execute('SELECT * FROM users');
    return rows;
  } else {
    const db = await getLocalDb();
    return db.users;
  }
}

export async function getCmsUserById(userId) {
  const users = await getCmsUsers();
  return users.find(u => u.id === userId) || null;
}

export async function getCmsUserByEmail(email) {
  const users = await getCmsUsers();
  return users.find(u => u.email === String(email).trim().toLowerCase()) || null;
}
