import { useEffect, useState } from 'react'
import { esApi, useEservice } from './EserviceUI'
import { barangays } from '../data/barangays'

const empty = { business_name: '', trade_name: '', ownership_type: '', address: { street: '', barangay: '' } }

export default function ResidentBusinesses({ onDirtyChange, onBusyChange }) {
  const businesses = useEservice(() => esApi('/businesses'), [])
  const [editing, setEditing] = useState(false)
  const [id, setId] = useState(null)
  const [form, setForm] = useState(empty)
  const [initial, setInitial] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const dirty = editing && JSON.stringify(form) !== JSON.stringify(initial)
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => { onBusyChange(busy) }, [busy, onBusyChange])
  const edit = business => {
    const next = business ? { business_name: business.business_name, trade_name: business.trade_name, ownership_type: business.ownership_type, address: { street: business.address.street || '', barangay: business.address.barangay || '' } } : empty
    setId(business?.id || null); setForm(next); setInitial(next); setEditing(true); setError(''); setSaved(false)
  }
  const update = key => event => setForm(current => ({ ...current, [key]: event.target.value }))
  const updateAddress = key => event => setForm(current => ({ ...current, address: { ...current.address, [key]: event.target.value } }))
  const save = async event => {
    event.preventDefault(); setBusy(true); setError(''); setSaved(false)
    try {
      const business = await esApi(id ? `/businesses/${id}` : '/businesses', id ? 'PUT' : 'POST', form, crypto.randomUUID())
      setInitial(form); setEditing(false); setSaved(true)
      await businesses.refresh()
      window.dispatchEvent(new CustomEvent('resident-businesses-updated', { detail: { id: business.id } }))
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  return <section className="profile-businesses" aria-labelledby="profile-business-title">
    <h2 id="profile-business-title">Business information</h2>
    <p className="portal-muted">Save your businesses here to use them in municipal service applications. The office will verify newly added details.</p>
    {businesses.loading && <p role="status">Loading your businesses…</p>}
    {businesses.error && <p className="portal-error" role="alert">{businesses.error} <button type="button" className="citizen-secondary" onClick={businesses.refresh}>Try again</button></p>}
    {!businesses.loading && businesses.data?.items.length === 0 && <p>You haven’t added a business yet.</p>}
    {businesses.data?.items.map(business => <article className="profile-business-card" key={business.id}>
      <div><h3>{business.business_name}</h3><p>{business.ownership_type}</p><p>{[business.address?.street, business.address?.barangay, business.address?.municipality].filter(Boolean).join(', ')}</p><small>{business.status === 'UNVERIFIED' ? 'For verification' : business.status === 'ACTIVE' ? 'Registered' : 'Under review'}</small>{(business.status !== 'UNVERIFIED' || business.profile_editable === false) && <p>Contact the business permits office to update this record.</p>}</div>
      {business.status === 'UNVERIFIED' && business.profile_editable !== false && !editing && <button className="citizen-secondary" type="button" onClick={() => edit(business)}>Edit business</button>}
    </article>)}
    {!editing && <button type="button" className="citizen-secondary" onClick={() => edit(null)} disabled={businesses.loading || !!businesses.error}>Add business</button>}
    {editing && <form onSubmit={save}>
      <h3>{id ? 'Edit business information' : 'Add a business'}</h3>
      <div className="portal-form-grid">
        <label>Business name<input aria-label="Business name" autoFocus required maxLength={160} value={form.business_name} onChange={update('business_name')} /></label>
        <label>Trade name (optional)<input aria-label="Trade name (optional)" maxLength={160} value={form.trade_name} onChange={update('trade_name')} /></label>
        <label>Ownership type<select aria-label="Ownership type" required value={form.ownership_type} onChange={update('ownership_type')}><option value="">Choose ownership type</option>{['Sole proprietorship', 'Partnership', 'Corporation', 'Cooperative'].map(type => <option key={type}>{type}</option>)}</select></label>
        <label>Business barangay<select aria-label="Business barangay" required value={form.address.barangay} onChange={updateAddress('barangay')}><option value="">Choose business barangay</option>{barangays.map(item => <option key={item.name}>{item.name}</option>)}</select></label>
      </div>
      <label>Business street, building or purok<input aria-label="Business street, building or purok" required maxLength={240} value={form.address.street} onChange={updateAddress('street')} /></label>
      <p className="portal-muted">Getafe, Bohol</p>
      <div className="profile-form-actions"><button type="button" className="citizen-secondary" disabled={busy} onClick={() => { setEditing(false); setError('') }}>Cancel business edit</button><button className="citizen-primary" disabled={busy}>{busy ? 'Saving…' : 'Save business'}</button></div>
    </form>}
    {error && <p className="portal-error" role="alert">{error}</p>}
    {saved && <p className="portal-success" role="status">Business information saved. You can now choose it in your application.</p>}
  </section>
}
