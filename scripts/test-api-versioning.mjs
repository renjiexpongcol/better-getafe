import assert from 'node:assert/strict'
import test from 'node:test'
import { installApiVersionAliases } from '../server/src/services/apiVersioning.js'

test('v1 aliases normalize to the audited legacy route surface', () => {
  let middleware
  installApiVersionAliases({ use(handler) { middleware = handler } })
  const request = { url: '/api/v1/auth/me?source=resident' }
  let continued = false
  middleware(request, {}, () => { continued = true })
  assert.equal(request.url, '/api/auth/me?source=resident')
  assert.equal(request.apiRoutePath, '/api/auth/me')
  assert.equal(request.apiVersion, 'v1')
  assert.equal(continued, true)
})

test('non-versioned paths pass through unchanged', () => {
  let middleware
  installApiVersionAliases({ use(handler) { middleware = handler } })
  const request = { url: '/api/ready' }
  middleware(request, {}, () => {})
  assert.equal(request.url, '/api/ready')
  assert.equal(request.apiVersion, undefined)
})
