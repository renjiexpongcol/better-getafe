import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import {
  Mail, Lock, Eye, EyeOff, ArrowRight,
  UserPlus, Loader2,
  KeyRound, User, LogIn, ArrowLeft,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { usePublicConfig } from '../../context/PublicConfig'
import { safeReturnPath } from '../../authNavigation'
import { passwordPassesPolicy } from '../../passwordPolicy'
import { ROUTES } from '../../routeRegistry'

const loginChallengeStorageKey = 'getafe:login:email-challenge'
const secondsUntil = timestamp => Math.max(0, Math.ceil((Number(timestamp || 0) - Date.now()) / 1000))
const readStoredLoginChallenge = () => {
  if (typeof window === 'undefined') return null
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(loginChallengeStorageKey) || 'null')
    return stored?.challengeId ? stored : null
  } catch { return null }
}

export default function Login() {
  const { user, loading: authLoading, login, completeMfa, register } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState('signin') // 'signin' | 'register'
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
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
  const codeRef = useRef(null)
  const returnUrl = safeReturnPath(searchParams.get('returnUrl'))
  const destination = role => returnUrl || (['admin', 'super_admin'].includes(role) ? ROUTES.admin.root : ['staff', 'it_support', 'content_manager'].includes(role) ? ROUTES.staff.root : ROUTES.app.root)
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
    if (searchParams.get('google') === 'existing') setInfo('This Google email already has a Getafe e-services account. Please sign in with your existing account.')
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
    setError(`Too many attempts. Please try again in ${seconds} seconds.`)
    return true
  }
  const handleResult = res => {
    if (res.verificationRequired) { setEmailChallenge(res.challengeId, res.nextResendAt, res.retryAfter); setError(''); return }
    if (res.mfaRequired) { clearEmailChallenge(); setMfaChallenge(res.mfaChallengeId); setError(''); return }
    if (res.passwordExpired) { clearEmailChallenge(); setRenewal(true); setError(''); return }
    if (!res.ok) { if (!applyRateLimit(res)) setError(res.error); return }
    else { clearEmailChallenge(); navigate(res.setup ? '/app/setup' : destination(res.user?.role || (res.admin ? 'admin' : 'resident')), { replace: true }) }
  }
  const completeMfaChallenge = async event => {
    event.preventDefault(); if (actionInFlight.current || loading || cooldown > 0) return; actionInFlight.current = true; setLoading(true); setError('')
    try {
      const result = await completeMfa(mfaChallenge, code)
      if (!result.ok) { if (!applyRateLimit(result)) setError(result.error) }
      else navigate(destination(result.admin ? 'admin' : result.user?.role), { replace: true })
    } catch { setError('Verification is temporarily unavailable.') } finally { setLoading(false); actionInFlight.current = false }
  }
  const completeChallenge = async event => {
    event.preventDefault(); if (actionInFlight.current || loading || cooldown > 0) return; actionInFlight.current = true; setLoading(true); setError('')
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
          throw new Error(`Too many attempts. Please try again in ${seconds} seconds.`)
        }
        if (!renewal && response.status === 401 && /expired/i.test(body.error || '')) {
          setResendUntil(0)
          setResendCooldown(0)
          setChallengeMessage('')
        }
        throw new Error(body.error || 'Verification failed.')
      }
      if (renewal) { clearEmailChallenge(); setRenewal(null); setError('Password updated. Sign in with your new password.'); setForm(previous => ({ ...previous, password: '' })) }
      else { clearEmailChallenge(); navigate(destination(body.user?.role || (body.admin ? 'admin' : 'resident')), { replace: true }) }
    } catch (error) { setError(error.message) } finally { actionInFlight.current = false; setLoading(false) }
  }
  const resendVerificationCode = async () => {
    if (actionInFlight.current || loading || resendCooldown > 0 || !challenge) return
    actionInFlight.current = true
    setLoading(true)
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
    } catch (error) { setError(error.message) } finally { actionInFlight.current = false; setLoading(false) }
  }
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirm: '',
    remember: true,
  })

  // Keep the login page from being used as an authenticated landing page.
  useEffect(() => {
    if (!authLoading && user) navigate(destination(user.role), { replace: true })
  }, [user, authLoading, navigate, returnUrl])

  useEffect(() => {
    if (mode !== 'register' || settings['security.registrationCaptcha'] !== true || !settings['security.recaptchaSiteKey']) return
    setCaptchaToken('')
    let script = document.querySelector('script[data-recaptcha]')
    if (!script) { script = document.createElement('script'); script.src = 'https://www.google.com/recaptcha/api.js?render=explicit'; script.async = true; script.defer = true; script.dataset.recaptcha = 'true' }
    if (!script.parentNode) document.head.appendChild(script)
    const render = () => { if (window.grecaptcha && document.getElementById('recaptcha-widget') && !document.getElementById('recaptcha-widget').dataset.rendered) { window.grecaptcha.render('recaptcha-widget', { sitekey: settings['security.recaptchaSiteKey'], callback: setCaptchaToken, 'expired-callback': () => setCaptchaToken(''), 'error-callback': () => setCaptchaToken('') }); document.getElementById('recaptcha-widget').dataset.rendered = 'true' } }
    script.addEventListener('load', render); const timer = setInterval(render, 250)
    return () => { clearInterval(timer); script.removeEventListener('load', render) }
  }, [mode, settings['security.registrationCaptcha'], settings['security.recaptchaSiteKey']])

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (actionInFlight.current || loading || cooldown > 0) return
    setError('')

    if (mode === 'signin') {
      if (!form.email.trim() || !form.password) {
        setError('Please enter your email and password.')
        return
      }
      actionInFlight.current = true
      setLoading(true)
      login(form.email, form.password, form.remember).then((res) => {
        setLoading(false)
        handleResult(res)
      }).finally(() => {
        actionInFlight.current = false
      })
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
      actionInFlight.current = true
      setLoading(true)
      setTimeout(() => {
        register(form.name, form.email, form.password, captchaToken).then((res) => {
          setLoading(false)
          handleResult(res)
        }).finally(() => {
          actionInFlight.current = false
        })
      }, 650)
    }
  }

  const switchMode = (next) => {
    setMode(next)
    setForgot(false)
    setError('')
  }

  const inputIcon = mode === 'signin' ? <Mail size={18} /> : <User size={18} />

  if (mfaChallenge) return <main className="login-page login-challenge-page"><section className="login-main"><form className="login-card password-renewal-card" onSubmit={completeMfaChallenge}><img className="mfa-authentication-icon" src="/assets/icons/auth-pack/authentication.png" alt="" aria-hidden="true"/><h1>Two-factor authentication</h1><p>Enter the six-digit code from your authenticator app, or one of your recovery codes.</p><label>Authenticator or recovery code<input required type="text" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} /></label>{error && <p role="alert">{error}</p>}<button className="login-submit" disabled={loading || cooldown > 0}>{loading ? 'Verifying…' : cooldown > 0 ? `Try again in ${cooldown}s` : 'Verify and sign in'}</button><button className="renewal-cancel" type="button" onClick={() => { setMfaChallenge(null); setCode(''); setError('') }}>Return to sign in</button></form></section></main>

  if (challenge || renewal) return <main className="login-page login-challenge-page"><section className="login-main"><form className={`login-card ${renewal ? 'password-renewal-card' : 'email-code-card'}`} onSubmit={completeChallenge}>{renewal && <img className="renewal-logo" src="/assets/getafe-seal.png" alt="Municipality of Getafe" />}<h1>{renewal ? 'Update your password' : 'Check your email'}</h1><p>{renewal ? 'You need to update your password because it has expired or this is your first time signing in.' : 'Enter the six-digit sign-in code sent to your email address.'}</p>{renewal ? <><label htmlFor="new-password">New password<input id="new-password" required minLength={Number(settings['authentication.passwordMinLength'] || 12)} maxLength="1024" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="New password" /></label><label htmlFor="confirm-new-password">Confirm password<input id="confirm-new-password" required minLength={Number(settings['authentication.passwordMinLength'] || 12)} maxLength="1024" type="password" autoComplete="new-password" value={confirmNewPassword} onChange={event => setConfirmNewPassword(event.target.value)} placeholder="Confirm password" /></label></> : <><label htmlFor="verification-code">Verification code<input ref={codeRef} id="verification-code" required type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} aria-describedby={`${error ? 'verification-code-error' : ''}${challengeMessage ? ' verification-code-status' : ''}`} aria-invalid={Boolean(error)} /></label>{challengeMessage && <p id="verification-code-status" className="email-code-message" role="status">{challengeMessage}</p>}</>}{error && <p id={renewal ? undefined : 'verification-code-error'} className="login-error" role="alert">{error}</p>}<button className="login-submit" disabled={loading || cooldown > 0 || (!renewal && code.length !== 6)}>{loading ? (renewal ? 'Checking…' : 'Verifying…') : cooldown > 0 ? `Try again in ${cooldown}s` : renewal ? 'Sign in' : 'Continue'}</button>{!renewal && <><p className="email-resend-prompt">Didn't receive the code?</p><button className="email-resend-button" type="button" onClick={resendVerificationCode} disabled={loading || resendCooldown > 0} aria-label={resendCooldown > 0 ? `Resend code in ${resendCooldown} seconds` : 'Resend code'}>{loading ? 'Sending…' : resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}</button><button className="login-tertiary-link" type="button" onClick={() => { clearEmailChallenge(); setCode(''); setError(''); setChallengeMessage('') }}>← Back to sign in</button></>}{renewal && <button className="renewal-cancel" type="button" onClick={() => { clearEmailChallenge(); setRenewal(null); setCode('') }}>Return to sign in</button>}</form></section></main>

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
          <div className="login-mobile-brand">
            <img src="/assets/getafe-seal.png" alt="Getafe seal" className="login-seal" />
            <div>
              <div className="login-brand-name">Municipality of Getafe</div>
              <div className="login-brand-sub">Bohol • Philippines</div>
            </div>
          </div>

          <div className="login-tabs" role="tablist" aria-label="Account access">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              className={mode === 'signin' ? 'login-tab active' : 'login-tab'}
              onClick={() => switchMode('signin')}
            >
              <LogIn size={16} /> Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'login-tab active' : 'login-tab'}
              onClick={() => switchMode('register')}
            >
              <UserPlus size={16} /> Create account
            </button>
          </div>

          <h2 className="login-heading">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="login-subheading">
            {mode === 'signin'
              ? 'Enter your credentials to access the Getafe e-services portal.'
              : 'Register to start using municipal digital services.'}
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
                <button type="button" className="login-forgot-close" onClick={() => setForgot(false)}>
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
                    id="name"
                    type="text"
                    autoComplete="off"
                    placeholder="e.g. Juan Dela Cruz"
                    value={form.name}
                    onChange={update('name')}
                  />
                </div>
              </div>
            )}

            {mode === 'register' && settings['security.registrationCaptcha'] === true && settings['security.recaptchaSiteKey'] && <div className="login-field"><div id="recaptcha-widget" aria-label="reCAPTCHA verification" /></div>}

            <div className="login-field">
              <label htmlFor="email">Email address</label>
              <div className="login-input-wrap">
                {inputIcon}
                <input
                  id="email"
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
                  <Link className="login-link-btn" to="/auth/forgot-password">
                    Forgot password?
                  </Link>
                )}
              </div>
              <div className="login-input-wrap">
                <Lock size={18} />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  minLength={mode === 'register' ? Number(settings['authentication.passwordMinLength'] || 12) : undefined}
                  maxLength={mode === 'register' ? 1024 : undefined}
                  placeholder={mode === 'signin' ? '••••••••' : `At least ${settings['authentication.passwordMinLength'] || 12} characters`}
                  value={form.password}
                  onChange={update('password')}
                />
                <button
                  type="button"
                  className="login-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                    id="confirm"
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
                    type="checkbox"
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
                <>Try again in {cooldown}s</>
              ) : (
                <>{mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          <div className="login-divider"><span>or continue with</span></div>

          <div className="login-social-row">
            <button type="button" className="login-social" onClick={() => { window.location.href = `/api/auth/google?intent=${mode === 'register' ? 'signup' : 'signin'}` }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
                <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z" />
              </svg>
              Google
            </button>
            <button type="button" className="login-social">
              <img src="/assets/icons/gov/e-gov.png" alt="" className="login-egov-icon" /> eGovPH
            </button>
          </div>

          {mode === 'signin' ? (
            <p className="login-switch">
              New to Getafe e-services?{' '}
              <button type="button" className="login-link-btn" onClick={() => switchMode('register')}>
                Create an account
              </button>
            </p>
          ) : (
            <p className="login-switch">
              Already have an account?{' '}
              <button type="button" className="login-link-btn" onClick={() => switchMode('signin')}>
                Sign in
              </button>
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
