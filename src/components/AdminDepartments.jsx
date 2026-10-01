import { useEffect, useState } from 'react'
import { destinationRequest } from '../services/destinations'
import { departmentRequest } from '../services/departments'
import { invalidateCachedPrefix } from '../services/requestCache'
const blank = { name: '', slug: '', shortDescription: '', description: '', responsibilities: '', programs: '', officialSlug: '', phone: '', email: '', location: '', hours: '', featuredImage: '', imageAlt: '', icon: '', published: false, displayOrder: 0, serviceIds: [], newsIds: [], documentPaths: [] }
export default function AdminDepartments({ media = [] }) {
  const [items, setItems] = useState([])
  const [options, setOptions] = useState({ services: [], officials: [], news: [] })
  const [form, setForm] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const load = async () => {
    const [list, choices] = await Promise.all([departmentRequest('/api/admin/departments'), departmentRequest('/api/admin/departments/options')])
    setItems(list.items); setOptions(choices)
  }
  useEffect(() => { let active = true; setLoading(true); setLoadError(false); Promise.all([departmentRequest('/api/admin/departments'), departmentRequest('/api/admin/departments/options')]).then(([list, choices]) => { if (active) { setItems(list.items); setOptions(choices) } }).catch(() => { if (active) setLoadError(true) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [attempt])
  const field = key => ({ value: form[key] || '', onChange: event => setForm({ ...form, [key]: event.target.value }) })
  const toggle = (key, value) => setForm({ ...form, [key]: form[key].includes(value) ? form[key].filter(item => item !== value) : [...form[key], value] })
  const edit = async item => {
    setBusy(true); setNotice('')
    try { setForm({ ...blank, ...await departmentRequest(`/api/admin/departments/${encodeURIComponent(item.id)}`) }) }
    catch { setNotice('Office information could not be loaded.') } finally { setBusy(false) }
  }
  const save = async event => {
    event.preventDefault(); setBusy(true); setNotice('')
    try {
      await destinationRequest(`/api/admin/departments${form.id ? `/${encodeURIComponent(form.id)}` : ''}`, { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(form) })
      invalidateCachedPrefix('/api/departments'); setForm(null); await load(); setNotice('Office saved. Published changes are available on the public page.')
    } catch (error) { setNotice(error.status === 422 || error.status === 409 ? error.message : 'Office could not be saved. Please try again.') } finally { setBusy(false) }
  }
  return <section><div className="cms-title"><h1>Departments &amp; offices</h1><button disabled={busy || loading || loadError} onClick={() => setForm({ ...blank })}>Create office</button></div>{notice && <p role="status">{notice}</p>}{form ? <form className="cms-editor" onSubmit={save}><fieldset disabled={busy} style={{ border: 0, padding: 0 }}><h2>{form.id ? 'Edit office' : 'New office'}</h2>
    <label>Office name<input required maxLength={200} {...field('name')} /></label><label>URL slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={120} {...field('slug')} /></label>
    <label>Short description<textarea maxLength={1200} {...field('shortDescription')} /></label>
    {[['description', 'About the Office'], ['responsibilities', 'Responsibilities & functions'], ['programs', 'Programs & initiatives']].map(([key, label]) => <label key={key}>{label}<textarea rows={6} maxLength={key === 'description' ? 30000 : key === 'programs' ? 15000 : 10000} {...field(key)} /></label>)}
    <label>Office head<select {...field('officialSlug')}><option value="">Not assigned</option>{form.officialSlug && !options.officials.some(item => item.slug === form.officialSlug) && <option value={form.officialSlug}>Previously assigned official</option>}{options.officials.map(item => <option key={item.publicKey} value={item.slug}>{item.name} — {item.role || item.position?.name}</option>)}</select></label>
    {[['phone', 'Contact number'], ['email', 'Email'], ['location', 'Office location'], ['hours', 'Office hours']].map(([key, label]) => <label key={key}>{label}<input type={key === 'email' ? 'email' : 'text'} maxLength={500} {...field(key)} /></label>)}
    <label>Department icon<select {...field('icon')}><option value="">Default</option>{['Building2','Landmark','WalletCards','HeartHandshake','Users','Map','ClipboardCheck','FileCheck2'].map(icon => <option key={icon} value={icon}>{icon}</option>)}</select></label><label>Header image<select {...field('featuredImage')}><option value="">No image</option>{form.featuredImage && !media.some(item => item.storage_path === form.featuredImage) && <option value={form.featuredImage}>Current image</option>}{media.filter(item => item.content_type?.startsWith('image/')).map(item => <option key={item.id} value={item.storage_path}>{item.original_filename || item.name}</option>)}</select></label><label>Image alt text<input required={form.published && !!form.featuredImage} maxLength={500} {...field('imageAlt')} /></label>
    <fieldset><legend>Services owned by this office</legend>{options.services.map(service => <label key={service.id}><span><input type="checkbox" checked={form.serviceIds.includes(service.id)} disabled={!!service.department_id && service.department_id !== form.id} onChange={() => toggle('serviceIds', service.id)} /> {service.name}{service.department_id && service.department_id !== form.id ? ' (assigned to another office)' : ''}</span></label>)}</fieldset>
    <fieldset><legend>Related announcements</legend>{options.news.map(item => <label key={item.id}><span><input type="checkbox" checked={form.newsIds.includes(item.id)} onChange={() => toggle('newsIds', item.id)} /> {item.title} · {item.status}</span></label>)}</fieldset>
    <fieldset><legend>Published office documents</legend>{media.filter(item => !item.content_type?.startsWith('image/')).map(item => <label key={item.id}><span><input type="checkbox" checked={form.documentPaths.includes(item.storage_path)} onChange={() => toggle('documentPaths', item.storage_path)} /> {item.original_filename || item.name}</span></label>)}<p>Selected files become public when this office is published.</p></fieldset>
    <label>Display order<input type="number" required min="0" max="100000" value={form.displayOrder} onChange={event => setForm({ ...form, displayOrder: Number(event.target.value) })} /></label><label><span><input type="checkbox" checked={form.published} onChange={event => setForm({ ...form, published: event.target.checked })} /> Published</span></label>
    <button type="submit">Save office</button><button type="button" onClick={() => setForm(null)}>Cancel</button></fieldset></form> : loading ? <p role="status">Loading offices…</p> : loadError ? <div role="alert"><p>Departments couldn't be loaded. Try again.</p><button onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : <div className="discover-admin-list">{items.map(item => <article key={item.id}><div><strong>{item.name}</strong><small>{item.published ? 'Published' : 'Unpublished'} · /departments/{item.slug}</small></div><button disabled={busy} onClick={() => edit(item)}>Edit {item.name}</button></article>)}{!items.length && <p>No departments or offices have been created yet.</p>}</div>}</section>
}
