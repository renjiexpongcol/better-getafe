import { useEffect, useRef, useState } from 'react'
import { Upload, UserRound, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { citizenApi } from '../../services/citizenData'
import { barangays } from '../../data/barangays'
import '../../citizen.css'

const steps = [
  ['Account Information', 'Personal information'],
  ['Contact Details', 'How we can reach you'],
  ['Home Address', 'Your local address'],
  ['Password', 'Create your portal password'],
  ['Review', 'Check your information'],
  ['Complete', 'Finish setup'],
]

export default function Setup() {
  const { user, loading } = useAuth()
  const fileInput = useRef(null)
  const reviewDialog = useRef(null)
  const [step, setStep] = useState(0)
  const [photo, setPhoto] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
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
    citizenApi('/profile').then(profile => {
      if (!active) return
      const names = (profile.full_name === user.email ? '' : profile.full_name || user.profileName || '').trim().split(/\s+/)
      setForm(current => ({ ...current, firstName: names[0] || '', lastName: names.length > 1 ? names.at(-1) : '', middleName: names.slice(1, -1).join(' '), mobile: profile.mobile || '', email: user.email || '', barangay: profile.barangay || '', houseLot: profile.house_lot || '', street: profile.street || '', purok: profile.purok_sitio || '' }))
      if (profile.avatar_url) setPhoto({ url: profile.avatar_url })
      setPasswordSet(Boolean(profile.passwordSet))
    }).catch(cause => { if (active) setError(cause.message) })
    return () => { active = false }
  }, [user])
  useEffect(() => {
    if (passwordSet && step === 3) setStep(4)
  }, [passwordSet, step])
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])
  useEffect(() => {
    if (step < 4) return undefined
    const closeModal = event => {
      if (event.key === 'Escape') {
        setError('')
        setStep(current => current - 1)
      }
    }
    reviewDialog.current?.focus()
    document.addEventListener('keydown', closeModal)
    return () => {
      document.removeEventListener('keydown', closeModal)
    }
  }, [step])
  if (loading) return null
  if (!user) return <Navigate to="/auth/login" replace />
  const update = key => event => setForm(current => ({ ...current, [key]: event.target.value }))
  const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(' ') || user.name
  const valid = () => {
    if (step === 0) return form.firstName.trim() && form.lastName.trim() && photo
    if (step === 1) return /^\+?[0-9]{10,15}$/.test(form.mobile.replace(/[\s()-]/g, '')) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
    if (step === 2) return form.houseLot.trim() && form.street.trim() && form.purok.trim() && form.barangay.trim()
    if (step === 3) return passwordSet || (password.length >= 8 && password === confirmPassword && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password))
    return true
  }
  const next = async () => {
    setError('')
    if (!valid()) { setError(step === 3 ? 'Use at least 8 characters with uppercase, lowercase, a number, and a special character. Both passwords must match.' : 'Please complete the required fields. A profile photo and a valid mobile number (10–15 digits) are required for Google accounts.'); return }
    if (step === 3 && !passwordSet) {
      setSaving(true)
      try { await citizenApi('/onboarding/password', { method: 'POST', body: JSON.stringify({ password }) }); setPasswordSet(true); setPassword(''); setConfirmPassword('') }
      catch (cause) { setError(cause.message); setSaving(false); return }
      setSaving(false)
    }
    if (step < steps.length - 1) { setStep(current => current + 1); return }
    setSaving(true)
    try {
      await citizenApi('/profile', { method: 'PUT', body: JSON.stringify({ full_name: fullName, mobile: form.mobile, barangay: form.barangay, house_lot: form.houseLot, street: form.street, purok_sitio: form.purok }) })
      if (photo?.file) {
        const response = await fetch('/api/citizen/profile/avatar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': photo.file.type }, body: photo.file })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Profile photo upload failed.')
      }
      await citizenApi('/onboarding/complete', { method: 'POST' })
      window.location.replace('/app?sysparm_object_id=dashboard')
    } catch (cause) { setError(cause.message) } finally { setSaving(false) }
  }
  const upload = event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Upload a JPEG, PNG, or WebP photo up to 5 MB.'); return }
    setPhoto({ url: URL.createObjectURL(file), file })
  }

  return <main className="account-setup"><section className="account-setup-modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
    <header className="account-setup-heading"><img src="/assets/getafe-seal.png" alt="Municipality of Getafe"/><div><h1 id="setup-title">Setup Account Information</h1><p>Confirm your name, profile photo, email address and mobile number. Complete any missing details before using the website.</p></div></header>
    <section className="setup-upload-card">
      <div className="setup-photo">{photo ? <img src={photo.url} alt="Selected profile"/> : <UserRound aria-hidden="true"/>}</div>
      <div className="setup-upload-copy"><h2>Upload Instructions</h2><em>To avoid delay or disapproval of your applications, please follow the instructions below.</em><ol><li>The photo must be taken no more than 6 months prior to uploading.</li><li>The applicant's face must be clear.</li></ol></div>
      <button type="button" className="setup-upload-button" onClick={() => fileInput.current?.click()}><Upload size={15}/> Upload</button>
      <input ref={fileInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={upload}/>
    </section>
    <section className="setup-form-card">
      <p className="setup-step-label">Step {step + 1} of {steps.length} - {steps[step][0]}</p>
      <ol className="setup-progress" style={{ '--setup-progress': `${step / (steps.length - 1) * 100}%` }} aria-label={`Step ${step + 1} of ${steps.length}`}>{steps.map(([label], index) => <li key={label} className={index < step ? 'complete' : index === step ? 'current' : ''}><span>{index < step ? <Check size={10}/> : ''}</span></li>)}</ol>
      <h2>{steps[step][1].toUpperCase()}</h2>
      {error && <p className="setup-error" role="alert">{error}</p>}
      {step === 0 && <div className="setup-grid"><label><span>Last Name</span><input value={form.lastName} onChange={update('lastName')} placeholder="Enter Last Name..." required/></label><label><span>First Name</span><input value={form.firstName} onChange={update('firstName')} placeholder="Enter First Name..." required/></label><label><span>Middle Name <i>- optional</i></span><input value={form.middleName} onChange={update('middleName')} placeholder="Enter Middle Name..."/></label></div>}
      {step === 1 && <div className="setup-grid"><label>Mobile Number<input type="tel" value={form.mobile} onChange={update('mobile')} placeholder="Enter mobile number..." required/></label><label>Email Address<input type="email" value={form.email} readOnly placeholder="Enter email address..." required/></label></div>}
      {step === 2 && <div className="setup-grid"><label>House / Lot Number<input value={form.houseLot} onChange={update('houseLot')} placeholder="Enter house or lot number..." required/></label><label>Street<input value={form.street} onChange={update('street')} placeholder="Enter street..." required/></label><label>Purok / Sitio<input value={form.purok} onChange={update('purok')} placeholder="Enter purok or sitio..." required/></label><label>Barangay<select value={form.barangay} onChange={update('barangay')} required><option value="">Select barangay...</option>{barangays.map(barangay => <option key={barangay.id} value={barangay.name}>{barangay.name}</option>)}</select></label></div>}
      {step === 3 && <div className="setup-grid">{passwordSet ? <div className="setup-complete"><Check size={28}/><p>Your portal password has been created.</p></div> : <><label>New Password<input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Create a strong password" required/></label><label>Confirm Password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Reenter your password" required/></label></>}</div>}
      {step === 4 && <div className="setup-review-backdrop" role="presentation"><section ref={reviewDialog} className="setup-review-modal" role="dialog" aria-modal="true" aria-labelledby="setup-review-title" tabIndex="-1"><header><div><h2 id="setup-review-title">Check your information</h2><p>Please confirm these details before completing your account setup.</p></div></header><div className="setup-review"><p><b>Name</b><span>{fullName}</span></p><p><b>Email</b><span>{form.email}</span></p><p><b>Mobile</b><span>{form.mobile}</span></p><p><b>Address</b><span>{[form.houseLot, form.street, form.purok, form.barangay].filter(Boolean).join(', ') || 'Not provided'}</span></p></div><footer><button type="button" className="setup-back" onClick={() => { setError(''); setStep(3) }}><ChevronLeft size={16}/> Back</button><button type="button" className="setup-next" onClick={next}>Confirm information <ChevronRight size={16}/></button></footer></section></div>}
      {step === 5 && <div className="setup-review-backdrop" role="presentation"><section ref={reviewDialog} className="setup-review-modal setup-complete-modal" role="dialog" aria-modal="true" aria-labelledby="setup-complete-title" tabIndex="-1"><div className="setup-complete-modal-body"><span><Check size={25}/></span><div><h2 id="setup-complete-title">Account setup complete</h2><p>Your account information is ready. Select <b>Finish Setup</b> to continue to your dashboard.</p></div></div><footer><button type="button" className="setup-back" onClick={() => { setError(''); setStep(4) }}><ChevronLeft size={16}/> Back</button><button type="button" className="setup-next" onClick={next} disabled={saving}>{saving ? 'Saving…' : 'Finish Setup'}</button></footer></section></div>}
      {step < 4 && <footer className="setup-actions">{step > 0 && <button type="button" className="setup-back" onClick={() => { setError(''); setStep(current => current - 1) }}><ChevronLeft size={16}/> Back</button>}<button type="button" className="setup-next" onClick={next} disabled={saving}>{saving ? 'Saving…' : <>Continue <ChevronRight size={16}/></>}</button></footer>}
    </section>
  </section></main>
}
