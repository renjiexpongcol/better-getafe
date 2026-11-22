import { requirePermission } from '../config/permissions.js';
import { aiOverview, generateCmsContent, isAiOperationEnabled, testOpenAiConnection, updateAiModule, updateAiSettings } from './aiManagement.js';
import { recordAssistantFeedback, residentAssistantPublicConfig, streamResidentAnswer } from './aiResidentAssistant.js';
import { deleteManualKnowledgeDocument, knowledgeDashboard, queueKnowledgeDocuments, queueKnowledgeSourceRebuild, saveManualKnowledgeDocument, updateKnowledgeSourcePolicy } from './aiKnowledgeBase.js';
import { assistSiteSearch } from './aiSmartSearch.js';

export function installAiRoutes(app, admin) {
  app.get('/api/ai/assistant/config', async (_req, res) => {
    try { res.set('Cache-Control', 'no-store').json(await residentAssistantPublicConfig()); }
    catch { res.set('Cache-Control', 'no-store').status(503).json({ error: 'Assistant configuration is unavailable.' }); }
  });
  app.post('/api/ai/assistant/chat', async (req, res) => {
    try { await streamResidentAnswer(req, res); }
    catch (error) {
      if (res.headersSent) { if (!res.destroyed) { res.write('event: error' + String.fromCharCode(10) + 'data: ' + JSON.stringify({ error: 'The assistant could not complete this response.' }) + String.fromCharCode(10, 10)); res.end(); } }
      else res.status(error.status || 503).json({ error: error.status ? error.message : 'The assistant could not complete this response.' });
    }
  });
  app.post('/api/ai/assistant/feedback', async (req, res) => {
    try { await recordAssistantFeedback(req.body || {}); res.set('Cache-Control', 'no-store').status(201).json({ accepted: true }); }
    catch (error) { res.set('Cache-Control', 'no-store').status(error.status || 503).json({ error: error.status ? error.message : 'Feedback could not be saved.' }); }
  });
  app.post('/api/ai/search/assist', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await assistSiteSearch(req)); }
    catch (error) { res.status(error.status || 503).json({ enabled: false, mode: 'traditional', expandedQueries: [], suggestions: [], answerSummary: '', citations: [], ...(error.status ? { error: error.message } : {}) }); }
  });
  app.use('/api/admin/ai', admin, (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const allowed = permission => (req, res, next) => {
    try { requirePermission(req.admin, permission); next(); }
    catch { res.status(403).json({ error: `Permission required: ${permission}` }); }
  };

  app.get('/api/admin/ai/knowledge', allowed('ai.knowledge.manage'), async (_req, res) => {
    try { res.json(await knowledgeDashboard()); }
    catch (error) { res.status(503).json({ error: 'Knowledge base status is unavailable. Apply database migration 054 and retry.' }); }
  });
  app.put('/api/admin/ai/knowledge/sources/:sourceKey', allowed('ai.knowledge.manage'), async (req, res) => {
    try { await updateKnowledgeSourcePolicy(req.params.sourceKey, req.body || {}, { ...req.admin, ip: req.ip }); res.json(await knowledgeDashboard()); }
    catch (error) { res.status(error.status || 422).json({ error: error.message }); }
  });
  app.post('/api/admin/ai/knowledge/sync', allowed('ai.knowledge.manage'), async (req, res) => {
    try {
      const body = req.body || {};
      const queued = body.action === 'rebuild' ? await queueKnowledgeSourceRebuild(body.sourceKeys || [], req.admin.id)
        : Array.isArray(body.documentIds) ? await queueKnowledgeDocuments(body.documentIds, req.admin.id)
          : await queueKnowledgeSourceRebuild(body.sourceKeys || [], req.admin.id);
      res.status(202).json({ queued, knowledge: await knowledgeDashboard() });
    } catch (error) { res.status(error.status || 422).json({ error: error.message }); }
  });
  app.post('/api/admin/ai/knowledge/documents', allowed('ai.knowledge.manage'), async (req, res) => {
    try { await saveManualKnowledgeDocument(null, req.body || {}, { ...req.admin, ip: req.ip }); res.status(201).json(await knowledgeDashboard()); }
    catch (error) { res.status(error.status || 422).json({ error: error.message }); }
  });
  app.put('/api/admin/ai/knowledge/documents/:id', allowed('ai.knowledge.manage'), async (req, res) => {
    try { await saveManualKnowledgeDocument(req.params.id, req.body || {}, { ...req.admin, ip: req.ip }); res.json(await knowledgeDashboard()); }
    catch (error) { res.status(error.status || 422).json({ error: error.message }); }
  });
  app.delete('/api/admin/ai/knowledge/documents/:id', allowed('ai.knowledge.manage'), async (req, res) => {
    try { await deleteManualKnowledgeDocument(req.params.id, { ...req.admin, ip: req.ip }); res.json(await knowledgeDashboard()); }
    catch (error) { res.status(error.status || 422).json({ error: error.message }); }
  });

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
    try {
      if (!(await isAiOperationEnabled())) return res.status(403).json({ error: 'AI System is disabled. Provider tests are unavailable until AI is enabled.' });
      res.json(await testOpenAiConnection(req.body?.model, { ...req.admin, ip: req.ip }));
    }
    catch (error) { res.status(error.status || 422).json({ error: error.message }); }
  });
}
