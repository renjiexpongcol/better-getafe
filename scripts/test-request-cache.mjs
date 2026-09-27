import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cachedJson, cachedRequest, readCached, clearPrivateCache, invalidateCached, invalidateCachedPrefix } from '../src/services/requestCache.js'

test('concurrent requests and repeat navigation share a single fetch', async () => {
  let calls = 0
  const fetcher = async () => { calls++; return { name: 'Citizen' } }
  const [first, second] = await Promise.all([cachedRequest('citizen:one', fetcher), cachedRequest('citizen:one', fetcher)])
  assert.equal(first, second)
  assert.equal(await cachedRequest('citizen:one', fetcher), first)
  assert.equal(calls, 1)
})

test('expired data and explicit refresh fetch new results', async () => {
  let calls = 0
  const fetcher = async () => ++calls
  await cachedRequest('expiry', fetcher, { ttl: -1 })
  assert.equal(await cachedRequest('expiry', fetcher), 2)
  assert.equal(await cachedRequest('expiry', fetcher, { force: true }), 3)
})

test('logout prevents a late response from restoring private data', async () => {
  let finish
  const request = cachedRequest('citizen:late', () => new Promise(resolve => { finish = resolve }))
  await Promise.resolve()
  clearPrivateCache()
  finish({ secret: 'old account' })
  await request
  assert.equal(readCached('citizen:late'), undefined)
  assert.equal(readCached('citizen:one'), undefined)
})

test('refresh cannot be overwritten by an older in-flight request', async () => {
  let finish
  const old = cachedRequest('race', () => new Promise(resolve => { finish = resolve }))
  await Promise.resolve()
  await cachedRequest('race', async () => 'new', { force: true })
  finish('old')
  await old
  assert.equal(readCached('race'), 'new')
})

test('failed requests are retryable and account keys stay isolated', async () => {
  await assert.rejects(cachedRequest('failure', async () => { throw new Error('offline') }))
  assert.equal(await cachedRequest('failure', async () => 'recovered'), 'recovered')
  await cachedRequest('citizen:A', async () => 'A')
  assert.equal(readCached('citizen:B'), undefined)
})

test('media query keys share concurrent work and invalidate after a write', async () => {
  let calls = 0
  const fetcher = async () => ({ items: [], pagination: { total: 0 } })
  await Promise.all([
    cachedRequest('cms:media:page=1&limit=20', async () => { calls++; return fetcher() }),
    cachedRequest('cms:media:page=1&limit=20', async () => { calls++; return fetcher() }),
  ])
  assert.equal(calls, 1)
  assert.deepEqual(readCached('cms:media:page=1&limit=20'), { items: [], pagination: { total: 0 } })
  invalidateCachedPrefix('cms:media:')
  assert.equal(readCached('cms:media:page=1&limit=20'), undefined)
})

test('public data survives memory eviction via tab storage and respects expiry', async () => {
  const values = new Map()
  globalThis.sessionStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const options = { persist: true }
  await cachedRequest('public-test', async () => 'config', options)
  invalidateCached('public-test')
  assert.equal(readCached('public-test', options), 'config')
  invalidateCached('public-test', options)
  assert.equal(readCached('public-test', options), undefined)
  delete globalThis.sessionStorage
})

test('read-only 429 responses are not replayed by the cache layer', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) return { status: 429, ok: false, headers: { get: name => name === 'Retry-After' ? '0' : null }, json: async () => ({ error: 'rate_limited' }) }
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ ok: true }) }
  }
  try {
    const results = await Promise.allSettled([
      cachedJson('/api/test-rate-retry', { cacheTtl: 1000, persist: false }),
      cachedJson('/api/test-rate-retry', { cacheTtl: 1000, persist: false }),
    ])
    assert.equal(results[0].status, 'rejected')
    assert.equal(results[1].status, 'rejected')
    assert.equal(results[0].reason.status, 429)
    assert.equal(results[1].reason.status, 429)
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})
