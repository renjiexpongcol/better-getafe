export async function probeBackendReadiness(port, timeoutMs = 5000, request = fetch) {
  let response
  try {
    response = await request(`http://127.0.0.1:${port}/ready`, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' })
    const body = await response.json()
    if (body?.service !== 'better-getafe' || typeof body.ready !== 'boolean') {
      return { ready: false, httpStatus: response.status, status: 'invalid-response', dependencies: [] }
    }
    return {
      ready: response.ok && body.ready === true,
      httpStatus: response.status,
      status: body.status || 'unknown',
      dependencies: Array.isArray(body.dependencies) ? body.dependencies.filter(item => typeof item?.name === 'string' && typeof item.status === 'string') : [],
    }
  } catch (error) {
    const status = error.name === 'TimeoutError' ? 'probe-timeout' : response ? 'invalid-response' : 'unreachable'
    return { ready: false, httpStatus: response?.status ?? null, status, dependencies: [] }
  }
}
