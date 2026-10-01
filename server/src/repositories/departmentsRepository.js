import { randomUUID } from 'node:crypto';
import { getCmsPool } from '../services/cloudSql.js';

const view = row => ({ ...row.content, id: row.id, slug: row.slug, name: row.name, published: row.published, displayOrder: row.display_order });
export async function listDepartments(admin = false) {
  const pool = await getCmsPool();
  const [rows] = await pool.execute(`SELECT * FROM departments ${admin ? '' : 'WHERE published = TRUE'} ORDER BY display_order, name`);
  return rows.map(view);
}
export async function findDepartment(value, admin = false) {
  const pool = await getCmsPool();
  const [rows] = await pool.execute(`SELECT * FROM departments WHERE ${admin ? 'id = ?' : '(slug = ? OR id = ?) AND published = TRUE'}`, admin ? [value] : [value, value]);
  if (!rows[0]) return null;
  const [services] = await pool.execute('SELECT service_id FROM department_services WHERE department_id = ? ORDER BY service_id', [rows[0].id]);
  return { ...view(rows[0]), serviceIds: services.map(row => row.service_id) };
}
export async function saveDepartment(data, id) {
  const pool = await getCmsPool();
  const connection = await pool.getConnection();
  const { name, slug, published, displayOrder, serviceIds, ...content } = data;
  try {
    await connection.beginTransaction();
    const key = id || randomUUID();
    const [rows] = id
      ? await connection.execute('UPDATE departments SET name=?,slug=?,published=?,display_order=?,content=?::jsonb,updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING id', [name, slug, published, displayOrder, JSON.stringify(content), key])
      : await connection.execute('INSERT INTO departments(id,name,slug,published,display_order,content) VALUES(?,?,?,?,?,?::jsonb) RETURNING id', [key, name, slug, published, displayOrder, JSON.stringify(content)]);
    if (!rows.length) { await connection.rollback(); return null; }
    await connection.execute('DELETE FROM department_services WHERE department_id=?', [key]);
    for (const serviceId of serviceIds) await connection.execute('INSERT INTO department_services(service_id,department_id) VALUES(?,?)', [serviceId, key]);
    await connection.commit();
    return key;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
