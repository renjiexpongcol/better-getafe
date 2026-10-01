import { normalizePublicError } from './publicError.js'

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
  const { timeoutMs = 15000, ...rest } = options
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = rest.signal ? AbortSignal.any([rest.signal, timeout]) : timeout
  try {
    return await fetch(apiPath(path), { credentials: 'include', ...rest, signal, headers: { Accept: 'application/json', 'X-Requested-With': 'GetafeCitizenPortal', ...rest.headers } })
  } catch (error) {
    if (rest.signal?.aborted) throw error
    throw new ApiRequestError("The server couldn't be reached. Try again.")
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
