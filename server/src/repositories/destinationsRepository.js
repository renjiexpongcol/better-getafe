import { randomUUID } from 'node:crypto';
import { getCmsPool } from '../services/cloudSql.js';
const fields = { title: 'title', slug: 'slug', shortDescription: 'short_description', fullDescription: 'full_description', featuredImage: 'featured_image', imageAlt: 'image_alt', location: 'location', category: 'category', published: 'published', featured: 'featured', displayOrder: 'display_order' };
const select = `id, ${Object.entries(fields).map(([key, column]) => `${column} AS "${key}"`).join(', ')}, created_at AS "createdAt", updated_at AS "updatedAt"`;
export async function listDestinations({ admin = false, featured = false, limit = 100, offset = 0 } = {}) {
  const pool = await getCmsPool();
  const where = admin ? '' : `WHERE published = TRUE${featured ? ' AND featured = TRUE' : ''}`;
  const [items] = await pool.execute(`SELECT ${select} FROM destinations ${where} ORDER BY display_order, id LIMIT ? OFFSET ?`, [limit, offset]);
  const [counts] = await pool.execute(`SELECT COUNT(*)::int AS total FROM destinations ${admin ? '' : 'WHERE published = TRUE'}`);
  return { items, total: counts[0].total };
}
export async function findDestination(slug) {
  const pool = await getCmsPool();
  const [rows] = await pool.execute(`SELECT ${select} FROM destinations WHERE slug = ? AND published = TRUE`, [slug]);
  return rows[0];
}
export async function findDestinationById(id) {
  const pool = await getCmsPool();
  const [rows] = await pool.execute(`SELECT ${select} FROM destinations WHERE id = ?`, [id]);
  return rows[0];
}
export async function saveDestination(data, id) {
  const pool = await getCmsPool();
  const values = Object.keys(fields).map(key => data[key]);
  const [rows] = id
    ? await pool.execute(`UPDATE destinations SET ${Object.values(fields).map(column => `${column} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING ${select}`, [...values, id])
    : await pool.execute(`INSERT INTO destinations (id, ${Object.values(fields).join(', ')}) VALUES (?, ${values.map(() => '?').join(', ')}) RETURNING ${select}`, [randomUUID(), ...values]);
  return rows[0];
}
export async function deleteDestination(id) {
  const pool = await getCmsPool();
  const [rows] = await pool.execute('DELETE FROM destinations WHERE id = ? RETURNING id', [id]);
  return rows.length > 0;
}

export async function findLegacyDestination(key) {
  const pool = await getCmsPool();
  const [aliases] = await pool.execute('SELECT destination_id FROM destination_legacy_routes WHERE legacy_key = ?', [key]);
  if (!aliases[0]) return undefined;
  const [rows] = await pool.execute(`SELECT ${select} FROM destinations WHERE id = ? AND published = TRUE`, [aliases[0].destination_id]);
  return rows[0];
}
