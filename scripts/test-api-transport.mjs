import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestJson, apiFetch } from '../src/services/apiTransport.js'
import { cachedRequest } from '../src/services/requestCache.js'
import { backendConnection, proxyRequestOrigin } from './backend-connection.mjs'

test('API target is consistent and rejects credential-bearing configuration', () => {
  assert.deepEqual(backendConnection({ PORT: '8090' }), { port: 8090, target: 'http://127.0.0.1:8090' })
  assert.equal(backendConnection({ PORT: '8080', BACKEND_PORT: '8090' }).port, 8090)
  assert.throws(() => backendConnection({ PORT: 'invalid' }))
  assert.throws(() => backendConnection({ VITE_BACKEND_URL: 'http://secret:password@host' }))
})
test('Vite proxy forwards legitimate same-origin preview requests while preserving hostile origins', () => {
  const request = { headers: { host: '127.0.0.1:4176', origin: 'http://127.0.0.1:4176' }, socket: {} }
  assert.equal(proxyRequestOrigin(request, 'http://127.0.0.1:8080'), 'http://127.0.0.1:8080')
  request.headers.origin = 'https://evil.example'
  assert.equal(proxyRequestOrigin(request, 'http://127.0.0.1:8080'), 'https://evil.example')
})
test('forced freshness can coalesce StrictMode/focus requests without abandoning the in-flight request', async () => {
  let calls = 0
  const options = { force: true, coalesce: true, persist: false }
  const responses = await Promise.all([cachedRequest('config-coalesce', async () => ++calls, options), cachedRequest('config-coalesce', async () => ++calls, options)])
  assert.deepEqual(responses, [1, 1]); assert.equal(calls, 1)
})
test('API uses relative paths, credentials, and safe normalized failures without automatic replay', async () => {
  const original = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = async (url, options) => {
      calls++; assert.equal(url, '/api/admin/departments'); assert.equal(options.credentials, 'include')
      throw new TypeError('Failed to fetch')
    }
    await assert.rejects(requestJson('/admin/departments'), error => error.category === 'NETWORK_UNAVAILABLE' && !error.message.includes('Failed to fetch'))
    assert.equal(calls, 1)
    for (const [status, category] of [[401,'UNAUTHORIZED'],[403,'FORBIDDEN'],[404,'NOT_FOUND'],[422,'VALIDATION_ERROR'],[429,'RATE_LIMITED'],[503,'SERVER_ERROR']]) {
      globalThis.fetch = async () => { calls++; return { status, ok: false, json: async () => ({ error: 'Unavailable' }), headers: { get: () => null } } }
      const before = calls
      await assert.rejects(requestJson('/admin/departments'), error => error.status === status && error.category === category)
      assert.equal(calls, before + 1)
    }
    await assert.rejects(apiFetch('http://localhost:8080/api/admin/departments'))
  } finally { globalThis.fetch = original }
})
