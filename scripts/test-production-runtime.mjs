import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { deploymentConfiguration } from '../server/src/config/deployment.js';

test('unconfigured function liveness returns 200 and other requests return controlled 503', async () => {
  const { default: handler } = await import('../api/index.js');
  const response = () => ({ headers: {}, setHeader(k,v) { this.headers[k]=v; }, end(body) { this.body=JSON.parse(body); } });
  const live = response();
  await handler({ url: '/api/health/live' }, live);
  assert.equal(live.statusCode, 200);
  const request = response();
  await handler({ url: '/api/news' }, request);
  assert.equal(request.statusCode, 503);
  assert.equal(request.body.code, 'SERVICE_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(request.body), /postgres|password|redis:\/\//i);
});

test('serverless imports register the whole API without network, listeners, intervals or process hooks', () => {
  const script = `
    const before = process.listenerCount('uncaughtException') + process.listenerCount('unhandledRejection');
    globalThis.setInterval = () => { throw Error('unexpected permanent interval'); };
    const {default:app} = await import('./server/index.js');
    if (typeof app !== 'function') throw Error('missing application');
    if (process.listenerCount('uncaughtException') + process.listenerCount('unhandledRejection') !== before) throw Error('unexpected process hooks');
    console.log('serverless import passed');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { SystemRoot: process.env.SystemRoot, NODE_ENV: 'production', PORTAL_SERVERLESS: 'true', AUTH_SESSION_SECRET: 'production-runtime-fixture-secret-value-32-chars', REDIS_URL: 'invalid-credential-fixture' },
    timeout: 15000, encoding: 'utf8', windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /serverless import passed/);
  assert.doesNotMatch(result.stdout + result.stderr, /Listening on|invalid-credential-fixture/);
});

test('Preview refuses local persistent storage and a missing stable encryption key', () => {
  const value = deploymentConfiguration({ VERCEL: '1', VERCEL_ENV: 'preview', PREVIEW_DATA_ISOLATED: 'true', APP_URL: 'https://preview.example', CMS_MEDIA_PROVIDER: 'local' });
  assert.ok(value.errors.some(error => error.includes('local storage') || error.includes('Local persistent')));
  assert.ok(value.errors.some(error => error.includes('ENCRYPTION_KEY')));
});

test('production Vite configuration does not resolve local backend ports', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "const {default:config}=await import('./vite.config.js'); if(config.server.proxy['/api']) throw Error('unexpected local API proxy');"], {
    env: { SystemRoot: process.env.SystemRoot, NODE_ENV: 'production', PORT: 'invalid-build-only-port' }, encoding: 'utf8', timeout: 15000, windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('client address uses Vercel ingress identity only inside the platform runtime', async () => {
  const { resolveClientAddress, resolveClient } = await import('../server/src/services/trafficProtection.js');
  const previous = process.env.VERCEL;
  const request = { socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-vercel-forwarded-for': '203.0.113.12', 'x-forwarded-for': '198.51.100.1' } };
  try {
    delete process.env.VERCEL;
    assert.equal(resolveClientAddress(request), '127.0.0.1');
    const localBucket = resolveClient(request).value;
    process.env.VERCEL = '1';
    assert.equal(resolveClientAddress(request), '203.0.113.12');
    assert.notEqual(resolveClient(request).value, localBucket);
    request.headers['x-vercel-forwarded-for'] = '203.0.113.12, 198.51.100.1';
    assert.equal(resolveClientAddress(request), '127.0.0.1');
  } finally { if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous; }
});
