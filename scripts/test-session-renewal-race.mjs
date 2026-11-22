import assert from 'node:assert/strict'
import express from 'express'
import test from 'node:test'
import { createApiSecurityMiddleware } from '../server/src/services/apiRoutePolicy.js'
import { createSessionEndpoint } from '../server/src/services/sessionEndpoint.js'
import { createSessionRegistry } from '../server/src/services/sessionRegistry.js'

test('a session check that started before renewal cannot revoke the renewed session', async t => {
  const start = Date.now()
  let now = start
  let registryRecord = JSON.stringify({
    userId: 'resident-1',
    kind: 'portal',
    role: 'resident',
    updatedAt: 'version',
    createdAt: start - 300_000,
    lastActivityAt: start - 299_000,
    expiresAt: start + 3_600_000,
    idleTimeoutEnabled: true,
  })
  let releaseSessionRead
  let sessionReadStarted
  const waitingForSessionRead = new Promise(resolve => { sessionReadStarted = resolve })
  const blockedRead = new Promise(resolve => { releaseSessionRead = resolve })
  let shouldBlockRead = true
  const redis = {
    async get() { return registryRecord },
    async eval(_script, { arguments: args }) {
      if (shouldBlockRead) {
        shouldBlockRead = false
        sessionReadStarted()
        await blockedRead
      }
      if (!registryRecord) return [0, 0]
      const metadata = JSON.parse(registryRecord)
      const [timestamp, enabledValue, idleMinutesValue, touchValue, recoveredValue] = args
      const timestampMs = Number(timestamp)
      const enabled = enabledValue === '1'
      const idleMinutes = Number(idleMinutesValue)
      const touch = touchValue === '1'
      let lastActivityAt = Number(metadata.lastActivityAt)
      const policyChanged = typeof metadata.idleTimeoutEnabled === 'boolean' && metadata.idleTimeoutEnabled !== enabled
      if (policyChanged) lastActivityAt = timestampMs
      const recovered = Number(recoveredValue)
      if (!policyChanged && recovered > lastActivityAt) lastActivityAt = recovered
      if (!Number.isFinite(lastActivityAt) || (enabled && timestampMs >= lastActivityAt + idleMinutes * 60_000)) {
        registryRecord = null
        return [0, 0]
      }
      if (touch) lastActivityAt = timestampMs
      metadata.lastActivityAt = lastActivityAt
      metadata.idleTimeoutEnabled = enabled
      if (touch || policyChanged || !Object.hasOwn(metadata, 'idleTimeoutEnabled') || recovered > Number(metadata.lastActivityAt)) {
        registryRecord = JSON.stringify(metadata)
      }
      return [1, String(enabled ? lastActivityAt + idleMinutes * 60_000 : 0), String(lastActivityAt)]
    },
  }
  const redisKeys = {
    session: id => `session:${id}`,
    userSessions: (kind, id) => `user-sessions:${kind}:${id}`,
    userSessionKeys: (kind, id) => `session-keys:${kind}:${id}`,
  }
  const revoked = new Set()
  const { tokenIsRevoked } = createSessionRegistry({
    redis,
    redisKeys,
    isRedisReady: () => true,
    config: { get: key => ({
      'authentication.sessionIdleEnabled': true,
      'authentication.sessionIdleMinutes': 5,
      'authentication.sessionWarningMinutes': 1,
    })[key] },
    readState: async key => revoked.has(key),
    putState: async key => revoked.add(key),
    stateKey: (type, value) => `${type}:${value}`,
    environment: 'production',
    now: () => now,
  })
  const session = {
    id: 'resident-1',
    sid: 'session-1',
    signature: 'signature-1',
    kind: 'portal',
    role: 'resident',
    updatedAt: 'version',
    iat: start - 300_000,
    exp: start + 3_600_000,
  }
  const config = { get: key => ({
    'advanced.authDebug': false,
    'authentication.sessionIdleEnabled': true,
    'authentication.sessionIdleMinutes': 5,
    'authentication.sessionWarningMinutes': 1,
  })[key] }
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { if (req.body === undefined) req.body = {}; next() })
  app.use('/api', createApiSecurityMiddleware({
    authenticate: () => ({ ...session }),
    isRevoked: tokenIsRevoked,
    validateAccount: async () => true,
  }))
  app.get('/api/auth/me', createSessionEndpoint({
    authenticated: () => ({ ...session }),
    readCookies: () => ({ getafe_session: 'opaque' }),
    SESSION_COOKIE: 'getafe_session',
    config,
    clearSessionCookie: res => res.append('Set-Cookie', 'getafe_session=; Path=/api; Max-Age=0'),
    tokenIsRevoked,
    getCmsUserById: async () => null,
    getPortalUserById: async () => ({ id: session.id, name: 'Resident', role: 'resident', updated_at: 'version' }),
    sessionUpdatedAt: user => user.updated_at,
    effectiveAccessFor: async () => null,
    googleOnboarding: async () => ({}),
    logApiFailure: () => {},
  }))
  app.post('/api/auth/renew', (req, res) => {
    const current = req.apiSession
    if (!current || current.exp <= now || current.idleExpiresAt <= now) return res.status(401).json({ error: 'Your session has expired.' })
    res.json({ expiresAt: current.idleExpiresAt, absoluteExpiresAt: current.exp })
  })
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener))
  })
  t.after(() => {
    releaseSessionRead()
    return new Promise(resolve => server.close(resolve))
  })
  const base = `http://127.0.0.1:${server.address().port}`

  const pendingMe = fetch(`${base}/api/auth/me`, { headers: { Cookie: 'getafe_session=opaque' } })
  await waitingForSessionRead
  const renewal = await fetch(`${base}/api/auth/renew`, { method: 'POST', headers: { Cookie: 'getafe_session=opaque' } })
  assert.equal(renewal.status, 200)
  const renewalBody = await renewal.json()
  assert.equal(renewalBody.expiresAt, start + 300_000)

  now = start + 2_000
  releaseSessionRead()
  const me = await pendingMe
  assert.equal(me.status, 200, 'the earlier /me read must observe the committed renewed deadline')
  assert.notEqual(registryRecord, null, 'the renewed Redis record must remain available')
})

