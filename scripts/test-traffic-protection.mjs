import assert from 'node:assert/strict';
import { AdaptiveTrafficProtector, createServiceSignature, policyFor, resolveClient, resolveServicePrincipal } from '../server/src/services/trafficProtection.js';
import { redisKeys } from '../server/src/infrastructure/redis/redisKeys.js';

function request(path = '/api/news', address = '198.51.100.20', method = 'GET') { return { originalUrl: path, path, method, socket: { remoteAddress: address }, get: () => undefined }; }
function response() { const events = new Map(); return { headers: new Map(), statusCode: 200, setHeader(k, v) { this.headers.set(k, v); }, status(v) { this.statusCode = v; return this; }, json(v) { this.body = v; return this; }, once(name, fn) { events.set(name, fn); }, finish() { events.get('finish')?.(); } }; }
let time = 1_000;
const protector = new AdaptiveTrafficProtector({ now: () => time });
const invoke = async req => { const res = response(); let passed = false; await protector.middleware()(req, res, () => { passed = true; res.finish(); }); return { res, passed }; };
// The local fallback keeps the configured authentication burst; it must not
// silently halve it when Redis is unavailable.
for (let count = 0; count < 10; count++) assert.equal((await invoke(request('/api/auth/login', '198.51.100.20', 'POST'))).passed, true, 'authentication burst passes');
const limited = await invoke(request('/api/auth/login', '198.51.100.20', 'POST'));
assert.equal(limited.res.statusCode, 429, 'authentication excess is rejected');
assert.equal(limited.res.body.error, 'Too many attempts. Please try again later.', 'authentication 429 has the generic error contract');
assert.ok(limited.res.body.retryAfter >= 1, '429 includes retryAfter');
assert.equal(limited.res.headers.get('Retry-After'), String(limited.res.body.retryAfter), '429 has a matching Retry-After header');
assert.equal((await invoke(request('/', '198.51.100.20', 'GET'))).passed, true, 'UI documents bypass API traffic protection');
assert.equal((await invoke(request('/news', '198.51.100.20', 'GET'))).passed, true, 'SPA routes bypass API traffic protection');
assert.equal(policyFor(request('/')), null, 'UI documents have no API rate-limit policy');
assert.equal(policyFor(request('/index.html')), null, 'static HTML has no API rate-limit policy');
assert.equal(policyFor(request('/uploads/photo.jpg', '198.51.100.20', 'PUT')), 'uploads', 'upload mutations keep the upload policy even with file extensions');
const abuseProtector = new AdaptiveTrafficProtector({ now: () => time });
const invokeAbuse = async req => {
  const res = response();
  let passed = false;
  await abuseProtector.middleware()(req, res, () => { passed = true; res.finish(); });
  return { res, passed };
};
for (let count = 0; count < 18; count++) await invokeAbuse(request('/api/auth/login', '198.51.100.60', 'POST'));
const blockedLogin = await invokeAbuse(request('/api/auth/login', '198.51.100.60', 'POST'));
assert.equal(blockedLogin.res.statusCode, 429, 'repeated login abuse reaches the temporary block path');
assert.equal(blockedLogin.res.body.error, 'Too many attempts. Please try again later.', 'temporary authentication blocks retain the auth error contract');
assert.equal((await invokeAbuse(request('/api/officials', '198.51.100.60', 'GET'))).passed, true, 'authentication blocks do not spill into public reads');
assert.equal((await invoke(request('/api/auth/mfa/verify', '198.51.100.20', 'POST'))).passed, true, 'OTP has an independent bucket');
assert.equal(policyFor(request('/api/auth/login', '198.51.100.20', 'POST')), 'authentication');
assert.equal(policyFor(request('/api/auth/google', '198.51.100.20', 'GET')), 'authentication', 'Google OAuth start uses the shared auth bucket');
assert.equal(policyFor(request('/api/auth/google/callback', '198.51.100.20', 'GET')), 'authentication', 'Google OAuth callback uses the shared auth bucket');
assert.equal(policyFor(request('/api/auth/verify-code', '198.51.100.20', 'POST')), 'otp');
assert.equal(policyFor(request('/api/auth/resend-code', '198.51.100.20', 'POST')), 'otp', 'verification-code resends use the strict OTP bucket');
assert.equal(policyFor(request('/api/citizen/onboarding/verification/confirm', '198.51.100.20', 'POST')), 'otp', 'onboarding codes use the strict OTP bucket');
assert.equal(policyFor(request('/api/auth/mfa/activate', '198.51.100.20', 'POST')), 'otp', 'all MFA verification actions use the strict OTP bucket');
assert.equal(policyFor(request('/api/auth/forgot-password/verify', '198.51.100.20', 'POST')), 'otp', 'password reset verification uses the strict OTP bucket');
assert.equal(policyFor(request('/api/contact', '198.51.100.20', 'POST')), 'contact_form');
assert.equal(policyFor(request('/api/storage/upload-url', '198.51.100.20', 'POST')), 'uploads');
assert.equal(policyFor(request('/api/media?page=1&limit=20', '198.51.100.20', 'GET')), 'media_read', 'Media collection reads use their own authenticated read bucket');
assert.equal(policyFor(request('/api/media/complete', '198.51.100.20', 'POST')), 'uploads', 'Media finalization stays on the upload bucket');
assert.equal(policyFor(request('/api/account/password', '198.51.100.20', 'PATCH')), 'admin_sensitive', 'CMS password updates use the sensitive admin bucket');
const spoofed = resolveClient({ socket: { remoteAddress: '198.51.100.30' }, get: name => name === 'X-Forwarded-For' ? '203.0.113.99' : undefined });
const direct = resolveClient({ socket: { remoteAddress: '198.51.100.30' }, get: () => undefined });
assert.equal(spoofed.value, direct.value, 'untrusted forwarding headers are ignored');
const firstFakeApiKey = resolveClient({ socket: { remoteAddress: '198.51.100.30' }, get: name => name === 'X-API-Key' ? 'first-client-key' : undefined });
const secondFakeApiKey = resolveClient({ socket: { remoteAddress: '198.51.100.30' }, get: name => name === 'X-API-Key' ? 'second-client-key' : undefined });
assert.equal(firstFakeApiKey.value, secondFakeApiKey.value, 'caller-controlled API-key headers cannot rotate rate-limit buckets');
const firstAuthenticatedClient = resolveClient({ socket: { remoteAddress: '198.51.100.30' }, apiKeyPrincipal: { id: 'client-a' } });
const secondAuthenticatedClient = resolveClient({ socket: { remoteAddress: '198.51.100.30' }, apiKeyPrincipal: { id: 'client-b' } });
assert.notEqual(firstAuthenticatedClient.value, secondAuthenticatedClient.value, 'validated API client identities receive separate buckets');
assert.equal(policyFor(request('/api/officials')), 'public', 'anonymous public reads use the public policy');
assert.equal(policyFor(request('/api/barangays')), 'public', 'anonymous barangay reads use the public policy');
assert.equal(policyFor(request('/api/officials'), { session: { kind: 'portal', role: 'resident' } }), 'authenticated', 'resident API reads use a signed-in policy');
assert.equal(policyFor(request('/api/officials'), { session: { kind: 'cms', role: 'staff' } }), 'admin_staff', 'staff API reads use the staff policy');
const publicProbe = new AdaptiveTrafficProtector({ now: () => time });
const publicClient = resolveClient(request('/api/officials', '198.51.100.40'));
const oneRequestPolicy = { limits: [{ rate: 1, windowMs: 60_000, burst: 1 }], maxDelayMs: 0, concurrency: 1 };
assert.equal((await publicProbe.consume(publicClient, 'public', oneRequestPolicy, '/api/officials')).allowed, true, 'public bucket allows its configured burst');
assert.equal((await publicProbe.consume(publicClient, 'public', oneRequestPolicy, '/api/officials')).allowed, false, 'public bucket throttles excess traffic');
assert.equal((await publicProbe.consume(publicClient, 'public', oneRequestPolicy, '/api/barangays')).allowed, true, 'public buckets are isolated by route group');
assert.notEqual(redisKeys.block('public', publicClient.value), redisKeys.block('authentication', publicClient.value), 'temporary blocks are isolated by policy');
assert.notEqual(redisKeys.rateLimitWait('public', publicClient.value), redisKeys.rateLimitWait('authentication', publicClient.value), 'delayed queues are isolated by policy');
const authenticatedRequest = request('/api/officials', '198.51.100.40');
authenticatedRequest.testSession = { id: 'resident-1', kind: 'portal', role: 'resident' };
const authenticatedProtector = new AdaptiveTrafficProtector({
  now: () => time,
  getAuthenticatedSession: req => req.testSession,
  getAuthenticatedId: req => req.testSession?.id,
});
const authenticatedResponse = response();
let authenticatedPassed = false;
await authenticatedProtector.middleware()(authenticatedRequest, authenticatedResponse, () => { authenticatedPassed = true; });
assert.equal(authenticatedPassed, true, 'authenticated traffic uses the signed-in policy instead of the public bucket');
assert.equal(policyFor(request('/api/auth/login', '198.51.100.30', 'POST'), { service: { verified: true } }), 'authentication', 'services cannot bypass auth throttling');
assert.equal(policyFor(request('/api/public-data/datasets/id/query', '198.51.100.30', 'POST'), { service: { verified: true } }), 'expensive', 'services cannot bypass expensive endpoint protection');

