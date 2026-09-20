import { config } from '../config/index.js';
import { categories, validate } from '../config/defaults.js';
import { authorizeChanges, permissionsFor, requirePermission } from '../config/permissions.js';
import { buildDatabase, discardDatabase, databaseHealth } from './cloudSql.js';
import { buildStorage } from './storage.js';
import { buildEmail, sendEmail } from './email.js';
import { systemStatus } from './runtimeConfiguration.js';
import { getCmsUsers } from '../repositories/cmsUserRepository.js';
export function installSettingsRoutes(app, admin) {
  const permission = name => (req, res, next) => { try { requirePermission(req.admin, name); next(); } catch { res.status(403).json({ error: `Permission required: ${name}` }); } };
  const originCheck = (req, res, next) => {
    if (['GET', 'HEAD'].includes(req.method)) return next();
    const allowed = new Set([`${req.protocol}://${req.get('host')}`]);
    if (config.get('general.url')) allowed.add(new URL(config.get('general.url')).origin);
    if (process.env.NODE_ENV !== 'production') allowed.add('http://localhost:5173');
    if ((req.get('origin') && !allowed.has(req.get('origin'))) || req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'Cross-origin settings changes are not allowed.' });
    if (!req.is('application/json')) return res.status(415).json({ error: 'Use application/json.' });
    next();
  };
  app.use('/api/admin/settings', admin, originCheck, (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const snapshot = user => ({ ...config.snapshot(), permissions: permissionsFor(user), categories, bootstrap: ['Configuration database connection', 'Settings encryption key', 'Session signing key', 'Secret Manager project / identity'], authenticationMethod: 'Application Default Credentials' });
  app.get('/api/admin/settings', permission('settings.view'), (req, res) => res.json(snapshot(req.admin)));
  app.get('/api/admin/settings/principals', permission('settings.security.edit'), async (req, res) => {
    try { res.json((await getCmsUsers()).filter(user => ['admin', 'super_admin'].includes(user.role)).map(user => ({ id: user.id, name: user.name, role: user.role }))); }
    catch { res.status(503).json({ error: 'Administrator list unavailable.' }); }
  });
  app.get('/api/admin/settings/history', permission('settings.audit.view'), async (req, res) => {
    try { res.json(await config.provider.history()); } catch { res.status(503).json({ error: 'Settings history is unavailable.' }); }
  });
  app.get('/api/admin/settings/status', permission('settings.view'), async (req, res) => {
    const status = Object.fromEntries(Object.entries(systemStatus).map(([key, value]) => [key, { ...value, source: config.sources[`${key}.provider`] || config.sources['email.enabled'] }]));
    for (const category of ['database', 'portalDatabase']) { if (status[category]) status[category] = { ...status[category], ...(await databaseHealth(category)) }; }
    res.json({ application: { status: config.available ? 'healthy' : 'degraded', checkedAt: new Date().toISOString() }, ...status });
  });
  app.post('/api/admin/settings/test/:service', permission('settings.view'), async (req, res) => {
    let resource;
    const start = Date.now();
    try {
      const patch = req.body.values || {};
      authorizeChanges(req.admin, patch);
      const values = Object.keys(patch).length ? config.candidate(patch) : { ...config.values };
      validate(values);
      const service = req.params.service;
      if (service === 'database' || service === 'portalDatabase') { requirePermission(req.admin, 'settings.database.edit'); resource = await buildDatabase(values, service, req.admin); await discardDatabase(resource); }
      else if (service === 'storage') { requirePermission(req.admin, 'settings.storage.edit'); await buildStorage(values); }
      else if (service === 'email') {
        resource = await buildEmail(values);
        if (!resource) throw new Error('Enable SMTP to test email.');
        // Only the explicit Test Email action sends a message, to the signed-in admin.
        if (req.body.send === true) {
          const recipient = String(req.body.recipient || '').trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error('Enter a valid email address to receive the test email.');
          await sendEmail(recipient, 'Settings test email', 'Your SMTP configuration is working.', resource, values);
        }
        resource.close();
      } else return res.status(404).json({ error: 'Unknown service.' });
      res.json({ ok: true, checkedAt: new Date().toISOString(), latencyMs: Date.now() - start });
    } catch (error) {
      if (req.params.service === 'email') resource?.close();
      const message = String(error?.message || '');
      const safe = /Permission required:|Enter a valid email address|Application Default Credentials|Could not load the default credentials|Database connection or schema validation failed|Storage test failed|SMTP connection failed|Authentication failed for MySQL user|Unable to reach MySQL|does not exist or is not accessible|TLS certificate validation failed|Legacy database configuration|Unsupported database connection mode|host is required|IP address is required|Invalid Cloud SQL instance|A persistent configuration database is required/.test(message);
      res.status(422).json({ error: safe ? message : 'Connection test failed. Check the connection fields, credentials and required service permissions.' });
    }
  });
  const save = async (req, res) => {
    const patch = req.body.values;
    try {
      validate(patch);
      if (req.params.category && Object.keys(patch).some(key => !key.startsWith(`${req.params.category}.`))) return res.status(422).json({ error: 'Settings must belong to the requested category.' });
      authorizeChanges(req.admin, patch);
    } catch (error) { return res.status(error.message.startsWith('Permission') || error.message.startsWith('Cannot grant') ? 403 : 422).json({ error: 'Invalid settings or insufficient permission for this change.' }); }
    try { await config.update(patch, { ...req.admin, ip: req.ip }); res.json({ ...snapshot(req.admin), saved: true }); }
    catch (error) {
      const safe = /^(Database connection or schema validation failed|Storage test failed|SMTP connection failed|Configure the bootstrap SETTINGS_ENCRYPTION_KEY|Configure SETTINGS_SECRET_PROJECT|Enable and configure SMTP|SMTP host and sender email are required|SMTP TLS is required|Could not load the default credentials|A persistent configuration database is required)/.test(error.message);
      res.status(422).json({ error: safe ? error.message : 'Settings could not be saved. Current configuration remains active. Check validation, secret store and configuration database availability.' });
    }
  };
  app.put('/api/admin/settings', save);
  app.put('/api/admin/settings/:category', save);
  app.patch('/api/admin/settings/:category', save);
  app.get('/api/admin/settings/:category', permission('settings.view'), (req, res) => {
    if (!categories.includes(req.params.category)) return res.status(404).json({ error: 'Unknown category.' });
    const body = snapshot(req.admin);
    for (const field of ['values', 'metadata']) body[field] = Object.fromEntries(Object.entries(body[field]).filter(([key]) => key.startsWith(`${req.params.category}.`)));
    res.json(body);
  });
}
