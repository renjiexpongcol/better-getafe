import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cachedJson, cachedRequest, readCached, clearPrivateCache, invalidateCached, invalidateCachedPrefix } from '../src/services/requestCache.js'
import { publicApi } from '../src/services/apiClient.js'
import { apiFetch } from '../src/services/apiTransport.js'

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
      cachedJson('/api/news?test=rate-retry', { cacheTtl: 1000, persist: false }),
      cachedJson('/api/news?test=rate-retry', { cacheTtl: 1000, persist: false }),
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

test('publicApi returns parsed JSON to content components', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    status: 200,
    ok: true,
    headers: { get: () => null },
    json: async () => ({ items: [{ id: 'published-update' }] }),
  })
  try {
    assert.deepEqual(await publicApi('/api/test-public-news-contract', { persist: false }), { items: [{ id: 'published-update' }] })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('network failures stop after three attempts and canceled requests are not replayed', async () => {
  const original = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = async () => { calls++; throw new TypeError('Failed to fetch') }
    await assert.rejects(cachedJson('/api/network-unavailable-test', { persist: false }), error => error.category === 'NETWORK_UNAVAILABLE')
    assert.equal(calls, 3)
    const controller = new AbortController(); controller.abort()
    calls = 0
    globalThis.fetch = async () => { calls++; throw new DOMException('Aborted', 'AbortError') }
    await assert.rejects(cachedJson('/api/canceled-test', { signal: controller.signal, persist: false }), error => error.name === 'AbortError')
    assert.equal(calls, 1)
  } finally { globalThis.fetch = original }
})

test('logout invalidates private CMS data', async () => {
  await cachedRequest('cms:media:logout-check', async () => ({ private: true }))
  clearPrivateCache()
  assert.equal(readCached('cms:media:logout-check'), undefined)
})

test('private JSON is fetched again across accounts while public reads discard credentials', async () => {
  const original = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = async (url, options) => {
      calls++
      if (url.startsWith('/api/news')) {
        assert.equal(options.credentials, 'omit')
        assert.equal(options.headers.has('Authorization'), false)
      } else assert.equal(options.credentials, 'include')
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ account: calls }) }
    }
    assert.deepEqual(await cachedJson('/api/auth/me'), { account: 1 })
    assert.deepEqual(await cachedJson('/api/auth/me'), { account: 2 })
    assert.equal(readCached('http:GET:/api/auth/me'), undefined)
    await cachedJson('/api/news?test=credential-isolation', { credentials: 'include', headers: { Authorization: 'Bearer private' }, persist: false })
    await cachedJson('/api/news?test=credential-isolation', { persist: false })
    assert.equal(calls, 3)
  } finally { globalThis.fetch = original }
})

test('mutations never retry even when marked startup sensitive', async () => {
  const original = globalThis.fetch
  try {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      let calls = 0
      globalThis.fetch = async () => { calls++; return new Response('{}', { status: 503, headers: { 'Retry-After': '2' } }) }
      assert.equal((await apiFetch('/api/auth/login', { method, startupSensitive: true })).status, 503)
      assert.equal(calls, 1)
      calls = 0
      globalThis.fetch = async () => { calls++; throw new TypeError('connection failed') }
      await assert.rejects(apiFetch('/api/auth/login', { method, startupSensitive: true }))
      assert.equal(calls, 1)
    }
  } finally { globalThis.fetch = original }
})
