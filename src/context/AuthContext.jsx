import { onDataChanged } from '../services/dataChanges'
import { AUTH_ENDPOINTS, createAuthClient, nextSessionDeadline, shouldSendActivityUpdate } from '@getafe/auth-client'
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
  const [absoluteSessionExpiresAt, setAbsoluteSessionExpiresAt] = useState(null)
  const [sessionInitialized, setSessionInitialized] = useState(false)
  const [warningMinutes, setWarningMinutes] = useState(5)
  const requestRef = useRef(0)
  const lastActivityRef = useRef(null)
  const activityPingRef = useRef(0)
  const renewalRef = useRef(null)
  const publishedDeadlineRef = useRef(0)
  const publishedAbsoluteDeadlineRef = useRef(0)
  const sessionEpochRef = useRef(0)
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
    ++sessionEpochRef.current
    publishedDeadlineRef.current = 0
    publishedAbsoluteDeadlineRef.current = 0
    setSessionExpiresAt(null)
    setAbsoluteSessionExpiresAt(null)
    setSessionInitialized(false)
    lastActivityRef.current = null
    activityPingRef.current = 0
    renewalRef.current = null
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
      if (nextUser && (!sessionRef.current.user || sessionRef.current.user.id !== nextUser.id)) lastActivityRef.current = Date.now()
      sessionRef.current.user = nextUser
      if (nextUser && body?.session?.expiresAt != null && Number.isFinite(Number(body.session.expiresAt))) {
        const deadline = nextSessionDeadline(publishedDeadlineRef.current || null, body.session.expiresAt)
        publishedDeadlineRef.current = deadline
        setSessionExpiresAt(deadline)
      }
      if (nextUser && body?.session?.absoluteExpiresAt != null && Number.isFinite(Number(body.session.absoluteExpiresAt))) {
        const absolute = nextSessionDeadline(publishedAbsoluteDeadlineRef.current || null, body.session.absoluteExpiresAt)
        publishedAbsoluteDeadlineRef.current = absolute
        setAbsoluteSessionExpiresAt(absolute)
      }
      if (nextUser && Number.isFinite(Number(body?.session?.warningMinutes))) setWarningMinutes(Number(body.session.warningMinutes))
      if (!nextUser) {
        publishedDeadlineRef.current = 0
        publishedAbsoluteDeadlineRef.current = 0
        setSessionExpiresAt(null)
        setAbsoluteSessionExpiresAt(null)
      }
      sessionRef.current.checkedAt = Date.now()
      // Keep consumers mounted without refetching their data when the session
      // returns the same account. Still apply profile/role changes immediately.
      setUser(current => JSON.stringify(current) === JSON.stringify(nextUser) ? current : nextUser)
      return nextUser
    } catch {
      if (requestId === requestRef.current) setSessionUnavailable(true)
      return null
    } finally {
      if (requestId === requestRef.current) { sessionRef.current.promise = null; setLoading(false); setSessionInitialized(true) }
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
      if (event.data?.type === 'deadline') {
        if (Number.isFinite(Number(event.data.expiresAt))) {
          publishedDeadlineRef.current = nextSessionDeadline(publishedDeadlineRef.current || null, event.data.expiresAt)
          setSessionExpiresAt(publishedDeadlineRef.current)
        }
        if (Number.isFinite(Number(event.data.absoluteExpiresAt))) {
          publishedAbsoluteDeadlineRef.current = nextSessionDeadline(publishedAbsoluteDeadlineRef.current || null, event.data.absoluteExpiresAt)
          setAbsoluteSessionExpiresAt(publishedAbsoluteDeadlineRef.current)
        }
        return
      }
      if (event.data?.type === 'warning' && Number.isFinite(Number(event.data.minutes))) {
        setWarningMinutes(Math.max(1, Math.min(30, Number(event.data.minutes))))
        return
      }
      if (event.key === 'getafe-auth-activity' && sessionRef.current.user) {
        const timestamp = Number(event.newValue)
        if (timestamp > lastActivityRef.current && timestamp <= Date.now()) lastActivityRef.current = timestamp
        return
      }
      if (event.key === 'getafe-auth-deadline' && event.newValue) {
        try {
          const expiresAt = Number(JSON.parse(event.newValue).expiresAt)
          if (Number.isFinite(expiresAt) && expiresAt > 0) {
            publishedDeadlineRef.current = nextSessionDeadline(publishedDeadlineRef.current || null, expiresAt)
            setSessionExpiresAt(publishedDeadlineRef.current)
            const absoluteExpiresAt = Number(JSON.parse(event.newValue).absoluteExpiresAt)
            if (Number.isFinite(absoluteExpiresAt) && absoluteExpiresAt > 0) {
              publishedAbsoluteDeadlineRef.current = nextSessionDeadline(publishedAbsoluteDeadlineRef.current || null, absoluteExpiresAt)
              setAbsoluteSessionExpiresAt(publishedAbsoluteDeadlineRef.current)
            }
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
        ++sessionEpochRef.current
        clearClientAuthState()
        setSignedOut(true)
        setUser(null)
        setSessionExpiresAt(null)
        setAbsoluteSessionExpiresAt(null)
        setSessionInitialized(true)
        setLoading(false)
      }
    }
    const onSessionExpired = () => {
      ++requestRef.current
      ++sessionEpochRef.current
      publishedDeadlineRef.current = 0
      publishedAbsoluteDeadlineRef.current = 0
      clearClientAuthState()
      setSessionUnavailable(false)
      setUser(null)
      setSessionExpiresAt(null)
      setAbsoluteSessionExpiresAt(null)
      setSessionInitialized(true)
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
      const absoluteExpiresAt = Number(event.detail?.absoluteExpiresAt)
      const validIdle = Number.isFinite(expiresAt) && expiresAt > 0
      const validAbsolute = Number.isFinite(absoluteExpiresAt) && absoluteExpiresAt > 0
      if (!validIdle && !validAbsolute) return
      const nextIdle = validIdle ? nextSessionDeadline(publishedDeadlineRef.current || null, expiresAt) : publishedDeadlineRef.current || null
      const nextAbsolute = validAbsolute ? nextSessionDeadline(publishedAbsoluteDeadlineRef.current || null, absoluteExpiresAt) : publishedAbsoluteDeadlineRef.current || null
      if (nextIdle === publishedDeadlineRef.current && nextAbsolute === publishedAbsoluteDeadlineRef.current) return
      publishedDeadlineRef.current = nextIdle || 0
      publishedAbsoluteDeadlineRef.current = nextAbsolute || 0
      if (validIdle) setSessionExpiresAt(nextIdle)
      if (validAbsolute) setAbsoluteSessionExpiresAt(nextAbsolute)
      try { channel?.postMessage({ type: 'deadline', ...(validIdle ? { expiresAt: nextIdle } : {}), ...(validAbsolute ? { absoluteExpiresAt: nextAbsolute } : {}) }) } catch {}
      try { window.localStorage.setItem('getafe-auth-deadline', JSON.stringify({ ...(validIdle ? { expiresAt: nextIdle } : {}), ...(validAbsolute ? { absoluteExpiresAt: nextAbsolute } : {}), updatedAt: Date.now() })) } catch {}
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
    ++sessionEpochRef.current
    publishedDeadlineRef.current = 0
    renewalRef.current = null
    setSignedOut(true)
    setUser(null)
    setSessionExpiresAt(null)
    setAbsoluteSessionExpiresAt(null)
    setSessionUnavailable(false)
    setLoading(false)
    clearClientAuthState()
    setSessionInitialized(true)
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
    const epoch = sessionEpochRef.current
    const pending = (async () => { try {
      const response = await apiFetch(AUTH_ENDPOINTS.renew, { method: 'POST', credentials: 'include', cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (response.status === 401) {
        if (sessionEpochRef.current === epoch) window.dispatchEvent(new Event('auth-session-expired'))
        return { ok: false, expired: true }
      }
      if (!response.ok || !Number.isFinite(Number(body.expiresAt))) return { ok: false, error: body.error || 'Could not renew your session. Check your connection and try again.' }
      if (sessionEpochRef.current !== epoch) return { ok: false, stale: true }
      const deadline = nextSessionDeadline(publishedDeadlineRef.current || null, body.expiresAt)
      publishedDeadlineRef.current = deadline
      setSessionExpiresAt(deadline)
      const absolute = Number(body.absoluteExpiresAt)
      if (Number.isFinite(absolute) && absolute > 0) {
        publishedAbsoluteDeadlineRef.current = nextSessionDeadline(publishedAbsoluteDeadlineRef.current || null, absolute)
        setAbsoluteSessionExpiresAt(publishedAbsoluteDeadlineRef.current)
      }
      return { ok: true, expiresAt: deadline, absoluteExpiresAt: publishedAbsoluteDeadlineRef.current || null }
    } catch {
      return { ok: false, error: 'Could not renew your session. Check your connection and try again.' }
    } finally { if (renewalRef.current === pending) renewalRef.current = null } })()
    renewalRef.current = pending
    return pending
  }, [])

  const expireSession = useCallback(() => window.dispatchEvent(new Event('auth-session-expired')), [])
  useEffect(() => {
    if (!user) return undefined
    activityPingRef.current = 0
    const markActivity = event => {
      const now = Date.now()
      if (!event.isTrusted || document.visibilityState !== 'visible' || event.target?.closest?.('.session-timeout-dialog')) return
      lastActivityRef.current = now
      if (!shouldSendActivityUpdate({ eventType: event.type, isTrusted: event.isTrusted, visible: document.visibilityState === 'visible', lastSentAt: activityPingRef.current, now })) return
      activityPingRef.current = now
      try { window.localStorage.setItem('getafe-auth-activity', String(now)) } catch {}
      renewSession().catch(() => {})
    }
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']
    for (const event of events) document.addEventListener(event, markActivity, { passive: true })
    return () => { for (const event of events) document.removeEventListener(event, markActivity) }
  }, [renewSession, user])
  const authValue = { user, loading, sessionUnavailable, signedOut, login: authClient.login, completeMfa: authClient.completeMfa, register: authClient.register, logout: authClient.logout, validateSession, refreshUser, updateUser, renewSession, sessionExpiresAt, absoluteSessionExpiresAt, warningMinutes }
  return <AuthContext.Provider value={authValue}>{children}<SessionTimeoutWarning lastActivityRef={lastActivityRef} user={user} initialized={sessionInitialized && !loading} expiresAt={sessionExpiresAt} absoluteExpiresAt={absoluteSessionExpiresAt} warningMinutes={warningMinutes} renewSession={renewSession} logout={authClient.logout} expireSession={expireSession} /></AuthContext.Provider>
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
