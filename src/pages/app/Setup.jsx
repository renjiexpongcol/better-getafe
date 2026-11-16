import ResidentBarangayField from '../../components/ResidentBarangayField'
import { securityFetch as fetch } from '../../services/securityFetch.js'
import { useEffect, useRef, useState } from 'react'
import { Upload, UserRound, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { usePublicConfig } from '../../context/PublicConfig'
import { passwordPassesPolicy } from '../../passwordPolicy'
import { citizenApi } from '../../services/citizenData'
import { useBarangays } from '../../hooks/usePublicResource'
import StableAvatar from '../../components/StableAvatar'
import ModalDialog from '../../components/ModalDialog'
import { consumePostAuthDestination } from '../../authNavigation'
import '../../citizen.css'
import MobileVerification from '../../components/MobileVerification'
import { normalizeMobile, validMobile } from '../../data/residentContact'

const steps = [
  ['Account Information', 'Personal information'],
  ['Contact Details', 'How we can reach you'],
  ['Home Address', 'Your local address'],
  ['Password', 'Create your portal password'],
  ['Review', 'Check your information'],
  ['Complete', 'Finish setup'],
]

export default function Setup() {
  const barangayResource = useBarangays()
  const { user, loading, refreshUser } = useAuth()
  const navigate = useNavigate()
  const publicConfig = usePublicConfig()
  const minimumPasswordLength = Number(publicConfig['authentication.passwordMinLength'] || 12)
  const fileInput = useRef(null)
  const continueButtonRef = useRef(null)
  const actionInFlight = useRef(false)
  const [step, setStep] = useState(0)
  const [photo, setPhoto] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [verificationOptions, setVerificationOptions] = useState(null)
  const [contactValidationVisible, setContactValidationVisible] = useState(false)
  const [verifiedMobile, setVerifiedMobile] = useState('')
  const [verificationBusy, setVerificationBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSet, setPasswordSet] = useState(Boolean(user?.passwordSet))
  const [form, setForm] = useState(() => {
    const names = (user?.name === user?.email ? '' : user?.name || '').trim().split(/\s+/)
    return { lastName: names.length > 1 ? names.at(-1) : '', firstName: names[0] || '', middleName: names.length > 2 ? names.slice(1, -1).join(' ') : '', mobile: '', email: user?.email || '', houseLot: '', street: '', purok: '', barangay: '' }
  })

  useEffect(() => {
    if (!user) return
    let active = true
    setProfileLoading(true)
    Promise.all([citizenApi('/profile'), citizenApi('/onboarding/options')]).then(([profile, options]) => {
      if (!active) return
      const names = (profile.full_name === user.email ? '' : profile.full_name || user.profileName || '').trim().split(/\s+/)
      setForm(current => ({ ...current, firstName: names[0] || '', lastName: names.length > 1 ? names.at(-1) : '', middleName: names.slice(1, -1).join(' '), mobile: profile.mobile || '', email: user.email || '', barangay: profile.barangay || '', houseLot: profile.house_lot || '', street: profile.street || '', purok: profile.purok_sitio || '' }))
      const avatarUrl = profile.avatar_url || user.avatar_url
      if (avatarUrl) setPhoto({ url: avatarUrl })
      setPasswordSet(Boolean(profile.passwordSet))
      setVerificationOptions(options)
      setVerifiedMobile(profile.mobile_verified_at || profile.mobileVerified ? normalizeMobile(profile.mobile) : '')
      setProfileLoaded(true)
      setError('')
    }).catch(cause => { if (active) { setProfileLoaded(false); setError(cause.message) } }).finally(() => { if (active) setProfileLoading(false) })
    return () => { active = false }
  }, [user?.id, user?.email, loadAttempt])
  if (loading) return null
  if (!user) return <Navigate to="/auth/login" replace />
  const update = key => event => setForm(current => ({ ...current, [key]: event.target.value }))
  const fullName = [form.firstName, form.middleName, form.lastName].map(part => part.trim()).filter(Boolean).join(' ') || user.name
  const homeAddress = [form.houseLot, form.street, form.purok, form.barangay].map(part => part.trim()).filter(Boolean).join(', ') || 'Not provided'
  const mobileVerified = validMobile(form.mobile) && verifiedMobile === normalizeMobile(form.mobile)
  const mobileContactError = step === 1 && contactValidationVisible && !validMobile(form.mobile)
  const emailContactError = step === 1 && contactValidationVisible && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
  const mobileVerificationError = step === 1 && contactValidationVisible && !mobileContactError && !emailContactError && verificationOptions?.mobileVerificationRequired && !mobileVerified
  const confirmMobile = number => { setVerifiedMobile(number); setError('') }
  const saveContact = async () => {
    if (!fullName.trim() || !validMobile(form.mobile)) throw new Error('Enter your full name and a mobile number with 10–15 digits.')
    return citizenApi('/profile', { method: 'PUT', body: JSON.stringify({ full_name: fullName, mobile: normalizeMobile(form.mobile) }) })
  }
  const valid = () => {
    if (step === 0) return form.firstName.trim() && form.lastName.trim()
    if (step === 1) return validMobile(form.mobile) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
    if (step === 2) return form.houseLot.trim() && form.street.trim() && form.purok.trim() && form.barangay.trim()
    if (step === 3) return passwordSet || (passwordPassesPolicy(password, minimumPasswordLength) && password === confirmPassword)
    return true
  }
  const next = async () => {
    if (actionInFlight.current || verificationBusy) return
    if (!profileLoaded || profileLoading) return
    setError('')
    if (step === 1) {
      setContactValidationVisible(true)
      if (!validMobile(form.mobile) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return
    }
    if (!valid()) { setError(step === 3 ? `Use at least ${minimumPasswordLength} characters with uppercase, lowercase, a number, and a special character. Avoid common passwords and keep it within 1,024 characters. Both passwords must match.` : 'Please complete the required fields. A valid mobile number (10–15 digits) is required for Google accounts.'); return }
    if (step === 1 && verificationOptions?.mobileVerificationRequired && !mobileVerified) { setContactValidationVisible(true); return }
    if (step < steps.length - 1 && step !== 1 && (step !== 3 || passwordSet)) {
      setStep(step === 2 && passwordSet ? 4 : step + 1)
      return
    }
    actionInFlight.current = true
    setSaving(true)
    try {
      if (step === 1) { await saveContact(); setStep(2); return }
      if (step === 3) {
        await citizenApi('/onboarding/password', { method: 'POST', body: JSON.stringify({ password }) })
        setPasswordSet(true)
        setPassword('')
        setConfirmPassword('')
        setStep(4)
        return
      }
      await citizenApi('/profile', { method: 'PUT', body: JSON.stringify({ full_name: fullName, mobile: normalizeMobile(form.mobile), barangay: form.barangay, house_lot: form.houseLot, street: form.street, purok_sitio: form.purok }) })
      if (photo?.file) {
        const response = await fetch('/api/citizen/profile/avatar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': photo.file.type }, body: photo.file })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Profile photo upload failed.')
      }
      await citizenApi('/onboarding/complete', { method: 'POST' })
      const current = await refreshUser()
      if (!current || current.setupRequired) throw new Error('Account setup could not be confirmed. Please try again.')
      const target = consumePostAuthDestination(current)
      navigate(target, { replace: true, state: { authDestination: target } })
    } catch (cause) { setError(cause.message) } finally { actionInFlight.current = false; setSaving(false) }
  }
  const goBack = () => {
    if (actionInFlight.current) return
    setError('')
    setStep(current => current === 4 && passwordSet ? 2 : Math.max(0, current - 1))
  }
  const upload = event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Upload a JPEG, PNG, or WebP photo up to 5 MB.'); return }
    setPhoto({ url: URL.createObjectURL(file), file })
  }

  return <main className="account-setup"><section className="account-setup-modal" aria-labelledby="setup-title">
    <header className="account-setup-heading"><img src="/assets/getafe-seal.png" alt="Municipality of Getafe"/><div><h1 id="setup-title">Setup Account Information</h1><p>Confirm your name, add a profile photo if available, and complete any missing details before using the website.</p></div></header>
    <section className="setup-upload-card">
      <div className="setup-photo">{photo ? <StableAvatar src={photo.url} alt="Selected profile" initials={(user?.name || 'Citizen').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()} onFailure={() => setPhoto(null)} /> : <UserRound aria-hidden="true"/>}</div>
      <div className="setup-upload-copy"><h2>Profile Photo (Optional)</h2><em>Use a clear, recent photo if you have one. You can continue with the default avatar.</em><ol><li>Choose a photo taken within the past 6 months.</li><li>Make sure your face is clearly visible.</li></ol></div>
      <button type="button" className="setup-upload-button" onClick={() => fileInput.current?.click()}><Upload size={15}/> Upload</button>
      <input ref={fileInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={upload}/>
    </section>
    <section className="setup-form-card">
      <p className="setup-step-label">Step {step + 1} of {steps.length} - {steps[step][0]}</p>
      <ol className="setup-progress" style={{ '--setup-progress': `${step / (steps.length - 1) * 100}%` }} aria-label={`Step ${step + 1} of ${steps.length}`}>{steps.map(([label], index) => <li key={label} className={index < step ? 'complete' : index === step ? 'current' : ''}><span>{index < step ? <Check size={10}/> : ''}</span></li>)}</ol>
      <h2>{steps[step][1].toUpperCase()}</h2>
      {error && step < 4 && <p className="setup-error" role="alert">{error}</p>}
      {profileLoading && <p role="status">Loading your saved account details…</p>}
      {!profileLoading && !profileLoaded && <button type="button" className="setup-back" onClick={() => setLoadAttempt(value => value + 1)}>Reload saved details</button>}
      <fieldset disabled={saving || verificationBusy || profileLoading || !profileLoaded} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      {step === 0 && <div className="setup-grid"><label><span>Last Name</span><input value={form.lastName} onChange={update('lastName')} placeholder="Enter Last Name..." required/></label><label><span>First Name</span><input value={form.firstName} onChange={update('firstName')} placeholder="Enter First Name..." required/></label><label><span>Middle Name <i>- optional</i></span><input value={form.middleName} onChange={update('middleName')} placeholder="Enter Middle Name..."/></label></div>}
      {step === 1 && <><div className="setup-grid setup-contact-grid"><label className="setup-contact-field"><span>Mobile Number</span><input type="tel" autoComplete="tel" maxLength={32} value={form.mobile} onChange={update('mobile')} placeholder="0917 123 4567" required aria-invalid={mobileContactError || mobileVerificationError ? 'true' : undefined} aria-describedby={`setup-mobile-guidance${mobileContactError ? ' setup-mobile-error' : ''}${mobileVerificationError ? ' setup-mobile-verification-error' : ''}`}/><small id="setup-mobile-guidance">Use 10–15 digits. Spaces, hyphens and a country code are accepted.</small>{mobileContactError && <small id="setup-mobile-error" className="setup-field-error" role="alert">Enter a valid mobile number with 10–15 digits.</small>}{mobileVerificationError && <small id="setup-mobile-verification-error" className="setup-field-error" role="alert">Verify your mobile number before continuing.</small>}</label><label className="setup-contact-field"><span>Email Address</span><input type="email" value={form.email} readOnly placeholder="Enter email address..." required aria-invalid={emailContactError ? 'true' : undefined} aria-describedby={emailContactError ? 'setup-email-error' : undefined}/>{emailContactError && <small id="setup-email-error" className="setup-field-error" role="alert">Enter a valid email address.</small>}</label></div><MobileVerification mobile={form.mobile} verified={mobileVerified} options={verificationOptions} beforeRequest={saveContact} onVerified={confirmMobile} onBusyChange={setVerificationBusy} disabled={saving}/></>}
      {step === 2 && <div className="setup-grid"><label>House / Lot Number<input value={form.houseLot} onChange={update('houseLot')} placeholder="Enter house or lot number..." required/></label><label>Street<input value={form.street} onChange={update('street')} placeholder="Enter street..." required/></label><label>Purok / Sitio<input value={form.purok} onChange={update('purok')} placeholder="Enter purok or sitio..." required/></label><ResidentBarangayField value={form.barangay} onChange={update('barangay')} resource={barangayResource} /></div>}
      {step === 3 && <div className="setup-grid">{passwordSet ? <div className="setup-complete"><Check size={28}/><p>Your portal password has been created.</p></div> : <><label>New Password<input type="password" minLength={minimumPasswordLength} maxLength="1024" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder={`At least ${minimumPasswordLength} characters`} required/></label><label>Confirm Password<input type="password" minLength={minimumPasswordLength} maxLength="1024" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Reenter your password" required/></label></>}</div>}
      </fieldset>
      {step === 4 && <ModalDialog backdropClass="setup-review-backdrop" labelledBy="setup-review-title" describedBy="setup-review-description" onClose={goBack} busy={saving} returnFocusRef={continueButtonRef}>
        <section className="setup-review-modal"><header><div><h2 id="setup-review-title">Review your information</h2><p id="setup-review-description">Make sure your details are correct before completing your account setup.</p></div></header>
          <div className="setup-review setup-review-details"><p className="setup-review-item"><b>Full name</b><span>{fullName}</span></p><p className="setup-review-item"><b>Email address</b><span>{form.email}</span></p><p className="setup-review-item"><b>Mobile number</b><span>{form.mobile}</span></p><p className="setup-review-item"><b>Home address</b><span>{homeAddress}</span></p></div>
          <footer className="setup-review-footer">{error && <p className="setup-error" role="alert">{error}</p>}<div className="setup-review-actions"><button type="button" className="setup-back" data-dialog-close-action="true" onClick={goBack} disabled={saving}>Back to edit</button><button type="button" className="setup-next" onClick={next} disabled={saving}>{saving ? 'Completing…' : 'Complete setup'}</button></div></footer>
        </section>
      </ModalDialog>}
      {step === 5 && <ModalDialog backdropClass="setup-review-backdrop" labelledBy="setup-complete-title" onClose={goBack} busy={saving}>
        <section className="setup-review-modal setup-complete-modal"><div className="setup-complete-modal-body"><span><Check size={25}/></span><div><h2 id="setup-complete-title">Finish account setup</h2><p>Your details are ready. Select <b>Finish Setup</b> to save and continue.</p></div></div>
          {error && <p className="setup-error" role="alert">{error}</p>}
          <footer><button type="button" className="setup-back" onClick={goBack} disabled={saving}><ChevronLeft size={16}/> Back</button><button type="button" className="setup-next" onClick={next} disabled={saving}>{saving ? 'Saving…' : 'Finish Setup'}</button></footer>
        </section>
      </ModalDialog>}
      <footer className="setup-actions" hidden={step >= 4}>{step > 0 && <button type="button" className="setup-back" onClick={goBack} disabled={saving || verificationBusy}><ChevronLeft size={16}/> Back</button>}<button ref={continueButtonRef} type="button" className="setup-next" onClick={next} disabled={saving || verificationBusy || profileLoading || !profileLoaded}>{saving ? 'Saving…' : <>Continue <ChevronRight size={16}/></>}</button></footer>
    </section>
  </section></main>
}
