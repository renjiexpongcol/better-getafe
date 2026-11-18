import { useEffect, useRef, useState } from 'react'
import ModalDialog from './ModalDialog.jsx'
import { formatSessionCountdown, sessionMaximumWarningVisible, sessionWarningVisible } from '@getafe/auth-client'
import './SessionTimeoutWarning.css'

export function SessionTimeoutWarning({ lastActivityRef, user, initialized, expiresAt, absoluteExpiresAt, warningMinutes, renewSession, renewalPending, validateSession, logout, expireSession }) {
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dismissedDeadline, setDismissedDeadline] = useState(null)
  const checkedExpiryRef = useRef('')
  const deadline = Number(expiresAt)
  const absoluteDeadline = Number(absoluteExpiresAt)
  const idleDeadlineValid = Number.isFinite(deadline) && deadline > 0
  const absoluteDeadlineValid = Number.isFinite(absoluteDeadline) && absoluteDeadline > 0
  const open = (!absoluteDeadlineValid || deadline < absoluteDeadline) && sessionWarningVisible({ initialized, hasSession: Boolean(user), expiresAt: deadline, warningMinutes, now, lastActivityAt: lastActivityRef.current })
  const showMaximumNotice = sessionMaximumWarningVisible({ initialized, hasSession: Boolean(user), expiresAt: absoluteDeadline, warningMinutes, now, lastActivityAt: lastActivityRef.current })

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
          if (!currentUser && user) expireSession()
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
    setBusy(true)
    setError('')
    try {
      const result = await renewSession()
      if (!result.ok && !result.expired && !result.stale) setError(result.error || 'Your session could not be renewed. Try again.')
    } finally { setBusy(false) }
  }
  const signOut = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await logout()
      if (!result?.ok) setError(result?.error || 'Sign out could not be completed. Try again.')
    } finally { setBusy(false) }
  }

  return <>
    {showMaximumNotice && !open && dismissedDeadline !== absoluteDeadline && <aside className="session-maximum-notice" aria-label="Session reminder">
      <div role="status">
        <strong>Your session ends at {new Date(absoluteDeadline).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</strong>
        <span>Save your work before signing in again.</span>
      </div>
      <button type="button" aria-label="Dismiss session reminder" onClick={() => setDismissedDeadline(absoluteDeadline)}>×</button>
    </aside>}
    {open && <ModalDialog labelledBy="session-warning-title" describedBy="session-warning-description" busy={busy} onClose={() => {}} size="small" themeClass="cms" backdropClass="session-timeout-backdrop">
      <section className="portal-action-modal session-timeout-dialog">
        <p className="session-timeout-kicker">Security reminder</p>
        <h2 id="session-warning-title">Your session is about to expire</h2>
        <p id="session-warning-description">For your security, you’ll be signed out after a period of inactivity.</p>
        <p className="session-timeout-countdown" aria-live="off">{formatSessionCountdown(deadline, now)}</p>
        <span className="session-timeout-sr-only" aria-live="polite">Your session is about to expire.</span>
        {error && <p className="session-timeout-error" role="alert">{error}</p>}
        <div className="session-timeout-actions">
          <button type="button" className="cms-primary" disabled={busy} onClick={staySignedIn}>{busy ? 'Renewing session…' : 'Stay signed in'}</button>
          <button type="button" className="session-timeout-secondary" data-dialog-close-action disabled={busy} onClick={signOut}>Sign out</button>
        </div>
      </section>
    </ModalDialog>}
  </>
}
