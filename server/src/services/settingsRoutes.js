import { config } from '../config/index.js';
import { categories, definitions, validate, visibleSettingDependencies } from '../config/defaults.js';
import { authorizeChanges, permissionsFor, requirePermission } from '../config/permissions.js';
import { databaseHealth, getDatabaseRuntimeStatus } from './database.js';
import { testDatabaseConnection } from './databaseConnectionTest.js';
import { randomUUID } from 'node:crypto';
import { buildStorage, getVerifiedAzureStatus, storageLocation } from './storage.js';
import { testAzureStorage } from './azureStorageTest.js';
import { acceptMediaMigration, activatePreparedAzureCutover, mediaMigrationStatus, startMediaMigration } from './mediaMigration.js';
import { buildEmail, sendEmail } from './email.js';
import { systemStatus } from './runtimeConfiguration.js';
import { getCmsUsers } from '../repositories/cmsUserRepository.js';
import { checkRequestOrigin } from './requestOrigin.js';
import { startPsgcSyncSchedule, stopPsgcSyncSchedule } from './psgcSyncService.js';
export function installSettingsRoutes(app, admin, { isTrustedProxy } = {}) {
  const permission = name => (req, res, next) => { try { requirePermission(req.admin, name); next(); } catch { res.status(403).json({ error: `Permission required: ${name}` }); } };
  const migrationAdmin = (req, res, next) => ['admin', 'super_admin'].includes(req.admin?.role)
    ? next() : res.status(403).json({ error: 'Administrator access is required for storage migration.' });
  const originCheck = (req, res, next) => {
    if (['GET', 'HEAD'].includes(req.method)) return next();
    const decision = checkRequestOrigin(req, () => config.get('general.url'), { isTrustedProxy });
    if (req.get('origin') && !decision.allowed) return res.status(403).json({ error: 'Cross-origin settings changes are not allowed.' });
    if (!req.is('application/json')) return res.status(415).json({ error: 'Use application/json.' });
    next();
  };
  app.use('/api/admin/settings', admin, originCheck, (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const snapshot = user => ({
    ...config.snapshot(), permissions: permissionsFor(user), categories,
    bootstrap: ['Database connection', 'Settings encryption key', 'Session signing key'],
    authenticationMethod: 'Environment configuration',
    databaseRuntime: Object.fromEntries(['database', 'portalDatabase'].map(category => [category, getDatabaseRuntimeStatus(category)])),
    storageRuntime: {
      activeProvider: storageLocation().provider,
      source: getVerifiedAzureStatus() ? 'migration' : config.sources['storage.provider'],
      environmentVariable: !getVerifiedAzureStatus() && config.sources['storage.provider'] === 'environment'
        ? definitions['storage.provider'].env.find(name => config.env[name]) : undefined,
    },
  });
  app.get('/api/admin/settings', permission('settings.view'), (req, res) => res.json(snapshot(req.admin)));
  app.get('/api/admin/settings/media-migration', migrationAdmin, permission('settings.storage.edit'), async (_req, res) => {
    try { res.json(await mediaMigrationStatus()); }
    catch { res.status(503).json({ error: 'Migration status is unavailable. Check that PostgreSQL migration 047 has been applied.' }); }
  });
  app.post('/api/admin/settings/media-migration', migrationAdmin, permission('settings.storage.edit'), permission('settings.edit'), async (req, res) => {
    const { action, confirmed } = req.body || {};
    if (!['inventory', 'copy', 'cutover', 'activate', 'accept'].includes(action) || (['cutover', 'activate', 'accept'].includes(action) && confirmed !== true)) {
      return res.status(422).json({ error: 'Choose a valid migration action and confirm deployment changes.' });
    }
    try {
      if (action === 'accept') { await acceptMediaMigration(req.admin.id); return res.json({ ok: true }); }
      if (action === 'activate') { await activatePreparedAzureCutover(req.admin.id); return res.json({ ok: true }); }
      res.status(202).json(await startMediaMigration(action, req.admin.id));
    } catch (error) {
      if ([409, 422].includes(error.status)) return res.status(error.status).json({ error: error.message });
      res.status(503).json({ error: 'The migration could not start. Check Supabase PostgreSQL and the backend configuration.' });
    }
  });
  const retiredDatabaseMigration = (_req, res) => res.status(410).json({ error: 'The portal uses Supabase PostgreSQL. Local database migration and rollback are retired.' });
  app.get('/api/admin/settings/database-migration', permission('settings.database.edit'), retiredDatabaseMigration);
  app.post('/api/admin/settings/database-migration', permission('settings.database.edit'), permission('settings.edit'), retiredDatabaseMigration);
  app.get('/api/admin/settings/principals', permission('settings.security.edit'), async (req, res) => {
    try { res.json((await getCmsUsers()).filter(user => ['admin', 'super_admin'].includes(user.role)).map(user => ({ id: user.id, name: user.name, role: user.role }))); }
    catch { res.status(503).json({ error: 'Administrator list unavailable.' }); }
  });
  app.get('/api/admin/settings/history', permission('settings.audit.view'), async (req, res) => {
    try { const history = await config.provider.history(); const users = await getCmsUsers(); res.json(history.map(entry => { const user = users.find(user => user.id === entry.user_id); return { ...entry, employee_label:user ? `${user.name} · EID ${user.eid}` : 'System' }; })); } catch { res.status(503).json({ error: 'Settings history is unavailable.' }); }
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
      const service = req.params.service;
      if (service === 'database' || service === 'portalDatabase') {
        requirePermission(req.admin, 'settings.edit');
        requirePermission(req.admin, 'settings.database.edit');
        const target = req.body?.target ?? 'active';
        if (target !== 'active') return res.status(422).json({ error: 'Only the active Supabase connection can be tested.' });
        const result = await testDatabaseConnection(service, target, req.requestId || randomUUID());
        return res.status(result.ok ? 200 : 422).json({ databaseConnectionTest: result });
      }
      if (req.params.service === 'azure-storage') {
        requirePermission(req.admin, 'settings.storage.edit');
        const createMissingContainer = req.body?.createMissingContainer === true;
        if (createMissingContainer) requirePermission(req.admin, 'settings.edit');
        return res.json(await testAzureStorage(config.values, { createMissingContainer }));
      }
      const patch = req.body.values || {};
      authorizeChanges(req.admin, patch);
      const values = Object.keys(patch).length ? config.candidate(patch) : { ...config.values };
      validate(values);
      if (service === 'storage') {
        requirePermission(req.admin, 'settings.storage.edit');
        const provider = values['storage.configuredProvider'];
        if (provider === 'azure') return res.json(await testAzureStorage(values));
        resource = await buildStorage({ ...values, 'storage.provider': provider });
        resource.client?.destroy();
      }
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
      const safe = /Permission required:|Enter a valid email address|Database connection or schema validation failed|Storage test failed|Backblaze B2|B2_ENDPOINT|B2_REGION|B2_BUCKET_NAME|B2_KEY_ID|B2_APPLICATION_KEY|SMTP connection failed|does not exist or is not accessible|TLS certificate validation failed|host is required|IP address is required|A persistent configuration database is required/.test(message);
      const forbidden = message.startsWith('Permission required:') || message.startsWith('Cannot grant');
      res.status(forbidden ? 403 : 422).json({ error: safe ? message : 'Connection test failed. Check the connection fields, credentials and required service permissions.' });
    }
  });
  const save = async (req, res) => {
    const patch = config.visiblePatch(req.body.values);
    try {
      validate(patch, { visiblePatch: true });
      if (req.params.category && Object.keys(patch).some(key => !key.startsWith(`${req.params.category}.`))) return res.status(422).json({ error: 'Settings must belong to the requested category.' });
      authorizeChanges(req.admin, patch);
    } catch (error) { return res.status(error.message.startsWith('Permission') || error.message.startsWith('Cannot grant') ? 403 : 422).json({ error: 'Invalid settings or insufficient permission for this change.' }); }
    if (Object.hasOwn(patch, 'storage.provider')) return res.status(422).json({ error: 'Provider activation is separate from Storage settings. Use the verified deployment cutover.' });
    try {
      await config.update(patch, { ...req.admin, ip: req.ip });
      if (Object.hasOwn(patch, 'integrations.psgcApiVersion')) {
        stopPsgcSyncSchedule();
        startPsgcSyncSchedule();
      }
      res.json({ ...snapshot(req.admin), saved: true });
    }
    catch (error) {
      const safe = /^(Azure activation requires a verified media migration|Azure runtime storage requires Connection string authentication|Set AZURE_STORAGE_CONNECTION_STRING or save the Azure connection string|Use an HTTPS Azure account-key connection string|Google OAuth requires both a client ID and client secret|Google OAuth redirect URI must be the registered browser callback|Database connection or schema validation failed|Storage test failed|Backblaze B2|B2_ENDPOINT|B2_REGION|B2_BUCKET_NAME|B2_KEY_ID|B2_APPLICATION_KEY|SMTP connection failed|Configure the bootstrap SETTINGS_ENCRYPTION_KEY|Configure SETTINGS_SECRET_PROJECT|Enable and configure SMTP|SMTP host and sender email are required|SMTP TLS is required|Could not load the default credentials|A persistent configuration database is required)/.test(error.message);
      res.status(422).json({ error: safe ? error.message : 'Settings could not be saved. Current configuration remains active. Check validation, secret store and configuration database availability.' });
    }
  };
  app.put('/api/admin/settings', save);
  app.put('/api/admin/settings/:category', save);
  app.patch('/api/admin/settings/:category', save);
  app.get('/api/admin/settings/:category', permission('settings.view'), (req, res) => {
    if (!categories.includes(req.params.category)) return res.status(404).json({ error: 'Unknown category.' });
    const body = snapshot(req.admin);
    // Keep the payload scoped to the active category. Metadata is safe to
    // share across categories and lets the client search the horizontal
    // navigation without fetching another full settings snapshot; values are
    // the potentially sensitive part and stay category-scoped.
    const categoryKeys = Object.keys(body.metadata).filter(key => key.startsWith(`${req.params.category}.`));
    const dependencies = [...new Set(categoryKeys.flatMap(key => visibleSettingDependencies(definitions[key]?.editVisibleWhen || definitions[key]?.visibleWhen)))].filter(key => !key.startsWith(`${req.params.category}.`));
    body.dependencyValues = Object.fromEntries(dependencies.map(key => [key, config.get(key)]));
    body.values = Object.fromEntries(Object.entries(body.values).filter(([key]) => key.startsWith(`${req.params.category}.`)));
    res.json(body);
  });
}
