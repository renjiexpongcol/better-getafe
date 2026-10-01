import { createContext, useContext, useEffect, useState } from 'react'
import { cachedRequest, readCached } from '../services/requestCache'
import { requestJson } from '../services/apiTransport.js'
const cacheKey = 'public-config'
const cacheOptions = { ttl: 300000, persist: true }
const publicCacheEnabled = () => !document.cookie.split(';').some(item => item.trim() === 'getafe_cache=off')
const initialConfig = () => publicCacheEnabled() ? readCached(cacheKey, cacheOptions) : undefined
const PublicConfig = createContext({ values: {}, ready: false })
export function PublicConfigProvider({ children }) {
 const [values, setValues] = useState(() => initialConfig() || {})
 const [ready, setReady] = useState(() => initialConfig() !== undefined)
 useEffect(() => {
  let active = true
  let latestRequest = 0
  const reload = (force = false) => {
   const requestId = ++latestRequest
   return cachedRequest(cacheKey, () => requestJson('/api/public/config', { cache: 'no-store' }), { ...cacheOptions, persist: publicCacheEnabled(), force: force || !publicCacheEnabled(), coalesce: true })
    .then(body => { if (active && requestId === latestRequest) setValues(current => JSON.stringify(current) === JSON.stringify(body) ? current : body) })
    .catch(() => {})
    .finally(() => { if (active && requestId === latestRequest) setReady(true) })
  }
  // Public settings can change in another tab or on another application
  // instance, so do not let a persisted browser cache mask the latest value.
  reload(true)
  const refresh = () => { if (document.visibilityState === 'visible') reload(true) }
  const changed = () => reload(true)
  const timer = setInterval(refresh, cacheOptions.ttl)
  window.addEventListener('focus', refresh)
  window.addEventListener('configuration-changed', changed)
  return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('configuration-changed', changed) }
 }, [])
 useEffect(() => {
  if (values['general.language']) document.documentElement.lang = values['general.language']
  if (values['general.favicon']) { let icon = document.querySelector('link[rel="icon"]'); if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon) } icon.href = values['general.favicon'] }
 }, [values])
 return <PublicConfig.Provider value={{ ...values, ready }}>{children}</PublicConfig.Provider>
}
export const usePublicConfig = () => useContext(PublicConfig)
