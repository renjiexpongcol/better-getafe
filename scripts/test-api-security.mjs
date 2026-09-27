import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { apiRouteInventory, createApiSecurityMiddleware, resolveApiRoutePolicy } from '../server/src/services/apiRoutePolicy.js';

const expectPolicy = (method, path, expected) => {
  const policy = resolveApiRoutePolicy(method, path);
  assert.ok(policy, `${method} ${path} should be registered`);
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(policy[key], value, `${method} ${path} ${key}`);
  return policy;
};

expectPolicy('GET', '/api/weather', { access: 'PUBLIC', methodAllowed: true });
expectPolicy('POST', '/api/auth/login', { access: 'AUTH_FLOW', methodAllowed: true, body: 'json' });
expectPolicy('GET', '/api/citizen/applications/owned-id', { access: 'RESIDENT', methodAllowed: true });
expectPolicy('POST', '/api/citizen/documents', { access: 'RESIDENT', methodAllowed: true, body: 'mixed' });
expectPolicy('POST', '/api/news', { access: 'CMS', methodAllowed: true });
expectPolicy('PUT', '/api/officials', { access: 'CMS', methodAllowed: true });
expectPolicy('GET', '/api/admin/access/users/user-id/effective', { access: 'CMS', methodAllowed: true });
expectPolicy('GET', '/api/staff/applications/application-id', { access: 'STAFF', methodAllowed: true });
expectPolicy('GET', '/api/health', { access: 'CMS', methodAllowed: true });
expectPolicy('POST', '/api/media/complete', { access: 'CMS', methodAllowed: true });

assert.equal(resolveApiRoutePolicy('GET', '/api/does-not-exist'), null, 'unknown API paths must be denied');
assert.equal(resolveApiRoutePolicy('GET', '/api/news').methodAllowed, true);
assert.equal(resolveApiRoutePolicy('DELETE', '/api/news').methodAllowed, true);
assert.equal(resolveApiRoutePolicy('PUT', '/api/weather').methodAllowed, false, 'known paths must reject unsupported methods');
assert.equal(resolveApiRoutePolicy('GET', '/api/citizen/dashboard').methodAllowed, true);
assert.equal(resolveApiRoutePolicy('DELETE', '/api/citizen/dashboard').methodAllowed, false);
assert.deepEqual(resolveApiRoutePolicy('GET', '/api/media/complete').methods, ['POST']);

assert.ok(apiRouteInventory.length >= 30, 'the route inventory should cover the API surface');
assert.ok(apiRouteInventory.every(route => route.methods.length > 0 && route.access), 'every route needs an explicit method and access class');

const sourceFiles = [
  new URL('../server/index.js', import.meta.url),
  ...(await readdir(new URL('../server/src/services/', import.meta.url), { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => new URL(`../server/src/services/${entry.name}`, import.meta.url)),
];
const declaredRoutes = [];
for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8');
  const routePattern = /app\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/gi;
  for (const match of source.matchAll(routePattern)) {
    if (!match[2].startsWith('/api/')) continue;
    const samplePath = match[2].replace(/:[A-Za-z0-9_]+/g, 'sample-id').replace(/\/\*/g, '/sample');
    const policy = resolveApiRoutePolicy(match[1].toUpperCase(), samplePath);
    assert.ok(policy?.methodAllowed, `${match[1].toUpperCase()} ${match[2]} is not covered by the API policy registry`);
    declaredRoutes.push(`${match[1].toUpperCase()} ${match[2]}`);
  }
}
assert.ok(declaredRoutes.length >= 70, `expected to audit the complete API handler surface, found ${declaredRoutes.length}`);

const responseStub = () => {
  const headers = new Map();
  return {
    statusCode: 200,
    payload: null,
    headers,
    set(name, value) { headers.set(name.toLowerCase(), value); return this; },
    getHeader(name) { return headers.get(name.toLowerCase()) || null; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
    once(_event, handler) { this.finish = handler; },
  };
};
const requestStub = (method, path, session) => ({
  method,
  originalUrl: path,
  apiSession: null,
  testSession: session,
  get(name) { return { 'content-length': undefined, 'transfer-encoding': undefined, 'content-type': undefined }[name.toLowerCase()]; },
});
const securityMiddleware = createApiSecurityMiddleware({
  authenticate: request => request.testSession,
  isRevoked: async () => false,
});
const invokeSecurity = async (method, path, session) => {
  const req = requestStub(method, path, session), res = responseStub();
  let nextCalled = false;
  await securityMiddleware(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
};
assert.equal((await invokeSecurity('GET', '/api/admin/dashboard', { kind: 'portal', role: 'resident', id: 'resident-1' })).res.statusCode, 403);
assert.equal((await invokeSecurity('GET', '/api/citizen/dashboard', { kind: 'cms', role: 'staff', id: 'staff-1' })).res.statusCode, 403);
assert.equal((await invokeSecurity('GET', '/api/admin/dashboard', null)).res.statusCode, 401);
assert.equal((await invokeSecurity('GET', '/api/citizen/dashboard', { kind: 'portal', role: 'resident', id: 'resident-1' })).nextCalled, true);
assert.equal((await invokeSecurity('GET', '/api/staff/dashboard', { kind: 'cms', role: 'staff', id: 'staff-1' })).nextCalled, true);

console.log(`API security policy tests passed (${apiRouteInventory.length} policy entries, ${declaredRoutes.length} declared handlers audited).`);
