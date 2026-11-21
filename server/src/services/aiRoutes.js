import { requirePermission } from '../config/permissions.js';
import { aiOverview, generateCmsContent, testOpenAiConnection, updateAiModule, updateAiSettings } from './aiManagement.js';

export function installAiRoutes(app, admin) {
  app.use('/api/admin/ai', admin, (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const allowed = permission => (req, res, next) => {
    try { requirePermission(req.admin, permission); next(); }
    catch { res.status(403).json({ error: `Permission required: ${permission}` }); }
  };

  app.get('/api/admin/ai/overview', allowed('ai.management.view'), async (_req, res) => {
    try { res.json(await aiOverview()); }
    catch (error) {
      res.status(503).json({ error: 'AI management data is unavailable. Apply database migration 052 and retry.' });
    }
  });

  app.put('/api/admin/ai/settings', allowed('ai.management.update'), allowed('ai.models.manage'), async (req, res) => {
    const body = req.body || {};
    try {
      await updateAiSettings({
        enabled: body.enabled,
        defaultModel: body.defaultModel,
        monthlyBudgetUsd: Number(body.monthlyBudgetUsd),
      }, { ...req.admin, ip: req.ip });
      res.json(await aiOverview());
    } catch (error) {
      res.status(error.status || 422).json({ error: error.message });
    }
  });

  app.put('/api/admin/ai/modules/:moduleKey', allowed('ai.management.update'), allowed('ai.assistant.configure'), async (req, res) => {
    try {
      await updateAiModule(req.params.moduleKey, req.body || {}, { ...req.admin, ip: req.ip });
      res.json(await aiOverview());
    } catch (error) {
      res.status(error.status || 422).json({ error: error.message });
    }
  });

  app.post('/api/admin/ai/content/generate', async (req, res, next) => {
    try {
      const action = String(req.body?.action || '');
      requirePermission(req.admin, action === 'translate' ? 'ai.content.translate' : 'ai.content.generate');
      next();
    } catch {
      res.status(403).json({ error: 'Permission required for AI content assistance.' });
    }
  }, async (req, res) => {
    try {
      res.json(await generateCmsContent(req.body || {}, { ...req.admin, ip: req.ip }));
    } catch (error) {
      res.status(error.status || 422).json({ error: error.message });
    }
  });

  app.post('/api/admin/ai/test-connection', allowed('ai.management.view'), allowed('ai.provider.configure'), async (req, res) => {
    try { res.json(await testOpenAiConnection(req.body?.model, { ...req.admin, ip: req.ip })); }
    catch (error) { res.status(error.status || 422).json({ error: error.message }); }
  });
}
