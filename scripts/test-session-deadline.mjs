import test from 'node:test'
import assert from 'node:assert/strict'
import { sessionDeadline, sessionWarningMinutes, sessionWarningStartsAt, formatSessionCountdown } from '../packages/auth-client/src/sessionDeadline.js'
import { validate } from '../server/src/config/defaults.js'
import { resolveApiRoutePolicy } from '../server/src/services/apiRoutePolicy.js'
import { ConfigService } from '../server/src/config/ConfigService.js'
import { sessionIdleDeadline, evaluateSessionIdlePolicy } from '../server/src/services/sessionRegistry.js'
import { sessionWarningVisible, sessionMaximumWarningVisible, shouldSendActivityUpdate, nextSessionDeadline } from '../packages/auth-client/src/sessionDeadlineState.js'

test('session warning defaults to five minutes and is capped below the idle timeout', () => {
  assert.equal(sessionWarningMinutes(30), 5)
  assert.equal(sessionWarningMinutes(60, 45), 30)
  assert.equal(sessionWarningMinutes(5), 4)
  assert.equal(sessionWarningMinutes(2), 1)
})

test('the effective session deadline is the earlier idle or absolute expiry', () => {
  assert.equal(sessionDeadline({ lastActivityAt: 1_000, idleMinutes: 20, absoluteExpiresAt: 2_000_000 }), 1_201_000)
  assert.equal(sessionDeadline({ lastActivityAt: 1_000, idleMinutes: 20, absoluteExpiresAt: 500_000 }), 500_000)
})

test('server idle deadline remains separate from the absolute session deadline', () => {
  assert.equal(sessionIdleDeadline(1_000, 20), 1_201_000)
  assert.ok(sessionIdleDeadline(1_000, 20) > 100_000)
})

test('a 20 minute idle deadline with a 5 minute warning opens after 15 minutes idle', () => {
  const loginAt = 1_000
  const deadline = sessionDeadline({ lastActivityAt: loginAt, idleMinutes: 20, absoluteExpiresAt: 5_000_000 })
  assert.equal(sessionWarningStartsAt(deadline, 5), loginAt + 15 * 60_000)
})

test('countdown is derived from the deadline and formats at zero', () => {
  assert.equal(formatSessionCountdown(65_000, 0), '01:05')
  assert.equal(formatSessionCountdown(500, 0), '00:01')
  assert.equal(formatSessionCountdown(0, 0), '00:00')
})

test('session warning waits for initialization and for the configured warning window', () => {
  const deadline = 1_200_000
  assert.equal(sessionWarningVisible({ lastActivityAt: 0, initialized: false, hasSession: true, expiresAt: deadline, warningMinutes: 5, now: deadline - 60_000 }), false)
  assert.equal(sessionWarningVisible({ lastActivityAt: 0, initialized: true, hasSession: true, expiresAt: deadline, warningMinutes: 5, now: deadline - 6 * 60_000 }), false)
  assert.equal(sessionWarningVisible({ lastActivityAt: 0, initialized: true, hasSession: true, expiresAt: deadline, warningMinutes: 5, now: deadline - 5 * 60_000 }), true)
})

test('older responses cannot move a live session deadline backwards, while a new session starts cleanly', () => {
  const renewed = 2_000_000
  assert.equal(nextSessionDeadline(renewed, renewed - 60_000), renewed)
  assert.equal(nextSessionDeadline(null, 1_000_000), 1_000_000)
})

test('an approaching absolute limit uses a separate notice while the idle warning stays closed', () => {
  const now = 1_000_000
  assert.equal(sessionWarningVisible({ lastActivityAt: 0, initialized: true, hasSession: true, expiresAt: now + 20 * 60_000, warningMinutes: 5, now }), false)
  assert.equal(sessionMaximumWarningVisible({ lastActivityAt: 0, initialized: true, hasSession: true, expiresAt: now + 4 * 60_000, warningMinutes: 5, now }), true)
})

test('only visible user input triggers a throttled activity update', () => {
  assert.equal(shouldSendActivityUpdate({ eventType: 'keydown', isTrusted: true, visible: true, lastSentAt: 0, now: 1_000 }), true)
  assert.equal(shouldSendActivityUpdate({ eventType: 'wheel', isTrusted: true, visible: true, lastSentAt: 1_000, now: 20_000 }), false)
  assert.equal(shouldSendActivityUpdate({ eventType: 'keydown', isTrusted: true, visible: false, lastSentAt: 1_000, now: 40_000 }), false)
  assert.equal(shouldSendActivityUpdate({ eventType: 'focus', isTrusted: true, visible: true, lastSentAt: 1_000, now: 40_000 }), false)
  assert.equal(shouldSendActivityUpdate({ eventType: 'keydown', isTrusted: false, visible: true, lastSentAt: 1_000, now: 40_000 }), false)
  assert.equal(shouldSendActivityUpdate({ eventType: 'keydown', isTrusted: true, visible: true, lastSentAt: 1_000, now: 31_000 }), true)
})

