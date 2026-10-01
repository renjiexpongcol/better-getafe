import { useCallback, useEffect, useState } from 'react'
import { requestJson } from './apiTransport.js'
export async function destinationRequest(url, options = {}) {
  return requestJson(url, options)
}
export function useDestinations(url) {
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt(value => value + 1), [])
  const [state, setState] = useState({ url, loading: true })
  useEffect(() => {
    const controller = new AbortController()
    setState({ url, loading: true })
    destinationRequest(url, { signal: controller.signal }).then(data => setState({ url, data, loading: false })).catch(error => {
      if (error.name !== 'AbortError') { console.error('Discover Getafe could not load:', error.status || 'network error'); setState({ url, error, loading: false }) }
    })
    return () => controller.abort()
  }, [url, attempt])
  return { ...(state.url === url ? state : { loading: true }), retry }
}
