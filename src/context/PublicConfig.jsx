import { createContext, useContext, useEffect, useState } from 'react'
import { cachedRequest, readCached } from '../services/requestCache'
import { requestJson } from '../services/apiTransport.js'
import { degradedPublicConfig } from '../services/homepagePresentation.js'
import { configureWebsiteAnalytics } from '../services/websiteAnalytics.js'
const cacheKey = 'public-config'
const cacheOptions = { ttl: 300000, persist: true }
const publicCacheEnabled = () => document.cookie.split(';').some(item => item.trim() === 'getafe_cache=on')
const initialConfig = () => publicCacheEnabled() ? readCached(cacheKey, cacheOptions) : undefined
const PublicConfig = createContext({ values: {}, ready: false })
export function PublicConfigProvider({ children, enabled = true }) {
 const [values, setValues] = useState(() => initialConfig() || {})
 const [ready, setReady] = useState(false)
 const [unavailable, setUnavailable] = useState(false)
 useEffect(() => {
  if (!enabled) return undefined
  let active = true
  let latestRequest = 0
  let lastAttempt = 0
  let startupFailed = false
  const reload = (force = false) => {
   lastAttempt = Date.now()
   const requestId = ++latestRequest
   // Bound the entire initial load, including retries and response parsing.
   // A stalled request must reach the recovery screen rather than block routing.
   return cachedRequest(cacheKey, () => requestJson('/api/public/config', { cache: 'no-store', timeoutMs: 3000, signal: AbortSignal.timeout(5000) }), { ...cacheOptions, persist: publicCacheEnabled(), force: force || !publicCacheEnabled(), coalesce: true })
    .then(body => {
      if (!active || requestId !== latestRequest) return
      configureWebsiteAnalytics(body?.['analytics.collectionEnabled'])
      setUnavailable(false)
      setValues(current => JSON.stringify(current) === JSON.stringify(body) ? current : body)
    })
    .catch(() => { if (active && requestId === latestRequest) { startupFailed = true; setUnavailable(true); setValues(current => degradedPublicConfig(current)) } })
    .finally(() => { if (active && requestId === latestRequest) setReady(true) })
  }
  // Public settings can change in another tab or on another application
  // instance, so do not let a persisted browser cache mask the latest value.
  reload(true)
  const refresh = () => { if (document.visibilityState === 'visible' && Date.now() - lastAttempt >= (startupFailed ? 30000 : 60000)) reload(true) }
  const timer = setInterval(refresh, 30000)
  window.addEventListener('focus', refresh)
  const changed = () => { reload(true) }
  window.addEventListener('configuration-changed', changed)
  return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('configuration-changed', changed) }
 }, [enabled])
 useEffect(() => {
  if (values['general.language']) document.documentElement.lang = values['general.language']
  if (values['general.favicon']) { let icon = document.querySelector('link[rel="icon"]'); if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon) } icon.href = values['general.favicon'] }
 }, [values])
 return <PublicConfig.Provider value={{ ...values, ready: !enabled || ready, unavailable: enabled && unavailable }}>{children}</PublicConfig.Provider>
}
export const usePublicConfig = () => useContext(PublicConfig)
