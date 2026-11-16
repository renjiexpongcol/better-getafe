import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { probeBackendReadiness } from './readiness-probe.mjs'

test('readiness probe allows a healthy handler to finish its database checks', async t => {
  const server = createServer((_req, res) => {
    setTimeout(() => {
      if (!res.destroyed) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ready: true, status: 'healthy' }))
      }
    }, 1700)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))

  const previousBudgetResult = await probeBackendReadiness(server.address().port, 1500)
  assert.equal(previousBudgetResult.status, 'probe-timeout')
  const result = await probeBackendReadiness(server.address().port, 5000)
  assert.deepEqual(result, { ready: true, httpStatus: 200, status: 'healthy' })
})

test('readiness probe reports HTTP-unready separately from transport timeouts', async t => {
  const server = createServer((_req, res) => {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ready: false, status: 'unhealthy' }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))

  const result = await probeBackendReadiness(server.address().port)
  assert.deepEqual(result, { ready: false, httpStatus: 503, status: 'unhealthy' })
})
