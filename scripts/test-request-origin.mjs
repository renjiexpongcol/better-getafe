import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { checkRequestOrigin } from '../server/src/services/requestOrigin.js';
import { createApiCorsMiddleware } from '../server/src/services/apiRoutePolicy.js';
import { authDiagnostics } from '../server/src/services/authDiagnostics.js';

const req = (origin, { host = 'localhost:8080', forwarded = '', protocol = 'http', remote = '198.51.100.10' } = {}) => ({ protocol, socket: { remoteAddress: remote }, get: name => ({ origin, host, 'x-forwarded-host': forwarded })[name] });
test('same-origin login works with the application host while hostile origins remain denied', () => {
  assert.equal(checkRequestOrigin(req('http://localhost:8080'), 'https://getafe.example').allowed, true);
  assert.equal(checkRequestOrigin(req('http://127.0.0.1:8080', { host: '127.0.0.1:8080' }), 'https://getafe.example').allowed, true);
  assert.equal(checkRequestOrigin(req('https://evil.example'), 'https://getafe.example').allowed, false);
  assert.equal(checkRequestOrigin(req('null'), 'https://getafe.example').allowed, false);
  assert.equal(checkRequestOrigin(req(''), 'https://getafe.example').allowed, false);
});
test('development origin is specific and is not enabled in production', () => {
  assert.equal(checkRequestOrigin(req('http://localhost:5173'), 'https://getafe.example', { environment: 'development' }).allowed, true);
  assert.equal(checkRequestOrigin(req('http://localhost:5174'), 'https://getafe.example', { environment: 'development' }).allowed, false);
  assert.equal(checkRequestOrigin(req('http://localhost:5173'), 'https://getafe.example', { environment: 'production' }).allowed, false);
  assert.equal(checkRequestOrigin(req('https://getafe.example'), 'https://getafe.example', { environment: 'production' }).allowed, true);
});
test('forwarded hosts only affect origin matching through an explicitly trusted immediate proxy', () => {
  const request = req('https://public.example', { host: 'internal:8080', protocol: 'https', forwarded: 'public.example', remote: '10.0.0.1' });
  assert.equal(checkRequestOrigin(request, '').allowed, false);
  assert.equal(checkRequestOrigin(request, '', { isTrustedProxy: address => address === '10.0.0.1' }).allowed, true);
  assert.equal(checkRequestOrigin(req('https://evil.example', { forwarded: 'evil.example' }), '', { isTrustedProxy: () => false }).allowed, false);
  assert.equal(checkRequestOrigin(req('https://public.example', { forwarded: 'public.example, evil.example' }), '', { isTrustedProxy: () => true }).allowed, false);
});
test('real HTTP CORS accepts same-origin and credentialed preflight headers without permitting hostile origins', async () => {
  const app = express(); app.use('/api', createApiCorsMiddleware({ configuredOrigin: 'https://getafe.example' }));
  app.post('/api/auth/login', (_req, res) => res.status(401).json({ error: 'Invalid email or password.' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { Origin: base } });
    assert.equal(response.status, 401);
    const preflight = await fetch(base + '/api/auth/login', { method: 'OPTIONS', headers: { Origin: 'https://getafe.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-requested-with' } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
    assert.match(preflight.headers.get('access-control-allow-headers'), /X-Requested-With/);
    assert.equal((await fetch(base + '/api/auth/login', { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('development diagnostics record decisions and cookie presence without credential values', async () => {
  const oldDebug = process.env.AUTH_DEBUG, oldEnvironment = process.env.NODE_ENV;
  process.env.AUTH_DEBUG = 'true'; process.env.NODE_ENV = 'development';
  const events = [], app = express();
  app.use(authDiagnostics({ hasSessionCookie: request => Boolean(request.headers.cookie), logger: value => events.push(value) }));
  app.post('/api/auth/login', (request, response) => { if (request.authDiagnostic) request.authDiagnostic.authentication = 'failed'; response.status(401).end(); });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, { method: 'POST', headers: { Cookie: 'getafe_session=private-cookie', Authorization: 'Bearer private-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'private-password', code: 'private-otp' }) });
    assert.equal(events[0].session_cookie_present, true); assert.equal(events[0].status, 401);
    assert.equal(JSON.stringify(events).includes('private-'), false);
    process.env.NODE_ENV = 'production';
    await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, { method: 'POST' });
    assert.equal(events.length, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (oldDebug === undefined) delete process.env.AUTH_DEBUG; else process.env.AUTH_DEBUG = oldDebug;
    if (oldEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnvironment;
  }
});
