import { authenticateExternalApi, createExternalApiKey, listExternalApiKeys, publicEmployee, revokeExternalApiKey, rotateExternalApiKey, updateExternalApiKey, listEmployees, API_SCOPES } from './externalApi.js';

const safe = (error, fallback) => [400, 401, 403, 404, 409, 422].includes(Number(error?.status)) ? error.message : fallback;
const ip = req => req.ip || req.socket?.remoteAddress || null;

export function installExternalApiRoutes(app, { admin, permission, permissionAny }) {
  const base = '/api/admin/api-keys';
  const handle = work => async (req, res) => { try { res.json(await work(req)); } catch (error) { res.status(error.status || 503).json({ error: safe(error, 'API key service is temporarily unavailable.') }); } };
  app.get(base, admin, permissionAny(['integrations.api_keys.view', 'integrations.api_keys.manage']), handle(() => listExternalApiKeys()));
  app.post(base, admin, permission('integrations.api_keys.manage'), handle(req => createExternalApiKey(req.body, req.admin.id, ip(req))));
  app.patch(`${base}/:id`, admin, permission('integrations.api_keys.manage'), handle(req => updateExternalApiKey(req.params.id, req.body, req.admin.id, ip(req))));
  app.post(`${base}/:id/rotate`, admin, permission('integrations.api_keys.manage'), handle(req => rotateExternalApiKey(req.params.id, req.admin.id, ip(req))));
  app.post(`${base}/:id/revoke`, admin, permission('integrations.api_keys.manage'), handle(req => revokeExternalApiKey(req.params.id, req.admin.id, ip(req))));
  app.get('/api/employees', async (req, res) => {
    const auth = await authenticateExternalApi(req, 'employees.read');
    if (auth.status) return res.status(auth.status).json({ error: auth.error });
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const rows = await listEmployees({ limit, offset });
    res.set('Cache-Control', 'no-store').json({ data: rows.map(publicEmployee), meta: { limit, offset, count: rows.length, scopes: auth.scopes } });
  });
  app.get('/api/employees/:id', async (req, res) => {
    const auth = await authenticateExternalApi(req, 'employees.read');
    if (auth.status) return res.status(auth.status).json({ error: auth.error });
    const rows = await listEmployees({ idValue: req.params.id, limit: 1, offset: 0 });
    if (!rows.length) return res.status(404).json({ error: 'Employee not found.' });
    res.set('Cache-Control', 'no-store').json({ data: publicEmployee(rows[0]) });
  });
  app.get('/api/external/departments', async (req, res) => {
    const auth = await authenticateExternalApi(req, 'departments.read');
    if (auth.status) return res.status(auth.status).json({ error: auth.error });
    const db = await (await import('../repositories/postgresRuntime.js')).getPostgresRuntime('database');
    const rows = await db.prepare('SELECT DISTINCT department AS name FROM employee_profiles WHERE department<>? ORDER BY department').all('');
    res.set('Cache-Control', 'no-store').json({ data: rows });
  });
}

export { API_SCOPES };
