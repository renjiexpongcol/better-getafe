import { requestJson } from './apiTransport.js'
import { isPublicApiRequest } from './securitySurfaces.js'

// Each consumer owns a subscription, rather than the shared fetch signal.
// A deferred final release allows StrictMode's cleanup/remount to rejoin.
const pending = new Map()
const cache = new Map()
const abortReason = signal => signal?.reason || new DOMException('The request was aborted.', 'AbortError')
export function invalidatePendingRouteRequest(path, scope) {
  const key = `${scope}:${path}`
  const entry = pending.get(key)
  cache.delete(key)
  if (!entry) return
  pending.delete(key)
  clearTimeout(entry.timer)
  entry.controller.abort()
}
export function invalidateRouteRequestCache(prefix) {
  for (const key of cache.keys()) if (key.includes(':' + prefix)) cache.delete(key)
}
export function invalidateAllRouteRequests() {
  cache.clear()
  // Detach old generations; subscribers can finish, but stale reads cannot cache.
  pending.clear()
}
export function clearRouteRequests() {
  for (const key of cache.keys()) if (!key.startsWith('public:')) cache.delete(key)
  for (const [key, entry] of pending) {
    if (!key.startsWith('public:') && !key.startsWith('session:')) { pending.delete(key); entry.controller.abort() }
  }
}
export function routeRequest(path, options = {}) {
  const { signal, scope = 'public', ttl = 0, force = false, ...rest } = options
  if (signal?.aborted) return Promise.reject(abortReason(signal))
  const key = `${scope}:${path}`
  if (force) cache.delete(key)
  const cached = cache.get(key)
  if (ttl && cached?.expires > Date.now()) return Promise.resolve(cached.value)
  let entry = pending.get(key)
  if (!entry) {
    const controller = new AbortController()
    entry = { controller, users: 0, timer: null }
    entry.promise = Promise.resolve().then(() => requestJson(path, { ...rest, signal: controller.signal }))
      .then(value => {
        if (pending.get(key) === entry && ttl && (scope !== 'public' || isPublicApiRequest(path)) && !controller.signal.aborted) {
          if (cache.size > 200) cache.delete(cache.keys().next().value)
          cache.set(key, { value, expires: Date.now() + ttl })
        }
        return value
      })
      .finally(() => { if (pending.get(key) === entry) pending.delete(key) })
    pending.set(key, entry)
  }
  clearTimeout(entry.timer)
  entry.users++
  return new Promise((resolve, reject) => {
    let released = false
    const release = () => {
      if (released) return
      released = true
      signal?.removeEventListener('abort', abort)
      if (--entry.users === 0) entry.timer = setTimeout(() => {
        if (!entry.users && pending.get(key) === entry) { pending.delete(key); entry.controller.abort() }
      }, 0)
    }
    const abort = () => { release(); reject(abortReason(signal)) }
    signal?.addEventListener('abort', abort, { once: true })
    entry.promise.then(value => { if (!released) { release(); resolve(value) } }, error => { if (!released) { release(); reject(error) } })
  })
}
