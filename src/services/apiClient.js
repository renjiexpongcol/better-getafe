import { cachedJson } from './requestCache'

const publicHeaders = { Accept: 'application/json', 'X-Requested-With': 'GetafeCitizenPortal' }

const apiPath = path => String(path).startsWith('/api/') ? String(path) : '/api' + (String(path).startsWith('/') ? String(path) : '/' + String(path))

export function apiJson(path, options = {}) {
  const { headers, ...rest } = options
  return cachedJson(apiPath(path), {
    ...rest,
    headers: { ...publicHeaders, ...(headers || {}) },
  })
}

export function publicApi(path, options = {}) {
  return apiJson(path, { cacheTtl: 300000, persist: true, ...options })
}
