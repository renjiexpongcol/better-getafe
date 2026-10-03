import { setStorageClientFactoryForTests, setStoragePresignerForTests, getObjectMetadata } from '../server/src/services/storage.js'
import { pingRedis } from '../server/src/infrastructure/redis/redisClient.js'
import redis from '../server/src/infrastructure/redis/redisClient.js'
import { redisKeys } from '../server/src/infrastructure/redis/redisKeys.js'
import { startEmailWorker, stopEmailWorker } from '../server/src/services/redisInfrastructure.js'
import { config } from '../server/src/config/index.js'
const readSettings = config.provider.read.bind(config.provider)
config.provider.read = async () => {
  if (process.env.FIXTURE_STARTUP_DELAY_MS) await new Promise(resolve => setTimeout(resolve, Number(process.env.FIXTURE_STARTUP_DELAY_MS)))
  return readSettings()
}
let storageDown = false
setStoragePresignerForTests(async () => '/test-signed-media.jpg')
setStorageClientFactoryForTests(() => ({
  async send(command) {
    if (command.constructor.name === 'HeadBucketCommand' && process.env.FIXTURE_STORAGE_DELAY_MS) {
      console.log('[FIXTURE] Storage check pending')
      await new Promise(resolve => setTimeout(resolve, Number(process.env.FIXTURE_STORAGE_DELAY_MS)))
      console.log('[FIXTURE] Storage check completed')
    }
    if (storageDown) throw Object.assign(new Error('Injected storage outage'), { code: 'ECONNREFUSED' })
    return { ContentLength: 1, ContentType: 'image/jpeg' }
  }, destroy() {},
}))
process.on('message', async message => {
  try {
    if (message.action === 'storage') { storageDown = message.down; await getObjectMetadata('test/probe.jpg') }
    if (message.action === 'redis') {
      process.send({ id: message.id, ok: await pingRedis(), pid: process.pid }); return
    }
    if (message.action === 'email') {
      await stopEmailWorker()
      await redis.rPush(redisKeys.queue('email'), JSON.stringify({ id: 'failure-test', attempts: 4, message: {} }))
      startEmailWorker(async () => { throw Object.assign(new Error('Injected SMTP failure'), { code: 'ECONNRESET' }) }, async () => { throw Object.assign(new Error('Injected delivery bookkeeping failure'), { code: 'ECONNRESET' }) })
    }
    process.send({ id: message.id, ok: true, pid: process.pid })
  } catch (error) { process.send({ id: message.id, ok: false, code: error.code, pid: process.pid }) }
})
await import('../server/index.js')
