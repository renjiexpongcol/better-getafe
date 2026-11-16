import { onDataChanged } from '../services/dataChanges'
import { AUTH_ENDPOINTS, createAuthClient } from '@getafe/auth-client'
import { apiFetch } from '../services/apiTransport.js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { clearPrivateCache } from '../services/requestCache'
import { normalizePublicError } from '../services/publicError'
import { routeRequest, invalidatePendingRouteRequest } from '../services/routeRequests'
import { pendingReturnUrlKey } from '../authNavigation'
import { SessionTimeoutWarning } from '../components/SessionTimeoutWarning.jsx'

const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionUnavailable, setSessionUnavailable] = useState(false)
  const [signedOut, setSignedOut] = useState(false)
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null)
  const [warningMinutes, setWarningMinutes] = useState(5)
  const requestRef = useRef(0)
  const activityPingRef = useRef(0)
  const renewalRef = useRef(null)
  const publishedDeadlineRef = useRef(0)
  const sessionControllerRef = useRef(null)
  const sessionRef = useRef({ promise: null, checkedAt: 0, user: null })
  useEffect(() => () => {
    // Leaving the application drops only its in-memory state, not its cookie.
    ++requestRef.current
    sessionControllerRef.current?.abort()
    sessionRef.current = { promise: null, checkedAt: 0, user: null }
    clearPrivateCache()
  }, [])

  const clearClientAuthState = useCallback((preserveIntent = false) => {
    sessionControllerRef.current?.abort()
    invalidatePendingRouteRequest(AUTH_ENDPOINTS.session, 'session')
    clearPrivateCache()
    sessionRef.current = { promise: null, checkedAt: 0, user: null }
    // The current application uses an HttpOnly cookie, but clear any legacy or
    // future client-persisted auth state as part of the same logout boundary.
    for (const type of ['localStorage', 'sessionStorage']) {
      try {
        const storage = window[type]
        for (const key of Object.keys(storage)) {
          if (preserveIntent && type === 'sessionStorage' && key === pendingReturnUrlKey) continue
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
    const controller = new AbortController()
    sessionControllerRef.current = controller
    // Loading is only for the initial session check. Background checks run on
    // focus/visibility events; hiding the app here unmounts open dialogs.
    const promise = (async () => { try {
      // Transport owns bounded network retries. An unavailable backend keeps
      // the session in recovery state; a 401/403 remains definitive sign-out.
      let response, body
      try {
          body = await routeRequest(AUTH_ENDPOINTS.session, { scope: 'session', signal: controller.signal, credentials: 'include', cache: 'no-store' })
          response = { ok: true, status: 200 }
      } catch (error) {
          response = error.status ? { ok: false, status: error.status } : null
      }
      if (requestId !== requestRef.current) return null
      if (!response || response.status >= 500 || response.status === 429) {
        // Keep any known account in place. On a cold refresh, ProtectedRoute
        // shows a recovery state instead of incorrectly sending the user to
        // the sign-in screen while the server is still reachable only later.
        setSessionUnavailable(true)
        sessionRef.current.checkedAt = Date.now()
        return sessionRef.current.user
      }
      const nextUser = response.ok ? body?.user || null : null
      if (nextUser) setSignedOut(false)
      setSessionUnavailable(false)
      if (!nextUser || sessionRef.current.user?.id !== nextUser.id) clearPrivateCache()
      sessionRef.current.user = nextUser
      if (nextUser && body?.session?.expiresAt != null && Number.isFinite(Number(body.session.expiresAt))) setSessionExpiresAt(Number(body.session.expiresAt))
      if (nextUser && Number.isFinite(Number(body?.session?.warningMinutes))) setWarningMinutes(Number(body.session.warningMinutes))
      if (!nextUser) setSessionExpiresAt(null)
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
    // Visibility and focus notifications often arrive together. Let the
    // existing freshness window coalesce them into one session read.
    const refresh = () => { if (document.visibilityState === 'visible') validateSession() }
    const unsubscribe = onDataChanged(refresh)
    const timer = setInterval(refresh, 60000)
    return () => { unsubscribe(); clearInterval(timer) }
  }, [validateSession])

  useEffect(() => {
    validateSession()
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel('getafe-auth') : null
    const onRemoteLogout = event => {
      if (event.data?.type === 'deadline' && Number.isFinite(Number(event.data.expiresAt))) {
        publishedDeadlineRef.current = Number(event.data.expiresAt)
        setSessionExpiresAt(publishedDeadlineRef.current)
        return
      }
      if (event.data?.type === 'warning' && Number.isFinite(Number(event.data.minutes))) {
        setWarningMinutes(Math.max(1, Math.min(30, Number(event.data.minutes))))
        return
      }
      if (event.key === 'getafe-auth-deadline' && event.newValue) {
        try {
          const expiresAt = Number(JSON.parse(event.newValue).expiresAt)
          if (Number.isFinite(expiresAt) && expiresAt > 0) {
            publishedDeadlineRef.current = expiresAt
            setSessionExpiresAt(expiresAt)
          }
        } catch {}
        return
      }
      if (event.key === 'getafe-auth-warning-minutes' && event.newValue) {
        const minutes = Number(event.newValue)
        if (Number.isInteger(minutes) && minutes >= 1 && minutes <= 30) setWarningMinutes(minutes)
        return
      }
      if (event.key === 'getafe-auth-logout' || event.data === 'logout') {
        ++requestRef.current
        clearClientAuthState()
        setSignedOut(true)
        setUser(null)
        setSessionExpiresAt(null)
        setLoading(false)
      }
    }
    const onSessionExpired = () => {
      ++requestRef.current
      clearClientAuthState()
      setSessionUnavailable(false)
      setUser(null)
      setSessionExpiresAt(null)
      setSignedOut(true)
      setLoading(false)
      try { window.localStorage.setItem('getafe-auth-logout', String(Date.now())) } catch {}
      try { channel?.postMessage('logout') } catch {}
    }
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') validateSession() }
    const onPageShow = () => validateSession()
    const onFocus = () => validateSession()
    const onDeadline = event => {
      const expiresAt = Number(event.detail?.expiresAt)
      if (!Number.isFinite(expiresAt) || expiresAt <= 0) return
      if (publishedDeadlineRef.current === expiresAt) return
      publishedDeadlineRef.current = expiresAt
      setSessionExpiresAt(expiresAt)
      try { channel?.postMessage({ type: 'deadline', expiresAt }) } catch {}
      try { window.localStorage.setItem('getafe-auth-deadline', JSON.stringify({ expiresAt, updatedAt: Date.now() })) } catch {}
    }
    const onWarningMinutes = event => {
      const minutes = Number(event.detail?.minutes)
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 30) return
      setWarningMinutes(minutes)
      try { channel?.postMessage({ type: 'warning', minutes }) } catch {}
      try { window.localStorage.setItem('getafe-auth-warning-minutes', String(minutes)) } catch {}
    }
    window.addEventListener('storage', onRemoteLogout)
    window.addEventListener('auth-session-expired', onSessionExpired)
    window.addEventListener('auth-session-deadline', onDeadline)
    window.addEventListener('auth-session-warning-minutes', onWarningMinutes)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    channel?.addEventListener('message', onRemoteLogout)
    return () => {
      window.removeEventListener('storage', onRemoteLogout)
      window.removeEventListener('auth-session-expired', onSessionExpired)
      window.removeEventListener('auth-session-deadline', onDeadline)
      window.removeEventListener('auth-session-warning-minutes', onWarningMinutes)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      channel?.removeEventListener('message', onRemoteLogout)
      channel?.close()
    }
  }, [clearClientAuthState, validateSession])

  const refreshUser = useCallback(() => {
    // A credential or onboarding mutation requires a new response, even if
    // an earlier session check is still running with the previous state.
    ++requestRef.current
    sessionControllerRef.current?.abort()
    invalidatePendingRouteRequest(AUTH_ENDPOINTS.session, 'session')
    sessionRef.current.promise = null
    return validateSession(true)
  }, [validateSession])

  useEffect(() => {
    if (!sessionUnavailable) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') validateSession(true)
    }, 10000)
    return () => window.clearInterval(timer)
  }, [sessionUnavailable, validateSession])

  const updateUser = useCallback((patch = {}) => {
    setUser(current => {
      if (!current) return current
      const next = { ...current, ...patch }
      sessionRef.current.user = next
      return next
    })
  }, [])

  const onSignedOut = useCallback(async () => {
    ++requestRef.current
    setSignedOut(true)
    setUser(null)
    setSessionExpiresAt(null)
    setSessionUnavailable(false)
    setLoading(false)
    clearClientAuthState()
    try { window.localStorage.setItem('getafe-auth-logout', String(Date.now())) } catch {}
    try {
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('getafe-auth')
        channel.postMessage('logout')
        channel.close()
      }
    } catch {}
  }, [clearClientAuthState])

  const authClient = useMemo(() => createAuthClient({
    request: apiFetch,
    normalizeError: normalizePublicError,
    onBeforeRefresh: () => clearClientAuthState(true),
    refreshSession: refreshUser,
    recoverSession: validateSession,
    onSignedOut,
  }), [clearClientAuthState, onSignedOut, refreshUser, validateSession])

  const renewSession = useCallback(() => {
    if (renewalRef.current) return renewalRef.current
    const pending = (async () => { try {
      const response = await apiFetch(AUTH_ENDPOINTS.renew, { method: 'POST', credentials: 'include', cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (response.status === 401) {
        window.dispatchEvent(new Event('auth-session-expired'))
        return { ok: false, expired: true }
      }
      if (!response.ok || !Number.isFinite(Number(body.expiresAt))) return { ok: false, error: body.error || 'Could not renew your session. Check your connection and try again.' }
      setSessionExpiresAt(Number(body.expiresAt))
      return { ok: true }
    } catch {
      return { ok: false, error: 'Could not renew your session. Check your connection and try again.' }
    } finally { if (renewalRef.current === pending) renewalRef.current = null } })()
    renewalRef.current = pending
    return pending
  }, [])

  const expireSession = useCallback(() => window.dispatchEvent(new Event('auth-session-expired')), [])
  useEffect(() => {
    if (!user) return undefined
    const markActivity = () => {
      if (document.visibilityState !== 'visible' || Date.now() - activityPingRef.current < 30000) return
      activityPingRef.current = Date.now()
      renewSession().catch(() => {})
    }
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']
    for (const event of events) document.addEventListener(event, markActivity, { passive: true })
    return () => { for (const event of events) document.removeEventListener(event, markActivity) }
  }, [renewSession, user])
  const authValue = { user, loading, sessionUnavailable, signedOut, login: authClient.login, completeMfa: authClient.completeMfa, register: authClient.register, logout: authClient.logout, validateSession, refreshUser, updateUser, renewSession, sessionExpiresAt, warningMinutes }
  return <AuthContext.Provider value={authValue}>{children}<SessionTimeoutWarning user={user} expiresAt={sessionExpiresAt} warningMinutes={warningMinutes} renewSession={renewSession} logout={authClient.logout} expireSession={expireSession} /></AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

// Published pages intentionally do not bootstrap a private session.
export function useOptionalAuth() {
  return useContext(AuthContext) || { user: null, loading: false }
}
