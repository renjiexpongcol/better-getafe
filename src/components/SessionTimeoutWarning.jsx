import { useEffect, useRef, useState } from 'react'
import ModalDialog from './ModalDialog.jsx'
import { LoaderCircle } from 'lucide-react'
import { formatSessionCountdown, sessionMaximumWarningVisible, sessionWarningVisible } from '@getafe/auth-client'
import './SessionTimeoutWarning.css'

export function SessionTimeoutWarning({ lastActivityRef, user, initialized, idleTimeoutEnabled = true, expiresAt, absoluteExpiresAt, warningMinutes, renewSession, renewalPending, validateSession, logout, expireSession }) {
  const [now, setNow] = useState(Date.now())
  const [pendingAction, setPendingAction] = useState(null)
  const busy = Boolean(pendingAction) || renewalPending
  const [error, setError] = useState('')
  const [dismissedDeadline, setDismissedDeadline] = useState(null)
  const [dismissedIdleDeadline, setDismissedIdleDeadline] = useState(null)
  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  const [ownsWarning, setOwnsWarning] = useState(false)
  const checkedExpiryRef = useRef('')
  const deadline = Number(expiresAt)
  const absoluteDeadline = Number(absoluteExpiresAt)
  const idleDeadlineValid = Number.isFinite(deadline) && deadline > 0
  const absoluteDeadlineValid = Number.isFinite(absoluteDeadline) && absoluteDeadline > 0
  const currentDeadlinesRef = useRef({ idle: null, absolute: null })
  currentDeadlinesRef.current = { idle: idleDeadlineValid ? deadline : null, absolute: absoluteDeadlineValid ? absoluteDeadline : null }
  const open = idleTimeoutEnabled && dismissedIdleDeadline !== deadline && (!absoluteDeadlineValid || deadline < absoluteDeadline) && sessionWarningVisible({ initialized, hasSession: Boolean(user), expiresAt: deadline, warningMinutes, now, lastActivityAt: lastActivityRef.current })
  const showMaximumNotice = sessionMaximumWarningVisible({ initialized, hasSession: Boolean(user), expiresAt: absoluteDeadline, warningMinutes, now, lastActivityAt: lastActivityRef.current })
  const maximumNoticeOpen = showMaximumNotice && !open && dismissedDeadline !== absoluteDeadline
  const warningDeadline = open ? deadline : absoluteDeadline

  useEffect(() => {
    const updateVisibility = () => setTabVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  useEffect(() => {
    setOwnsWarning(false)
    if (!tabVisible || !(open || maximumNoticeOpen)) return undefined
    if (!navigator.locks?.request) {
      setOwnsWarning(true)
      return undefined
    }
    const controller = new AbortController()
    let active = true
    let releaseLock
    navigator.locks.request(`getafe-session-warning:${user.id}:${warningDeadline}`, { mode: 'exclusive', signal: controller.signal }, lock => {
      if (!lock || !active) return undefined
      setOwnsWarning(true)
      return new Promise(resolve => { releaseLock = resolve })
    }).catch(error => {
      if (error.name !== 'AbortError' && active) {
        console.warn('Session warning coordination failed:', error.name)
        setOwnsWarning(true)
      }
    })
    return () => {
      active = false
      controller.abort()
      releaseLock?.()
    }
  }, [maximumNoticeOpen, open, tabVisible, user?.id, warningDeadline])

  useEffect(() => {
    if (!initialized || !user || !(idleDeadlineValid || absoluteDeadlineValid)) return undefined
    const tick = () => {
      const current = Date.now()
      setNow(current)
      if ((idleDeadlineValid && deadline <= current) || (absoluteDeadlineValid && absoluteDeadline <= current)) {
        if (renewalPending) return
        const checkKey = `${user?.id || ''}:${deadline}:${absoluteDeadline}`
        if (checkedExpiryRef.current === checkKey) return
        checkedExpiryRef.current = checkKey
        // The client deadline can be stale while a renewal response is in
        // flight. Confirm expiry with the server before clearing the session.
        void validateSession(true).then(currentUser => {
          const currentDeadlines = Object.values(currentDeadlinesRef.current).filter(value => Number.isFinite(value) && value > 0)
          if ((!currentUser && user) || (currentDeadlines.length > 0 && Math.min(...currentDeadlines) <= Date.now())) expireSession()
        })
      }
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    window.addEventListener('pageshow', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('pageshow', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [absoluteDeadline, absoluteDeadlineValid, deadline, expireSession, idleDeadlineValid, initialized, renewalPending, user, validateSession])

  useEffect(() => { if (open) setError('') }, [open])

  const staySignedIn = async () => {
    if (busy) return
    setPendingAction('renew')
    setError('')
    try {
      const result = await renewSession()
      if (!result.ok && !result.expired && !result.stale) setError(result.error || 'Your session could not be renewed. Try again.')
    } finally { setPendingAction(null) }
  }
  const signOut = async () => {
    if (busy) return
    setPendingAction('logout')
    setError('')
    try {
      const result = await logout()
      if (!result?.ok) setError(result?.error || 'Sign out could not be completed. Try again.')
    } finally { setPendingAction(null) }
  }

  return <>
    {maximumNoticeOpen && ownsWarning && <aside className="session-maximum-notice" aria-label="Session reminder">
      <div role="status">
        <strong>Your session ends at {new Date(absoluteDeadline).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</strong>
        <span>Save your work before signing in again.</span>
      </div>
      <button type="button" aria-label="Dismiss session reminder" onClick={() => setDismissedDeadline(absoluteDeadline)}>×</button>
    </aside>}
    {open && ownsWarning && <ModalDialog labelledBy="session-warning-title" describedBy="session-warning-description" busy={busy} onClose={() => setDismissedIdleDeadline(deadline)} size="small" themeClass="cms" backdropClass="session-timeout-backdrop">
      <section className="portal-action-modal session-timeout-dialog">
        <h2 id="session-warning-title">Session will expire soon</h2>
        <p id="session-warning-description">You've been inactive for a while.<br />For your security, you'll be logged out in:</p>
        <p className="session-timeout-countdown" role="timer" aria-label="Time remaining before log out" aria-live="off">{formatSessionCountdown(deadline, now)}</p>
        <p className="session-timeout-prompt">Would you like to keep working?</p>
        <span className="session-timeout-sr-only" role="status">Your session will expire soon. Choose Keep working to stay signed in.</span>
        {error && <p className="session-timeout-error" role="alert">{error}</p>}
        <div className="session-timeout-actions">
          <button type="button" className="session-timeout-secondary" disabled={busy} onClick={signOut}>{pendingAction === 'logout' ? 'Logging out…' : 'Log out'}</button>
          <button type="button" className="session-timeout-primary" autoFocus disabled={busy} onClick={staySignedIn}>{pendingAction === 'renew' && <LoaderCircle size={16} aria-hidden="true" />}{pendingAction === 'renew' ? 'Keeping you signed in…' : 'Keep working'}</button>
        </div>
        <p className="session-timeout-footnote">Closing this reminder does not extend your session.</p>
      </section>
    </ModalDialog>}
  </>
}
