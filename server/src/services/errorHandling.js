import crypto from 'node:crypto'
import { getPostgresRuntime } from '../repositories/postgresRuntime.js'
import { id, now } from './identifiers.js'
import { dependencyStatus } from './dependencyFailures.js'

const SAFE_STATUS_CODES = new Set([400, 401, 403, 404, 405, 409, 413, 415, 422, 429, 500, 502, 503, 504])
const TECHNICAL_PATTERN = /(?:API_PROXY_[A-Z0-9_]+|ECONN(?:REFUSED|RESET)|ETIMEDOUT|EPIPE|ENETUNREACH|ENOTFOUND|EHOSTUNREACH|SQLSTATE|POSTGRES(?:QL)?|REDIS|S3|B2_|AZURE_|VITE|EXPRESS|JWT|stack(?:trace)?|node_modules|[A-Z]:\\|\/var\/|127\.0\.0\.1|localhost:\d+|\bport\s+\d+|internal(?:_|\s)error|database\s+(?:connection|error|unavailable)|connection\s+(?:refused|failed|timed out)|permission\s+required|cannot\s+grant|authorization\s*[:=]|cookie\s*[:=]|password\s*[:=]|secret\s*[:=])/i

const PUBLIC_CONTEXTS = {
  news: { title: 'News is temporarily unavailable', message: "We couldn't load the latest news right now. Please try again in a moment." },
  events: { title: 'Events are temporarily unavailable', message: "We couldn't load upcoming events right now. Please try again later." },
  weather: { title: 'Weather information is temporarily unavailable', message: "We couldn't retrieve the latest weather information." },
  services: { title: 'Services are temporarily unavailable', message: "We couldn't load municipal services right now." },
  form: { title: "We couldn't submit your request", message: 'Please try again in a moment.' },
  auth: { title: 'Sign-in is temporarily unavailable', message: "We couldn't complete sign-in right now. Please try again later." },
  unknown: { title: 'Something went wrong', message: "We couldn't complete your request right now. Please try again later." },
}

const STATUS_MESSAGES = {
  400: 'Request is invalid.',
  401: 'Authentication required.',
  403: 'Access denied.',
  404: 'Resource not found.',
  405: 'Method not allowed.',
  409: 'Request conflicts with the current state.',
  413: 'Request body is too large.',
  415: 'Unsupported request content type.',
  422: 'Request validation failed.',
  429: 'Too many requests. Please try again later.',
}

const contextFor = req => {
  const path = String(req?.path || req?.originalUrl || '').toLowerCase()
  if (path.includes('news')) return 'news'
  if (path.includes('event')) return 'events'
  if (path.includes('weather')) return 'weather'
  if (path.includes('service') || path.includes('barangay')) return 'services'
  if (path.includes('auth') || path.includes('login') || path.includes('password') || path.includes('mfa')) return 'auth'
  return 'unknown'
}

const serviceFor = req => {
  const path = String(req?.path || '').toLowerCase()
  if (path.includes('weather')) return 'Weather'
  if (path.includes('news')) return 'News'
  if (path.includes('event')) return 'Events'
  if (path.includes('media') || path.includes('storage') || path.includes('upload')) return 'Media and storage'
  if (path.includes('auth') || path.includes('password') || path.includes('mfa')) return 'Authentication'
  if (path.includes('admin')) return 'Admin API'
  if (path.includes('citizen') || path.includes('portal')) return 'Resident portal'
  return 'API'
}

