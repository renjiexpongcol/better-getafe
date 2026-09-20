import crypto from 'node:crypto';

const BASE_URL = process.env.STATISTICS_API_URL || 'https://statistics.bettergov.ph/api/v1';
const cache = new Map();
const inflight = new Map();
const DATASET_ID = /^[A-Za-z0-9][A-Za-z0-9._~:-]{0,191}$/;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export class StatisticsError extends Error {
  constructor(message, status = 502, code = 'UPSTREAM_ERROR') { super(message); this.status = status; this.code = code; }
}

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function cacheFor(endpoint) {
  if (endpoint === 'coverage' || endpoint === 'topics') return 12 * 60 * 60 * 1000;
  if (endpoint === 'datasets') return 2 * 60 * 60 * 1000;
  return 12 * 60 * 60 * 1000;
}
function safeId(id) { if (!DATASET_ID.test(String(id || ''))) throw new StatisticsError('Invalid dataset identifier.', 400, 'INVALID_DATASET_ID'); return id; }
function safePath(segment) { return String(segment).split('/').map(encodeURIComponent).join('/'); }

async function upstream(endpoint, { method = 'GET', query, body, ttl = cacheFor(endpoint), release = '' } = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) if (value !== undefined && value !== '') search.set(key, String(value));
  const url = `${BASE_URL}/${safePath(endpoint)}${search.size ? `?${search}` : ''}`;
  const cacheKey = hash(stable({ endpoint, method, query, body, release }));
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cache: 'HIT' };
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);
  const job = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const started = Date.now();
    try {
      const response = await fetch(url, { method, signal: controller.signal, headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const length = Number(response.headers.get('content-length') || 0);
      if (length > MAX_RESPONSE_BYTES) throw new StatisticsError('The public statistics response was too large.', 502, 'RESPONSE_TOO_LARGE');
      const raw = await response.text();
      if (raw.length > MAX_RESPONSE_BYTES) throw new StatisticsError('The public statistics response was too large.', 502, 'RESPONSE_TOO_LARGE');
      let data; try { data = raw ? JSON.parse(raw) : {}; } catch { throw new StatisticsError('The public statistics service returned an invalid response.', 502, 'MALFORMED_RESPONSE'); }
      console.info(JSON.stringify({ event: 'statistics.upstream', endpoint, status: response.status, durationMs: Date.now() - started, cache: 'MISS' }));
      if (!response.ok) {
        if (response.status === 413) throw new StatisticsError('Your selection is too large. Narrow the selected areas, years, or indicators.', 413, 'SELECTION_TOO_LARGE');
        if (response.status === 409) throw new StatisticsError('This dataset release changed. Refresh the dataset details and rebuild your selection.', 409, 'RELEASE_CHANGED');
        if (response.status === 503) throw new StatisticsError('The public statistics service is temporarily unavailable. Please try again later.', 503, 'UPSTREAM_UNAVAILABLE');
        const upstreamError = data?.error;
        const message = data?.message || (typeof upstreamError === 'string' ? upstreamError : upstreamError?.message) || 'The public statistics service could not complete this request.';
        throw new StatisticsError(message, response.status, 'UPSTREAM_HTTP');
      }
      const value = { data, retrievedAt: new Date().toISOString(), sourceUrl: url, cache: 'MISS' };
      cache.set(cacheKey, { value, expiresAt: Date.now() + ttl });
      return value;
    } catch (error) {
      if (error instanceof StatisticsError) throw error;
      if (error?.name === 'AbortError') throw new StatisticsError('The public statistics service took too long to respond.', 504, 'UPSTREAM_TIMEOUT');
      throw new StatisticsError('The public statistics service is temporarily unavailable. Please try again later.', 503, 'UPSTREAM_UNAVAILABLE');
    } finally { clearTimeout(timer); }
  })().finally(() => inflight.delete(cacheKey));
  inflight.set(cacheKey, job); return job;
}

export const statisticsService = {
  coverage: () => upstream('coverage'),
  topics: () => upstream('topics'),
  datasets: (query) => upstream('datasets', { query, ttl: 2 * 60 * 60 * 1000 }),
  dataset: (id) => upstream(`datasets/${safeId(id)}`),
  values: (id, query) => upstream(`datasets/${safeId(id)}/values`, { query }),
  query: (id, body) => upstream(`datasets/${safeId(id)}/query`, { method: 'POST', body, ttl: 15 * 60 * 1000, release: body?.release || body?.version || '' }),
  classification: (query) => upstream('classification', { query }),
};

export function validateQuery(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new StatisticsError('A valid dataset selection is required.', 400, 'INVALID_QUERY');
  const dimensions = body.dimensions || body.selection || body.filters;
  if (dimensions && (typeof dimensions !== 'object' || Array.isArray(dimensions))) throw new StatisticsError('Invalid dimension selection.', 400, 'INVALID_QUERY');
  const values = Object.values(dimensions || {}).flatMap(value => Array.isArray(value) ? value : [value]);
  if (values.length > 500 || values.some(value => typeof value !== 'string' && typeof value !== 'number')) throw new StatisticsError('Your current selection is too large. Select fewer values to continue.', 413, 'SELECTION_TOO_LARGE');
  const estimate = Object.values(dimensions || {}).reduce((product, value) => product * Math.max(1, Array.isArray(value) ? value.length : 1), 1);
  if (estimate > 10_000) throw new StatisticsError('Your current selection is too large. Select fewer values to continue.', 413, 'SELECTION_TOO_LARGE');
  return body;
}
