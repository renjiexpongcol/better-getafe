import { integrationHub } from './service.js';
import { HubError, safeCode } from './security.js';

export function registerIntegrationHubRoutes(app, { admin, permission, hub = integrationHub }) {
  const base = '/api/admin/integration-hub';
  const handler = work => async (req, res) => {
    try { await work(req, res); }
    catch (error) { res.status(error instanceof HubError ? error.status : 503).json({ error: safeCode(error).replaceAll('_', ' '), code: safeCode(error) }); }
  };
  app.get(base, admin, permission('integrations.view'), handler(async (_req, res) => res.json(await hub.overview())));
  app.post(`${base}/installations`, admin, permission('integrations.configure'), handler(async (req, res) => {
    if (Object.keys(req.body).some(k => !['connectorId', 'configuration'].includes(k))) throw new HubError('invalid_configuration');
    res.json(await hub.configure(req.body.connectorId, req.body.configuration, req.admin.id));
  }));
  app.put(`${base}/installations/:id/credentials`, admin, permission('integrations.credentials.rotate'), handler(async (req, res) => res.json(await hub.credentials(req.params.id, req.body, req.admin.id))));
  for (const [action, grant] of [['test', 'test'], ['disable', 'configure'], ['disconnect', 'disconnect']]) app.post(`${base}/installations/:id/${action}`, admin, permission(`integrations.${grant}`), handler(async (req, res) => res.status(action === 'test' ? 202 : 200).json(await hub.action(req.params.id, action, req.admin.id, req.get('Idempotency-Key')))));
  app.get(`${base}/installations/:id/history`, admin, permission('integrations.logs.view'), handler(async (req, res) => res.json(await hub.repo.history(req.params.id))));
  app.post(`${base}/jobs/:id/retry`, admin, permission('integrations.jobs.retry'), handler(async (req, res) => res.status(202).json(await hub.retry(req.params.id, req.admin.id))));
  app.post(`${base}/installations/:id/authorize`, admin, permission('integrations.connect'), handler(async (req, res) => res.json(await hub.oauth.start(req.params.id, req.admin.id))));
  app.get(`${base}/oauth/callback`, admin, permission('integrations.connect'), handler(async (req, res) => { await hub.oauth.finish(req.query.state, req.query.code, req.admin.id); res.redirect('/admin/system/integrations'); }));
  app.post('/api/integrations/webhooks/:provider', handler(async (req, res) => res.status(202).json(await hub.webhook(req.params.provider, req.rawBody, req.headers))));
}
