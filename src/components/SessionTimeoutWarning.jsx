import { useEffect, useState } from 'react'
import ModalDialog from './ModalDialog.jsx'
import { formatSessionCountdown, sessionWarningVisible } from '@getafe/auth-client'
import './SessionTimeoutWarning.css'

export function SessionTimeoutWarning({ user, initialized, expiresAt, warningMinutes, renewSession, logout, expireSession }) {
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [renewalNote, setRenewalNote] = useState('')
  const deadline = Number(expiresAt)
  const open = sessionWarningVisible({ initialized, hasSession: Boolean(user), expiresAt: deadline, warningMinutes, now })

  useEffect(() => {
    if (!initialized || !user || !Number.isFinite(deadline)) return undefined
    const tick = () => {
      const current = Date.now()
      setNow(current)
      if (deadline <= current) expireSession()
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
  }, [deadline, expireSession, initialized, user])

  useEffect(() => { if (open) { setError(''); setRenewalNote('') } }, [open])
  if (!open) return null

  const staySignedIn = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    setRenewalNote('')
    try {
      const result = await renewSession()
      if (!result.ok && !result.expired && !result.stale) setError(result.error || 'Your session could not be renewed. Try again.')
      if (result.ok && (Number(result.expiresAt) <= deadline || Number(result.expiresAt) - Date.now() <= Number(warningMinutes) * 60_000)) {
        setRenewalNote('Your session was renewed as far as its maximum session lifetime allows. Sign in again when it expires.')
      }
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

  return <ModalDialog labelledBy="session-warning-title" describedBy="session-warning-description" busy={busy} onClose={() => {}} size="small" themeClass="cms" backdropClass="session-timeout-backdrop">
    <section className="portal-action-modal session-timeout-dialog">
      <p className="session-timeout-kicker">Security reminder</p>
      <h2 id="session-warning-title">Your session is about to expire</h2>
      <p id="session-warning-description">For your security, you’ll be signed out after a period of inactivity.</p>
      <p className="session-timeout-countdown" aria-live="off">{formatSessionCountdown(deadline, now)}</p>
      <span className="session-timeout-sr-only" aria-live="polite">Your session is about to expire.</span>
      {renewalNote && <p className="session-timeout-note" role="status">{renewalNote}</p>}
      {error && <p className="session-timeout-error" role="alert">{error}</p>}
      <div className="session-timeout-actions">
        <button type="button" className="cms-primary" disabled={busy} onClick={staySignedIn}>{busy ? 'Renewing session…' : 'Stay signed in'}</button>
        <button type="button" className="session-timeout-secondary" data-dialog-close-action disabled={busy} onClick={signOut}>Sign out</button>
      </div>
    </section>
  </ModalDialog>
}
