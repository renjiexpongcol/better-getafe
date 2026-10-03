import crypto from 'node:crypto'
import { setStorageClientFactoryForTests, setStoragePresignerForTests } from '../server/src/services/storage.js'
import redis from '../server/src/infrastructure/redis/redisClient.js'
import { redisKeys } from '../server/src/infrastructure/redis/redisKeys.js'
import { consumeState, putState, stateKey } from '../server/src/services/authState.js'
import { verificationCodeDigest } from '../server/src/services/authSecurity.js'
let failUploads = false
setStorageClientFactoryForTests(() => ({ send: async command => {
  if (failUploads && command.constructor.name === 'PutObjectCommand') throw Object.assign(new Error('Isolated storage failure'), { code: 'ECONNRESET' })
  if (command.constructor.name === 'GetBucketAclCommand') return { Owner: { ID: 'test-owner' }, Grants: [{ Grantee: { Type: 'CanonicalUser', ID: 'test-owner' }, Permission: 'FULL_CONTROL' }] }
  return {}
}, destroy() {} }))
setStoragePresignerForTests(async () => '/test-media.jpg')
process.on('message', async ({ id, action, user }) => {
  try {
    if (action === 'storage-failure') { failUploads = Boolean(user.enabled); process.send({ id, ok: true }); return }
    if (action === 'cleanup') {
      await consumeState(stateKey('verified', user.id))
      await consumeState(stateKey('passwordAge', user.id))
      process.send({ id, ok: true }); return
    }
    if (action === 'session') {
      const timestamp = Date.now(), sid = crypto.randomUUID(), kind = user.role === 'resident' ? 'portal' : 'cms'
      const payload = Buffer.from(JSON.stringify({ id: user.id, role: user.role, kind, sid, iat: timestamp, exp: timestamp + 600000 })).toString('base64url')
      const secret = process.env.AUTH_SESSION_SECRET || process.env.CMS_SESSION_SECRET || process.env.SESSION_SECRET || 'change-this-local-development-session-secret'
      const token = `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('base64url')}`
      await redis.set(redisKeys.session(sid), JSON.stringify({ userId: user.id, kind, role: user.role, lastActivityAt: timestamp, expiresAt: timestamp + 600000 }), { EX: 600 })
      process.send({ id, token }); return
    }
    const challengeId = crypto.randomBytes(24).toString('hex')
    await putState(stateKey('challenge', challengeId), { digest: verificationCodeDigest(challengeId, '123456'), purpose: action === 'login' ? 'login' : 'password-reset', payload: { id: user.id, kind: 'portal', remember: false }, attempts: 0, expiresAt: Date.now() + 600000 }, 600000)
    process.send({ id, challengeId })
  } catch (error) { process.send({ id, error: error.message }) }
})
await import('../server/index.js')
