const TECHNICAL_ERROR_PATTERN = /(?:API_PROXY_[A-Z0-9_]+|ECONN(?:REFUSED|RESET)|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|SQLSTATE|POSTGRES(?:QL)?|REDIS|S3|B2_|AZURE_|VITE|EXPRESS|JWT|stack(?:trace)?|node_modules|\/var\/|[A-Z]:\\|127\.0\.0\.1|localhost:\d+|\bport\s+\d+|internal(?:_|\s)error|database\s+(?:connection|error|unavailable)|connection\s+(?:refused|failed|timed out)|permission\s+required|cannot\s+grant|secret|password|authorization|cookie)/i

const CONTEXTS = {
  news: { title: 'News is temporarily unavailable', message: "We couldn't load the latest news right now. Please try again in a moment." },
  events: { title: 'Events are temporarily unavailable', message: "We couldn't load upcoming events right now. Please try again later." },
  weather: { title: 'Weather information is temporarily unavailable', message: "We couldn't retrieve the latest weather information." },
  services: { title: 'Services are temporarily unavailable', message: "We couldn't load municipal services right now." },
  form: { title: "We couldn't submit your request", message: 'Please try again in a moment.' },
  auth: { title: 'Sign-in is temporarily unavailable', message: 'We couldn\'t complete sign-in right now. Please try again later.' },
  unknown: { title: 'Something went wrong', message: "We couldn't complete your request right now. Please try again later." },
}

const STATUS_CONTEXTS = {
  400: { title: 'Request could not be completed', message: 'Please check the information provided and try again.' },
  401: { title: 'Sign-in required', message: 'Please sign in and try again.' },
  403: { title: 'Access denied', message: "Your account doesn't have permission to complete this action." },
  404: { title: 'Not found', message: "We couldn't find what you requested." },
  409: { title: 'Request needs attention', message: 'This request conflicts with the current information. Refresh and try again.' },
  422: { title: 'Please check your information', message: 'Review the highlighted information and try again.' },
  429: { title: 'Please wait a moment', message: 'Too many attempts were made. Please try again shortly.' },
  502: { title: 'Service temporarily unavailable', message: 'This service is temporarily unavailable. Please try again later.' },
  503: { title: 'Service temporarily unavailable', message: 'This service is temporarily unavailable. Please try again later.' },
  504: { title: 'Service took too long to respond', message: 'Please try again later.' },
}

const bodyOf = error => error?.body || error?.response?.body || (error?.error ? error : null) || {}
const errorValue = body => body?.error?.message || body?.error || body?.message || ''
const statusOf = error => Number(error?.status || error?.response?.status || bodyOf(error)?.status || 0)
const referenceOf = error => bodyOf(error)?.error?.referenceId || bodyOf(error)?.referenceId || bodyOf(error)?.reference_id || error?.referenceId || ''

export function isTechnicalError(value) {
  return TECHNICAL_ERROR_PATTERN.test(String(value || ''))
}

export function errorContextForPath(path = '') {
  const value = String(path).toLowerCase()
  if (value.includes('news')) return 'news'
  if (value.includes('event')) return 'events'
  if (value.includes('weather')) return 'weather'
  if (value.includes('service') || value.includes('barangay')) return 'services'
  if (value.includes('auth') || value.includes('login') || value.includes('password') || value.includes('mfa')) return 'auth'
  return 'unknown'
}

export function normalizePublicError(error, context = 'unknown') {
  const status = statusOf(error)
  const body = bodyOf(error)
  const candidate = String(errorValue(body) || (error instanceof Error ? error.message : '') || '').trim()
  const statusContext = STATUS_CONTEXTS[status]
  const contextContext = CONTEXTS[context] || CONTEXTS.unknown
  const safeCandidate = candidate && !isTechnicalError(candidate) && candidate.length <= 220
  const useStatusMessage = status >= 400 && status < 500 && safeCandidate
  const copy = useStatusMessage ? { title: statusContext?.title || contextContext.title, message: candidate } : status >= 400 && status < 500 && statusContext ? statusContext : contextContext
  return {
    title: copy.title,
    message: copy.message,
    referenceId: referenceOf(error) || undefined,
    status: status || undefined,
    retryAfter: Number(error?.retryAfter || body?.retryAfter || 0) || 0,
  }
}

export function publicErrorMessage(error, context = 'unknown') {
  return normalizePublicError(error, context).message
}

export function publicErrorFromResponse(response, body, context = 'unknown') {
  return normalizePublicError({ status: response?.status, body, retryAfter: response?.headers?.get?.('Retry-After') }, context)
}

export function reportClientError(error, info) {
  if (typeof window === 'undefined') return
  const payload = {
    message: String(error?.message || 'Client rendering error').slice(0, 2000),
    stack: String(error?.stack || '').slice(0, 12000),
    componentStack: String(info?.componentStack || '').slice(0, 12000),
    route: `${window.location.pathname}${window.location.search}`.slice(0, 1000),
  }
  void fetch('/api/client-errors', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GetafeCitizenPortal' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {})
}

export { CONTEXTS }
