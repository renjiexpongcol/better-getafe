import { useState } from 'react'
import { ArrowRight, BriefcaseBusiness, CalendarDays, Check, Download, FileText, FolderOpen, GraduationCap, HeartPulse, Search, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { serviceCategories, citizenServices, searchServices, serviceLink } from '../data/citizenServices'
import { useCitizen } from '../context/CitizenContext'
import { dateLabel, needsAction, isActive, statusKey } from '../services/citizenData'

export function DataState({ children }) {
  const { loading, error, data } = useCitizen()
  if (loading) return <div className="portal-loading" role="status"><span className="page-loader-spinner"/>Loading your records…</div>
  if (error || !data) return <p className="portal-muted">Records are unavailable. Use “Try again” above to reload.</p>
  return children
}
export function Panel({ title, href, action = 'View all', children, className = '' }) {
  return <section className={`citizen-panel ${className}`}><div className="citizen-panel-head"><h2>{title}</h2>{href && <Link to={href}>{action}<ArrowRight size={15}/></Link>}</div>{children}</section>
}
export function Empty({ icon: Icon = FolderOpen, title, description, href, action }) {
  return <div className="citizen-empty"><span className="portal-empty-icon"><Icon size={25}/></span><strong>{title}</strong>{description && <p>{description}</p>}{href && <Link to={href}>{action}<ArrowRight size={14}/></Link>}</div>
}
const labels = { draft: 'Draft', submitted: 'Submitted', verified: 'Verified', under_review: 'Under Review', review: 'Under Review', processing: 'Under Review', action_required: 'Action Required', additional_information_required: 'Action Required', additional_documents_required: 'Action Required', requires_action: 'Action Required', approved: 'Approved', ready_for_release: 'Ready for Release', completed: 'Completed', rejected: 'Rejected', released: 'Released', cancelled: 'Cancelled', requested: 'Awaiting confirmation', scheduled: 'Scheduled', confirmed: 'Confirmed', pending: 'Pending', paid: 'Paid', unpaid: 'Unpaid' }
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
  return items.length ? <div className="portal-records">{items.map(item => <article className="portal-application" key={item.id}><div className="portal-record-heading"><div><h3>{item.service_name}</h3><span className="portal-reference">{item.reference_number}</span></div><Status value={item.status}/></div>{needsAction(item) && <p className="portal-action-note">{item.latest_note || 'Open your application to review the requested information.'}</p>}{isActive(item) && <Progress status={item.status}/>}<div className="portal-record-footer"><span>{item.submitted_at ? `Submitted ${dateLabel(item.submitted_at)}` : `Updated ${dateLabel(item.last_updated)}`}</span><Link to={`/app/requests/${encodeURIComponent(item.id)}`}>{needsAction(item) || statusKey(item.status) === 'draft' ? 'Continue application' : 'View application'}<ArrowRight size={14}/></Link></div></article>)}</div> : <Empty icon={FileText} title="No applications yet" description="Request certificates, permits and other municipal services online." href="/app/services" action="Browse services"/>
}
export function DocumentRows({ items }) {
  return items.length ? <div className="portal-records">{items.map(item => <article className="portal-document" key={item.id} id={`document-${item.id}`}><span className="portal-document-icon"><FileText size={20}/></span><div><span className="portal-document-kind">{item.document_kind === 'issued' ? 'ISSUED' : item.document_kind === 'receipt' ? 'RECEIPT' : 'UPLOADED'}</span><h3>{item.name}</h3><p>{item.document_kind === 'uploaded' ? 'Uploaded' : 'Issued'} {dateLabel(item.created_at)}</p><small>{item.downloadable ? 'Available for download' : 'File not yet available'}</small></div>{item.downloadable ? <a className="portal-icon-button" href={`/api/citizen/documents/${encodeURIComponent(item.id)}/download`} aria-label={`Download ${item.name}`}><Download size={18}/></a> : <Link to={`/app/requests/${encodeURIComponent(item.application_id)}`} aria-label={`View application for ${item.name}`}><ArrowRight size={18}/></Link>}</article>)}</div> : <Empty icon={FolderOpen} title="No documents yet" description="Documents issued through your applications and uploaded requirements will appear here." href="/app/services" action="Browse services"/>
}
export function AppointmentRows({ items }) {
  return items.length ? <div className="portal-records">{items.map(item => <article className="portal-appointment" key={item.id}><span className="portal-document-icon"><CalendarDays size={21}/></span><div><h3>{item.department}</h3><p>{item.service}</p><strong>{dateLabel(item.appointment_at, { hour: 'numeric', minute: '2-digit' })}</strong><p><Status value={item.status}/></p><small>Reference: {item.id}</small><Link to={`/app/appointments?appointment=${encodeURIComponent(item.id)}`}>View appointment <ArrowRight size={14}/></Link></div></article>)}</div> : <Empty icon={CalendarDays} title="No upcoming appointments" description="Choose a service and request a convenient time to visit." href="/app/appointments?book=1" action="Schedule an appointment"/>
}
export function ServiceSearch({ autoFocus = false }) {
  const [query, setQuery] = useState(''), [open, setOpen] = useState(true)
  const results = searchServices(query)
  return <section className="portal-service-search"><label htmlFor="service-search">What municipal service do you need?</label><div className="portal-search-input"><Search size={19}/><input id="service-search" autoFocus={autoFocus} placeholder="Search municipal services, permits, certificates…" value={query} onChange={event => { setQuery(event.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}/>{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={17}/></button>}</div>{query.trim() && open && <div className="portal-search-results"><p role="status">{results.length} matching {results.length === 1 ? 'service' : 'services'}</p>{results.map(service => <Link key={service.id} to={serviceLink(service)}><FileText size={17}/><span>{service.name}<small>{serviceCategories.find(item => item.id === service.category)?.name}</small></span><ArrowRight size={16}/></Link>)}{!results.length && <p>Try another keyword, or <Link to="/app/help">get help finding a service</Link>.</p>}</div>}</section>
}
export function ServiceCategories() {
  const icons = { FileText, BriefcaseBusiness, HeartPulse, GraduationCap }
  return <section className="citizen-section"><div className="citizen-section-head"><h2>Municipal services</h2><Link to="/app/services">View all services<ArrowRight size={15}/></Link></div><div className="citizen-service-grid">{serviceCategories.map(category => { const Icon = icons[category.icon]; return <Link className="citizen-service" to={`/app/services?category=${category.id}`} key={category.id}><span><Icon size={21}/></span><strong>{category.name}</strong><p>{category.description}</p><small>{citizenServices.filter(item => item.category === category.id).length} services<ArrowRight size={17}/></small></Link> })}</div></section>
}
