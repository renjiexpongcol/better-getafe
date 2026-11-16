import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { readCached } from '../services/requestCache'
import { useLocation } from 'react-router-dom'
import { onDataChanged } from '../services/dataChanges'
import { routeRequest } from '../services/routeRequests'

const CitizenContext = createContext(null)
export function CitizenProvider({ children }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const key = `citizen:${user.id}:dashboard`
  const requestRef = useRef(0)
  const controllerRef = useRef(null)
  const [state, setState] = useState(() => {
    const data = readCached(key) || null
    return { data, error: '', loading: !data }
  })
  const load = useCallback(async (force = false, ownedController = null) => {
    const request = ++requestRef.current
    controllerRef.current?.abort()
    const controller = ownedController || new AbortController()
    controllerRef.current = controller
    setState(current => ({ ...current, loading: !current.data, error: '' }))
    try {
      const data = await routeRequest('/api/citizen/dashboard', { scope: `citizen:${user.id}`, signal: controller.signal, ttl: 60000, force })
      if (request === requestRef.current) setState({ data, error: '', loading: false })
    } catch (error) {
      if (request === requestRef.current) setState(current => ({ ...current, error: error.message, loading: false }))
    }
  }, [key])
  const reload = useCallback(() => load(true), [load])
  useEffect(() => {
    const controller = new AbortController()
    load(false, controller)
    return () => {
      ++requestRef.current
      controller.abort()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [load, pathname])
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') load(true) }
    const unsubscribe = onDataChanged(reload)
    const timer = setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    return () => { unsubscribe(); clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [load])
  return <CitizenContext.Provider value={{ ...state, reload }}>{children}</CitizenContext.Provider>
}
export const useCitizen = () => useContext(CitizenContext)
