import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { citizenApi } from '../services/citizenData'
import { cachedRequest, readCached } from '../services/requestCache'
import { useLocation } from 'react-router-dom'

const CitizenContext = createContext(null)
export function CitizenProvider({ children }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const key = `citizen:${user.id}:dashboard`
  const requestRef = useRef(0)
  const [state, setState] = useState(() => {
    const data = readCached(key) || null
    return { data, error: '', loading: !data }
  })
  const load = useCallback(async (force = false) => {
    const request = ++requestRef.current
    setState(current => ({ ...current, loading: !current.data, error: '' }))
    try {
      const data = await cachedRequest(key, () => citizenApi('/dashboard'), { force })
      if (request === requestRef.current) setState({ data, error: '', loading: false })
    } catch (error) {
      if (request === requestRef.current) setState(current => ({ ...current, error: error.message, loading: false }))
    }
  }, [key])
  const reload = useCallback(() => load(true), [load])
  useEffect(() => { load(); return () => { ++requestRef.current } }, [load, pathname])
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') load() }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [load])
  return <CitizenContext.Provider value={{ ...state, reload }}>{children}</CitizenContext.Provider>
}
export const useCitizen = () => useContext(CitizenContext)
