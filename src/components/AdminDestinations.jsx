import { useEffect, useState } from 'react'
import { destinationRequest } from '../services/destinations'
import MediaFolderPicker from './MediaFolderBrowser'
import './DiscoverGetafe.css'
const blank = { title: '', slug: '', shortDescription: '', fullDescription: '', featuredImage: '', imageAlt: '', location: '', category: '', published: false, featured: false, displayOrder: 0 }
export default function AdminDestinations({ canManageMedia }) {
  const [items, setItems] = useState([])
  const [form, setForm] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const load = async () => { const data = await destinationRequest(`/api/admin/destinations?offset=${offset}`); setItems(data.items); setTotal(data.total) }
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    destinationRequest(`/api/admin/destinations?offset=${offset}`, { signal: controller.signal }).then(data => { setItems(data.items); setTotal(data.total) }).catch(error => { if (error.name !== 'AbortError') setNotice(error.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [offset])
  const field = key => ({ value: form[key], onChange: event => setForm({ ...form, [key]: event.target.value }) })
  const save = async event => {
    event.preventDefault(); setNotice('')
    if (form.published && !form.featuredImage) { setNotice('Select a verified Media Library image before publishing.'); return }
    if (form.published && !String(form.imageAlt || '').trim()) { setNotice('Write meaningful alt text before publishing.'); return }
    setBusy(true)
    try { await destinationRequest(`/api/admin/destinations${form.id ? `/${encodeURIComponent(form.id)}` : ''}`, { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(form) }); setForm(null); await load(); setNotice('Destination saved.') }
    catch (error) { setNotice(error.message) } finally { setBusy(false) }
  }
  const remove = async item => {
    if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return
    setBusy(true)
    try { await destinationRequest(`/api/admin/destinations/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); await load(); setNotice('Destination deleted.') }
    catch (error) { setNotice(error.message) } finally { setBusy(false) }
  }
  return <section><div className="cms-title"><h1>Discover Getafe</h1><button onClick={() => { setForm({ ...blank }); setNotice('') }} disabled={busy}>Create destination</button></div><p>Review destination information and choose a verified Media Library photo before publishing. Lower display orders appear first.</p>{notice && <p role="status">{notice}</p>}
    {form ? <form className="cms-editor" onSubmit={save}><h2>{form.id ? 'Edit destination' : 'New destination'}</h2><fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
      <label>Title<input required maxLength={200} {...field('title')}/></label>
      <label>Slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={200} {...field('slug')}/></label>
      <label>Short description<textarea required maxLength={1200} {...field('shortDescription')}/></label>
      <label>Full description<textarea rows={10} maxLength={30000} {...field('fullDescription')}/></label>
      <div><strong>Featured image</strong> {canManageMedia && <button type="button" onClick={() => setPickerOpen(true)}>Choose featured image</button>}</div>
      {form.featuredImage && <p>{form.featuredImage.split('/').at(-1)}</p>}
      {selected?.storage_path === form.featuredImage && selected?.preview_url && <img className="cms-preview" src={selected.preview_url} alt="Selected featured image preview"/>}
      {pickerOpen && <MediaFolderPicker title="Choose destination image" onClose={() => setPickerOpen(false)} onSelect={([item]) => {
        setSelected(item); setForm(current => ({ ...current, featuredImage: item.storage_path })); setPickerOpen(false)
      }} />}
      <label>Image alt text<input required={form.published} maxLength={500} {...field('imageAlt')}/></label>
      <label>Location<input maxLength={300} {...field('location')}/></label>
      <label>Category<input maxLength={100} list="destination-categories" {...field('category')}/></label><datalist id="destination-categories">{['Islands', 'Marine & Coastal', 'Nature', 'Culture & Heritage', 'Community'].map(value => <option key={value} value={value}/>)}</datalist>
      <label>Display order<input type="number" min="0" max="100000" required value={form.displayOrder} onChange={event => setForm({ ...form, displayOrder: Number(event.target.value) })}/></label>
      <label><span><input type="checkbox" checked={form.featured} onChange={event => setForm({ ...form, featured: event.target.checked })}/> Featured on homepage</span></label>
      <label><span><input type="checkbox" checked={form.published} onChange={event => setForm({ ...form, published: event.target.checked })}/> Published</span></label>
      <div className="discover-admin-actions"><button type="submit">Save destination</button><button type="button" onClick={() => setForm(null)}>Cancel</button></div>
    </fieldset></form> : loading ? <p role="status">Loading destinations…</p> : <><div className="discover-admin-list">{items.map(item => <article key={item.id}><div><strong>{item.title}</strong><small>{item.published ? 'Published' : 'Draft'} · Order {item.displayOrder}{item.featured ? ' · Featured' : ''}</small></div><div className="discover-admin-actions"><button disabled={busy} onClick={() => setForm({ ...item })} aria-label={`Edit ${item.title}`}>Edit</button><button disabled={busy} onClick={() => remove(item)} aria-label={`Delete ${item.title}`}>Delete</button></div></article>)}</div>{!items.length && <p>No destinations yet. Create one to get started.</p>}<div className="discover-admin-actions">{offset > 0 && <button onClick={() => setOffset(offset - 100)}>Previous</button>}{offset + items.length < total && <button onClick={() => setOffset(offset + 100)}>Next</button>}</div></>}
  </section>
}
