// Short-lived page data, never credentials. Private entries stay in memory.
import { normalizePublicError } from './publicError.js'
import { apiFetch, ApiRequestError } from './apiTransport.js'
export { ApiRequestError } from './apiTransport.js'

const entries = new Map()
const pending = new Map()
const versions = new Map()
const retryCooldowns = new Map()
const storagePrefix = 'getafe-public-cache:'

export function readCached(key, { persist = false } = {}) {
  let entry = entries.get(key)
  if (!entry && persist) {
    try { entry = JSON.parse(sessionStorage.getItem(storagePrefix + key)) } catch { /* Storage can be disabled. */ }
  }
  if (!entry || entry.expires <= Date.now()) return undefined
  entries.set(key, entry)
  return entry.value
}

export function invalidateCached(key, { persist = false } = {}) {
  entries.delete(key)
  pending.delete(key)
  versions.set(key, (versions.get(key) || 0) + 1)
  if (persist) {
    try { sessionStorage.removeItem(storagePrefix + key) } catch { /* Storage can be disabled. */ }
  }
}

export function invalidateCachedPrefix(prefix) {
  const keys = new Set([...entries.keys(), ...pending.keys()])
  for (const key of keys) {
    if (key.startsWith(prefix)) invalidateCached(key)
  }
}

export function clearPrivateCache() {
  for (const key of new Set([...entries.keys(), ...pending.keys()])) {
    if (key.startsWith('citizen:') || key.startsWith('cms:')) invalidateCached(key)
  }
}

export function cachedRequest(key, fetcher, { ttl = 60000, force = false, persist = false, coalesce = false } = {}) {
  if (coalesce && pending.has(key)) return pending.get(key)
  if (force) invalidateCached(key, { persist })
  if (pending.has(key)) return pending.get(key)
  const value = readCached(key, { persist })
  if (value !== undefined) return Promise.resolve(value)
  const version = versions.get(key) || 0
  const request = Promise.resolve().then(fetcher).then(value => {
    // A request finishing after logout or a write must not repopulate the cache.
    if ((versions.get(key) || 0) === version) {
      const entry = { value, expires: Date.now() + ttl }
      entries.set(key, entry)
      if (persist) {
        try { sessionStorage.setItem(storagePrefix + key, JSON.stringify(entry)) } catch { /* Memory cache still works. */ }
      }
    }
    return value
  }).finally(() => { if (pending.get(key) === request) pending.delete(key) })
  pending.set(key, request)
  return request
}

export function retryAfterMilliseconds(response) {
  const value = response.headers.get('Retry-After')
  if (!value) return 0
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

async function fetchJsonWithBackoff(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  const readOnly = method === 'GET' || method === 'HEAD'
  const errorContext = options.errorContext || 'unknown'
  const maxAttempts = readOnly ? 3 : 1
  const requestOptions = { ...options }
  delete requestOptions.cacheTtl
  delete requestOptions.persist
  delete requestOptions.force
  delete requestOptions.errorContext

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const cooldown = retryCooldowns.get(url) || 0
    if (cooldown > Date.now()) await wait(cooldown - Date.now())
    let response
    try {
      response = await apiFetch(url, requestOptions)
    } catch (error) {
      if (requestOptions.signal?.aborted) throw error
      if (attempt < maxAttempts - 1) {
        await wait(Math.min(5_000, 250 * (2 ** attempt)))
        continue
      }
      throw error
    }
    const retryAfter = retryAfterMilliseconds(response)
    if (response.status === 429) {
      const fallback = Math.min(5000, 250 * (2 ** attempt))
      const delay = Math.max(retryAfter, fallback) + Math.floor(Math.random() * 125)
      retryCooldowns.set(url, Date.now() + delay)
      // A 429 is an explicit server-side back-pressure signal. Preserve the
      // cooldown for a later caller, but do not replay this request here: a
      // page load must not multiply the traffic the limiter is shedding.
    }
    const body = response.status === 204 ? null : await response.json().catch(() => ({}))
    if (!response.ok) {
      const publicError = normalizePublicError({ status: response.status, body, retryAfter: Math.ceil(retryAfter / 1000) }, errorContext)
      throw new ApiRequestError(publicError.message, response.status, body, publicError.retryAfter)
    }
    return body
  }
  throw new ApiRequestError('The service is temporarily unavailable.', 503)
}

export function cachedJson(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  const cacheable = method === 'GET' || method === 'HEAD'
  const key = 'http:' + method + ':' + url
  const { cacheTtl = 300000, persist = true, force = false } = options
  if (!cacheable) return fetchJsonWithBackoff(url, options)
  return cachedRequest(key, () => fetchJsonWithBackoff(url, options), { ttl: cacheTtl, persist, force })
}