test('configuration rejects warnings that are not shorter than the idle timeout', () => {
  assert.doesNotThrow(() => validate({ 'authentication.sessionIdleMinutes': 20, 'authentication.sessionWarningMinutes': 5 }))
  assert.throws(() => validate({ 'authentication.sessionIdleMinutes': 5, 'authentication.sessionWarningMinutes': 5 }), /shorter than the session idle timeout/)
})

test('the resolver shortens its default warning for a five minute idle timeout', async () => {
  const config = new ConfigService({ provider: {}, secrets: { open: async value => value }, env: { AUTH_SESSION_IDLE_MINUTES: '5' } })
  const resolved = await config.resolve({})
  assert.equal(resolved.values['authentication.sessionIdleMinutes'], 5)
  assert.equal(resolved.values['authentication.sessionWarningMinutes'], 4)
})

test('concurrent session policy defaults to multiple sessions and validates supported global policies', async () => {
  const config = new ConfigService({ provider: {}, secrets: { open: async value => value }, env: {} })
  const resolved = await config.resolve({})
  assert.equal(resolved.values['authentication.concurrentSessionPolicy'], 'allow_multiple')
  assert.doesNotThrow(() => validate({ 'authentication.concurrentSessionPolicy': 'single_active' }))
  assert.throws(() => validate({ 'authentication.concurrentSessionPolicy': 'unlimited' }), /Invalid Concurrent sessions/)
})

test('session renewal is an authenticated, CSRF protected mutation', () => {
  const policy = resolveApiRoutePolicy('POST', '/api/auth/renew')
  assert.equal(policy.access, 'SESSION')
  assert.equal(policy.csrf, 'cookie token + origin')
  assert.equal(resolveApiRoutePolicy('GET', '/api/auth/renew').methodAllowed, false)
})

test('warning follows the authoritative deadline and opens at the configured lead time', () => {
  const loginAt = 1_000_000
  const deadline = loginAt + 5 * 60_000
  const session = { initialized: true, hasSession: true, expiresAt: deadline, warningMinutes: 4 }
  assert.equal(sessionWarningVisible({ ...session, now: loginAt, lastActivityAt: loginAt }), false)
  assert.equal(sessionWarningVisible({ ...session, now: loginAt + 60_000, lastActivityAt: loginAt + 60_000 }), true)
  assert.equal(sessionWarningVisible({ ...session, now: loginAt + 60_000, lastActivityAt: loginAt + 60_000, expiresAt: deadline + 60_000 }), false)
  assert.equal(sessionMaximumWarningVisible({ ...session, now: deadline - 4 * 60_000 }), true)
})

test('passive checks do not renew inactivity and explicit renewal cannot revive expiry', () => {
  const metadata = { lastActivityAt: 1000, idleTimeoutEnabled: true }
  const policy = { enabled: true, idleMinutes: 5 }
  assert.equal(evaluateSessionIdlePolicy(metadata, policy, { now: 2000 }).lastActivityAt, 1000)
  assert.equal(evaluateSessionIdlePolicy(metadata, policy, { now: 2000, touch: true }).expiresAt, 302000)
  assert.equal(evaluateSessionIdlePolicy(metadata, policy, { now: 301000, touch: true }).expired, true)
})

test('inactivity can be disabled without an idle deadline, and re-enabling starts a fresh window', () => {
  const metadata = { lastActivityAt: 1000, idleTimeoutEnabled: true }
  const disabled = evaluateSessionIdlePolicy(metadata, { enabled: false, idleMinutes: 30 }, { now: 2000000 })
  assert.equal(disabled.expired, false)
  assert.equal(disabled.expiresAt, null)
  const enabled = evaluateSessionIdlePolicy(disabled, { enabled: true, idleMinutes: 15 }, { now: 3000000 })
  assert.equal(enabled.expiresAt, 3900000)
  assert.equal(enabled.changed, true)
})

test('turning inactivity off retains saved durations and hides only the editing controls', async () => {
  const config = new ConfigService({ provider: {}, secrets: { open: async value => value }, env: {} })
  const snapshot = await config.resolve({ 'authentication.sessionIdleEnabled': false, 'authentication.sessionIdleMinutes': 15, 'authentication.sessionWarningMinutes': 2 })
  config.values = snapshot.values
  assert.equal(config.get('authentication.sessionIdleMinutes'), 15)
  assert.equal(config.get('authentication.sessionWarningMinutes'), 2)
  assert.deepEqual(config.visiblePatch({ 'authentication.sessionIdleEnabled': false, 'authentication.sessionIdleMinutes': 60 }), { 'authentication.sessionIdleEnabled': false })
})
