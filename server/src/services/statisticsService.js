import crypto from 'node:crypto';

const BASE_URL = process.env.STATISTICS_API_URL || 'https://statistics.bettergov.ph/api/v1';
const cache = new Map();
const inflight = new Map();
const DATASET_ID = /^[A-Za-z0-9][A-Za-z0-9._~:-]{0,191}$/;
// A query can legitimately contain thousands of observations after batching.
// Bound a single upstream response to protect the process while allowing the
// full public dataset selection to be assembled from smaller API requests.
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 256;
let cachedBytes = 0;
const MAX_QUERY_POINTS = 5000;
const MAX_QUERY_BODY_BYTES = 60 * 1024;

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
function isSelectionLimitError(error) {
  return error?.code === 'SELECTION_TOO_LARGE'
    || error?.status === 413
    || /selection.{0,80}(?:too large|too many|limit|exceed)|too many.{0,50}(?:values|selections)|(?:values|selection).{0,80}(?:limit|exceed|too large)/i.test(String(error?.message || ''))
}

async function upstream(endpoint, { method = 'GET', query, body, ttl = cacheFor(endpoint), release = '' } = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) if (value !== undefined && value !== '') search.set(key, String(value));
  const url = `${BASE_URL}/${safePath(endpoint)}${search.size ? `?${search}` : ''}`;
  const cacheKey = hash(stable({ endpoint, method, query, body, release }));
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cache: 'HIT', durationMs: 0 };
  if (cached) {
    cache.delete(cacheKey);
    cachedBytes -= cached.bytes;
  }
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);
  const job = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), endpoint.endsWith('/query') ? 120_000 : 12_000);
    const started = Date.now();
    try {
      const response = await fetch(url, { method, signal: controller.signal, headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const length = Number(response.headers.get('content-length') || 0);
      if (length > MAX_RESPONSE_BYTES) {
        controller.abort();
        throw new StatisticsError('The public statistics response was too large.', 502, 'RESPONSE_TOO_LARGE');
      }
      let bytes = 0;
      const chunks = [];
      for await (const chunk of response.body || []) {
        bytes += chunk.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          controller.abort();
          throw new StatisticsError('The public statistics response was too large.', 502, 'RESPONSE_TOO_LARGE');
        }
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks, bytes).toString('utf8').replace(/^\uFEFF/, '');
      let data; try { data = raw ? JSON.parse(raw) : {}; } catch { throw new StatisticsError('The public statistics service returned an invalid response.', 502, 'MALFORMED_RESPONSE'); }
      console.info(JSON.stringify({ event: 'statistics.upstream', endpoint, status: response.status, durationMs: Date.now() - started, cache: 'MISS' }));
      if (!response.ok) {
        const upstreamError = data?.error;
        const message = data?.message || data?.detail || (typeof upstreamError === 'string' ? upstreamError : upstreamError?.message) || '';
        if (response.status === 413 || isSelectionLimitError({ message })) throw new StatisticsError(message || 'Selection batch exceeds the statistics provider limit.', 413, 'SELECTION_TOO_LARGE');
        if (response.status === 409) throw new StatisticsError('This dataset release changed. Refresh the dataset details and rebuild your selection.', 409, 'RELEASE_CHANGED');
        if (response.status === 503) throw new StatisticsError('The public statistics service is temporarily unavailable. Please try again later.', 503, 'UPSTREAM_UNAVAILABLE');
        throw new StatisticsError(message || 'The public statistics service could not complete this request.', response.status, 'UPSTREAM_HTTP');
      }
      const value = { data, retrievedAt: new Date().toISOString(), sourceUrl: url, cache: 'MISS', durationMs: Date.now() - started };
      while (cache.size >= MAX_CACHE_ENTRIES || cachedBytes + bytes > MAX_RESPONSE_BYTES) {
        const oldest = cache.keys().next().value;
        cachedBytes -= cache.get(oldest).bytes;
        cache.delete(oldest);
      }
      cache.set(cacheKey, { value, bytes, expiresAt: Date.now() + ttl });
      cachedBytes += bytes;
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
  query: async (id, body) => {
    const rawSelection = body?.selection || body?.dimensions || body?.filters;
    if (!rawSelection || !Object.keys(rawSelection).length) return upstream(`datasets/${safeId(id)}/query`, { method: 'POST', body, ttl: 15 * 60 * 1000, release: body?.release || body?.version || '' });
    const selection = Object.fromEntries(Object.entries(rawSelection).map(([key, values]) => [key, Array.isArray(values) ? values : [values]]));
    const batches = [{ ...selection }];
    for (let index = 0; index < batches.length;) {
      const batch = batches[index];
      const points = Object.values(batch).reduce((count, values) => count * values.length, 1);
      const bodyBytes = Buffer.byteLength(JSON.stringify({ ...body, selection: batch }));
      if (points <= MAX_QUERY_POINTS && bodyBytes <= MAX_QUERY_BODY_BYTES) { index += 1; continue; }
      const splittable = Object.entries(batch).filter(([, values]) => values.length > 1).sort((a, b) => b[1].length - a[1].length)[0];
      if (!splittable) throw new StatisticsError('A selected value is too large to send to the public statistics service.', 413, 'SELECTION_TOO_LARGE');
      const [dimension, values] = splittable;
      const midpoint = Math.ceil(values.length / 2);
      const left = { ...batch, [dimension]: values.slice(0, midpoint) };
      const right = { ...batch, [dimension]: values.slice(midpoint) };
      batches.splice(index, 1, left, right);
    }

    // The source API accepts at most 5,000 observations per query. Split large
    // selections into valid requests, then combine every returned row.
    const responses = [];
    for (let index = 0; index < batches.length;) {
      const batch = batches[index];
      try {
        responses.push(await upstream(`datasets/${safeId(id)}/query`, {
          method: 'POST', body: { ...body, selection: batch }, ttl: 15 * 60 * 1000,
          release: body?.release || body?.version || '',
        }));
        index += 1;
      } catch (error) {
        const splittable = isSelectionLimitError(error)
          ? Object.entries(batch).filter(([, values]) => values.length > 1).sort((a, b) => b[1].length - a[1].length)[0]
          : null;
        if (!splittable) throw error;
        const [dimension, values] = splittable;
        const midpoint = Math.ceil(values.length / 2);
        batches.splice(index, 1,
          { ...batch, [dimension]: values.slice(0, midpoint) },
          { ...batch, [dimension]: values.slice(midpoint) },
        );
      }
    }
    if (responses.length === 1) return responses[0];

    const first = responses[0];
    const data = { ...first.data };
    const rowKey = ['rows', 'observations', 'results'].find(key => responses.some(response => Array.isArray(response.data?.[key]) || Array.isArray(response.data?.data?.[key]))) || 'rows';
    const nestedRows = !Array.isArray(data[rowKey]) && Array.isArray(data.data?.[rowKey]);
    const allRows = responses.flatMap(response => {
      const rows = response.data?.[rowKey] || response.data?.data?.[rowKey];
      return Array.isArray(rows) ? rows : [];
    });
    if (nestedRows) {
      data.data = { ...data.data, [rowKey]: allRows };
      for (const key of ['count', 'total', 'totalRows']) if (Object.hasOwn(data.data, key)) data.data[key] = allRows.length;
    } else {
      data[rowKey] = allRows;
      for (const key of ['count', 'total', 'totalRows']) if (Object.hasOwn(data, key)) data[key] = allRows.length;
    }
    return { ...first, data, cache: responses.every(response => response.cache === 'HIT') ? 'HIT' : 'MISS', durationMs: responses.reduce((total, response) => total + (Number(response.durationMs) || 0), 0), retrievedAt: responses.reduce((latest, response) => response.retrievedAt > latest ? response.retrievedAt : latest, first.retrievedAt), batches: responses.length };
  },
  classification: (query) => upstream('classification', { query }),
};

export function validateQuery(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new StatisticsError('A valid dataset selection is required.', 400, 'INVALID_QUERY');
  const dimensions = body.dimensions || body.selection || body.filters;
  if (dimensions && (typeof dimensions !== 'object' || Array.isArray(dimensions))) throw new StatisticsError('Invalid dimension selection.', 400, 'INVALID_QUERY');
  const values = Object.values(dimensions || {}).flatMap(value => Array.isArray(value) ? value : [value]);
  if (values.some(value => typeof value !== 'string' && typeof value !== 'number')) throw new StatisticsError('Dimension values must be text or numeric source codes.', 400, 'INVALID_QUERY');
  if (Object.values(dimensions || {}).some(value => Array.isArray(value) && value.length === 0)) throw new StatisticsError('Select at least one value for every dataset dimension.', 400, 'INVALID_QUERY');
  return body;
}
