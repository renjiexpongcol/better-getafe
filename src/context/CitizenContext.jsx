import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { citizenApi } from '../services/citizenData'

const CitizenContext = createContext(null)
export function CitizenProvider({ children }) {
  const { user } = useAuth()
  const [state, setState] = useState({ data: null, error: '', loading: true })
  const reload = useCallback(async () => {
    if (!user) return
    setState(current => ({ ...current, loading: true, error: '' }))
    try { const data = await citizenApi('/dashboard'); setState({ data, error: '', loading: false }) }
    catch (error) { setState({ data: null, error: error.message, loading: false }) }
  }, [user])
  useEffect(() => { reload() }, [reload])
  return <CitizenContext.Provider value={{ ...state, reload }}>{children}</CitizenContext.Provider>
}
export const useCitizen = () => useContext(CitizenContext)
