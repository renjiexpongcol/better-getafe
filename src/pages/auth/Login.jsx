import { focusContentTarget } from '../../services/focusManagement'
import { securityFetch as fetch } from '../../services/securityFetch.js'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import {
  Mail, Lock, Eye, EyeOff,
  Loader2,
  KeyRound, User, ArrowLeft, Info,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { usePublicConfig } from '../../context/PublicConfig'
import { safeReturnPath, setPendingReturnUrl, getPendingReturnUrl, clearPendingReturnUrl, consumePostAuthDestination } from '../../authNavigation'
import { passwordPassesPolicy } from '../../passwordPolicy'
import { validatePasswordLogin } from '../../services/loginValidation'
import AuthBranding from '../../components/AuthBranding'

const loginChallengeStorageKey = 'getafe:login:email-challenge'
const secondsUntil = timestamp => Math.max(0, Math.ceil((Number(timestamp || 0) - Date.now()) / 1000))
const formatCooldown = seconds => {
  const value = Math.max(0, Math.ceil(Number(seconds) || 0))
  if (value < 60) return `${value} second${value === 1 ? '' : 's'}`
  const minutes = Math.ceil(value / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (!remainingMinutes) return `${hours} hour${hours === 1 ? '' : 's'}`
  return `${hours} hour${hours === 1 ? '' : 's'} ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}`
}
const readStoredLoginChallenge = () => {
  if (typeof window === 'undefined') return null
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(loginChallengeStorageKey) || 'null')
    return stored?.challengeId ? stored : null
  } catch { return null }
}

