import { getCmsPool, getPortalPool } from './cloudSql.js';
import { config } from '../config/index.js';
import { getLocalDb, saveLocalDb, hash } from '../repositories/localDb.js';
export async function replacePassword(id, kind, password) {
  const category = kind === 'cms' ? 'database' : 'portalDatabase';
  const table = kind === 'cms' ? 'users' : 'portal_users';
  const encoded = hash(password);
  if (config.get(`${category}.provider`) === 'local') {
    const db = await getLocalDb();
    const user = (db[table] || []).find(user => user.id === id);
    if (!user) throw new Error('Account unavailable');
    user.password = encoded; user.updated_at = new Date().toISOString();
    await saveLocalDb(db);
  } else await (await (kind === 'cms' ? getCmsPool() : getPortalPool())).execute(`UPDATE ${table} SET password=?, updated_at=? WHERE id=?`, [encoded, new Date(), id]);
}
