import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { normalizeMobile, validMobile } from '../src/data/residentContact.js';
import { billingStatus } from '../src/data/businessBillingWorkflow.js';
import { fieldProfileSource, publicStatus } from '../src/data/serviceApplication.js';
import { normalizedNpmEnvironment } from './vercel-npm.mjs';
import { deploymentConfiguration } from '../server/src/config/deployment.js';

test('resident shared exports preserve setup, profile, billing and request behavior', () => {
  assert.equal(normalizeMobile('+63 917 123 4567'), '09171234567');
  assert.equal(validMobile('0917-123-4567'), true);
  assert.equal(validMobile('invalid'), false);
  assert.equal(billingStatus({ status: 'AWAITING_PAYMENT', payment_pending: true }), 'Pending payment verification');
  assert.equal(billingStatus({ status: 'AWAITING_PAYMENT' }), 'Payment Required');
  assert.equal(fieldProfileSource({ key: 'contact_number' }), 'mobile');
  assert.equal(publicStatus('FOR_RELEASE'), 'Ready for Release');
});

test('legacy npm cache environment is translated without hiding other settings', () => {
  const source = { NPM_CONFIG_CACHE_DIR: '/build/cache', npm_config_loglevel: 'warn', other: 'preserved' };
  assert.deepEqual(normalizedNpmEnvironment(source), { npm_config_cache: '/build/cache', npm_config_loglevel: 'warn', other: 'preserved' });
  assert.equal(source.NPM_CONFIG_CACHE_DIR, '/build/cache');
  const explicit = normalizedNpmEnvironment({ npm_config_cache_dir: 'legacy', NPM_CONFIG_CACHE: 'explicit' });
  assert.equal(explicit.NPM_CONFIG_CACHE, 'explicit');
  assert.equal('npm_config_cache_dir' in explicit, false);
});

test('deployment routing preserves API/health/upload paths before the SPA fallback', async () => {
  const config = JSON.parse(await fs.readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const fallback = config.rewrites.findIndex(rule => rule.destination === '/index.html');
  assert.ok(fallback > 0);
  for (const source of ['/api/:path*', '/health/:path*', '/uploads/:path*']) {
    const index = config.rewrites.findIndex(rule => rule.source === source);
    assert.ok(index >= 0 && index < fallback);
    assert.equal(config.rewrites[index].destination, '/api');
  }
  assert.match(config.rewrites[fallback].source, /\?!api/);
  assert.equal(config.outputDirectory, 'dist');
  assert.equal(deploymentConfiguration({ VERCEL: '1', VERCEL_ENV: 'preview' }).errors.length > 0, true);
});
