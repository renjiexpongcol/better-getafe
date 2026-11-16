import { statisticsService, StatisticsError, validateQuery } from './statisticsService.js';
import { recordServerOperation } from './websiteAnalyticsRoutes.js';

function route(handler, operation = null) { return async (req, res) => { const started = Date.now(); const synthetic = req.get?.('x-analytics-synthetic') === 'true'; try { const result = await handler(req); if (operation) void recordServerOperation({ operation, datasetId: req.params.id, outcome: 'success', category: 'none', cacheStatus: result?.cache || 'unknown', durationMs: result?.durationMs ?? Date.now() - started, synthetic }); res.set('Cache-Control', 'private, max-age=300').json(result); } catch (error) { const known = error instanceof StatisticsError; const status = known ? error.status : 500; if (operation) { const category = error?.code === 'UPSTREAM_TIMEOUT' ? 'timeout' : status === 400 || status === 413 ? 'invalid_request' : status === 502 || status === 503 ? 'upstream_error' : 'server_error'; void recordServerOperation({ operation, datasetId: req.params.id, outcome: 'failure', category, cacheStatus: 'unknown', durationMs: Date.now() - started, synthetic }); } console.warn(JSON.stringify({ event: 'statistics.error', category: error.code || 'UNKNOWN', status: error.status || 500 })); res.status(status).json({ error: known ? error.message : 'The public statistics service is temporarily unavailable.', code: known ? error.code : 'INTERNAL_ERROR' }); } }; }
function catalogueQuery(query) {
  const value = {};
  if (query.q !== undefined) value.q = String(query.q).slice(0, 160);
  if (query.topic !== undefined && query.topic !== '') value.topic = String(query.topic).slice(0, 80);
  if (query.dimension !== undefined && query.dimension !== '') value.dimension = String(query.dimension).slice(0, 160);
  if (query.release !== undefined && query.release !== '') value.release = String(query.release).slice(0, 160);

  const sort = {
    recommended: 'recommended',
    title_asc: 'title-asc',
    title_desc: 'title-desc',
    size: 'size-desc',
    year: 'year-desc',
    updated: 'updated-desc',
  }[query.sort];
  if (sort) value.sort = sort;

  // The upstream catalogue accepts limit/offset, not page/pageSize. Its
  // catalogue also has no availability parameter; availability is a UI
  // filter only and must not be forwarded as an unknown query key.
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 10));
  value.limit = pageSize;
  value.offset = (page - 1) * pageSize;
  return value;
}

export function installPublicDataRoutes(app) {
  app.get('/api/public-data/coverage', route(() => statisticsService.coverage()));
  app.get('/api/public-data/topics', route(() => statisticsService.topics()));
  app.get('/api/public-data/datasets', route(req => statisticsService.datasets(catalogueQuery(req.query))));
  app.get('/api/public-data/datasets/:id', route(req => statisticsService.dataset(req.params.id)));
  app.get('/api/public-data/datasets/:id/values', route(req => statisticsService.values(req.params.id, catalogueQuery(req.query))));
  app.post('/api/public-data/datasets/:id/query', route(req => statisticsService.query(req.params.id, validateQuery(req.body)), 'dataset_query'));
  app.get('/api/public-data/classification', route(req => statisticsService.classification(catalogueQuery(req.query))));
}