const priorServiceEnvironment = {
  id: process.env.INTERNAL_SERVICE_ID,
  secret: process.env.INTERNAL_SERVICE_SECRET,
};
process.env.INTERNAL_SERVICE_ID = 'test-service';
process.env.INTERNAL_SERVICE_SECRET = 'test-service-secret';
const serviceTimestamp = String(Date.now());
const serviceRequest = request('/api/officials', '198.51.100.30', 'GET');
const serviceHeaders = {
  'x-internal-service-id': 'test-service',
  'x-internal-service-timestamp': serviceTimestamp,
  'x-internal-service-signature': createServiceSignature({ secret: 'test-service-secret', timestamp: serviceTimestamp, method: serviceRequest.method, path: serviceRequest.originalUrl }),
};
serviceRequest.get = name => serviceHeaders[String(name).toLowerCase()];
assert.equal(resolveServicePrincipal(serviceRequest)?.id, 'test-service', 'valid service signatures are accepted');
assert.equal(resolveServicePrincipal({ ...serviceRequest, get: name => name.toLowerCase() === 'x-internal-request' ? 'true' : undefined }), null, 'spoofed internal markers are rejected');
const serviceProtector = new AdaptiveTrafficProtector({ now: () => Date.now(), getServicePrincipal: req => resolveServicePrincipal(req) });
const serviceResponse = response();
let servicePassed = false;
await serviceProtector.middleware()(serviceRequest, serviceResponse, () => { servicePassed = true; });
assert.equal(servicePassed, true, 'verified services bypass normal request buckets');
if (priorServiceEnvironment.id === undefined) delete process.env.INTERNAL_SERVICE_ID; else process.env.INTERNAL_SERVICE_ID = priorServiceEnvironment.id;
if (priorServiceEnvironment.secret === undefined) delete process.env.INTERNAL_SERVICE_SECRET; else process.env.INTERNAL_SERVICE_SECRET = priorServiceEnvironment.secret;
console.log('Adaptive traffic protection checks passed.');
