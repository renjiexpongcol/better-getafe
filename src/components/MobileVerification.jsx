import { useEffect, useRef, useState } from 'react'
import { citizenApi } from '../services/citizenData'
import { normalizeMobile, validMobile } from '../data/residentContact'
import './MobileVerification.css'

export default function MobileVerification({ mobile, verified = false, options: suppliedOptions, beforeRequest, onVerified, onBusyChange, disabled = false }) {
  const number = normalizeMobile(mobile)
  const [options, setOptions] = useState(suppliedOptions || null)
  const [challenge, setChallenge] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retryAt, setRetryAt] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const inFlight = useRef(false)
  const currentNumber = useRef(number)
  currentNumber.current = number
  useEffect(() => { onBusyChange?.(busy) }, [busy, onBusyChange])
  useEffect(() => () => { onBusyChange?.(false) }, [onBusyChange])

  useEffect(() => {
    if (suppliedOptions) { setOptions(suppliedOptions); return }
    let active = true
    citizenApi('/onboarding/options').then(value => { if (active) { setOptions(value); setError('') } }).catch(() => { if (active) setError('Verification options could not be loaded. Try again.') })
    return () => { active = false }
  }, [suppliedOptions, loadAttempt])
  useEffect(() => { setChallenge(''); setCode(''); setNotice(''); setError('') }, [number])
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)))
    tick()
    if (!retryAt) return
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [retryAt])

  const send = async () => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(''); setNotice('')
    const recipient = number
    try {
      await beforeRequest?.()
      const result = await citizenApi('/mobile-verification/request', { method: 'POST', body: '{}' })
      if (currentNumber.current !== recipient) return
      if (result.verified) { onVerified?.(recipient); return }
      setChallenge(result.challengeId); setCode(''); setRetryAt(Date.now() + (result.retryAfter || 30) * 1000)
      setNotice(`A code was sent to ${result.mobile}. It expires in 10 minutes.`)
    } catch (cause) {
      setError(cause.message)
      if (cause.retryAfter) setRetryAt(Date.now() + cause.retryAfter * 1000)
    } finally { inFlight.current = false; setBusy(false) }
  }
  const confirm = async () => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    const recipient = number
    try {
      const result = await citizenApi('/mobile-verification/confirm', { method: 'POST', body: JSON.stringify({ challengeId: challenge, code }) })
      if (currentNumber.current !== recipient) return
      setChallenge(''); setCode(''); setNotice('Mobile number verified.')
      await onVerified?.(result.mobile)
    } catch (cause) { setError(cause.message) }
    finally { inFlight.current = false; setBusy(false) }
  }

  if (verified) return <div className="mobile-verification" role="status"><strong>Mobile number verified</strong></div>
  if (options?.mobileVerificationEnabled === false) return null
  if (options && !options.sms && !options.mobileVerificationRequired) return null
  return <div className="mobile-verification">
    <strong>Verify mobile number{options?.mobileVerificationRequired ? ' (required)' : ''}</strong>
    {!options ? <>{error ? <><p role="alert">{error}</p><button type="button" className="citizen-secondary" onClick={() => setLoadAttempt(value => value + 1)}>Try again</button></> : <p role="status">Loading verification options…</p>}</> : !options.sms ? <p>SMS verification is currently unavailable. Contact municipal support{options.mobileVerificationRequired ? ' to complete your setup' : ''}.</p> : <>
      <p>Confirm this number with a six-digit SMS code.</p>
      <button type="button" className="citizen-secondary" onClick={send} disabled={disabled || busy || !validMobile(number) || seconds > 0}>{busy && !challenge ? 'Sending…' : seconds > 0 ? `Resend in ${seconds}s` : challenge ? 'Resend code' : 'Send verification code'}</button>
      {notice && <p role="status">{notice}</p>}
      {challenge && <div className="mobile-verification-code"><label>Mobile verification code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} disabled={disabled || busy}/></label><button type="button" className="citizen-primary" onClick={confirm} disabled={disabled || busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify number'}</button></div>}
      {error && <p role="alert">{error}</p>}
    </>}
  </div>
}
