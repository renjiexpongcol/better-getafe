import { isPublicApiRequest } from './securitySurfaces.js'
import { publishDataChanged } from './dataChanges.js'

// Keep direct callers and shared transport on the same cookie/CSRF contract.
// Obtain a fresh token for each mutation so login, reset and MFA rotations
// cannot leave a cached token bound to a previous credential.
export async function securityFetch(input, options = {}) {
  const pathname = typeof input === 'string' ? input.split('?')[0] : ''
  const method = String(options.method || 'GET').toUpperCase()
  if (!pathname.startsWith('/api/')) return globalThis.fetch(input, options)
  const publicRequest = isPublicApiRequest(pathname, method)
  const headers = new Headers(options.headers)
  if (publicRequest) headers.delete('Authorization')
  const credentials = publicRequest || headers.has('Authorization') ? 'omit' : options.credentials || 'include'
  if (!publicRequest && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && credentials !== 'omit' && !headers.has('Authorization')) {
    const response = await globalThis.fetch('/api/auth/csrf', { credentials, signal: options.signal, cache: 'no-store', headers: { Accept: 'application/json' } })
    if (!response.ok) return response
    const data = await response.json()
    if (typeof data.token !== 'string') throw new Error('Request protection is temporarily unavailable.')
    headers.set('X-CSRF-Token', data.token)
  }
  const response = await globalThis.fetch(input, { ...options, headers, credentials })
  if (response.ok && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !publicRequest) publishDataChanged()
  return response
}
