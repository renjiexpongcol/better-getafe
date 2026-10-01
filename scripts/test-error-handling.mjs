import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePublicError, isTechnicalError } from '../src/services/publicError.js'

test('technical API details become a contextual public message', () => {
  const result = normalizePublicError({ status: 503, body: { error: { message: 'API_PROXY_BACKEND_UNAVAILABLE', referenceId: 'ERR-8F4K2M' } } }, 'news')
  assert.equal(result.title, 'News is temporarily unavailable')
  assert.equal(result.message, "We couldn't load the latest news right now. Please try again in a moment.")
  assert.equal(result.referenceId, 'ERR-8F4K2M')
  assert.equal(isTechnicalError(result.message), false)
})

test('safe validation messages remain actionable', () => {
  const result = normalizePublicError({ status: 422, body: { error: 'Email address is required.' } }, 'form')
  assert.equal(result.message, 'Email address is required.')
})

test('network failures use a generic message', () => {
  const result = normalizePublicError(new TypeError('ECONNREFUSED 127.0.0.1:5432'), 'unknown')
  assert.equal(result.message, "We couldn't complete your request right now. Please try again later.")
  assert.equal(isTechnicalError(result.message), false)
})
