import { createContext, useContext, useEffect, useState } from 'react'
import { cachedRequest, readCached } from '../services/requestCache'
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
  const reload = (force = false) => cachedRequest(cacheKey, async () => {
    const response = await fetch('/api/public/config', { cache: 'no-store' })
    if (!response.ok) throw new Error('Configuration unavailable')
    return response.json()
  }, { ...cacheOptions, persist: publicCacheEnabled(), force: force || !publicCacheEnabled() }).then(body => { if (active) setValues(current => JSON.stringify(current) === JSON.stringify(body) ? current : body) }).catch(() => {}).finally(() => { if (active) setReady(true) })
  reload()
  const refresh = () => { if (document.visibilityState === 'visible') reload() }
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