const redact = value => String(value ?? '')
  .replace(/(authorization|cookie|set-cookie|password|passwd|secret|token|api[_-]?key|application[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
  .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
  .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '[REDACTED_ADDRESS]')
  .replace(/(?:postgres(?:ql)?|redis|mysql|mongodb):\/\/[^\s]+/gi, '[REDACTED_CONNECTION]')
  .slice(0, 20000)

const errorCodeFor = error => String(error?.code || error?.name || 'UNEXPECTED_ERROR').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 120)
const errorMessageFor = error => redact(error?.safeMessage || error?.message || 'Unexpected server error.')
const stackFor = error => redact(error?.stack || errorMessageFor(error))
const referenceId = () => `ERR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
const fingerprintFor = ({ error, req, service }) => crypto.createHash('sha256')
  .update([errorCodeFor(error), service, req?.method || 'GET', req?.path || '/', stackFor(error).split('\n').slice(0, 3).join('\n')].join('|'))
  .digest('hex')

export const isTechnicalError = value => TECHNICAL_PATTERN.test(String(value || ''))

export function safeStatusFor(error, fallback = 503) {
  const status = Number(error?.status || error?.statusCode)
  return SAFE_STATUS_CODES.has(status) ? status : fallback
}

export function publicMessageFor(error, context = 'unknown', status = 503) {
  if (status >= 400 && status < 500 && !isTechnicalError(error?.publicMessage || '') && error?.publicMessage) return String(error.publicMessage)
  if (status >= 400 && status < 500) return STATUS_MESSAGES[status] || 'Request could not be completed.'
  return PUBLIC_CONTEXTS[context]?.message || PUBLIC_CONTEXTS.unknown.message
}

export async function recordDiagnosticError({ req, error, status, context = contextFor(req), service = serviceFor(req), publicMessage, referenceId: suppliedReferenceId } = {}) {
  const timestamp = now()
  const code = errorCodeFor(error)
  const fingerprint = fingerprintFor({ error, req, service })
  const values = {
    fingerprint,
    referenceId: suppliedReferenceId || referenceId(),
    firstSeen: timestamp,
    lastSeen: timestamp,
    service,
    route: String(req?.path || req?.originalUrl || '/').split('?')[0].slice(0, 1000),
    method: String(req?.method || 'GET').slice(0, 16),
    status: Number(status) || 503,
    internalCode: code,
    technicalMessage: errorMessageFor(error),
    stackTrace: stackFor(error),
    upstreamDependency: redact(error?.upstream || error?.cause?.name || ''),
    applicationVersion: process.env.npm_package_version || 'unknown',
    environment: process.env.NODE_ENV || 'development',
    requestId: String(req?.requestId || '').slice(0, 160) || null,
    userId: String(req?.admin?.id || req?.resident?.id || '').slice(0, 255) || null,
    context: JSON.stringify({ context, publicMessage: publicMessage || publicMessageFor(error, context, status) }),
  }
  try {
    const db = await getPostgresRuntime('database')
    const retentionDays = Math.max(30, Math.min(3650, Number(process.env.ERROR_LOG_RETENTION_DAYS) || 90))
    const retentionCutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
    await db.prepare("DELETE FROM system_error_groups WHERE state='resolved' AND last_seen < ?").run(retentionCutoff)
    const existing = await db.prepare('SELECT reference_id FROM system_error_groups WHERE fingerprint=?').get(values.fingerprint)
    if (existing) {
      await db.prepare(`UPDATE system_error_groups
        SET last_seen=?, occurrence_count=occurrence_count+1, status=?, internal_code=?, technical_message=?, stack_trace=?, upstream_dependency=?, request_id=?, user_id=?, context_json=?, updated_at=?
        WHERE fingerprint=?`).run(values.lastSeen, values.status, values.internalCode, values.technicalMessage, values.stackTrace, values.upstreamDependency || null, values.requestId, values.userId, values.context, values.lastSeen, values.fingerprint)
      return existing.reference_id
    }
    try {
      await db.prepare(`INSERT INTO system_error_groups
        (id, reference_id, fingerprint, first_seen, last_seen, occurrence_count, state, service, route, method, status, internal_code, technical_message, stack_trace, upstream_dependency, application_version, environment, request_id, user_id, context_json, created_at, updated_at)
        VALUES (?,?,?,?,?,1,'open',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id(), values.referenceId, values.fingerprint, values.firstSeen, values.lastSeen, values.service, values.route, values.method, values.status,
        values.internalCode, values.technicalMessage, values.stackTrace, values.upstreamDependency || null, values.applicationVersion, values.environment,
        values.requestId, values.userId, values.context, values.firstSeen, values.lastSeen,
      )
      return values.referenceId
    } catch (insertError) {
      if (!/duplicate|unique/i.test(String(insertError?.message || ''))) throw insertError
      return (await db.prepare('SELECT reference_id FROM system_error_groups WHERE fingerprint=?').get(values.fingerprint))?.reference_id || values.referenceId
    }
  } catch (storageError) {
    // The diagnostic store can be the dependency that failed. Keep the public
    // contract safe and leave a redacted operator record in process logs.
    console.error(JSON.stringify({ event: 'diagnostic_error_record_failed', reference_id: values.referenceId, code, status: values.status, route: values.route, storage_error: redact(storageError?.message) }))
    console.error(JSON.stringify({ event: 'api_error', reference_id: values.referenceId, request_id: values.requestId, code, status: values.status, route: values.route, message: values.technicalMessage }))
    return values.referenceId
  }
}

export async function sendPublicError(res, req, error, options = {}) {
  const status = safeStatusFor(error, options.status || dependencyStatus(error))
  const context = options.context || contextFor(req)
  const publicMessage = options.message || publicMessageFor(error, context, status)
  const reference = await recordDiagnosticError({ req, error, status, context, service: options.service, publicMessage })
  const type = status === 502 || status === 503 || status === 504 ? 'SERVICE_UNAVAILABLE' : status >= 500 ? 'SERVER_ERROR' : 'REQUEST_ERROR'
  return res.status(status).json({ error: { type, message: publicMessage, referenceId: reference } })
}

export function installResponseSanitizer(app) {
  app.use((req, res, next) => {
    const originalJson = res.json.bind(res)
    res.json = body => {
      if (body && typeof body === 'object' && body.error && !res.locals.allowDiagnosticResponse) {
        const raw = typeof body.error === 'string' ? body.error : body.error?.message
        if (isTechnicalError(raw) || body.stack || body.debug || body.internalError) {
          const safeError = new Error(raw || 'Unexpected server error.')
          safeError.code = body.error?.code || body.code || 'UNSAFE_API_ERROR'
          const status = safeStatusFor({ status: res.statusCode }, 503)
          const context = contextFor(req)
          const reference = referenceId()
          void recordDiagnosticError({ req, error: safeError, status, context, publicMessage: publicMessageFor(safeError, context, status), referenceId: reference })
          return originalJson({ error: { type: status >= 500 ? 'SERVICE_UNAVAILABLE' : 'REQUEST_ERROR', message: publicMessageFor(safeError, context, status), referenceId: reference } })
        }
        if (body.error && typeof body.error === 'object') {
          const cleaned = { ...body }
          cleaned.error = {
            type: body.error.type || 'REQUEST_ERROR',
            message: isTechnicalError(body.error.message) ? publicMessageFor(new Error(body.error.message), contextFor(req), res.statusCode) : String(body.error.message || 'The request could not be completed.'),
            ...(body.error.referenceId ? { referenceId: body.error.referenceId } : {}),
          }
          delete cleaned.stack
          delete cleaned.debug
          delete cleaned.internalError
          return originalJson(cleaned)
        }
        return originalJson(body)
      }
      return originalJson(body)
    }
    next()
  })
}

export { contextFor, redact as redactDiagnostic }
