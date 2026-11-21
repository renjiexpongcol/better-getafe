export function sessionTtlSeconds(expiresAt, now = Date.now()) {
  return Math.max(1, Math.ceil((Number(expiresAt) - now) / 1000))
}

export function sessionIdleDeadline(lastActivityAt, idleMinutes) {
  const deadline = Number(lastActivityAt) + Number(idleMinutes) * 60_000
  return Number.isFinite(deadline) ? deadline : null
}

// Check expiry before touching activity: a renewal cannot revive an expired
// session. Changing the enabled policy gives existing sessions a fresh window.
export function evaluateSessionIdlePolicy(metadata, { enabled = true, idleMinutes }, { touch = false, now = Date.now() } = {}) {
  const policyChanged = typeof metadata.idleTimeoutEnabled === 'boolean' && metadata.idleTimeoutEnabled !== enabled;
  const lastActivityAt = policyChanged ? now : Number(metadata.lastActivityAt);
  if (!Number.isFinite(lastActivityAt) || (enabled && now >= sessionIdleDeadline(lastActivityAt, idleMinutes))) {
    return { expired: true };
  }
  const nextActivityAt = touch ? now : lastActivityAt;
  return {
    expired: false, lastActivityAt: nextActivityAt, idleTimeoutEnabled: enabled,
    expiresAt: enabled ? sessionIdleDeadline(nextActivityAt, idleMinutes) : null,
    changed: touch || policyChanged || metadata.idleTimeoutEnabled !== enabled,
  };
}

export function assertSessionRegistryAvailable(ready, production = process.env.NODE_ENV === 'production') {
  if (production && !ready) {
    const error = new Error('Session registry is unavailable.')
    error.code = 'AUTH_SESSION_REGISTRY_UNAVAILABLE'
    throw error
  }
}

export async function extendRedisKeyExpiry(redis, key, seconds) {
  const ttl = Math.max(1, Math.trunc(Number(seconds) || 1))
  const result = await redis.eval(
    "local current=redis.call('TTL',KEYS[1]); local target=tonumber(ARGV[1]); if current<target then return redis.call('EXPIRE',KEYS[1],target) end; return 0",
    { keys: [key], arguments: [String(ttl)] },
  )
  return Number(result) === 1
}

const validateRedisSessionScript = `
local raw=redis.call('GET',KEYS[1])
if not raw then return {0,0} end
local metadata=cjson.decode(raw)
local now=tonumber(ARGV[1])
local enabled=ARGV[2]=='1'
local idleMinutes=tonumber(ARGV[3])
local touch=ARGV[4]=='1'
local recovered=tonumber(ARGV[5])
local previousEnabled=type(metadata.idleTimeoutEnabled)=='boolean'
local policyChanged=previousEnabled and metadata.idleTimeoutEnabled~=enabled
local lastActivityAt=tonumber(metadata.lastActivityAt)
if policyChanged then lastActivityAt=now end
local recoveredActivity=not policyChanged and recovered and recovered>lastActivityAt
if recoveredActivity then lastActivityAt=recovered end
if not lastActivityAt or (enabled and now>=lastActivityAt+idleMinutes*60000) then
  redis.call('DEL',KEYS[1])
  redis.call('SREM',KEYS[2],ARGV[6])
  redis.call('HDEL',KEYS[3],ARGV[6])
  return {0,0}
end
if touch then lastActivityAt=now end
metadata.lastActivityAt=lastActivityAt
metadata.idleTimeoutEnabled=enabled
if touch or policyChanged or not previousEnabled or recoveredActivity then
  redis.call('SET',KEYS[1],cjson.encode(metadata),'EX',tonumber(ARGV[7]))
end
local expiresAt=enabled and lastActivityAt+idleMinutes*60000 or 0
return {1,tostring(expiresAt),tostring(lastActivityAt)}
`

