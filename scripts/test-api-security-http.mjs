import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const baseUrl = (process.env.API_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* Assertions below verify JSON where required. */ }
  return { response, text, body };
}

const assertJsonError = (result, status, message = null) => {
  assert.equal(result.response.status, status);
  assert.equal(result.response.headers.get('content-type')?.split(';')[0], 'application/json');
  assert.equal(typeof result.body?.error, 'string');
  assert.ok(!/stack| at \w+ \(/i.test(result.text), 'API errors must not expose stack traces');
  if (message) assert.equal(result.body.error, message);
};

assertJsonError(await request('/api/not-registered'), 404, 'API endpoint not found.');

for (const path of ['/api/health', '/api/citizen/dashboard', '/api/staff/dashboard', '/api/admin/dashboard', '/api/citizen/documents/not-owned/download']) {
  const result = await request(path);
  assertJsonError(result, 401);
  assert.ok(!('cmsDatabase' in (result.body || {})), `${path} must not disclose operational state`);
}

const forged = await request('/api/admin/dashboard', { headers: { Authorization: 'Bearer forged-token' } });
assertJsonError(forged, 401);

const wrongWeatherMethod = await request('/api/weather', { method: 'POST' });
assertJsonError(wrongWeatherMethod, 405, 'Method not allowed.');
assert.equal(wrongWeatherMethod.response.headers.get('allow'), 'GET');

const wrongMediaMethod = await request('/api/media/complete');
assertJsonError(wrongMediaMethod, 405, 'Method not allowed.');
assert.equal(wrongMediaMethod.response.headers.get('allow'), 'POST');

const blockedCors = await request('/api/notifications', { headers: { Origin: 'https://evil.example' } });
assertJsonError(blockedCors, 403, 'Origin not allowed.');
assert.notEqual(blockedCors.response.headers.get('access-control-allow-origin'), '*');

const malformed = await request('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{',
});
assertJsonError(malformed, 400, 'Malformed JSON request.');

const wrongContentType = await request('/api/contact', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' },
  body: 'not-json',
});
assertJsonError(wrongContentType, 415, 'Use application/json for this request.');

const publicNotifications = await request('/api/notifications');
assert.equal(publicNotifications.response.status, 200);
assert.ok(Array.isArray(publicNotifications.body));
assert.equal(publicNotifications.text.includes('storage_path'), false, 'public notifications must not expose storage keys');

const containsKey = (value, key) => {
  if (Array.isArray(value)) return value.some(item => containsKey(item, key));
  if (!value || typeof value !== 'object') return false;
  return Object.hasOwn(value, key) || Object.values(value).some(item => containsKey(item, key));
};
const forbiddenPublicKeys = ['password', 'password_hash', 'storage_path', 'featured_image_path', 'person_id', 'assignment_id', 'legacy_source_key', 'verification', 'api_key', 'secret'];
for (const path of ['/api/categories', '/api/officials', '/api/officials/directory', '/api/barangays']) {
  const result = await request(path);
  assert.equal(result.response.status, 200, `${path} should remain publicly readable`);
  for (const key of forbiddenPublicKeys) assert.equal(containsKey(result.body, key), false, `${path} must not expose ${key}`);
}

const publicNews = await request('/api/news?limit=1&public=true');
assert.equal(publicNews.response.status, 200);
for (const key of forbiddenPublicKeys) assert.equal(containsKey(publicNews.body?.items?.[0], key), false, `public news must not expose ${key}`);
const invalidNewsLimit = await request('/api/news?limit=1000');
assertJsonError(invalidNewsLimit, 400);
const publicDraftQuery = await request('/api/news?status=draft&limit=100&public=true');
const publicDefaultQuery = await request('/api/news?limit=100&public=true');
assert.equal(publicDraftQuery.response.status, 200);
assert.equal(publicDraftQuery.body?.total, publicDefaultQuery.body?.total, 'public status filters must not change the published result set');
const firstPublicSlug = publicNews.body?.items?.[0]?.slug;
if (firstPublicSlug) {
  const publicNewsDetail = await request(`/api/news/${encodeURIComponent(firstPublicSlug)}`);
  assert.equal(publicNewsDetail.response.status, 200);
  for (const key of forbiddenPublicKeys) assert.equal(containsKey(publicNewsDetail.body, key), false, `public news detail must not expose ${key}`);
}
const publicDestinations = await request('/api/discover?limit=1');
assert.equal(publicDestinations.response.status, 200);
assert.equal(containsKey(publicDestinations.body?.items?.[0], 'featuredImage'), false, 'public destinations must not expose CMS storage paths');

const citizenRoutes = await readFile(new URL('../server/src/services/citizenRoutes.js', import.meta.url), 'utf8');
const staffRoutes = await readFile(new URL('../server/src/services/staffRoutes.js', import.meta.url), 'utf8');
assert.match(citizenRoutes, /WHERE id = \? AND user_id = \?/);
assert.match(citizenRoutes, /WHERE id = \? AND user_id = \?/g);
assert.match(staffRoutes, /authorizationResource\(application\)/);
assert.match(citizenRoutes, /WHERE id = \? AND user_id = \?/);

console.log(`Direct API security checks passed against ${baseUrl}.`);
