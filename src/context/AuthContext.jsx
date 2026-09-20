import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { clearPrivateCache } from '../services/requestCache'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionUnavailable, setSessionUnavailable] = useState(false)
  const requestRef = useRef(0)
  const sessionRef = useRef({ promise: null, checkedAt: 0, user: null })

  const clearClientAuthState = useCallback(() => {
    clearPrivateCache()
    sessionRef.current = { promise: null, checkedAt: 0, user: null }
    // The current application uses an HttpOnly cookie, but clear any legacy or
    // future client-persisted auth state as part of the same logout boundary.
    for (const type of ['localStorage', 'sessionStorage']) {
      try {
        const storage = window[type]
        for (const key of Object.keys(storage)) {
          if (/(auth|session|token|user|profile|citizen)/i.test(key)) storage.removeItem(key)
        }
      } catch {
        // Storage may be disabled; the server cookie is still invalidated below.
      }
    }
    if ('caches' in window) window.caches.keys().then(keys => Promise.all(keys.map(key => window.caches.delete(key)))).catch(() => {})
  }, [])

  const validateSession = useCallback((force = false) => {
    if (sessionRef.current.promise) return sessionRef.current.promise
    if (!force && Date.now() - sessionRef.current.checkedAt < 30000) return Promise.resolve(sessionRef.current.user)
    const requestId = ++requestRef.current
    // Loading is only for the initial session check. Background checks run on
    // navigation and window focus; hiding the app here unmounts open dialogs.
    const promise = (async () => { try {
      // A server can briefly be unavailable while its database connection is
      // recovering. Retry those transient checks before treating a session as
      // absent; a 401/403 remains an immediate, definitive sign-out.
      let response, body
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store', headers: { 'X-Requested-With': 'GetafeCitizenPortal' } })
          body = await response.json().catch(() => ({}))
          if (response.status < 500 && response.status !== 429) break
        } catch {
          response = null
        }
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 180 * (attempt + 1)))
      }
      if (requestId !== requestRef.current) return null
      if (!response || response.status >= 500 || response.status === 429) {
        // Keep any known account in place. On a cold refresh, ProtectedRoute
        // shows a recovery state instead of incorrectly sending the user to
        // the sign-in screen while the server is still reachable only later.
        setSessionUnavailable(true)
        return sessionRef.current.user
      }
      const nextUser = response.ok ? body?.user || null : null
      setSessionUnavailable(false)
      if (!nextUser || sessionRef.current.user?.id !== nextUser.id) clearPrivateCache()
      sessionRef.current.user = nextUser
      sessionRef.current.checkedAt = Date.now()
      // Keep consumers mounted without refetching their data when the session
      // returns the same account. Still apply profile/role changes immediately.
      setUser(current => JSON.stringify(current) === JSON.stringify(nextUser) ? current : nextUser)
      return nextUser
    } catch {
      if (requestId === requestRef.current) setSessionUnavailable(true)
      return null
    } finally {
      if (requestId === requestRef.current) { sessionRef.current.promise = null; setLoading(false) }
    }
    })()
    sessionRef.current.promise = promise
    return promise
  }, [clearClientAuthState])

  useEffect(() => {
    validateSession()
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel('getafe-auth') : null
    const onRemoteLogout = event => {
      if (event.key === 'getafe-auth-logout' || event.data === 'logout') {
        ++requestRef.current
        clearClientAuthState()
        setUser(null)
        setLoading(false)
      }
    }
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') validateSession() }
    window.addEventListener('storage', onRemoteLogout)
    window.addEventListener('pageshow', validateSession)
    window.addEventListener('focus', validateSession)
    document.addEventListener('visibilitychange', onVisibilityChange)
    channel?.addEventListener('message', onRemoteLogout)
    return () => {
      window.removeEventListener('storage', onRemoteLogout)
      window.removeEventListener('pageshow', validateSession)
      window.removeEventListener('focus', validateSession)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      channel?.removeEventListener('message', onRemoteLogout)
      channel?.close()
    }
  }, [clearClientAuthState, validateSession])

  useEffect(() => {
    if (!sessionUnavailable) return undefined
    const retry = setTimeout(() => validateSession(true), 2000)
    return () => clearTimeout(retry)
  }, [sessionUnavailable, validateSession])

  const login = async (email, password, remember = false) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GetafeCitizenPortal' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, remember }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) return { ok: false, error: body.error || 'Invalid email or password.' }
      if (body.verificationRequired || body.passwordExpired || body.mfaRequired) return { ok: false, ...body }
      const session = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store', headers: { 'X-Requested-With': 'GetafeCitizenPortal' } })
      const current = await session.json().catch(() => ({}))
      if (!session.ok || !current.user) return { ok: false, error: 'The sign-in session could not be established. Please try again.' }
      ++requestRef.current
      clearClientAuthState()
      sessionRef.current = { promise: null, checkedAt: Date.now(), user: current.user }
      setSessionUnavailable(false)
      setUser(current.user)
      setLoading(false)
      return { ok: true, admin: current.admin === true }
    } catch {
      return { ok: false, error: 'The sign-in service is temporarily unavailable.' }
    }
  }

  const register = async (name, email, password, captchaToken) => {
    try {
      const response = await fetch('/api/portal-auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, captchaToken }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) return { ok: false, error: body.error || 'The account could not be created.' }
      if (body.verificationRequired) return { ok: false, ...body }
      const session = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store', headers: { 'X-Requested-With': 'GetafeCitizenPortal' } })
      const current = await session.json().catch(() => ({}))
      if (!session.ok || !current.user) return { ok: false, error: 'The sign-in session could not be established. Please try again.' }
      ++requestRef.current
      clearClientAuthState()
      sessionRef.current = { promise: null, checkedAt: Date.now(), user: current.user }
      setSessionUnavailable(false)
      setUser(current.user)
      setLoading(false)
      return { ok: true, setup: true }
    } catch {
      return { ok: false, error: 'The account service is temporarily unavailable.' }
    }
  }

  const logout = async () => {
    ++requestRef.current
    setUser(null)
    setSessionUnavailable(false)
    setLoading(false)
    clearClientAuthState()
    let response
    try {
      response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'X-Requested-With': 'GetafeCitizenPortal' },
      })
    } catch {
      await validateSession()
      return { ok: false, error: 'Could not complete sign out. Please check your connection and try again.' }
    }
    if (!response.ok) {
      await validateSession()
      return { ok: false, error: 'Could not complete sign out. Please try again.' }
    }
    try { window.localStorage.setItem('getafe-auth-logout', String(Date.now())) } catch {}
    try {
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('getafe-auth')
        channel.postMessage('logout')
        channel.close()
      }
    } catch {}
    return { ok: true }
  }

  const completeMfa = async (challengeId, code) => {
    try {
      const response = await fetch('/api/auth/mfa/verify', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GetafeCitizenPortal' }, body: JSON.stringify({ challengeId, code }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) return { ok: false, error: body.error || 'MFA verification failed.' }
      ++requestRef.current
      clearClientAuthState()
      sessionRef.current = { promise: null, checkedAt: Date.now(), user: body.user }
      setSessionUnavailable(false)
      setUser(body.user)
      setLoading(false)
      return { ok: true, recoveryCodeUsed: body.recoveryCodeUsed === true }
    } catch { return { ok: false, error: 'MFA verification is temporarily unavailable.' } }
  }

  return <AuthContext.Provider value={{ user, loading, sessionUnavailable, login, completeMfa, register, logout, validateSession }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
