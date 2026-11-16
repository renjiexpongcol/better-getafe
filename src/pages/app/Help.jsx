import ResourceOptionsStatus from '../../components/ResourceOptionsStatus'
import { usePublicConfig } from '../../context/PublicConfig'
import ModalDialog from '../../components/ModalDialog'
import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import AppPage from './AppPage'
import { citizenApi } from '../../services/citizenData'
import { useBarangays, usePublishedContent } from '../../hooks/usePublicResource'
import { useAuth } from '../../context/AuthContext'

const initialForm = { category: '', subject: '', barangay: '', location: '', date: '', time: '', details: '', contact: 'Email', phone: '' }

function readAttachment(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null)
    if (file.size > 5 * 1024 * 1024) return reject(new Error('Choose a supporting file up to 5 MB.'))
    const reader = new FileReader()
    reader.onload = () => resolve({ name: file.name, type: file.type, data: String(reader.result).split(',')[1] })
    reader.onerror = () => reject(new Error('The supporting file could not be read. Choose the file again.'))
    reader.readAsDataURL(file)
  })
}

export default function Help() {
  const settings = usePublicConfig()
  const help = usePublishedContent('help')
  const concernCategories = String(settings['contact.concernCategories'] || '').split('\n').map(name => name.trim()).filter(Boolean)

  const barangayResource = useBarangays()
  const barangays = barangayResource.items
  const submitRef = useRef(false)
  const { user } = useAuth()
  const [params] = useSearchParams()
  const [open, setOpen] = useState(params.get('report') === '1'), [form, setForm] = useState(initialForm), [attachment, setAttachment] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [submitted, setSubmitted] = useState(null)
  const update = key => event => setForm(current => ({ ...current, [key]: event.target.value }))
  const close = () => { if (busy) return; setOpen(false); setSubmitted(null); setError('') }
  const submit = async event => {
    event.preventDefault(); if (submitRef.current) return; submitRef.current = true; setBusy(true); setError('')
    try {
      const file = await readAttachment(attachment)
      const purpose = [
        `Category: ${form.category}`,
        `Subject: ${form.subject}`,
        `Barangay: ${form.barangay}`,
        `Specific location: ${form.location || 'Not provided'}`,
        `Date and time noticed: ${form.date || 'Not provided'} ${form.time || ''}`.trim(),
        `Preferred contact: ${form.contact}${form.phone ? ` (${form.phone})` : ''}`,
        '',
        `Details:\n${form.details}`,
      ].join('\n')
      const result = await citizenApi('/applications', { method: 'POST', body: JSON.stringify({ service_name: 'Report a Concern', details: { purpose, attachment: file } }) })
      setSubmitted(result); setForm(initialForm); setAttachment(null)
    } catch (submissionError) { setError(submissionError.message) } finally { submitRef.current = false; setBusy(false) }
  }
  return <AppPage title="Help & support"><section className="citizen-panel portal-help"><h2>How can we help?</h2><ResourceOptionsStatus resource={barangayResource} label="Barangays" />{help.loading ? <p role="status">Loading help…</p> : help.error ? <p role="alert">{help.error}<button onClick={help.reload}>Retry</button></p> : (help.content?.items || []).map(item => <details key={item.title}><summary>{item.title}</summary><div className="published-content" dangerouslySetInnerHTML={{ __html: item.body }} /></details>)}<details><summary>How can I contact the municipality?</summary><p>For assistance, contact the municipal office at <a href={`tel:${String(settings['contact.phone'] || '').replace(/[^0-9+]/g, '')}`}>{settings['contact.phone'] || 'Contact details not published'}</a> or <a href={`mailto:${settings['contact.email'] || ''}`}>{settings['contact.email'] || ''}</a>. Include your application reference when asking about a request.</p><button type="button" className="portal-inline-action" onClick={() => { setOpen(true); setSubmitted(null) }}>Report a non-emergency concern →</button></details></section>{open && <ModalDialog labelledBy={submitted ? 'concern-success-title' : 'concern-title'} backdropClass="portal-action-backdrop concern-modal-backdrop" busy={busy} onClose={close}>{submitted ? <section className="portal-action-modal concern-modal concern-success"><button type="button" className="portal-action-close" aria-label="Close report dialog" onClick={close} disabled={busy} data-icon-button="ghost"><X size={18}/></button><h2 id="concern-success-title">Concern submitted</h2><p>Your report has been sent to the municipality for review.</p><strong className="concern-reference">Reference: {submitted.reference_number}</strong><button type="button" className="citizen-primary" onClick={close}>Done</button></section> : <form className="portal-action-modal concern-modal" onSubmit={submit}><button type="button" className="portal-action-close" aria-label="Close request form" onClick={close} disabled={busy} data-icon-button="ghost"><X size={18}/></button><div className="concern-modal-heading"><h2 id="concern-title">Report a non-emergency concern</h2><p>Share enough detail for the right municipal office to understand and follow up on your concern.</p></div><div className="concern-reportee"><span>Reporting as</span><strong>{user?.name || 'Citizen'}</strong><small>{user?.email}</small></div><div className="portal-form-grid"><label>Concern category<select disabled={busy} required value={form.category} onChange={update('category')}><option value="">Select a category</option>{concernCategories.map(name => <option key={name}>{name}</option>)}</select></label><label>Subject<input disabled={busy} required maxLength={160} value={form.subject} onChange={update('subject')} placeholder="Briefly describe the concern"/></label><label htmlFor="concern-barangay">Barangay<select disabled={busy} id="concern-barangay" required value={form.barangay} onChange={update('barangay')}><option value="">Select a barangay</option>{barangays.map(item => <option key={item.name}>{item.name}</option>)}</select></label><label>Specific location<input disabled={busy} maxLength={180} value={form.location} onChange={update('location')} placeholder="Street, landmark, or facility"/></label><label>Date noticed<input disabled={busy} type="date" value={form.date} onChange={update('date')}/></label><label>Time noticed<input disabled={busy} type="time" value={form.time} onChange={update('time')}/></label></div><label>Describe what happened<textarea disabled={busy} required maxLength={3000} value={form.details} onChange={update('details')} placeholder="What happened? Who or what is affected? Include any steps already taken." rows="5"/></label><div className="portal-form-grid"><label>Preferred contact method<select disabled={busy} value={form.contact} onChange={update('contact')}><option>Email</option><option>Phone call</option><option>SMS</option></select></label><label>Contact number{form.contact === 'Email' ? <input disabled={busy} type="tel" value={form.phone} onChange={update('phone')} placeholder="Optional"/> : <input disabled={busy} required type="tel" value={form.phone} onChange={update('phone')} pattern="09[0-9]{9}" placeholder="09XX XXX XXXX"/>}</label></div><div className="concern-support-file"><label>Supporting file <span className="concern-optional">(optional, up to 5 MB)</span><input disabled={busy} type="file" accept=".jpg,.jpeg,.png,.pdf,.doc,.docx" onChange={event => setAttachment(event.target.files?.[0] || null)}/></label><p>Attach a photo or document that helps explain the concern.</p></div>{error && <p className="portal-error" role="alert">{error}</p>}<div className="concern-emergency-note" role="note"><strong>Not for emergencies</strong><span>Do not use this form for emergencies. Call the appropriate emergency hotline for urgent danger or immediate assistance.</span></div><div className="concern-modal-actions"><button type="button" className="portal-action-secondary" disabled={busy} onClick={close}>Cancel</button><button className="citizen-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit concern'}</button></div></form>}</ModalDialog>}</AppPage>
}
