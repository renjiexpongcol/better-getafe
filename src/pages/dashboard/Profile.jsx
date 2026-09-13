import { useEffect, useState } from 'react'
import { Camera, Save } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCitizen } from '../../context/CitizenContext'
import AppPage from '../app/AppPage'
import { DataState } from '../../components/CitizenWidgets'
import { citizenApi } from '../../services/citizenData'
export default function Profile() { return <AppPage title="My profile"><ProfileForm/></AppPage> }
function ProfileForm() {
  const { user } = useAuth(), { data, reload } = useCitizen()
  const [form, setForm] = useState({ full_name: '', mobile: '', barangay: '', house_lot: '', street: '', purok_sitio: '' }), [saved, setSaved] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false), [avatarBusy, setAvatarBusy] = useState(false), [avatarError, setAvatarError] = useState('')
  useEffect(() => { if (data) setForm(current => Object.fromEntries(Object.keys(current).map(key => [key, data.profile?.[key] || (key === 'full_name' ? user.name : '')]))) }, [data, user.name])
  const update = key => event => { setSaved(false); setError(''); setForm(current => ({ ...current, [key]: event.target.value })) }
  const submit = async event => { event.preventDefault(); setSaved(false); setError(''); setBusy(true); try { await citizenApi('/profile', { method: 'PUT', body: JSON.stringify(form) }); await reload(); setSaved(true) } catch (error) { setError(error.message) } finally { setBusy(false) } }
  const uploadAvatar = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setAvatarBusy(true); setAvatarError('')
    try {
      const response = await fetch('/api/citizen/profile/avatar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type }, body: file })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Profile photo upload failed.')
      await reload()
    } catch (cause) { setAvatarError(cause.message) } finally { setAvatarBusy(false) }
  }
  return <section className="citizen-panel portal-form"><DataState><form onSubmit={submit}><div className="profile-photo-row"><div className="profile-photo">{data?.profile?.avatar_url ? <img src={data.profile.avatar_url} alt={`${form.full_name || user.name}'s profile`}/> : <span>{(form.full_name || user.name).split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span>}</div><div><h2>Personal and contact information</h2><p className="portal-muted">Keep your information current to make municipal applications easier. Your email is linked to your account.</p><label className="profile-photo-button"><Camera size={16}/>{avatarBusy ? 'Uploading…' : 'Upload profile photo'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={avatarBusy}/></label><small className="profile-photo-help">JPEG, PNG or WebP · up to 5 MB</small>{avatarError && <p className="portal-error" role="alert">{avatarError}</p>}</div></div><div className="portal-form-grid"><label>Full name<input value={form.full_name} onChange={update('full_name')} required maxLength={160}/></label><label>Email address<input value={user.email} readOnly/></label><label>Mobile number<input type="tel" value={form.mobile} onChange={update('mobile')} maxLength={32}/></label><label>Barangay<input value={form.barangay} onChange={update('barangay')} maxLength={160}/></label><label>House/lot number<input value={form.house_lot} onChange={update('house_lot')} maxLength={160}/></label><label>Street<input value={form.street} onChange={update('street')} maxLength={160}/></label></div><label>Purok or sitio<input value={form.purok_sitio} onChange={update('purok_sitio')} maxLength={160}/></label>{error && <p className="portal-error" role="alert">{error}</p>}{saved && <p className="portal-success" role="status">Profile saved.</p>}<button className="citizen-primary" disabled={busy}><Save size={16}/>{busy ? 'Saving…' : 'Save changes'}</button></form></DataState></section>
}
