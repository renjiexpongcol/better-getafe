import { cachedJson } from './requestCache.js'
import { errorContextForPath } from './publicError.js'
import { apiPath } from './apiTransport.js'
import { readPreferences } from './cookiePreferences.js'
export { apiFetch, requestJson, ApiRequestError } from './apiTransport.js'

const publicHeaders = { Accept: 'application/json', 'X-Requested-With': 'GetafeCitizenPortal' }

export function apiJson(path, options = {}) {
  const { headers, errorContext, ...rest } = options
  return cachedJson(apiPath(path), {
    ...rest,
    errorContext: errorContext || errorContextForPath(path),
    headers: { ...publicHeaders, ...(headers || {}) },
  })
}

export function publicApi(path, options = {}) {
  if (/^\/(?:api\/)?news(?:\/[^/?]+)?(?:\?|$)/.test(path)) {
    path += `${path.includes('?') ? '&' : '?'}media=portal`
  }
  return apiJson(path, { cacheTtl: 300000, persist: readPreferences()?.publicCache === true, ...options })
}
