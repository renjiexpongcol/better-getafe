import { getCmsPool } from '../services/cloudSql.js';

export async function getPopularServices(limit = 3) {
  const pool = await getCmsPool();
  const [rows] = await pool.execute(`
    SELECT id, label, href
    FROM popular_services
    WHERE is_active = TRUE
    ORDER BY popularity_score DESC, updated_at DESC, id ASC
    LIMIT ?
  `, [limit]);
  return rows;
}