test('parallel renewals serialize on the current Redis deadline', async () => {
  const start = Date.now()
  const times = [start + 1_000, start + 2_000]
  let registryRecord = JSON.stringify({ lastActivityAt: start, idleTimeoutEnabled: true })
  const redis = {
    async eval(_script, { arguments: args }) {
      const [timestamp, enabledValue, idleMinutesValue, touchValue] = args
      const currentTime = Number(timestamp)
      const enabled = enabledValue === '1'
      const idleMinutes = Number(idleMinutesValue)
      const metadata = JSON.parse(registryRecord)
      if (enabled && currentTime >= metadata.lastActivityAt + idleMinutes * 60_000) {
        registryRecord = null
        return [0, 0]
      }
      if (touchValue === '1') metadata.lastActivityAt = currentTime
      metadata.idleTimeoutEnabled = enabled
      registryRecord = JSON.stringify(metadata)
      return [1, String(enabled ? metadata.lastActivityAt + idleMinutes * 60_000 : 0), String(metadata.lastActivityAt)]
    },
    async sRem() {},
    async del() { registryRecord = null },
  }
  const { tokenIsRevoked } = createSessionRegistry({
    redis,
    redisKeys: { session: id => `session:${id}`, userSessions: () => 'user-sessions', userSessionKeys: () => 'session-keys' },
    isRedisReady: () => true,
    config: { get: key => key === 'authentication.sessionIdleEnabled' ? true : 5 },
    readState: async () => false,
    putState: async () => {},
    stateKey: () => 'revoked',
    environment: 'production',
    now: () => times.shift(),
  })
  const session = { id: 'resident-1', sid: 'session-1', kind: 'portal', iat: start, exp: start + 3_600_000 }
  const results = await Promise.all([
    tokenIsRevoked({ ...session }, { touch: true }),
    tokenIsRevoked({ ...session }, { touch: true }),
  ])
  assert.deepEqual(results, [false, false])
  assert.equal(JSON.parse(registryRecord).lastActivityAt, start + 2_000)
})

test('session checks fail closed while Redis is down and validate the persisted session after recovery', async () => {
  const start = Date.now()
  let now = start
  let redisReady = false
  const developmentSessions = new Map()
  const revoked = new Set()
  let registryRecord = JSON.stringify({ lastActivityAt: start, idleTimeoutEnabled: true })
  const registry = createSessionRegistry({
    redis: { eval: async (_script, { arguments: args }) => {
      const [timestamp, enabledValue, idleMinutesValue, touchValue] = args
      const metadata = JSON.parse(registryRecord)
      const checkedAt = Number(timestamp)
      const enabled = enabledValue === '1'
      const lastActivityAt = touchValue === '1' ? checkedAt : metadata.lastActivityAt
      if (enabled && checkedAt >= lastActivityAt + Number(idleMinutesValue) * 60_000) return [0, 0]
      metadata.lastActivityAt = lastActivityAt
      registryRecord = JSON.stringify(metadata)
      return [1, String(enabled ? lastActivityAt + Number(idleMinutesValue) * 60_000 : 0), String(lastActivityAt)]
    } },
    redisKeys: { session: id => `session:${id}`, userSessions: () => 'user-sessions', userSessionKeys: () => 'session-keys' },
    isRedisReady: () => redisReady,
    config: { get: key => key === 'authentication.sessionIdleEnabled' ? true : 5 },
    readState: async key => revoked.has(key),
    putState: async key => revoked.add(key),
    stateKey: (type, id) => `${type}:${id}`,
    developmentSessions,
    environment: 'development',
    now: () => now,
  })
  const session = { id: 'resident-1', sid: 'session-fallback', signature: 'signature', kind: 'portal', role: 'resident', iat: start, exp: start + 3_600_000 }

  await assert.rejects(registry.tokenIsRevoked({ ...session }, { touch: true }), error => error.code === 'AUTH_SESSION_REGISTRY_UNAVAILABLE')
  assert.equal(developmentSessions.size, 0, 'session credentials are never accepted from an in-memory fallback')

  now = start + 30_000
  redisReady = true
  const afterRecovery = { ...session }
  assert.equal(await registry.tokenIsRevoked(afterRecovery), false)
  assert.equal(afterRecovery.idleExpiresAt, start + 5 * 60_000)

  now = start + 5 * 60_000
  assert.equal(await registry.tokenIsRevoked({ ...session }), true, 'the local idle deadline remains enforced after Redis recovers')
})

