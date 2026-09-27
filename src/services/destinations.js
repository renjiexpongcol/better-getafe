import { useCallback, useEffect, useState } from 'react'
export async function destinationRequest(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GetafeCitizenPortal', ...options.headers } })
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) { const error = new Error(data?.error || 'Destination information is unavailable.'); error.status = response.status; throw error }
  if (response.status !== 204 && (!data || typeof data !== 'object')) throw new Error('Destination information is unavailable.')
  return data
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
