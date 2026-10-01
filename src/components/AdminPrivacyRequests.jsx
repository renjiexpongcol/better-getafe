import { useEffect, useState } from 'react'
import { Ban, CheckCircle2, CircleAlert, Clock3, Info, LoaderCircle, ShieldCheck, XCircle } from 'lucide-react'
import { normalizePublicError } from '../services/publicError'

const statuses = ['submitted', 'identity_verified', 'under_review', 'processing', 'completed', 'additional_information_required', 'partially_completed', 'rejected_unable_to_delete', 'cancelled']
const label = value => {
  const formatted = value.replaceAll('_', ' ')
  return `${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}`
}
const privacyStatusMeta = {
  submitted: { label: 'Pending', tone: 'pending', Icon: Clock3 },
  identity_verified: { label: 'Identity verified', tone: 'verified', Icon: ShieldCheck },
  under_review: { label: 'In review', tone: 'review', Icon: Clock3 },
  processing: { label: 'In review', tone: 'review', Icon: LoaderCircle },
  completed: { label: 'Completed', tone: 'completed', Icon: CheckCircle2 },
  additional_information_required: { label: 'Information needed', tone: 'pending', Icon: CircleAlert },
  partially_completed: { label: 'Partially completed', tone: 'partial', Icon: CheckCircle2 },
  rejected_unable_to_delete: { label: 'Rejected', tone: 'rejected', Icon: XCircle },
  cancelled: { label: 'Cancelled', tone: 'cancelled', Icon: Ban },
}
const statusMeta = value => privacyStatusMeta[value] || { label: value ? label(value) : 'Unknown', tone: 'default', Icon: Info }
const dateLabel = value => value ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable'
const api = (url, options = {}) => fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options }).then(async response => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(normalizePublicError({ status: response.status, body }, 'unknown').message); return body })

export default function AdminPrivacyRequests({ onNotice }) {
  const [items, setItems] = useState([]), [selected, setSelected] = useState(null), [status, setStatus] = useState('under_review'), [note, setNote] = useState(''), [loading, setLoading] = useState(true)
  const load = () => { setLoading(true); api('/api/admin/privacy-requests').then(setItems).catch(error => onNotice(error.message)).finally(() => setLoading(false)) }
  useEffect(load, [])
  const save = async event => { event.preventDefault(); try { await api(`/api/admin/privacy-requests/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ status, note }) }); onNotice('Privacy request updated.'); setSelected(null); setNote(''); load() } catch (error) { onNotice(error.message) } }
  if (loading) return <p className="cms-muted">Loading privacy requests…</p>
  return <section className="privacy-admin">
    <header className="privacy-admin-header">
      <h1>Data Privacy Requests</h1>
      <p className="cms-muted privacy-admin-intro">Review requests. Account/profile data and uploaded files may be eligible; applications, permits, certificates, payments, correspondence, and audit records remain protected until an authorized review confirms otherwise.</p>
    </header>
    {items.length ? <ul className="privacy-admin-list" aria-label="Submitted data privacy requests">{items.map(item => {
      const requestId = item.id.slice(0, 8).toUpperCase()
      const currentStatus = statusMeta(item.status)
      const StatusIcon = currentStatus.Icon
      const createdLabel = dateLabel(item.created_at)
      const openRequest = () => { setSelected(item); setStatus(item.status); setNote(item.review_note || '') }
      const onRequestKeyDown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRequest() } }
      return <li key={item.id}>
        <article className="privacy-admin-item" role="button" tabIndex={0} aria-label={`Open privacy request ${requestId}. ${item.request_type}, ${label(item.scope)}. Status: ${currentStatus.label}. Submitted ${createdLabel}.`} onClick={openRequest} onKeyDown={onRequestKeyDown}>
          <span className="privacy-admin-copy">
            <strong className="privacy-admin-id">{requestId}</strong>
            <span className="privacy-admin-summary">{item.request_type} · {label(item.scope)}</span>
          </span>
          <span className="privacy-admin-meta">
            <span className={`privacy-status privacy-status--${currentStatus.tone}`}><StatusIcon size={14} aria-hidden="true"/><span>{currentStatus.label}</span></span>
            <time dateTime={item.created_at}>{createdLabel}</time>
          </span>
        </article>
      </li>
    })}</ul> : <div className="cms-empty"><h2>No privacy requests</h2><p>Submitted citizen privacy requests will appear here.</p></div>}
    {selected && <div className="privacy-admin-editor"><form role="dialog" aria-modal="true" aria-labelledby="privacy-review-title" onSubmit={save}><h2 id="privacy-review-title">Review request {selected.id.slice(0, 8).toUpperCase()}</h2><p><strong>Scope:</strong> {label(selected.scope)}</p><p><strong>Submitted:</strong> {new Date(selected.created_at).toLocaleString('en-PH')}</p><p className="cms-muted"><strong>Protected systems:</strong> official applications, permits, certificates, payments, correspondence, and audit history. Review before taking any action.</p><label>Status<select value={status} onChange={event => setStatus(event.target.value)}>{statuses.map(value => <option key={value} value={value}>{statusMeta(value).label}</option>)}</select></label><label>Reason or update note<textarea value={note} onChange={event => setNote(event.target.value)} required rows="4" placeholder="Explain retained records or the action taken in plain language."/></label><div><button type="button" onClick={() => setSelected(null)}>Cancel</button><button className="cms-primary" type="submit">Save update</button></div></form></div>}
  </section>
}
