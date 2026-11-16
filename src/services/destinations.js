import { useCallback, useEffect, useState } from 'react'
import { requestJson } from './apiTransport.js'
import { cachedRequest } from './requestCache.js'
import {routeRequest} from './routeRequests.js'
import {isPublicApiRequest} from './securitySurfaces.js'
export async function destinationRequest(url, options = {}) {
  if (!options.method || options.method === 'GET') return routeRequest(url, {scope:isPublicApiRequest(url)?'public':'cms',...options})
  return requestJson(url, options)
}
export function useDestinations(url) {
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt(value => value + 1), [])
  const [state, setState] = useState({ url, loading: true })
  useEffect(() => {
    let active = true
    setState({ url, loading: true })
    cachedRequest(`destinations:${url}`, () => destinationRequest(url, { startupSensitive: true }), { ttl: 60000, force: attempt > 0, coalesce: true }).then(data => { if (active) setState({ url, data, loading: false }) }).catch(error => {
      if (active) setState({ url, error, loading: false })
    })
    return () => { active = false }
  }, [url, attempt])
  return { ...(state.url === url ? state : { loading: true }), retry }
}
