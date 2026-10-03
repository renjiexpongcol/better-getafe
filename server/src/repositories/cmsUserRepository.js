import { provisionEmployee } from '../services/employeeProvisioning.js';
import { getCmsPool } from '../services/cloudSql.js';
import { getLocalDb, saveLocalDb, isGcp } from './postgresCompatibility.js';

export async function getCmsUsers() {
  if (isGcp()) {
    try {
      const pool = await getCmsPool();
      const [rows] = await pool.execute('SELECT u.*,p.eid,p.department,p.position FROM users u LEFT JOIN employee_profiles p ON p.user_id=u.id');
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

export async function saveCmsAccount(values,userId,actor = { id:'system' }) {
  return (await provisionEmployee(values,userId,actor)).id;
}

export async function saveCmsAvatar(userId, avatarStoragePath) {
  if (isGcp()) {
    const pool = await getCmsPool();
    await pool.execute('WITH changed AS (UPDATE users SET avatar_storage_path=? WHERE id=? RETURNING id) UPDATE employee_profiles SET updated_at=CURRENT_TIMESTAMP WHERE user_id IN (SELECT id FROM changed)', [avatarStoragePath, userId]);
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
    const [rows] = await (await getCmsPool()).execute('SELECT u.*,p.eid,p.department,p.position FROM users u LEFT JOIN employee_profiles p ON p.user_id=u.id WHERE u.id=?', [userId]);
    return rows[0] || null;
  }
  const users = await getCmsUsers();
  return users.find(u => u.id === userId) || null;
}

// Disabled accounts use the existing disabled role. There is no separate username
// column: email is the account login identifier.
export async function searchDepartmentStaff(query, limit = 10, offset = 0) {
  const [rows] = await (await getCmsPool()).execute(
    "SELECT u.id,u.name,u.email,p.eid,p.department,p.position FROM users u JOIN employee_profiles p ON p.user_id=u.id WHERE u.role IN ('staff','admin','super_admin','it_support','content_manager') AND (strpos(lower(u.name),lower(?))>0 OR strpos(lower(u.email),lower(?))>0 OR strpos(p.eid,?)>0 OR strpos(lower(p.department),lower(?))>0 OR strpos(lower(p.position),lower(?))>0) ORDER BY lower(u.name),u.id LIMIT ? OFFSET ?",
    [query,query,query.replace(/^EID\s*/i,''),query,query,limit+1,offset]);
  return { items:rows.slice(0,limit),has_more:rows.length > limit };
}

export async function getCmsUserByEmail(email) {
  const users = await getCmsUsers();
  return users.find(u => u.email === String(email).trim().toLowerCase()) || null;
}
