import { getCmsPool, getPortalPool } from './cloudSql.js';
import { hash } from './identifiers.js';
export async function replacePassword(id, kind, password, { touchUpdatedAt = true } = {}) {
  const category = kind === 'cms' ? 'database' : 'portalDatabase';
  const table = kind === 'cms' ? 'users' : 'portal_users';
  const encoded = hash(password);
  if (touchUpdatedAt) await (await (kind === 'cms' ? getCmsPool() : getPortalPool())).execute(`UPDATE ${table} SET password=?, updated_at=? WHERE id=?`, [encoded, new Date(), id]);
  else await (await (kind === 'cms' ? getCmsPool() : getPortalPool())).execute(`UPDATE ${table} SET password=? WHERE id=?`, [encoded, id]);
}
