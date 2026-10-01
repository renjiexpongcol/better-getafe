import assert from 'node:assert/strict';
import { validateDepartment } from '../server/src/services/departmentValidation.js';
import { resolveApiRoutePolicy } from '../server/src/services/apiRoutePolicy.js';

assert.throws(() => validateDepartment({ name: 'Office', slug: 'bad/path' }));
assert.throws(() => validateDepartment({ name: 'Office', slug: 'office', serviceIds: ['fake-payment'] }));
assert.throws(() => validateDepartment({ name: 'Office', slug: 'office', email: 'invalid' }));
assert.throws(() => validateDepartment({ name: 'Office', slug: 'office', displayOrder: -1 }));
assert.equal(validateDepartment({ name: 'Office', slug: 'office', published: 'true' }).published, false);
assert.equal(resolveApiRoutePolicy('GET', '/api/departments/treasury').access, 'PUBLIC');
assert.notEqual(resolveApiRoutePolicy('PUT', '/api/admin/departments/treasury').access, 'PUBLIC');
console.log('Department validation and policy checks passed.');

if (process.argv.includes('--integration')) {
  await import('dotenv/config');
  const { createPostgresResource } = await import('../server/src/services/postgres.js');
  const { activateDatabase, closeCloudSql } = await import('../server/src/services/cloudSql.js');
  const { registerDepartmentRoutes } = await import('../server/src/services/departmentRoutes.js');
  const { default: express } = await import('express');
  const { randomUUID } = await import('node:crypto');
  const key = `department-check-${randomUUID()}`;
  const values = { 'database.host': process.env.DB_HOST || '127.0.0.1', 'database.port': Number(process.env.DB_PORT || 5432), 'database.name': process.env.DB_NAME || 'getafe_portal', 'database.username': process.env.DB_USER || 'getafe_app', 'database.password': process.env.DB_PASSWORD, 'database.sslMode': process.env.DB_SSL === 'true' ? 'required' : 'disable', 'database.connectionLimit': 5, 'database.connectTimeout': 5000 };
  const resource = createPostgresResource(values, 'database');
  activateDatabase('database', resource);
  const app = express(); app.use(express.json());
  registerDepartmentRoutes(app, { admin: (req, res, next) => req.headers['x-test-admin'] ? next() : res.status(401).end(), permission: () => (req, res, next) => req.headers['x-test-permission'] === 'departments.manage' ? next() : res.status(403).end() });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', body, authorized = true) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(authorized ? { 'x-test-admin': 'true', 'x-test-permission': 'departments.manage' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  let officeId;
  const authorId = `${key}-author`;
  const newsIds = ['published', 'draft', 'future', 'unrelated'].map(suffix => `${key}-${suffix}`);
  try {
    for (const slug of ['executive', 'engineering', 'zoning-planning', 'treasury', 'assessment', 'civil-registry', 'health', 'social-welfare']) assert.equal((await request(`/api/departments/${slug}`)).status, 200, slug);
    assert.equal((await request('/api/admin/departments', 'GET', undefined, false)).status, 401);
    assert.equal((await request('/api/departments/missing-office')).status, 404);
    let result = await request('/api/admin/departments', 'POST', { name: 'Verification office', slug: key, published: false });
    assert.equal(result.status, 201); const office = await result.json(); officeId = office.id;
    assert.equal((await request(`/api/departments/${key}`)).status, 404);
    result = await request(`/api/admin/departments/${officeId}`, 'PUT', { ...office, published: true, description: 'Verified CMS description' });
    assert.equal(result.status, 200);
    const published = await (await request(`/api/departments/${key}`)).json();
    assert.equal(published.description, 'Verified CMS description');
    await resource.execute('INSERT INTO users(id,name,email,password,role,created_at,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)', [authorId, 'Department verification', `${key}@example.invalid`, 'disabled-test-account', 'disabled']);
    for (let index = 0; index < newsIds.length; index++) {
      await resource.execute('INSERT INTO news(id,title,slug,excerpt,content,author_id,status,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?::timestamptz,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)', [newsIds[index], `Department check ${index}`, newsIds[index], 'Verification excerpt', 'Verification content', authorId, index === 1 ? 'draft' : 'published', index === 2 ? '2099-01-01T00:00:00Z' : '2020-01-01T00:00:00Z']);
    }
    result = await request(`/api/admin/departments/${officeId}`, 'PUT', { ...office, published: true, description: 'Verified CMS description', newsIds: newsIds.slice(0, 3) });
    assert.equal(result.status, 200);
    const withNews = await (await request(`/api/departments/${key}`)).json();
    assert.deepEqual(withNews.announcements.map(item => item.id), [newsIds[0]], 'Only associated, published, non-future announcements appear');
    const treasury = await (await request('/api/departments/treasury')).json();
    assert.ok(treasury.services.every(service => service.department_id === treasury.id));
    const owned = treasury.services[0];
    if (owned) {
      result = await request(`/api/admin/departments/${officeId}`, 'PUT', { ...office, published: true, serviceIds: [owned.id] });
      assert.equal(result.status, 409);
      assert.equal((await (await request(`/api/departments/${key}`)).json()).description, 'Verified CMS description');
    }
    assert.equal((await request(`/api/admin/departments/${officeId}`, 'PUT', { ...office, officialSlug: 'nonexistent-person' })).status, 422);
    assert.equal((await request('/api/admin/departments/options')).status, 200);
    result = await request(`/api/admin/departments/${officeId}`, 'PUT', { ...office, published: false });
    assert.equal(result.status, 200);
    assert.equal((await request(`/api/departments/${key}`)).status, 404);
    console.log('All eight public pages, CMS publication, updates, ownership rollback, permissions, and official reference checks passed against PostgreSQL.');
  } finally {
    if (officeId) { await resource.execute('DELETE FROM content_media WHERE content_type=? AND content_id=?', ['department', officeId]); await resource.execute('DELETE FROM departments WHERE id=?', [officeId]); }
    for (const newsId of newsIds) await resource.execute('DELETE FROM news WHERE id=?', [newsId]);
    await resource.execute('DELETE FROM users WHERE id=?', [authorId]);
    await new Promise(resolve => server.close(resolve));
    await closeCloudSql();
  }
}

