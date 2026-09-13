import { createContext, useContext, useEffect, useState } from 'react'
const PublicConfig = createContext({ values: {}, ready: false })
export function PublicConfigProvider({ children }) {
 const [values, setValues] = useState({})
 const [ready, setReady] = useState(false)
 useEffect(() => {
  let active = true
  const reload = () => fetch('/api/public/config', { cache: 'no-store' }).then(response => response.ok ? response.json() : {}).then(body => { if (active) setValues(body) }).catch(() => {}).finally(() => { if (active) setReady(true) })
  reload()
  const timer = setInterval(reload, 30000)
  window.addEventListener('configuration-changed', reload)
  return () => { active = false; clearInterval(timer); window.removeEventListener('configuration-changed', reload) }
 }, [])
 useEffect(() => {
  if (values['general.language']) document.documentElement.lang = values['general.language']
  if (values['general.favicon']) { let icon = document.querySelector('link[rel="icon"]'); if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon) } icon.href = values['general.favicon'] }
 }, [values])
 return <PublicConfig.Provider value={{ ...values, ready }}>{children}</PublicConfig.Provider>
}
export const usePublicConfig = () => useContext(PublicConfig)
