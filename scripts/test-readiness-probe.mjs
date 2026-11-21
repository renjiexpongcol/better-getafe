import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { probeBackendReadiness } from './readiness-probe.mjs'
import { evaluateDependencies } from '../server/src/services/startupDiagnostics.js'

test('initializing, healthy, degraded and unavailable states preserve required-service readiness', async () => {
  const required = { name: 'CMS_DB', required: true, status: 'healthy' }
  assert.equal(evaluateDependencies([required], false).status, 'initializing')
  assert.equal(evaluateDependencies([required]).status, 'healthy')
  assert.equal(evaluateDependencies([required, { name: 'MEDIA_STORAGE', required: false, status: 'degraded' }]).status, 'degraded')
  assert.equal(evaluateDependencies([{ ...required, status: 'unhealthy' }]).status, 'unavailable')
  for (const status of ['initializing', 'unavailable']) {
    const result = await probeBackendReadiness(5173, 5000, async () => Response.json({ service: 'better-getafe', ready: false, status }, { status: 503 }))
    assert.equal(result.status, status)
    assert.equal(result.ready, false)
  }
})

test('readiness probe allows a healthy handler to finish its database checks', async t => {
  const server = createServer((_req, res) => {
    setTimeout(() => {
      if (!res.destroyed) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ service: 'better-getafe', ready: true, status: 'healthy' }))
      }
    }, 1700)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))

  const previousBudgetResult = await probeBackendReadiness(server.address().port, 1500)
  assert.equal(previousBudgetResult.status, 'probe-timeout')
  const result = await probeBackendReadiness(server.address().port, 5000)
  assert.deepEqual(result, { ready: true, httpStatus: 200, status: 'healthy', dependencies: [] })
})

test('readiness probe reports HTTP-unready separately from transport timeouts', async t => {
  const server = createServer((_req, res) => {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ service: 'better-getafe', ready: false, status: 'unhealthy' }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))

  const result = await probeBackendReadiness(server.address().port)
  assert.deepEqual(result, { ready: false, httpStatus: 503, status: 'unhealthy', dependencies: [] })
})

test('only the portal can report ready and malformed responses retain their HTTP status', async () => {
  const probe = body => probeBackendReadiness(5173, 5000, async () => new Response(body))
  assert.equal((await probe(JSON.stringify({ ready: true }))).status, 'invalid-response')
  assert.deepEqual(await probe('<html>Unavailable</html>'), { ready: false, httpStatus: 200, status: 'invalid-response', dependencies: [] })
  const dependencies = [{ name: 'CMS_DB', status: 'healthy' }]
  const state = await probe(JSON.stringify({ service: 'better-getafe', ready: true, status: 'healthy', dependencies: [null, ...dependencies] }))
  assert.deepEqual(state, { ready: true, httpStatus: 200, status: 'healthy', dependencies })
})

test('the monitor distinguishes an HTTP dependency failure from a transport timeout', async () => {
  const dependencies = [{ name: 'CMS_DB', status: 'unhealthy' }]
  const failed = await probeBackendReadiness(5173, 5000, async () =>
    Response.json({ service: 'better-getafe', ready: false, status: 'unhealthy', dependencies }, { status: 503 }))
  assert.deepEqual(failed, { ready: false, httpStatus: 503, status: 'unhealthy', dependencies })
  const timeout = await probeBackendReadiness(5173, 5000, async () => { throw new DOMException('Timed out', 'TimeoutError') })
  assert.deepEqual(timeout, { ready: false, httpStatus: null, status: 'probe-timeout', dependencies: [] })
})
