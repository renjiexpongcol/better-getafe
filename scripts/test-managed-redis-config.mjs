import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRedisConfiguration } from '../server/src/infrastructure/redis/redisConfiguration.js';

test('unconfigured Redis is reported as disabled so readiness can fail without weakening auth', () => {
  assert.deepEqual(resolveRedisConfiguration({ NODE_ENV: 'development' }), { enabled: false, url: null, source: 'unconfigured' });
  assert.deepEqual(resolveRedisConfiguration({ NODE_ENV: 'production' }), { enabled: false, url: null, source: 'unconfigured' });
});

test('managed Redis configuration rejects local and conflicting URLs', () => {
  assert.throws(() => resolveRedisConfiguration({ REDIS_URL: 'redis://127.0.0.1:6379' }), /managed Redis service/);
  assert.throws(() => resolveRedisConfiguration({ MY_REDIS_REDIS_URL: 'rediss://user:pass@managed.example:6380', REDIS_URL: 'rediss://user:other@managed.example:6380' }), /conflict/);
});

test('managed Redis configuration prefers the integration URL and permits the matching migration alias', () => {
  const url = 'rediss://user:pass@managed.example:6380';
  assert.equal(resolveRedisConfiguration({ MY_REDIS_REDIS_URL: url, REDIS_URL: url }).source, 'MY_REDIS_REDIS_URL');
  assert.equal(resolveRedisConfiguration({ REDIS_URL: url }).source, 'REDIS_URL');
});
