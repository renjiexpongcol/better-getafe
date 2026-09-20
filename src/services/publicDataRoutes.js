import { statisticsService, StatisticsError, validateQuery } from './statisticsService.js';

const rate = new Map();
function allowed(req, limit) { const key = req.ip || 'anonymous'; const now = Date.now(); const record = rate.get(key) || { at: now, count: 0 }; if (now - record.at > 60_000) { record.at = now; record.count = 0; } record.count += 1; rate.set(key, record); return record.count <= limit; }
function route(handler, limit = 80) { return async (req, res) => { if (!allowed(req, limit)) return res.status(429).json({ error: 'Too many public-data requests. Please try again shortly.' }); try { const result = await handler(req); res.set('Cache-Control', 'private, max-age=300').json(result); } catch (error) { const known = error instanceof StatisticsError; console.warn(JSON.stringify({ event: 'statistics.error', category: error.code || 'UNKNOWN', status: error.status || 500 })); res.status(known ? error.status : 500).json({ error: known ? error.message : 'The public data service is temporarily unavailable.', code: known ? error.code : 'INTERNAL_ERROR' }); } }; }
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
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));
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
  app.post('/api/public-data/datasets/:id/query', route(req => statisticsService.query(req.params.id, validateQuery(req.body)), 20));
  app.get('/api/public-data/classification', route(req => statisticsService.classification(catalogueQuery(req.query))));
}
