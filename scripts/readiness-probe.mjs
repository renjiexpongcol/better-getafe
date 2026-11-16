export async function probeBackendReadiness(port, timeoutMs = 5000) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/ready`, { signal: AbortSignal.timeout(timeoutMs) })
    const body = await response.json()
    return { ready: response.ok && body.ready === true, httpStatus: response.status, status: body.status || 'unknown' }
  } catch (error) {
    return { ready: false, httpStatus: null, status: error.name === 'TimeoutError' ? 'probe-timeout' : 'unreachable' }
  }
}