const registerRedisSessionScript = `
local ttl=tonumber(ARGV[2])
local policy=ARGV[4]
local revoked=0
redis.call('SET',KEYS[1],ARGV[1],'EX',ttl)
if policy=='single_active' then
  revoked=redis.call('SCARD',KEYS[2])
  local existing=redis.call('HGETALL',KEYS[3])
  for i=1,#existing,2 do
    if existing[i+1]~=KEYS[1] then redis.call('DEL',existing[i+1]) end
  end
  for i=4,#KEYS do redis.call('DEL',KEYS[i]) end
  redis.call('DEL',KEYS[2])
  redis.call('DEL',KEYS[3])
end
redis.call('SADD',KEYS[2],ARGV[3])
redis.call('HSET',KEYS[3],ARGV[3],KEYS[1])
local indexTtl=redis.call('TTL',KEYS[2])
if indexTtl<ttl then redis.call('EXPIRE',KEYS[2],ttl) end
local keyMapTtl=redis.call('TTL',KEYS[3])
if keyMapTtl<ttl then redis.call('EXPIRE',KEYS[3],ttl) end
return revoked
`

export function createSessionRegistry({ redis, redisKeys, isRedisReady, config, readState, putState, stateKey, developmentSessions = new Map(), environment = process.env.NODE_ENV, now = Date.now }) {
  const logSessionEvent = (event, requestId, session, reason) => console.info(JSON.stringify({
    event,
    request_id: requestId || null,
    session_kind: session?.kind || null,
    ...(reason ? { reason } : {}),
  }))
  const rememberDevelopmentSession = (sid, metadata) => {
    for (const [key, value] of developmentSessions) if (value.expiresAt <= now()) developmentSessions.delete(key)
    if (developmentSessions.size >= 1000 && !developmentSessions.has(sid)) developmentSessions.delete(developmentSessions.keys().next().value)
    developmentSessions.set(sid, metadata)
  }
  const registerSession = async (session, metadata, requestId) => {
    const policy = config.get('authentication.concurrentSessionPolicy') || 'allow_multiple'
    if (!['allow_multiple', 'single_active'].includes(policy)) throw new Error('Invalid concurrent session policy.')
    const registryReady = isRedisReady()
    try { assertSessionRegistryAvailable(registryReady, environment === 'production') }
    catch (error) {
      console.error(JSON.stringify({ event: 'session_creation_failed', request_id: requestId || null, session_kind: session.kind, reason: 'registry_unavailable' }))
      throw error
    }
    if (!registryReady) {
      let revoked = 0
      if (policy === 'single_active') {
        for (const [sid, value] of developmentSessions) {
          if (value.userId === session.id && value.kind === session.kind) {
            await putState(stateKey('revoked-session', sid), true, Math.max(1, Number(value.expiresAt) - now()))
            developmentSessions.delete(sid)
            revoked++
          }
        }
      }
      rememberDevelopmentSession(session.sid, metadata)
      if (revoked > 0) logSessionEvent('session_revoked', requestId, session, 'single_active_policy')
      return
    }
    const index = redisKeys.userSessions(session.kind, session.id)
    const sessionKey = redisKeys.session(session.sid)
    const keyMap = redisKeys.userSessionKeys(session.kind, session.id)
    try {
      const legacyKeys = policy === 'single_active'
        ? (await redis.sMembers(index)).map(sid => redisKeys.session(sid))
        : []
      const result = await redis.eval(registerRedisSessionScript, {
        keys: [sessionKey, index, keyMap, ...legacyKeys],
        arguments: [JSON.stringify(metadata), String(sessionTtlSeconds(session.exp, now())), session.sid, policy],
      })
      const revoked = Number(result)
      if (!Number.isInteger(revoked) || revoked < 0) throw new Error('Session registry did not confirm the write.')
      if (revoked > 0) logSessionEvent('session_revoked', requestId, session, 'single_active_policy')
    } catch (error) {
      console.error(JSON.stringify({ event: 'session_creation_failed', request_id: requestId || null, session_kind: session.kind, reason: 'registry_unavailable' }))
      const failure = new Error('Session registry is unavailable.')
      failure.code = 'AUTH_SESSION_REGISTRY_UNAVAILABLE'
      throw failure
    }
  }

  const tokenIsRevoked = async (session, { touch = false, requestId } = {}) => {
    if (!session) return false
    if (!session.sid) {
      if (touch) logSessionEvent('session_renewal_failed', requestId, session, 'missing_session_id')
      return true
    }
    if (touch) logSessionEvent('session_renewal_started', requestId, session)
    const registryReady = isRedisReady()
    try { assertSessionRegistryAvailable(registryReady, environment === 'production') }
    catch (error) {
      if (touch) logSessionEvent('session_renewal_failed', requestId, session, 'registry_unavailable')
      throw error
    }
    try {
      if (session.signature && await readState(stateKey('revoked-token', session.signature))) {
        logSessionEvent('session_revoked', requestId, session, 'revoked_token')
        if (touch) logSessionEvent('session_renewal_failed', requestId, session, 'revoked')
        return true
      }
      if (session.sid && await readState(stateKey('revoked-session', session.sid))) {
        logSessionEvent('session_revoked', requestId, session, 'revoked_session')
        if (touch) logSessionEvent('session_renewal_failed', requestId, session, 'revoked')
        return true
      }
    } catch (error) {
      if (touch) logSessionEvent('session_renewal_failed', requestId, session, 'registry_unavailable')
      throw error
    }
    const idlePolicy = { enabled: config.get('authentication.sessionIdleEnabled') !== false, idleMinutes: config.get('authentication.sessionIdleMinutes') }
    if (!registryReady) {
      const metadata = developmentSessions.get(session.sid) || { lastActivityAt: session.iat, expiresAt: session.exp }
      const idle = evaluateSessionIdlePolicy(metadata, idlePolicy, { touch, now: now() })
      if (idle.expired) {
        developmentSessions.delete(session.sid)
        await putState(stateKey('revoked-session', session.sid), true, Math.max(1, session.exp - now()))
        logSessionEvent('session_expired', requestId, session, 'idle_timeout')
        if (touch) logSessionEvent('session_renewal_failed', requestId, session, 'expired')
        return true
      }
      rememberDevelopmentSession(session.sid, { ...metadata, lastActivityAt: idle.lastActivityAt, idleTimeoutEnabled: idle.idleTimeoutEnabled })
      session.idleExpiresAt = idle.expiresAt
      if (touch) logSessionEvent('session_renewal_committed', requestId, session)
      return false
    }
    const key = redisKeys.session(session.sid)
    try {
      const local = environment !== 'production' ? developmentSessions.get(session.sid) : null
      const currentTime = now()
      const recoveredActivity = local?.expiresAt === session.exp && Number(local.lastActivityAt) > 0 ? Number(local.lastActivityAt) : 0
      const result = await redis.eval(validateRedisSessionScript, {
        keys: [key, redisKeys.userSessions(session.kind, session.id), redisKeys.userSessionKeys(session.kind, session.id)],
        arguments: [
          String(currentTime),
          idlePolicy.enabled ? '1' : '0',
          String(idlePolicy.idleMinutes),
          touch ? '1' : '0',
          String(recoveredActivity),
          String(session.sid),
          String(sessionTtlSeconds(session.exp, currentTime)),
        ],
      })
      if (!Array.isArray(result) || Number(result[0]) !== 1) {
        await putState(stateKey('revoked-session', session.sid), true, Math.max(1, session.exp - now()))
        logSessionEvent('session_expired', requestId, session, 'idle_timeout_or_missing_record')
        if (touch) logSessionEvent('session_renewal_failed', requestId, session, 'expired')
        return true
      }
      const expiresAt = Number(result[1])
      session.idleExpiresAt = Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null
      if (environment !== 'production') {
        const lastActivityAt = Number(result[2])
        rememberDevelopmentSession(session.sid, {
          ...local,
          userId: session.id,
          kind: session.kind,
          role: session.role,
          updatedAt: session.updatedAt,
          createdAt: session.iat,
          lastActivityAt,
          expiresAt: session.exp,
          idleTimeoutEnabled: idlePolicy.enabled,
        })
      }
      if (touch) logSessionEvent('session_renewal_committed', requestId, session)
      return false
    } catch {
      if (touch) logSessionEvent('session_renewal_failed', requestId, session, 'registry_unavailable')
      const error = new Error('Session registry is unavailable.')
      error.code = 'AUTH_SESSION_REGISTRY_UNAVAILABLE'
      throw error
    }
  }

  return { tokenIsRevoked, rememberDevelopmentSession, registerSession }
}
