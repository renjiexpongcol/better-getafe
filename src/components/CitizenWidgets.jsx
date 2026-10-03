import { useState } from 'react'
import { ArrowRight, CalendarDays, Check, Download, FileText, FolderOpen, Search, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { esApi, useEservice } from './EserviceUI'
import { useCitizen } from '../context/CitizenContext'
import { apiFetch } from '../services/apiTransport'
import { normalizePublicError } from '../services/publicError'
import { dateLabel, needsAction, isActive, statusKey } from '../services/citizenData'
import { ROUTES } from '../routeRegistry'
import './CitizenWidgets.css'

export function DataState({ children }) {
  const { loading, data } = useCitizen()
  if (loading && !data) return <div className="portal-loading" role="status"><span className="page-loader-spinner"/>Loading your records…</div>
  if (!data) return <p className="portal-muted">Records are unavailable. Use “Try again” above to reload.</p>
  return children
}
export function Panel({ title, href, action = 'View all', children, className = '' }) {
  return <section className={`citizen-panel ${className}`}><div className="citizen-panel-head"><h2>{title}</h2>{href && <Link to={href}>{action}<ArrowRight size={15}/></Link>}</div>{children}</section>
}
export function Empty({ icon: Icon = FolderOpen, title, description, href, action }) {
  return <div className="citizen-empty"><span className="portal-empty-icon"><Icon size={25}/></span><strong>{title}</strong>{description && <p>{description}</p>}{href && <Link to={href}>{action}<ArrowRight size={14}/></Link>}</div>
}
const labels = { draft: 'Draft', submitted: 'Submitted', verified: 'Verified', under_review: 'Under Review', review: 'Under Review', processing: 'In progress', needs_information: 'Action required', on_hold: 'On hold', action_required: 'Action Required', additional_information_required: 'Action Required', additional_documents_required: 'Action Required', requires_action: 'Action Required', approved: 'Approved', ready_for_release: 'Ready for Release', completed: 'Completed', rejected: 'Rejected', released: 'Released', cancelled: 'Cancelled', requested: 'Awaiting confirmation', scheduled: 'Scheduled', confirmed: 'Confirmed', pending: 'Pending', paid: 'Paid', unpaid: 'Unpaid' }
export function Status({ value }) {
  const key = statusKey(value), tone = needsAction({ status: key }) || ['pending', 'unpaid', 'requested'].includes(key) ? 'amber' : ['approved', 'completed', 'paid', 'released', 'ready_for_release'].includes(key) ? 'green' : ['rejected', 'failed', 'overdue'].includes(key) ? 'red' : ['draft', 'cancelled'].includes(key) ? 'gray' : 'blue'
  return <span className={`portal-status ${tone}`}><i/>{labels[key] || key.replaceAll('_', ' ')}</span>
}
export function Progress({ status }) {
  const key = statusKey(status)
  const current = { submitted: 0, verified: 1, under_review: 2, review: 2, processing: 2, approved: 3, ready_for_release: 4, released: 4, completed: 4 }[key]
  if (current === undefined) return null
  return <ol className="portal-progress" aria-label="Application progress">{['Submitted', 'Verified', 'Review', 'Approved', 'Release'].map((label, index) => <li key={label} className={index < current ? 'done' : index === current ? 'current' : ''} aria-current={index === current ? 'step' : undefined}><span>{index < current ? <Check size={10}/> : <i/>}</span><small>{label}</small></li>)}</ol>
}
export function ApplicationRows({ items }) {
  return items.length ? <div className="portal-records">{items.map(item => <article className="portal-application" key={item.id}><div className="portal-record-heading"><div><h3>{item.service_name}</h3><span className="portal-reference">{item.reference_number}</span></div><Status value={item.status}/></div>{needsAction(item) && <p className="portal-action-note">{item.latest_note || 'Open your application to review the requested information.'}</p>}{isActive(item) && <Progress status={item.status}/>}<div className="portal-record-footer"><span>{item.submitted_at ? `Submitted ${dateLabel(item.submitted_at)}` : `Updated ${dateLabel(item.last_updated)}`}</span><Link to={ROUTES.app.request(item.id)}>{needsAction(item) || statusKey(item.status) === 'draft' ? 'Continue application' : 'View application'}<ArrowRight size={14}/></Link></div></article>)}</div> : <Empty icon={FileText} title="No applications yet" description="Request certificates, permits and other municipal services online." href={ROUTES.app.services} action="Browse services"/>
}
export function DocumentRows({ items }) {
  const [downloading, setDownloading] = useState(''), [downloadError, setDownloadError] = useState('')
  const download = async item => {
    setDownloading(item.id); setDownloadError('')
    try {
      const response = await apiFetch(`/api/citizen/documents/${encodeURIComponent(item.id)}/download`, { credentials: 'include', headers: { 'X-Requested-With': 'GetafeCitizenPortal' } })
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(normalizePublicError({ status: response.status, body }, 'services').message) }
      const url = URL.createObjectURL(await response.blob()), anchor = document.createElement('a')
      anchor.href = url; anchor.download = item.name || 'document'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
    } catch (error) { setDownloadError(error.message) } finally { setDownloading('') }
  }
  return items.length ? <div className="portal-records">{items.map(item => <article className="portal-document" key={item.id} id={`document-${item.id}`}><span className="portal-document-icon"><FileText size={20}/></span><div><span className="portal-document-kind">{item.document_kind === 'issued' ? 'ISSUED' : item.document_kind === 'receipt' ? 'RECEIPT' : 'UPLOADED'}</span><h3>{item.name}</h3><p>{item.document_kind === 'uploaded' ? 'Uploaded' : 'Issued'} {dateLabel(item.created_at)}</p><small>{item.downloadable ? 'Available for download' : 'File not yet available'}</small></div>{item.downloadable ? <button type="button" className="portal-icon-button" onClick={() => download(item)} disabled={downloading === item.id} aria-label={`Download ${item.name}`} data-icon-button="ghost">{downloading === item.id ? '…' : <Download size={18}/>}</button> : <Link to={ROUTES.app.request(item.application_id)} aria-label={`View application for ${item.name}`} data-icon-button="ghost"><ArrowRight size={18}/></Link>}</article>)}{downloadError && <p className="portal-error" role="alert">{downloadError}</p>}</div> : <Empty icon={FolderOpen} title="No documents yet" description="Documents issued through your applications and uploaded requirements will appear here." href={ROUTES.app.services} action="Browse services"/>
}
export function AppointmentRows({ items }) {
  return items.length ? <div className="portal-records">{items.map(item => <article className="portal-appointment" key={item.id}><span className="portal-document-icon"><CalendarDays size={21}/></span><div><h3>{item.department}</h3><p>{item.service}</p><strong>{dateLabel(item.appointment_at, { hour: 'numeric', minute: '2-digit' })}</strong><p><Status value={item.status}/></p><small>Reference: {item.id}</small><Link to={ROUTES.app.appointments}>View appointments <ArrowRight size={14}/></Link></div></article>)}</div> : <Empty icon={CalendarDays} title="No upcoming appointments" description="Choose a service and request a convenient time to visit."/>
}
export function ServiceSearch({ autoFocus = false, compact = false, inputId }) {
  const [query, setQuery] = useState(''), [open, setOpen] = useState(true)
  const catalog = useEservice(() => esApi('/services'), [])
  const results = (catalog.data?.items || []).filter(service => service.kind !== 'DIRECTORY' && `${service.name} ${service.category_name || ''}`.toLowerCase().includes(query.toLowerCase()))
  const id = inputId || (compact ? 'header-service-search' : 'service-search')
  const placeholder = compact ? 'Search services, news, and information...' : 'Search municipal services, permits, certificates…'
  return <section className={`portal-service-search${compact ? ' portal-service-search-compact' : ''}`}><label htmlFor={id}>{compact ? 'Search services, news, and information' : 'What municipal service do you need?'}</label><div className="portal-search-input"><Search size={19} aria-hidden="true"/><input id={id} autoFocus={autoFocus} type="search" placeholder={placeholder} value={query} onChange={event => { setQuery(event.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}/>{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')} data-icon-button="ghost"><X size={17}/></button>}</div>{query.trim() && open && <div className="portal-search-results"><p role="status">{results.length} matching {results.length === 1 ? 'service' : 'services'}</p>{results.map(service => <Link key={service.id} to={`/app/services/${service.slug}`}><FileText size={17}/><span>{service.name}<small>{service.category_name}</small></span><ArrowRight size={16}/></Link>)}{!results.length && <p>Try another keyword, or <Link to="/app/help">get help finding a service</Link>.</p>}</div>}</section>
}
export function ServiceCategories() {
  const catalog = useEservice(() => esApi('/services'), [])
  const categories = [...new Map((catalog.data?.items || []).filter(item => item.kind !== 'DIRECTORY' && item.category_id).map(item => [item.category_id, { name: item.category_name, count: catalog.data.items.filter(service => service.kind !== 'DIRECTORY' && service.category_id === item.category_id).length }])).entries()]
  return <section className="citizen-section"><div className="citizen-section-head"><h2>Municipal services</h2><Link to={ROUTES.app.services}>View all services<ArrowRight size={15}/></Link></div><div className="citizen-service-grid">{categories.map(([id, category]) => <Link className="citizen-service" to={`${ROUTES.app.services}?category=${encodeURIComponent(id)}`} key={id}><span><FileText size={21}/></span><strong>{category.name}</strong><small>{category.count} services<ArrowRight size={17}/></small></Link>)}</div>{catalog.error && <p role="alert">{catalog.error}</p>}</section>
}