test('single-active sign-in atomically replaces prior sessions while multiple-session policy preserves them', async () => {
  const records = new Map()
  const indexes = new Map()
  const keyMaps = new Map()
  let policy = 'allow_multiple'
  const redisKeys = {
    session: sid => `session:${sid}`,
    userSessions: (kind, id) => `user-sessions:${kind}:${id}`,
    userSessionKeys: (kind, id) => `session-keys:${kind}:${id}`,
  }
  const redis = {
    async sMembers(key) { return [...(indexes.get(key) || [])] },
    async eval(_script, { keys, arguments: args }) {
      const [recordKey, indexKey, mapKey, ...legacyRecordKeys] = keys
      const [rawMetadata, , sid, requestedPolicy] = args
      const index = indexes.get(indexKey) || new Set()
      const keyMap = keyMaps.get(mapKey) || new Map()
      records.set(recordKey, JSON.parse(rawMetadata))
      let revoked = 0
      if (requestedPolicy === 'single_active') {
        revoked = index.size
        for (const previousRecordKey of keyMap.values()) records.delete(previousRecordKey)
        for (const previousRecordKey of legacyRecordKeys) records.delete(previousRecordKey)
        index.clear()
        keyMap.clear()
      }
      index.add(sid)
      keyMap.set(sid, recordKey)
      indexes.set(indexKey, index)
      keyMaps.set(mapKey, keyMap)
      return revoked
    },
  }
  const registry = createSessionRegistry({
    redis,
    redisKeys,
    isRedisReady: () => true,
    config: { get: key => key === 'authentication.concurrentSessionPolicy' ? policy : 30 },
    readState: async () => false,
    putState: async () => {},
    stateKey: () => 'revoked',
    environment: 'production',
  })
  const user = { id: 'resident-1', kind: 'portal', exp: Date.now() + 60_000 }
  const create = sid => registry.registerSession({ ...user, sid }, { userId: user.id, kind: user.kind, expiresAt: user.exp })

  await create('session-1')
  await create('session-2')
  assert.deepEqual([...indexes.get('user-sessions:portal:resident-1')], ['session-1', 'session-2'])
  assert.equal(records.size, 2)

  policy = 'single_active'
  await create('session-3')
  assert.deepEqual([...indexes.get('user-sessions:portal:resident-1')], ['session-3'])
  assert.deepEqual([...records.keys()], ['session:session-3'])
  assert.deepEqual([...keyMaps.get('session-keys:portal:resident-1').keys()], ['session-3'])
  await Promise.all([create('session-4'), create('session-5')])
  assert.equal(indexes.get('user-sessions:portal:resident-1').size, 1)
  assert.equal(records.size, 1)
})

test('session creation fails closed when Redis cannot persist the session', async () => {
  const registry = createSessionRegistry({
    redis: { sMembers: async () => [], eval: async () => { throw Error('private Redis detail') } },
    redisKeys: {
      session: sid => `session:${sid}`,
      userSessions: () => 'user-sessions',
      userSessionKeys: () => 'session-keys',
    },
    isRedisReady: () => true,
    config: { get: key => key === 'authentication.concurrentSessionPolicy' ? 'allow_multiple' : 30 },
    readState: async () => false,
    putState: async () => {},
    stateKey: () => 'revoked',
    environment: 'production',
  })
  await assert.rejects(
    registry.registerSession({ id: 'resident-1', sid: 'session-1', kind: 'portal', exp: Date.now() + 60_000 }, { userId: 'resident-1' }),
    /Session registry is unavailable/,
  )
})

test('Redis failure cannot produce a successful renewal response', async t => {
  const session = { id: 'resident-1', sid: 'session-1', kind: 'portal', role: 'resident', iat: Date.now(), exp: Date.now() + 60_000 }
  const { tokenIsRevoked } = createSessionRegistry({
    redis: { eval: async () => { throw Error('private Redis detail') } },
    redisKeys: { session: id => `session:${id}`, userSessions: () => 'user-sessions', userSessionKeys: () => 'session-keys' },
    isRedisReady: () => true,
    config: { get: key => key === 'authentication.sessionIdleEnabled' ? true : 5 },
    readState: async () => false,
    putState: async () => {},
    stateKey: () => 'revoked',
    environment: 'production',
  })
  const app = express()
  app.use(express.json())
  app.use('/api', createApiSecurityMiddleware({
    authenticate: () => ({ ...session }),
    isRevoked: tokenIsRevoked,
    validateAccount: async () => true,
  }))
  app.post('/api/auth/renew', (_req, res) => res.json({ ok: true }))
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener))
  })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/renew`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  assert.equal(response.status, 503)
  assert.doesNotMatch(await response.text(), /private Redis detail/)
})
