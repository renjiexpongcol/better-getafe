// Only allow-listed error metadata is logged. Never copy arbitrary driver
// messages, URLs, stacks, or configuration values into dependency reports.
export function dependencyReason(error) {
  const cause = error?.cause || error
  const code = /^[A-Z0-9_]{2,64}$/.test(cause?.code || '') ? cause.code : 'DEPENDENCY_ERROR'
  const status = Number(cause?.$metadata?.httpStatusCode || cause?.statusCode || cause?.status || 0)
  if (status === 401 || status === 403) return `${code}: Permission denied by dependency`
  const reasons = { ECONNREFUSED: 'Connection refused', ESOCKET: 'Connection failed', ENOTFOUND: 'Host not found', ETIMEDOUT: 'Connection timed out', ECONNRESET: 'Connection reset', '28P01': 'Database authentication failed', '28000': 'Database authorization failed', '3D000': 'Database not found', '42P01': 'Required database table is missing', '42703': 'Required database column is missing' }
  const address = /^[\d.:]+$/.test(cause?.address || '') ? ` ${cause.address}` : ''
  const port = Number.isInteger(cause?.port) ? `:${cause.port}` : ''
  return `${code}: ${reasons[code] || 'Dependency initialization/check failed'}${address}${port}`
}

export function evaluateDependencies(dependencies, initialized = true) {
  const requiredFailures = dependencies.filter(item => item.required && item.status !== 'healthy')
  const optionalFailures = dependencies.filter(item => !item.required && !['healthy', 'disabled'].includes(item.status))
  const ready = initialized && requiredFailures.length === 0
  return { ready, status: !initialized ? 'initializing' : !ready ? 'unhealthy' : optionalFailures.length ? 'degraded' : 'healthy', requiredFailures, optionalFailures }
}

export function reportStartup(dependencies, initialized = true, logger = console.info) {
  const result = evaluateDependencies(dependencies, initialized)
  for (const item of dependencies) logger(`[STARTUP][${item.name}] ${item.status === 'healthy' ? 'healthy' : item.status === 'disabled' ? 'optional/unconfigured' : 'FAILED'} Required: ${item.required}${item.reason ? ` Reason: ${item.reason}` : ''}`)
  logger(`[STARTUP 8/8] Initialization complete${result.ready ? result.status === 'degraded' ? ' with degraded dependencies' : '' : ' with required dependency failures'}`)
  logger(`[STARTUP] Application ${result.ready ? result.status.toUpperCase() : 'FAILED'}; API Ready: ${result.ready ? 'YES' : 'NO'}`)
  for (const item of result.requiredFailures) logger(`[STARTUP] Required failure: ${item.name}`)
  for (const item of result.optionalFailures) logger(`[STARTUP] Optional failure: ${item.name}`)
  return result
}
