import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import AppPage from './AppPage'
import { citizenApi } from '../../services/citizenData'
import { barangays } from '../../data/barangays'
import { useAuth } from '../../context/AuthContext'

const initialForm = { category: '', subject: '', barangay: '', location: '', date: '', time: '', details: '', contact: 'Email', phone: '' }

function readAttachment(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null)
    const reader = new FileReader()
    reader.onload = () => resolve({ name: file.name, type: file.type, data: String(reader.result).split(',')[1] })
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function Help() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const [open, setOpen] = useState(params.get('report') === '1'), [form, setForm] = useState(initialForm), [attachment, setAttachment] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [submitted, setSubmitted] = useState(null)
  const update = key => event => setForm(current => ({ ...current, [key]: event.target.value }))
  const close = () => { setOpen(false); setSubmitted(null); setError('') }
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('')
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
    } catch (submissionError) { setError(submissionError.message) } finally { setBusy(false) }
  }
  return <AppPage title="Help & support"><section className="citizen-panel portal-help"><h2>How can we help?</h2><details open><summary>How do I request a municipal service?</summary><p>Browse the service catalog, choose a service, and describe what you need. Submit your request, then upload supporting documents from its application page. <Link to="/app?sysparm_object_id=services">Browse services →</Link></p></details><details><summary>How do I track my application?</summary><p>Open My Applications to see its current status, progress and status history. If the office requests more information, a notice appears on your dashboard. <Link to="/app?sysparm_object_id=requests">My applications →</Link></p></details><details><summary>How do I upload or download a document?</summary><p>Open My Documents and choose Upload Document. Select the associated application and attach a PDF, JPEG or PNG smaller than 5 MB. Use the download icon beside an available document to save it.</p></details><details><summary>Is my appointment confirmed?</summary><p>New requests show “Awaiting confirmation.” Wait for the responsible municipal office to confirm the date and time before visiting.</p></details><details><summary>How do I settle an ordinance violation, market stall, miscellaneous fee, or transport franchise?</summary><p>Open Payments & settlements, choose the obligation type, enter the reference and amount, then select your payment channel. Your request will be verified by the Municipal Treasurer’s Office before it is marked paid. <Link to="/app?sysparm_object_id=payments">Open Payments & settlements →</Link></p></details><details><summary>How can I contact the municipality?</summary><p>For assistance, contact the municipal office at <a href="tel:+63385029088">(038) 502-9088</a> or <a href="mailto:lgugetafe@yahoo.com">lgugetafe@yahoo.com</a>. Include your application reference when asking about a request.</p><button type="button" className="portal-inline-action" onClick={() => { setOpen(true); setSubmitted(null) }}>Report a non-emergency concern →</button></details></section>{open && <div className="portal-action-backdrop concern-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && close()}>{submitted ? <section className="portal-action-modal concern-modal concern-success" role="dialog" aria-modal="true" aria-labelledby="concern-success-title"><button type="button" className="portal-action-close" aria-label="Close report dialog" onClick={close}><X size={18}/></button><h2 id="concern-success-title">Concern submitted</h2><p>Your report has been sent to the municipality for review.</p><strong className="concern-reference">Reference: {submitted.reference_number}</strong><button type="button" className="citizen-primary" onClick={close}>Done</button></section> : <form className="portal-action-modal concern-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="concern-title"><button type="button" className="portal-action-close" aria-label="Close report dialog" onClick={close}><X size={18}/></button><div className="concern-modal-heading"><h2 id="concern-title">Report a non-emergency concern</h2><p>Share enough detail for the right municipal office to understand and follow up on your concern.</p></div><div className="concern-reportee"><span>Reporting as</span><strong>{user?.name || 'Citizen'}</strong><small>{user?.email}</small></div><div className="portal-form-grid"><label>Concern category<select required value={form.category} onChange={update('category')}><option value="">Select a category</option><option>Service issue</option><option>Website issue</option><option>Community concern</option><option>Other</option></select></label><label>Subject<input required maxLength={160} value={form.subject} onChange={update('subject')} placeholder="Briefly describe the concern"/></label><label>Barangay<select required value={form.barangay} onChange={update('barangay')}><option value="">Select a barangay</option>{barangays.map(item => <option key={item.name}>{item.name}</option>)}</select></label><label>Specific location<input maxLength={180} value={form.location} onChange={update('location')} placeholder="Street, landmark, or facility"/></label><label>Date noticed<input type="date" value={form.date} onChange={update('date')}/></label><label>Time noticed<input type="time" value={form.time} onChange={update('time')}/></label></div><label>Describe what happened<textarea required maxLength={3000} value={form.details} onChange={update('details')} placeholder="What happened? Who or what is affected? Include any steps already taken." rows="5"/></label><div className="portal-form-grid"><label>Preferred contact method<select value={form.contact} onChange={update('contact')}><option>Email</option><option>Phone call</option><option>SMS</option></select></label><label>Contact number{form.contact === 'Email' ? <input type="tel" value={form.phone} onChange={update('phone')} placeholder="Optional"/> : <input required type="tel" value={form.phone} onChange={update('phone')} pattern="09[0-9]{9}" placeholder="09XX XXX XXXX"/>}</label></div><div className="concern-support-file"><label>Supporting file <span className="concern-optional">(optional, up to 5 MB)</span><input type="file" accept=".jpg,.jpeg,.png,.pdf,.doc,.docx" onChange={event => setAttachment(event.target.files?.[0] || null)}/></label><p>Attach a photo or document that helps explain the concern.</p></div>{error && <p className="portal-error" role="alert">{error}</p>}<div className="concern-emergency-note" role="note"><strong>Not for emergencies</strong><span>Do not use this form for emergencies. Call the appropriate emergency hotline for urgent danger or immediate assistance.</span></div><div className="concern-modal-actions"><button type="button" className="portal-action-secondary" onClick={close}>Cancel</button><button className="citizen-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit concern'}</button></div></form>}</div>}</AppPage>
}
