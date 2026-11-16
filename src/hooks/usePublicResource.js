import { useCallback, useEffect, useState } from 'react'
import { publicApi } from '../services/apiClient'
import { onDataChanged } from '../services/dataChanges'
import { invalidateCachedPrefix } from '../services/requestCache'
import { invalidateRouteRequestCache } from '../services/routeRequests'

// No business records are synthesized here. Callers choose their empty presentation.
export function usePublicResource(path, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: '' })
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => onDataChanged(reload), [reload])
  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    setState({ data: null, loading: true, error: '' })
    publicApi(path, { persist: false, force: true, coalesce: true })
      .then(data => { if (active) setState({ data, loading: false, error: '' }) })
      .catch(error => { if (active) setState({ data: null, loading: false, error: error.message || 'Information is temporarily unavailable.' }) })
    return () => { active = false }
  }, [path, revision, enabled])
  useEffect(() => {
    if (!enabled) return undefined
    const refresh = () => { if (document.visibilityState === 'visible') reload() }
    const timer = setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [enabled, reload])
  return { ...state, reload }
}
export function useBarangays() {
  const resource = usePublicResource('/barangays')
  return { ...resource, items: Array.isArray(resource.data) ? resource.data : [] }
}
export function usePublishedContent(key) {
  const resource = usePublicResource(`/public/content/${encodeURIComponent(key)}`)
  return { ...resource, content: resource.data?.item?.content || null }
}
export function useDataRevision() {
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') { invalidateCachedPrefix('http:GET:'); invalidateRouteRequestCache('/api/'); setRevision(value => value + 1) } }
    const unsubscribe = onDataChanged(refresh)
    const timer = setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    return () => { unsubscribe(); clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])
  return revision
}
