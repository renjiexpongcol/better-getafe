import crypto from 'node:crypto'
const expectedCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE'])
const handled = new WeakSet()
const lastLog = new Map()
export const isHandledProxyError = error => error && handled.has(error)
export function proxyLogger(logger) {
  const report = logger.error.bind(logger)
  logger.error = (message, options) => { if (!isHandledProxyError(options?.error)) report(message, options) }
  return logger
}

export function handleProxyError(error, request, response) {
  if (expectedCodes.has(error?.code)) {
    handled.add(error)
    if (Date.now() - (lastLog.get(error.code) || 0) > 10000) {
      lastLog.set(error.code, Date.now())
      console.error(JSON.stringify({ event: 'proxy_unavailable', code: error.code, route: String(request?.url || '').split('?')[0] }))
    }
  }
  if (!response || response.destroyed || response.writableEnded) return
  // http-proxy may pass a raw socket for an upgrade, rather than ServerResponse.
  if (typeof response.writeHead !== 'function' || response.headersSent) {
    response.destroy()
    return
  }
  response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '2' })
  response.end(JSON.stringify({ error: {
    type: 'SERVICE_TEMPORARILY_UNAVAILABLE',
    message: 'The service is temporarily unavailable. Please try again shortly.',
    referenceId: `ERR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
  } }))
}
