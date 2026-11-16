import { useEffect, useState } from 'react'
import MediaFolderPicker from './MediaFolderBrowser'
import { destinationRequest } from '../services/destinations'
import { departmentRequest } from '../services/departments'
import { invalidateCachedPrefix } from '../services/requestCache'
const blank = { name: '', slug: '', shortDescription: '', description: '', responsibilities: '', programs: '', officialSlug: '', phone: '', email: '', location: '', hours: '', featuredImage: '', imageAlt: '', icon: '', published: false, displayOrder: 0, serviceIds: [], newsIds: [], documentPaths: [] }
export default function AdminDepartments({ canManageMedia }) {
  const [picker, setPicker] = useState(null)
  const [items, setItems] = useState([])
  const [options, setOptions] = useState({ services: [], officials: [], news: [] })
  const [form, setForm] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const load = async () => {
    const list = await departmentRequest('/api/admin/departments')
    setItems(list.items)
  }
  useEffect(() => { let active = true; setLoading(true); setLoadError(false); departmentRequest('/api/admin/departments').then(list => { if (active) setItems(list.items) }).catch(() => { if (active) setLoadError(true) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [attempt])
  const prepareEditor = async () => {
    const choices = await departmentRequest('/api/admin/departments/options')
    setOptions(choices)
  }
  const create = async () => { setBusy(true); setNotice(''); try { await prepareEditor(); setForm({...blank}) } catch { setNotice('Editor options could not be loaded. Try again.') } finally { setBusy(false) } }
  const field = key => ({ value: form[key] || '', onChange: event => setForm({ ...form, [key]: event.target.value }) })
  const toggle = (key, value) => setForm({ ...form, [key]: form[key].includes(value) ? form[key].filter(item => item !== value) : [...form[key], value] })
  const edit = async item => {
    setBusy(true); setNotice('')
    try { const [record] = await Promise.all([departmentRequest(`/api/admin/departments/${encodeURIComponent(item.id)}`), prepareEditor()]); setForm({ ...blank, ...record }) }
    catch { setNotice('Office information could not be loaded.') } finally { setBusy(false) }
  }
  const save = async event => {
    event.preventDefault(); setBusy(true); setNotice('')
    try {
      await destinationRequest(`/api/admin/departments${form.id ? `/${encodeURIComponent(form.id)}` : ''}`, { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(form) })
      invalidateCachedPrefix('/api/departments'); setForm(null); await load(); setNotice('Office saved. Published changes are available on the public page.')
    } catch (error) { setNotice(error.status === 422 || error.status === 409 ? error.message : 'Office could not be saved. Please try again.') } finally { setBusy(false) }
  }
  return <section><div className="cms-title"><h1>Departments &amp; offices</h1><button disabled={busy || loading || loadError} onClick={create}>Create office</button></div>{notice && <p role="status">{notice}</p>}{form ? <form className="cms-editor" onSubmit={save}><fieldset disabled={busy} style={{ border: 0, padding: 0 }}><h2>{form.id ? 'Edit office' : 'New office'}</h2>
    <label>Office name<input required maxLength={200} {...field('name')} /></label><label>URL slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={120} {...field('slug')} /></label>
    <label>Short description<textarea maxLength={1200} {...field('shortDescription')} /></label>
    {[['description', 'About the Office'], ['responsibilities', 'Responsibilities & functions'], ['programs', 'Programs & initiatives']].map(([key, label]) => <label key={key}>{label}<textarea rows={6} maxLength={key === 'description' ? 30000 : key === 'programs' ? 15000 : 10000} {...field(key)} /></label>)}
    <label>Office head<select {...field('officialSlug')}><option value="">Not assigned</option>{form.officialSlug && !options.officials.some(item => item.slug === form.officialSlug) && <option value={form.officialSlug}>Previously assigned official</option>}{options.officials.map(item => <option key={item.publicKey} value={item.slug}>{item.name} — {item.role || item.position?.name}</option>)}</select></label>
    {[['phone', 'Contact number'], ['email', 'Email'], ['location', 'Office location'], ['hours', 'Office hours']].map(([key, label]) => <label key={key}>{label}<input type={key === 'email' ? 'email' : 'text'} maxLength={500} {...field(key)} /></label>)}
    <label>Department icon<select {...field('icon')}><option value="">Default</option>{['Building2','Landmark','WalletCards','HeartHandshake','Users','Map','ClipboardCheck','FileCheck2'].map(icon => <option key={icon} value={icon}>{icon}</option>)}</select></label><div><strong>Header image</strong> {canManageMedia && <button type="button" onClick={() => setPicker('images')}>Choose header image</button>}
      {form.featuredImage && <><p>{form.featuredImage.split('/').at(-1)}</p><button type="button" onClick={() => setForm(current => ({ ...current, featuredImage: '' }))}>Remove header image</button></>}
    </div><label>Image alt text<input required={form.published && !!form.featuredImage} maxLength={500} {...field('imageAlt')} /></label>
    <fieldset><legend>Services owned by this office</legend>{options.services.map(service => <label key={service.id}><span><input type="checkbox" checked={form.serviceIds.includes(service.id)} disabled={!!service.department_id && service.department_id !== form.id} onChange={() => toggle('serviceIds', service.id)} /> {service.name}{service.department_id && service.department_id !== form.id ? ' (assigned to another office)' : ''}</span></label>)}</fieldset>
    <fieldset><legend>Related announcements</legend>{options.news.map(item => <label key={item.id}><span><input type="checkbox" checked={form.newsIds.includes(item.id)} onChange={() => toggle('newsIds', item.id)} /> {item.title} · {item.status}</span></label>)}</fieldset>
    <fieldset><legend>Published office documents</legend>
      {form.documentPaths.map(key => <div key={key}>{key.split('/').at(-1)} <button type="button" onClick={() => toggle('documentPaths', key)}>Remove</button></div>)}
      {canManageMedia && <button type="button" onClick={() => setPicker('documents')}>Choose documents</button>}
      <p>Selected files become public when this office is published.</p>
    </fieldset>
    {picker && <MediaFolderPicker title={picker === 'documents' ? 'Choose office documents' : 'Choose office header image'} kind={picker}
      multiple={picker === 'documents'} canUpload={picker === 'images'} attached={picker === 'documents' ? form.documentPaths : []}
      onClose={() => setPicker(null)} onSelect={items => {
        setForm(current => picker === 'documents'
          ? { ...current, documentPaths: [...new Set([...current.documentPaths, ...items.map(item => item.storage_path)])] }
          : { ...current, featuredImage: items[0].storage_path });
        setPicker(null);
      }} />}
    <label>Display order<input type="number" required min="0" max="100000" value={form.displayOrder} onChange={event => setForm({ ...form, displayOrder: Number(event.target.value) })} /></label><label><span><input type="checkbox" checked={form.published} onChange={event => setForm({ ...form, published: event.target.checked })} /> Published</span></label>
    <button type="submit">Save office</button><button type="button" onClick={() => setForm(null)}>Cancel</button></fieldset></form> : loading ? <p role="status">Loading offices…</p> : loadError ? <div role="alert"><p>Departments couldn't be loaded. Try again.</p><button onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : <div className="discover-admin-list">{items.map(item => <article key={item.id}><div><strong>{item.name}</strong><small>{item.published ? 'Published' : 'Unpublished'} · /departments/{item.slug}</small></div><button disabled={busy} onClick={() => edit(item)}>Edit {item.name}</button></article>)}{!items.length && <p>No departments or offices have been created yet.</p>}</div>}</section>
}