export default function Login() {
  const { user, loading: authLoading, login, completeMfa, register, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState('signin') // 'signin' | 'register'
  const [showPassword, setShowPassword] = useState(false)
  const [egovNotice, setEgovNotice] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)
  const loading = pendingAction !== null
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState('')
  const [forgot, setForgot] = useState(false)
  const settings = usePublicConfig()
  const storedChallenge = readStoredLoginChallenge()
  const [challenge, setChallenge] = useState(storedChallenge?.challengeId || null)
  const [mfaChallenge, setMfaChallenge] = useState(null)
  const [code, setCode] = useState('')
  const [resendUntil, setResendUntil] = useState(storedChallenge?.nextResendAt || 0)
  const [resendCooldown, setResendCooldown] = useState(() => secondsUntil(storedChallenge?.nextResendAt))
  const [challengeMessage, setChallengeMessage] = useState('')
  const [renewal, setRenewal] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const [info, setInfo] = useState('')
  const actionInFlight = useRef(false)
  const redirectStarted = useRef(false)
  const codeRef = useRef(null)
  useEffect(() => {
    const title = mfaChallenge ? 'Two-factor authentication' : renewal ? 'Update your password' : challenge ? 'Check your email' : mode === 'register' ? 'Create your account' : 'Sign in'
    document.title = `${settings['general.name'] || 'Getafe'} | ${title}`
    if (mfaChallenge || challenge || renewal) {
      const heading = document.querySelector('.login-challenge-page h1')
      focusContentTarget(heading)
    }
  }, [mfaChallenge, challenge, renewal, mode, settings['general.name']])
  const returnUrl = safeReturnPath(searchParams.get('returnUrl'))
  const hasReturnUrl = searchParams.has('returnUrl')
  useEffect(() => {
    if (hasReturnUrl) {
      if (returnUrl) setPendingReturnUrl(returnUrl)
      else clearPendingReturnUrl()
    }
  }, [hasReturnUrl, returnUrl])
  const setEmailChallenge = (challengeId, nextResendAt, retryAfter = 30) => {
    const target = Number(nextResendAt) || Date.now() + Math.max(1, Number(retryAfter) || 30) * 1000
    setChallenge(challengeId)
    setResendUntil(target)
    setResendCooldown(secondsUntil(target))
    setChallengeMessage('')
    try { window.sessionStorage.setItem(loginChallengeStorageKey, JSON.stringify({ challengeId, nextResendAt: target })) } catch { /* storage is optional */ }
  }
  const clearEmailChallenge = () => {
    setChallenge(null)
    setResendUntil(0)
    setResendCooldown(0)
    try { window.sessionStorage.removeItem(loginChallengeStorageKey) } catch { /* storage is optional */ }
  }
  const applyResendCooldown = (nextResendAt, retryAfter = 30) => {
    const target = Number(nextResendAt) || Date.now() + Math.max(1, Number(retryAfter) || 30) * 1000
    setResendUntil(target)
    setResendCooldown(secondsUntil(target))
    if (challenge) {
      try { window.sessionStorage.setItem(loginChallengeStorageKey, JSON.stringify({ challengeId: challenge, nextResendAt: target })) } catch { /* storage is optional */ }
    }
  }
  useEffect(() => {
    if (searchParams.get('google') === 'existing' || searchParams.get('google') === 'unavailable') setInfo('Google sign-in could not be completed. Please try again or use your email and password.')
    if (searchParams.get('google') === 'cancelled') setInfo('Google sign-in was cancelled. You can try again or sign in with your password.')
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const challengeId = fragment.get('mfa') || searchParams.get('mfa')
    if (challengeId) {
      setMfaChallenge(challengeId)
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
    }
  }, [searchParams])
  useEffect(() => {
    if (!resendUntil) return undefined
    const update = () => {
      const remaining = secondsUntil(resendUntil)
      setResendCooldown(remaining)
      if (!remaining) window.clearInterval(timer)
    }
    const timer = window.setInterval(update, 1000)
    update()
    return () => window.clearInterval(timer)
  }, [resendUntil])
  useEffect(() => {
    if (!cooldown) return undefined
    const timer = setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])
  const applyRateLimit = result => {
    if (!result?.retryAfter && result?.error !== 'rate_limited') return false
    const seconds = Math.max(1, Math.ceil(Number(result.retryAfter) || 60))
    setCooldown(seconds)
    setError(`Too many attempts. Please try again in ${formatCooldown(seconds)}.`)
    return true
  }
  const handleResult = res => {
    if (res.verificationRequired) { setEmailChallenge(res.challengeId, res.nextResendAt, res.retryAfter); setError(''); return }
    if (res.mfaRequired) { clearEmailChallenge(); setMfaChallenge(res.mfaChallengeId); setError(''); return }
    if (res.passwordExpired) { clearEmailChallenge(); setRenewal(true); setError(''); return }
    if (!res.ok) { if (!applyRateLimit(res)) setError(res.error); return }
    else { clearEmailChallenge() }
  }
  const completeMfaChallenge = async event => {
    event.preventDefault(); if (actionInFlight.current || loading || cooldown > 0) return; actionInFlight.current = true; setPendingAction('verify'); setError('')
    try {
      const result = await completeMfa(mfaChallenge, code)
      if (!result.ok) { if (!applyRateLimit(result)) setError(result.error) }
    } catch { setError('Verification is temporarily unavailable.') } finally { setPendingAction(null); actionInFlight.current = false }
  }
  const completeChallenge = async event => {
    event.preventDefault(); if (actionInFlight.current || loading || cooldown > 0) return; actionInFlight.current = true; setPendingAction('verify'); setError('')
    try {
      if (renewal && !passwordPassesPolicy(newPassword, Number(settings['authentication.passwordMinLength'] || 12))) throw new Error('Choose a stronger password that meets the password requirements.')
      if (renewal && newPassword !== confirmNewPassword) throw new Error('Passwords do not match.')
      if (!renewal && code.length !== 6) throw new Error('Enter the six-digit verification code.')
      const response = await fetch(renewal ? '/api/auth/renew-password' : '/api/auth/verify-code', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(renewal ? { password: newPassword } : { challengeId: challenge, code }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 429) {
          const seconds = Math.max(1, Math.ceil(Number(body.retryAfter || response.headers.get('Retry-After')) || 60))
          setCooldown(seconds)
          throw new Error(`Too many attempts. Please try again in ${formatCooldown(seconds)}.`)
        }
        if (!renewal && response.status === 401 && /expired/i.test(body.error || '')) {
          setResendUntil(0)
          setResendCooldown(0)
          setChallengeMessage('')
        }
        throw new Error(body.error || 'Verification failed.')
      }
      if (renewal) { clearEmailChallenge(); setRenewal(null); setError('Password updated. Sign in with your new password.'); setForm(previous => ({ ...previous, password: '' })) }
      else { clearEmailChallenge(); if (!await refreshUser()) throw new Error('The sign-in session could not be established. Please try again.') }
    } catch (error) { setError(error.message) } finally { actionInFlight.current = false; setPendingAction(null) }
  }
  const resendVerificationCode = async () => {
    if (actionInFlight.current || loading || resendCooldown > 0 || !challenge) return
    actionInFlight.current = true
    setPendingAction('resend')
    setError('')
    setChallengeMessage('')
    try {
      const response = await fetch('/api/auth/resend-code', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GetafeCitizenPortal' }, body: JSON.stringify({ challengeId: challenge }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = Math.max(1, Math.ceil(Number(body.retryAfter || response.headers.get('Retry-After')) || 30))
          applyResendCooldown(body.nextResendAt, retryAfter)
        }
        if (response.status === 401) clearEmailChallenge()
        throw new Error(body.error || "We couldn't send a new code. Please try again.")
      }
      setCode('')
      setChallengeMessage(body.message || 'A new code has been sent to your email.')
      applyResendCooldown(body.nextResendAt, body.retryAfter)
      window.requestAnimationFrame(() => codeRef.current?.focus())
    } catch (error) { setError(error.message) } finally { actionInFlight.current = false; setPendingAction(null) }
  }
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirm: '',
    remember: false,
  })

  // Keep the login page from being used as an authenticated landing page.
  useEffect(() => {
    if (!authLoading && user && !redirectStarted.current) {
      redirectStarted.current = true
      const target = consumePostAuthDestination(user, hasReturnUrl ? returnUrl : undefined)
      navigate(target, { replace: true, state: { authDestination: target } })
    }
  }, [user, authLoading, navigate, returnUrl, hasReturnUrl])

  useEffect(() => {
    if (mode !== 'register' || settings['security.registrationCaptcha'] !== true || !settings['security.recaptchaSiteKey']) return
    setCaptchaToken('')
    let script = document.querySelector('script[data-recaptcha]')
    const v3 = settings['security.recaptchaVersion'] === 'v3'
    const enterprise = settings['security.recaptchaProvider'] === 'google-enterprise'
    if (!script) { script = document.createElement('script'); script.src = enterprise ? `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(settings['security.recaptchaSiteKey'])}` : v3 ? `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(settings['security.recaptchaSiteKey'])}` : 'https://www.google.com/recaptcha/api.js?render=explicit'; script.async = true; script.defer = true; script.dataset.recaptcha = 'true'; script.dataset.recaptchaVersion = v3 ? 'v3' : 'v2'; script.dataset.recaptchaProvider = enterprise ? 'google-enterprise' : 'google-standard' }
    if (!script.parentNode) document.head.appendChild(script)
    const render = () => { const node = document.getElementById('recaptcha-widget'); const api = enterprise ? window.grecaptcha?.enterprise : window.grecaptcha; if (api && node && !v3 && !node.dataset.rendered) { api.render(node, { sitekey: settings['security.recaptchaSiteKey'], callback: setCaptchaToken, 'expired-callback': () => setCaptchaToken(''), 'error-callback': () => setCaptchaToken('') }); node.dataset.rendered = 'true' } }
    script.addEventListener('load', render); const timer = setInterval(render, 250)
    return () => { clearInterval(timer); script.removeEventListener('load', render) }
  }, [mode, settings['security.registrationCaptcha'], settings['security.recaptchaSiteKey'], settings['security.recaptchaProvider'], settings['security.recaptchaVersion']])

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (actionInFlight.current || loading || cooldown > 0) return
    setError('')

    if (mode === 'signin') {
      const email = form.email.trim().toLowerCase()
      const validation = validatePasswordLogin(email, form.password)
      if (validation) {
        setError(validation.message)
        e.currentTarget.elements.namedItem(validation.field)?.focus()
        return
      }
    } else {
      if (!form.name.trim() || !form.email.trim() || !form.password) {
        setError('Please fill in all required fields.')
        return
      }
      if (!passwordPassesPolicy(form.password, Number(settings['authentication.passwordMinLength'] || 12))) {
        setError('Choose a stronger password with uppercase and lowercase letters, a number, and a special character. Avoid common passwords.')
        return
      }
      if (form.password !== form.confirm) {
        setError('Passwords do not match.')
        return
      }
    }

    actionInFlight.current = true
    setPendingAction(mode)
    try {
      if (mode === 'signin') {
        handleResult(await login(form.email.trim().toLowerCase(), form.password, form.remember))
        return
      }
      let token = captchaToken
      if (settings['security.registrationCaptcha'] === true && settings['security.recaptchaSiteKey']) {
        if (settings['security.recaptchaVersion'] === 'v3') {
          const api = settings['security.recaptchaProvider'] === 'google-enterprise' ? window.grecaptcha?.enterprise : window.grecaptcha
          if (!api) { setError('Verification is loading. Please try again.'); return }
          try {
            await new Promise(resolve => api.ready(resolve))
            token = await api.execute(settings['security.recaptchaSiteKey'], { action: 'register' })
          } catch {
            setError('Verification failed. Please try again.')
            return
          }
        }
        if (!token) { setError('Please complete the reCAPTCHA verification.'); return }
      }
      handleResult(await register(form.name, form.email, form.password, token))
    } catch {
      setError(mode === 'signin' ? 'Sign-in is temporarily unavailable. Please try again.' : 'Registration is temporarily unavailable. Please try again.')
    } finally {
      actionInFlight.current = false
      setPendingAction(null)
    }
  }

  const switchMode = (next) => {
    if (actionInFlight.current) return
    setMode(next)
    setForgot(false)
    setError('')
  }

  const inputIcon = mode === 'signin' ? <Mail size={18} /> : <User size={18} />

  if (mfaChallenge) return <main className="login-page login-challenge-page"><section className="login-main"><form className="login-card password-renewal-card" onSubmit={completeMfaChallenge}><img className="mfa-authentication-icon" src="/assets/icons/auth-pack/authentication.png" alt="" aria-hidden="true"/><h1>Two-factor authentication</h1><p>Enter the six-digit code from your authenticator app, or one of your recovery codes.</p><label>Authenticator or recovery code<input disabled={loading} required type="text" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} /></label>{error && <p role="alert">{error}</p>}<button className="login-submit" disabled={loading || cooldown > 0}>{loading ? 'Verifying…' : cooldown > 0 ? `Try again in ${formatCooldown(cooldown)}` : 'Verify and sign in'}</button><button className="renewal-cancel" type="button" disabled={loading} onClick={() => { setMfaChallenge(null); setCode(''); setError('') }}>Return to sign in</button></form></section></main>

  if (challenge || renewal) return (
    <main className="login-page login-challenge-page">
      <section className="login-main">
        <form className={`login-card ${renewal ? 'password-renewal-card' : 'email-code-card'}`} onSubmit={completeChallenge}>
          {renewal && <img className="renewal-logo" src="/assets/getafe-seal.png" alt="Municipality of Getafe" />}
          <h1>{renewal ? 'Update your password' : 'Check your email'}</h1>
          <p>{renewal ? 'You need to update your password because it has expired or this is your first time signing in.' : 'Enter the six-digit sign-in code sent to your email address.'}</p>
          {renewal ? <>
            <label htmlFor="new-password">New password<input disabled={loading} id="new-password" required minLength={Number(settings['authentication.passwordMinLength'] || 12)} maxLength="1024" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="New password" /></label>
            <label htmlFor="confirm-new-password">Confirm password<input disabled={loading} id="confirm-new-password" required minLength={Number(settings['authentication.passwordMinLength'] || 12)} maxLength="1024" type="password" autoComplete="new-password" value={confirmNewPassword} onChange={event => setConfirmNewPassword(event.target.value)} placeholder="Confirm password" /></label>
          </> : <>
            <label htmlFor="verification-code">Verification code<input disabled={loading} ref={codeRef} id="verification-code" required type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} aria-describedby={`${error ? 'verification-code-error' : ''}${challengeMessage ? ' verification-code-status' : ''}`} aria-invalid={Boolean(error)} /></label>
            {challengeMessage && <p id="verification-code-status" className="email-code-message" role="status"><Info size={16} aria-hidden="true"/><span>{challengeMessage}</span></p>}
          </>}
          {error && <p id={renewal ? undefined : 'verification-code-error'} className="login-error" role="alert">{error}</p>}
          <button className="login-submit" disabled={loading || cooldown > 0 || (!renewal && code.length !== 6)}>{pendingAction === 'verify' ? (renewal ? 'Checking…' : 'Verifying…') : cooldown > 0 ? `Try again in ${cooldown}s` : renewal ? 'Sign in' : 'Continue'}</button>
          {!renewal && <>
            <p className="email-resend-prompt">Didn't receive the code?</p>
            <button className="email-resend-button" type="button" onClick={resendVerificationCode} disabled={loading || resendCooldown > 0} aria-label={resendCooldown > 0 ? `Resend code in ${resendCooldown} seconds` : 'Resend code'}>{loading ? 'Sending…' : resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}</button>
            <button className="login-tertiary-link" type="button" disabled={loading} onClick={() => { clearEmailChallenge(); setCode(''); setError(''); setChallengeMessage('') }}>← Back to sign in</button>
          </>}
          {renewal && <button className="renewal-cancel" type="button" disabled={loading} onClick={() => { clearEmailChallenge(); setRenewal(null); setCode('') }}>Return to sign in</button>}
        </form>
      </section>
    </main>
  )

  return (
    <div className="login-page">
      {/* ===== Brand / welcome panel ===== */}
      <aside className="login-aside">
        <div className="login-aside-bg" aria-hidden="true" />
        <div className="login-aside-top">
          <Link to="/" className="login-back-link">
            <ArrowLeft size={16} /> Back to portal
          </Link>
        </div>

        <div className="login-brand-block">
          <div className="login-brand-row">
            <img src="/assets/getafe-seal.png" alt="Municipality of Getafe seal" className="login-seal" />
            <div>
              <div className="login-brand-name">Municipality of Getafe</div>
              <div className="login-brand-sub">Bohol • Philippines</div>
            </div>
          </div>
          <h1 className="login-aside-title">
            Getafe services, made easier for <em>everyone</em>.
          </h1>
          <p className="login-aside-text">
            Access municipal services, request documents and certificates, apply for permits, and stay connected with local programs—all in one secure place, anytime and anywhere.
          </p>

        </div>

        <div className="login-aside-foot">
          <p className="login-aside-copyright">© 2026 LGU Getafe. All rights reserved.</p>
        </div>
      </aside>

      {/* ===== Form panel ===== */}
      <main className="login-main">
        <div className={`login-card login-card-${mode}`}>
          <AuthBranding />
          <section><h1 className="login-heading">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className={`login-subheading login-subtitle login-subtitle-${mode}`}>
            {mode === 'signin' ? 'Sign in to access Getafe’s online services.' : 'Create an account to access Getafe’s online services.'}
          </p>

          {error && (
            <div className="login-error" role="alert">{error}</div>
          )}

          {info && <div className="login-info" role="status">{info}</div>}

          {forgot && mode === 'signin' && (
            <div className="login-forgot-panel">
              <KeyRound size={18} />
              <div>
                <strong>Reset your password</strong>
                <p>
                  A password reset link was requested. Contact the LGU help desk at
                  {' '}<a href="tel:09171234567">(038) 502-9088</a> or visit the municipal
                  hall to verify your identity.
                </p>
                <button type="button" disabled={loading} className="login-forgot-close" onClick={() => setForgot(false)}>
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <form className="login-form" onSubmit={handleSubmit} noValidate autoComplete={mode === 'register' ? 'off' : 'on'}>
            {mode === 'register' && (
              <div className="login-field">
                <label htmlFor="name">Full name</label>
                <div className="login-input-wrap">
                  <User size={18} />
                  <input
                    disabled={loading} id="name"
                    type="text"
                    autoComplete="off"
                    placeholder="e.g. Juan Dela Cruz"
                    value={form.name}
                    onChange={update('name')}
                  />
                </div>
              </div>
            )}

            {mode === 'register' && settings['security.registrationCaptcha'] === true && settings['security.recaptchaSiteKey'] && settings['security.recaptchaVersion'] !== 'v3' && <div className="login-field"><div id="recaptcha-widget" aria-label="reCAPTCHA verification" /></div>}

            <div className="login-field">
              <label htmlFor="email">Email address</label>
              <div className="login-input-wrap">
                {inputIcon}
                <input
                  disabled={loading} id="email"
                  type="email"
                  autoComplete={mode === 'register' ? 'off' : 'email'}
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={update('email')}
                />
              </div>
            </div>

            <div className="login-field">
              <div className="login-label-row">
                <label htmlFor="password">Password</label>
                {mode === 'signin' && (
                  loading ? <span className="login-link-btn" aria-disabled="true">Forgot password?</span> : <Link className="login-link-btn" to="/auth/forgot-password">
                    Forgot password?
                  </Link>
                )}
              </div>
              <div className="login-input-wrap">
                <Lock size={18} />
                <input
                  disabled={loading} id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  minLength={mode === 'register' ? Number(settings['authentication.passwordMinLength'] || 12) : undefined}
                  maxLength={mode === 'register' ? 1024 : undefined}
                  placeholder={mode === 'signin' ? '••••••••' : `At least ${settings['authentication.passwordMinLength'] || 12} characters`}
                  value={form.password}
                  onChange={update('password')}
                />
                <button
                  type="button" disabled={loading}
                  className="login-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-controls="password"
                  title={showPassword ? 'Hide password' : 'Show password'}
                 data-icon-button="ghost">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div className="login-field">
                <label htmlFor="confirm">Confirm password</label>
                <div className="login-input-wrap">
                  <Lock size={18} />
                  <input
                    disabled={loading} id="confirm"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="off"
                    placeholder="Repeat your password"
                    value={form.confirm}
                    onChange={update('confirm')}
                  />
                </div>
              </div>
            )}

            {mode === 'signin' && (
              <div className="login-options-row">
                <label className="login-checkbox">
                  <input
                    disabled={loading} type="checkbox"
                    checked={form.remember}
                    onChange={(e) => setForm((f) => ({ ...f, remember: e.target.checked }))}
                  />
                  <span>Remember me</span>
                </label>
              </div>
            )}

            <button type="submit" className="login-submit" disabled={loading || cooldown > 0}>
              {loading ? (
                <><Loader2 size={18} className="spin" /> {mode === 'signin' ? 'Signing in…' : 'Creating account…'}</>
              ) : cooldown > 0 ? (
                <>Try again in {formatCooldown(cooldown)}</>
              ) : (
                mode === 'signin' ? 'Sign in' : 'Create account'
              )}
            </button>
          </form></section>

          <div className="login-divider"><span>or continue with</span></div>

          <div className="login-social-row">
            <button type="button" disabled={loading} className="login-social" onClick={() => {
              const intended = hasReturnUrl ? returnUrl : getPendingReturnUrl()
              if (intended) setPendingReturnUrl(intended)
              const query = new URLSearchParams({ intent: mode === 'register' ? 'signup' : 'signin' })
              if (mode === 'signin') query.set('remember', String(form.remember))
              if (intended) query.set('returnUrl', intended)
              window.location.href = `/api/auth/google?${query}`
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
                <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z" />
              </svg>
              Google
            </button>
            <div className="login-egov-option" onMouseEnter={() => setEgovNotice(true)} onMouseLeave={() => setEgovNotice(false)}>
              <button type="button" disabled={loading} className="login-social" aria-describedby={egovNotice ? 'egov-availability' : undefined} onFocus={() => setEgovNotice(true)} onBlur={() => setEgovNotice(false)} onClick={() => setEgovNotice(true)} onKeyDown={event => { if (event.key === 'Escape') setEgovNotice(false) }}>
                <img src="/assets/icons/gov/e-gov.png" alt="" className="login-egov-icon" /> eGovPH
              </button>
              {egovNotice && <span id="egov-availability" className="login-egov-notice" role="tooltip">eGovPH sign-in is temporarily unavailable. Use email or Google instead.</span>}
            </div>
          </div>

          {mode === 'signin' ? (
            <p className="login-switch">
              New to Getafe e-services?{' '}
              <button type="button" disabled={loading} className="login-link-btn" onClick={() => switchMode('register')}>
                Create an account
              </button>
            </p>
          ) : (
            <p className="login-switch">
              Already have an account?{' '}
              <button type="button" disabled={loading} className="login-link-btn" onClick={() => switchMode('signin')}>
                Sign in
              </button>
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
