// Short-lived page data, never credentials. Private entries stay in memory.
const entries = new Map()
const pending = new Map()
const versions = new Map()
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

export function clearPrivateCache() {
  for (const key of new Set([...entries.keys(), ...pending.keys()])) {
    if (key.startsWith('citizen:')) invalidateCached(key)
  }
}

export function cachedRequest(key, fetcher, { ttl = 60000, force = false, persist = false } = {}) {
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
