import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import http from 'node:http'
import net from 'node:net'
import { createLogger, createServer } from 'vite'
import { handleProxyError, proxyLogger } from './proxy-errors.mjs'
import { isBackendSource } from './backend-watch.mjs'
import { isDependencyFailure, dependencyStatus, installPoolErrorHandler } from '../server/src/services/dependencyFailures.js'
import { ConfigService } from '../server/src/config/ConfigService.js'
import { normalizePublicError } from '../src/services/publicError.js'
import { buildEmail } from '../server/src/services/email.js'
import { buildStorage, activateStorage, getObjectMetadata, setStorageClientFactoryForTests } from '../server/src/services/storage.js'

test('B2 client is retained through startup outage and later operations recover', async () => {
  let unavailable = true, destroyed = false
  const client = { async send() { if (unavailable) throw Object.assign(new Error('reset'), { code: 'ECONNRESET' }); return { ContentLength: 1 } }, destroy() { destroyed = true } }
  setStorageClientFactoryForTests(() => client)
  try {
    const resource = await buildStorage({ 'storage.provider': 'backblaze', 'storage.endpoint': 'https://s3.us-test-001.backblazeb2.com', 'storage.region': 'us-test-001', 'storage.bucket': 'test-bucket', 'storage.keyId': 'test', 'storage.applicationKey': 'test' }, { allowUnavailable: true })
    assert.equal(resource.degraded, true); assert.equal(destroyed, false)
    activateStorage(resource)
    unavailable = false
    assert.equal((await getObjectMetadata('test/probe.jpg')).ContentLength, 1)
    assert.equal(resource.degraded, false)
  } finally { activateStorage(null); setStorageClientFactoryForTests(null) }
})

test('SMTP transport survives startup connection loss and reconnects after recovery', async () => {
  let unavailable = true
  const sockets = new Set()
  const smtp = net.createServer(socket => {
    sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket))
    if (unavailable) { socket.destroy(); return }
    socket.write('220 test SMTP\r\n')
    socket.on('data', chunk => {
      for (const command of chunk.toString().split('\r\n').filter(Boolean)) {
        if (command.startsWith('QUIT')) socket.end('221 goodbye\r\n')
        else socket.write('250 OK\r\n')
      }
    })
  })
  await new Promise(resolve => smtp.listen(0, '127.0.0.1', resolve))
  let transport
  try {
    transport = await buildEmail({ 'email.enabled': true, 'email.smtpHost': '127.0.0.1', 'email.smtpPort': smtp.address().port, 'email.senderEmail': 'sender@example.test', 'email.security': 'none' }, { allowUnavailable: true })
    assert.equal(transport.degraded, true)
    unavailable = false
    assert.equal(await transport.verify(), true)
  } finally { transport?.close(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => smtp.close(resolve)) }
})

test('dependency failures are recoverable; configuration/schema/programming errors remain fatal', () => {
  for (const code of ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH', '57P01']) {
    const error = Object.assign(new Error('test'), { code })
    assert.equal(isDependencyFailure(error), true)
    assert.ok([503, 504].includes(dependencyStatus(error)))
  }
  for (const code of ['28P01', '3D000', '42P01']) assert.equal(isDependencyFailure({ code }), false)
  assert.equal(dependencyStatus(new TypeError('bug')), 500)
})

test('both idle pool errors and checked-out client errors are handled', () => {
  const pool = installPoolErrorHandler(new EventEmitter(), 'test')
  const client = new EventEmitter()
  pool.emit('connect', client)
  assert.doesNotThrow(() => pool.emit('error', Object.assign(new Error('reset'), { code: 'ECONNRESET' })))
  assert.doesNotThrow(() => client.emit('error', Object.assign(new Error('reset'), { code: 'ECONNRESET' })))
})

test('settings startup survives an outage and loads saved settings on recovery', async () => {
  let unavailable = true, activations = 0
  const service = new ConfigService({ env: {}, secrets: {},
    provider: { read: async () => { if (unavailable) throw Object.assign(new Error('reset'), { code: 'ECONNRESET' }); return { 'general.name': 'Recovered' } } },
    prepare: async () => ({ activate() { activations++ } }),
  })
  await service.load(true)
  assert.equal(service.available, false)
  unavailable = false
  await service.load(true)
  assert.equal(service.available, true)
  assert.equal(service.get('general.name'), 'Recovered')
  assert.equal(activations, 2)
})

test('runtime generated files are excluded while source changes remain watched', () => {
  for (const file of ['logs/request.log', 'uploads/a.js', 'tmp/a.js', 'storage/generated.js', 'settings.json', 'db.sqlite-wal', 'cache/a.mjs']) assert.equal(isBackendSource(file), false)
  assert.equal(isBackendSource('src/services/postgres.js'), true)
})

test('proxy handles ended responses, partially sent responses and upgrade sockets', () => {
  assert.doesNotThrow(() => handleProxyError({ code: 'EPIPE' }, {}, { writableEnded: true }))
  let destroyed = false
  handleProxyError({ code: 'ECONNRESET' }, {}, { destroy() { destroyed = true } })
  assert.equal(destroyed, true)
})

test('only handled network proxy failures suppress Vite duplicate logs; unexpected failures remain visible', () => {
  const messages = []
  const logger = proxyLogger({ error: message => messages.push(message) })
  const network = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })
  handleProxyError(network, {}, { writableEnded: true })
  logger.error('duplicate', { error: network })
  logger.error('unexpected bug', { error: new TypeError('bug') })
  assert.deepEqual(messages, ['unexpected bug'])
})

test('real Vite proxy returns controlled 503 on reset/refusal and recovers without restart', async () => {
  let reset = true
  const upstream = http.createServer((req, res) => { if (reset) req.socket.destroy(); else res.end('{"ok":true}') })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const target = `http://127.0.0.1:${upstream.address().port}`
  const vite = await createServer({ configFile: false, customLogger: proxyLogger(createLogger()), server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target, configure(proxy) { proxy.on('error', handleProxyError) } } } } })
  try {
    await vite.listen()
    const base = `http://127.0.0.1:${vite.httpServer.address().port}`
    const failed = await fetch(base + '/api/auth/login', { method: 'POST' })
    assert.equal(failed.status, 503)
    const body = await failed.json()
    assert.equal(body.error.type, 'SERVICE_TEMPORARILY_UNAVAILABLE')
    assert.equal(normalizePublicError({ status: 503, body }, 'auth').message, 'The service is temporarily unavailable. Please try again shortly.')
    assert.doesNotMatch(JSON.stringify(body), /ECONN|127\.0\.0\.1|stack/)
    reset = false
    assert.equal((await fetch(base + '/api/auth/login')).status, 200)
    await new Promise(resolve => upstream.close(resolve))
    assert.equal((await fetch(base + '/api/auth/login')).status, 503)
  } finally { await vite.close(); upstream.closeAllConnections(); upstream.close() }
})
