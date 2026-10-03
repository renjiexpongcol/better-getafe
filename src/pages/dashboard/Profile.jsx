import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Camera, Save } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useCitizen } from '../../context/CitizenContext'
import { citizenApi } from '../../services/citizenData'
import { barangays } from '../../data/barangays'
import { ROUTES } from '../../routeRegistry'
import StableAvatar from '../../components/StableAvatar'
import ResidentBusinesses from '../../components/ResidentBusinesses'

// Kept as a route component for old bookmarks and legacy links. Resident
// profile is now owned by CitizenLayout and opens as a modal on the current
// app page instead of rendering a second standalone implementation.
export default function Profile() {
  return <Navigate to={ROUTES.app.root} replace state={{ openProfileModal: true }} />
}

const emptyForm = { full_name: '', mobile: '', gender: '', barangay: '', house_lot: '', street: '', purok_sitio: '' }
const formKeys = Object.keys(emptyForm)

function profileFormFromData(data, fallbackName) {
  return Object.fromEntries(formKeys.map(key => [key, data?.profile?.[key] || (key === 'full_name' ? fallbackName : '')]))
}

export const ProfileForm = forwardRef(function ProfileForm({ onClose }, ref) {
  const { user, updateUser } = useAuth()
  const { data, loading, error: dataError, reload } = useCitizen()
  const initialFormRef = useRef(emptyForm)
  const [form, setForm] = useState(emptyForm)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [businessDirty, setBusinessDirty] = useState(false)
  const [businessBusy, setBusinessBusy] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const pendingActionRef = useRef(null)

  useEffect(() => {
    if (!data) return
    const next = profileFormFromData(data, user.name)
    setForm(next)
    initialFormRef.current = next
    setSaved(false)
    setConfirmDiscard(false)
  }, [data, user.name])

  const dirty = businessDirty || formKeys.some(key => form[key] !== initialFormRef.current[key])
  const guardAction = useCallback(action => {
    if (busy || avatarBusy || businessBusy) return
    if (dirty) {
      pendingActionRef.current = action
      setConfirmDiscard(true)
      return
    }
    action?.()
  }, [avatarBusy, businessBusy, busy, dirty])
  const requestClose = useCallback(() => guardAction(onClose), [guardAction, onClose])

  useImperativeHandle(ref, () => ({ requestClose, requestSwitch: guardAction }), [guardAction, requestClose])

  const update = key => event => {
    setSaved(false)
    setError('')
    setForm(current => ({ ...current, [key]: event.target.value }))
  }

  const submit = async event => {
    event.preventDefault()
    setSaved(false)
    setError('')
    setBusy(true)
    try {
      await citizenApi('/profile', { method: 'PUT', body: JSON.stringify(form) })
      initialFormRef.current = { ...form }
      updateUser?.({ name: form.full_name })
      await reload()
      setSaved(true)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const uploadAvatar = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setAvatarBusy(true)
    setAvatarError('')
    try {
      const response = await fetch('/api/citizen/profile/avatar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type }, body: file })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Profile photo upload failed.')
      await reload()
    } catch (cause) {
      setAvatarError(cause.message)
    } finally {
      setAvatarBusy(false)
    }
  }

  if (loading && !data) {
    return <div className="profile-modal-state" role="status"><span className="page-loader-spinner"/>Loading your account information…</div>
  }
  if (!data) {
    return <div className="profile-modal-state profile-modal-error" role="alert"><strong>We couldn't load your account information.</strong><p>{dataError || 'Please try again.'}</p><button type="button" className="citizen-primary" onClick={reload}>Try again</button></div>
  }

  return (
    <section className="citizen-panel portal-form profile-form-panel">
      <form onSubmit={submit}>
        <div className="profile-photo-row">
          <div className="profile-photo">
            <StableAvatar src={data.profile?.avatar_url} alt={`${form.full_name || user.name}'s profile`} initials={(form.full_name || user.name).split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()} />
          </div>
          <div>
            <h2 id="profile-personal-information-title">Personal and contact information</h2>
            <p className="portal-muted">Keep your information current to make municipal applications easier. Your email is linked to your account.</p>
            <label className="profile-photo-button"><Camera size={16} aria-hidden="true" />{avatarBusy ? 'Uploading…' : 'Upload profile photo'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={avatarBusy} /></label>
            <small className="profile-photo-help">JPEG, PNG or WebP · up to 5 MB</small>
            {avatarError && <p className="portal-error" role="alert">{avatarError}</p>}
          </div>
        </div>
        <div className="portal-form-grid">
          <label>Full name<input aria-label="Full name" value={form.full_name} onChange={update('full_name')} required maxLength={160} /></label>
          <label>Email address<input aria-label="Email address" value={user.email || ''} readOnly /></label>
          <label>Mobile number<input aria-label="Mobile number" type="tel" value={form.mobile} onChange={update('mobile')} maxLength={32} /></label>
          <label>Gender<select aria-label="Gender" value={form.gender} onChange={update('gender')} required><option value="">Select gender</option><option value="male">Male</option><option value="female">Female</option></select></label>
          <label>Barangay<select aria-label="Barangay" value={form.barangay} onChange={update('barangay')} required><option value="">Select your barangay</option>{barangays.map(item => <option value={item.name} key={item.name}>{item.name}</option>)}</select></label>
          <label>House/lot number<input aria-label="House/lot number" value={form.house_lot} onChange={update('house_lot')} maxLength={160} /></label>
          <label>Street<input aria-label="Street" value={form.street} onChange={update('street')} maxLength={160} /></label>
        </div>
        <label>Purok or sitio<input aria-label="Purok or sitio" value={form.purok_sitio} onChange={update('purok_sitio')} maxLength={160} /></label>
        {error && <p className="portal-error" role="alert">{error}</p>}
        {saved && <p className="portal-success" role="status">Profile saved.</p>}
        <div className="profile-form-actions">
          <button type="button" className="portal-action-secondary" onClick={requestClose} disabled={busy || avatarBusy}>Cancel</button>
          <button type="submit" className="citizen-primary" disabled={busy || avatarBusy}><Save size={16} aria-hidden="true" />{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
      <ResidentBusinesses onDirtyChange={setBusinessDirty} onBusyChange={setBusinessBusy} />
      {confirmDiscard && <div className="profile-discard-confirmation" role="alertdialog" aria-labelledby="discard-profile-title" aria-describedby="discard-profile-description"><div><h3 id="discard-profile-title">Discard unsaved changes?</h3><p id="discard-profile-description">Your edits will be lost if you close your account profile now.</p></div><div><button type="button" className="citizen-secondary" onClick={() => { pendingActionRef.current = null; setConfirmDiscard(false) }}>Keep editing</button><button type="button" className="citizen-primary" onClick={() => { const action = pendingActionRef.current || onClose; pendingActionRef.current = null; setConfirmDiscard(false); action?.() }}>Discard changes</button></div></div>}
    </section>
  )
})
