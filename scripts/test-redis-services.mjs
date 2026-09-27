import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import redis, { connectRedis, closeRedis } from '../server/src/infrastructure/redis/redisClient.js';
import { redisKeys } from '../server/src/infrastructure/redis/redisKeys.js';
import { cacheService } from '../server/src/services/cacheService.js';
import { claimIdempotency, incrementCounter, withRedisLock } from '../server/src/services/redisInfrastructure.js';
import { stateKey, putState, readState } from '../server/src/services/authState.js';
import { verifyCode, loginThrottle, actionThrottle, verificationCodeDigest } from '../server/src/services/authSecurity.js';
import { config } from '../server/src/config/index.js';
import { closeConfigStore } from '../server/src/config/DatabaseSettingsProvider.js';
import { closeCloudSql } from '../server/src/services/cloudSql.js';
import { extendRedisKeyExpiry, sessionTtlSeconds } from '../server/src/services/sessionRegistry.js';

const suffix = crypto.randomUUID();
const cleanup = [];
const challengeKeys = [];
const authStateKeys = [];
const addChallenge = async (purpose = 'password-reset', code = '111111') => {
  const id = crypto.randomBytes(24).toString('hex');
  const stateId = stateKey('challenge', id);
  challengeKeys.push(redisKeys.authState(stateId));
  await putState(stateId, { digest: verificationCodeDigest(id, code), purpose, payload: { test: suffix }, attempts: 0, expiresAt: Date.now() + 60_000 }, 60_000);
  return id;
};
try {
  assert.equal(await connectRedis(), true, 'Redis connects');
  assert.ok(redisKeys.rateLimit('general', 'client').startsWith('getafe:ratelimit:'));
  assert.ok(redisKeys.authState('challenge:secret').startsWith('getafe:auth-state:'));

  assert.equal(sessionTtlSeconds(120_000, 0), 120, 'session expiration milliseconds are converted to seconds');
  assert.equal(sessionTtlSeconds(1, 0), 1, 'sub-second session remainder rounds up safely');
  const sessionIndex = redisKeys.userSessions('portal', `test-${suffix}`);
  await redis.sAdd(sessionIndex, `session-${suffix}`);
  cleanup.push(sessionIndex);
  await redis.expire(sessionIndex, 3600);
  assert.equal(await extendRedisKeyExpiry(redis, sessionIndex, 60), false, 'a shorter session does not reduce the shared index expiry');
  assert.ok(await redis.ttl(sessionIndex) > 3500, 'longer sessions remain indexed');
  assert.equal(await extendRedisKeyExpiry(redis, sessionIndex, 7200), true, 'a longer session extends the shared index expiry');
  assert.ok(await redis.ttl(sessionIndex) > 7100, 'the shared index expires no earlier than the longest session');

  const cacheGroup = `test-${suffix}`;
  await cacheService.set(cacheGroup, 'resource', { value: 42 }, 5);
  cleanup.push(redisKeys.cache(cacheGroup, 'resource'));
  assert.deepEqual(await cacheService.get(cacheGroup, 'resource'), { value: 42 }, 'cache hit returns stored value');
  await cacheService.invalidate(cacheGroup);
  assert.equal(await cacheService.get(cacheGroup, 'resource'), null, 'version invalidation hides stale values');
  assert.deepEqual(await cacheService.getOrSet(cacheGroup, 'resource', async () => ({ value: 7 }), 5), { value: 7 }, 'cache miss populates');
  let loads = 0;
  const coalesced = await Promise.all(Array.from({ length: 8 }, () => cacheService.getOrSet(cacheGroup, 'coalesced', async () => {
    loads++;
    await new Promise(resolve => setTimeout(resolve, 25));
    return { value: 'shared' };
  }, 5)));
  assert.equal(loads, 1, 'simultaneous local cache misses share one loader');
  assert.equal(coalesced.every(item => item.value === 'shared'), true);
  await cacheService.getOrSetNegative(cacheGroup, 'missing', async () => null, 5, 5);
  assert.deepEqual(await cacheService.getOrSetNegative(cacheGroup, 'missing', async () => { throw new Error('negative result should be cached'); }, 5, 5), null, 'safe misses use negative caching');
  let staleLoads = 0;
  assert.deepEqual(await cacheService.getOrSetStale(cacheGroup, 'stale', async () => ({ count: ++staleLoads }), { ttlSeconds: 1, staleSeconds: 2 }), { count: 1 });
  assert.deepEqual(await cacheService.getOrSetStale(cacheGroup, 'stale', async () => ({ count: ++staleLoads }), { ttlSeconds: 1, staleSeconds: 2 }), { count: 1 }, 'fresh stale-aware cache returns immediately');

  assert.equal(await incrementCounter('test', suffix), 1, 'counter increments');
  assert.equal(await incrementCounter('test', suffix), 2, 'counter increments atomically');
  cleanup.push(redisKeys.counter('test', suffix));

  const lock = await withRedisLock(`test-${suffix}`, 5000, async () => 'done');
  assert.deepEqual(lock, { acquired: true, value: 'done' }, 'lock acquired and safely released');
  const idem = `test-${suffix}`;
  assert.equal(await claimIdempotency(idem, 5), true);
  assert.equal(await claimIdempotency(idem, 5), false, 'duplicate idempotency claim rejected');
  cleanup.push(redisKeys.idempotency(idem));

  const challenge = await addChallenge();
  assert.equal(await verifyCode(challenge, '111111', 'login'), null, 'purpose mismatch does not verify');
  const beforeWrongAttempt = await readState(stateKey('challenge', challenge));
  assert.equal(beforeWrongAttempt?.attempts, 0, 'purpose mismatch preserves the valid challenge');
  assert.equal(await verifyCode(challenge, '222222', 'password-reset'), null, 'wrong code is rejected');
  const afterWrongAttempt = await readState(stateKey('challenge', challenge));
  assert.equal(afterWrongAttempt?.attempts, 1, 'wrong code increments attempts');
  assert.equal(afterWrongAttempt?.expiresAt, beforeWrongAttempt?.expiresAt, 'wrong code does not extend OTP expiry');
  assert.deepEqual(await verifyCode(challenge, '111111', 'password-reset'), { test: suffix }, 'correct OTP is accepted');
  assert.equal(await verifyCode(challenge, '111111', 'password-reset'), null, 'OTP cannot be replayed');

  const concurrentChallenge = await addChallenge('login', '333333');
  const concurrentResults = await Promise.all([
    verifyCode(concurrentChallenge, '333333', 'login'),
    verifyCode(concurrentChallenge, '333333', 'login'),
  ]);
  assert.equal(concurrentResults.filter(Boolean).length, 1, 'concurrent OTP verification succeeds exactly once');

  const limitedChallenge = await addChallenge('mfa-disable', '444444');
  for (let attempt = 0; attempt < 5; attempt++) await verifyCode(limitedChallenge, '555555', 'mfa-disable');
  assert.equal(await verifyCode(limitedChallenge, '444444', 'mfa-disable'), null, 'five incorrect attempts invalidate a challenge');

  const expiredId = crypto.randomBytes(24).toString('hex');
  const expiredKey = stateKey('challenge', expiredId);
  challengeKeys.push(redisKeys.authState(expiredKey));
  await putState(expiredKey, { digest: verificationCodeDigest(expiredId, '666666'), purpose: 'password-reset', payload: { test: suffix }, attempts: 0, expiresAt: Date.now() - 1 }, 1);
  assert.equal(await verifyCode(expiredId, '666666', 'password-reset'), null, 'expired OTP is rejected');

  const identities = { ip: `ip-${suffix}`, account: `account-${suffix}`, combination: `combo-${suffix}` };
  for (const [scope, identity] of Object.entries(identities)) authStateKeys.push(redisKeys.authState(stateKey(`login-attempts-${scope}`, identity)));
  const configuredLoginLimit = Number(config.get('authentication.failedLoginLimit')) || 5;
  for (let attempt = 0; attempt < configuredLoginLimit; attempt++) await loginThrottle(identities, true);
  const lockedLogin = await loginThrottle(identities);
  assert.equal(lockedLogin.allowed, false, 'layered login limiter locks after configured failed attempts');
  assert.ok(lockedLogin.retryAfter >= 1, 'login lockout returns the stored remaining TTL');

  const actionIdentity = `action-${suffix}`;
  authStateKeys.push(redisKeys.authState(stateKey('test-action-throttle', actionIdentity)));
  assert.equal((await actionThrottle('test-action-throttle', actionIdentity, 2, 60_000)).allowed, true);
  assert.equal((await actionThrottle('test-action-throttle', actionIdentity, 2, 60_000)).allowed, true);
  const limitedAction = await actionThrottle('test-action-throttle', actionIdentity, 2, 60_000);
  assert.equal(limitedAction.allowed, false, 'action throttle enforces its fixed window');
  assert.ok(limitedAction.retryAfter >= 1, 'action throttle returns its stored remaining TTL');

  console.log('Redis service checks passed.');
} finally {
  if (redis.isReady) {
    for await (const keys of redis.scanIterator({ MATCH: `getafe:cache:test-${suffix}*`, COUNT: 50 })) cleanup.push(...(Array.isArray(keys) ? keys : [keys]));
  }
  if (cleanup.length) await redis.del(cleanup);
  if (challengeKeys.length) await redis.del(challengeKeys);
  if (authStateKeys.length) await redis.del(authStateKeys);
  await closeRedis();
  await closeConfigStore();
  await closeCloudSql();
}
