import { normalizePublicError } from './publicError.js'
import { isPublicApiRequest } from './securitySurfaces.js'

export const apiPath = path => {
  const value = String(path)
  if (/^(?:[a-z]+:)?\/\//i.test(value)) throw new Error('API requests must use a same-origin path.')
  return value.startsWith('/api/') ? value : '/api' + (value.startsWith('/') ? value : '/' + value)
}
const categoryFor = status => ({ 0: 'NETWORK_UNAVAILABLE', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 429: 'RATE_LIMITED' })[status] || (status >= 500 ? 'SERVER_ERROR' : 'VALIDATION_ERROR')
export class ApiRequestError extends Error {
  constructor(message, status = 0, body = {}, retryAfter = 0) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.body = body
    this.category = categoryFor(status)
    this.retryAfter = retryAfter
    this.code = body?.code
    this.references = body?.references
    this.referenceId = body?.error?.referenceId || body?.referenceId
  }
}
export async function apiFetch(path, options = {}) {
  const { timeoutMs = 15000, startupSensitive = false, ...rest } = options
  const readOnly = ['GET', 'HEAD'].includes(String(rest.method || 'GET').toUpperCase())
  const attempts = readOnly ? (startupSensitive ? 4 : 3) : 1
  const publicRequest = isPublicApiRequest(apiPath(path), rest.method || 'GET')
  for (let attempt = 0; attempt < attempts; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs)
    const signal = rest.signal ? AbortSignal.any([rest.signal, timeout]) : timeout
    let response, failure
    try {
    const headers = new Headers({ Accept: 'application/json', 'X-Requested-With': 'GetafeCitizenPortal', ...rest.headers })
    if (publicRequest) headers.delete('Authorization')
    response = await fetch(apiPath(path), { ...rest, credentials: publicRequest ? 'omit' : rest.credentials || 'include', signal, headers })
    } catch (error) {
      if (rest.signal?.aborted) throw error
      failure = new ApiRequestError("The server couldn't be reached. Try again.")
    }
    const retryable = failure || (startupSensitive && [502, 503, 504].includes(response.status))
    if (!retryable || attempt === attempts - 1) {
      if (failure) throw failure
      return response
    }
    const after = response?.headers.get('Retry-After')
    const seconds = after && Number(after)
    const afterMs = after ? (Number.isFinite(seconds) ? seconds * 1000 : Math.max(0, Date.parse(after) - Date.now()) || 0) : 0
    // A long server cooldown exceeds this short startup recovery window.
    // Stop instead of retrying sooner than the server requested.
    if (afterMs > 30000) return response
    const delay = Math.min(30000, Math.max(afterMs, (startupSensitive ? 2000 : 250) * 2 ** attempt))
    await response?.body?.cancel().catch(() => {})
    await new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(rest.signal.reason) }
      const timer = setTimeout(() => { rest.signal?.removeEventListener('abort', abort); resolve() }, delay)
      if (rest.signal?.aborted) abort()
      else rest.signal?.addEventListener('abort', abort, { once: true })
    })
  }
}
export async function requestJson(path, options = {}) {
  const { errorContext = 'unknown', ...rest } = options
  const response = await apiFetch(path, { ...rest, headers: { 'Content-Type': 'application/json', ...rest.headers } })
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const seconds = Number(response.headers.get('Retry-After')) || Number(body?.retryAfter) || 0
    const safe = normalizePublicError({ status: response.status, body, retryAfter: seconds }, errorContext)
    throw new ApiRequestError(safe.message, response.status, body, seconds)
  }
  if (response.status !== 204 && (body === null || typeof body !== 'object')) throw new ApiRequestError('The server returned an unavailable response. Try again.', 502)
  return body
}
