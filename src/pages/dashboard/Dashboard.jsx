import { useState } from 'react'
import { ArrowRight, Bell, CalendarDays, CircleAlert, ChevronDown, CreditCard, FilePlus2, FileText, FolderOpen, MessageSquare, Plus, BriefcaseBusiness, X } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import CitizenLayout from '../../components/CitizenLayout'
import { ApplicationRows, AppointmentRows, DataState, DocumentRows, Empty, Panel, ServiceCategories } from '../../components/CitizenWidgets'
import { useAuth } from '../../context/AuthContext'
import { useCitizen } from '../../context/CitizenContext'
import { citizenApi, dateLabel, isActive, money, needsAction, notificationLink, paymentDue, upcomingAppointments } from '../../services/citizenData'
import { barangays } from '../../data/barangays'
import { ProfileForm } from './Profile'

const actions = [
  ['Request Document', FilePlus2, '/app/services?category=certificates'], ['Apply for Permit', BriefcaseBusiness, '/app/services?category=business'],
  ['Book Appointment', CalendarDays, '/app/appointments?book=1'],
  ['Pay Fees', CreditCard, '/app/payments'], ['Report Concern', MessageSquare, '/app/requests/new?service=concern'],
]
const quickFields = {
  'Request Document': [['Document type', 'select', ['Barangay Clearance', 'Certificate of Residency', 'Business Certificate']], ['Purpose', 'text']],
  'Apply for Permit': [['Permit type', 'select', ['Business Permit', 'Building Permit', 'Special Permit']], ['Applicant or business name', 'text']],
  'Book Appointment': [['Service', 'select', ['Civil Registry', 'Business Services', 'General Assistance']], ['Preferred date', 'date'], ['Preferred time', 'time']],
  'Upload Document': [['Document category', 'select', ['Identification', 'Supporting document', 'Proof of payment']], ['Choose file', 'file']],
  'Pay Fees': [['What is this payment for?', 'select', ['Application fee', 'Permit fee', 'Document release fee', 'Document request fee', 'Other municipal service']], ['Payment method', 'select', ['GCash', 'Card', 'Over-the-counter']], ['Reference or application number', 'text'], ['Proof of payment', 'file']],
  'Report Concern': [['Concern category', 'select', ['Service issue', 'Website issue', 'Community concern']], ['Subject', 'text'], ['Location or barangay', 'select', barangays.map(item => item.name)], ['Preferred contact method', 'select', ['Email', 'Phone call', 'SMS']], ['Details', 'textarea'], ['Attach supporting file', 'file']],
}
function BarangaySelect({ options }) {
  const [open, setOpen] = useState(false), [value, setValue] = useState('')
  return <div className="portal-custom-select"><button type="button" className="portal-custom-select-trigger" onClick={() => setOpen(current => !current)} aria-expanded={open}>{value || 'Select an option'}<ChevronDown size={16} aria-hidden="true"/></button>{open && <div className="portal-custom-select-menu">{options.map(option => <button type="button" key={option} onClick={() => { setValue(option); setOpen(false) }}>{option}</button>)}</div>}<input type="hidden" required value={value} /></div>
}
export default function Dashboard() { return <CitizenLayout title="Dashboard"><DashboardContent/></CitizenLayout> }
function DashboardContent() {
  const { user } = useAuth(), { data, loading, error } = useCitizen()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [quickAction, setQuickAction] = useState(null)
  const [quickConfirmation, setQuickConfirmation] = useState('')
  const profile = data?.profile, name = profile?.full_name || user.name || 'Citizen'
  const applications = data?.applications || [], documents = data?.documents || [], payments = data?.payments || [], appointments = upcomingAppointments(data?.appointments || [])
  const active = applications.filter(isActive), attention = applications.filter(needsAction), due = payments.filter(paymentDue)
  const available = documents.filter(item => item.downloadable), pending = loading || error || !data
  const stats = [
    ['Active Applications', FileText, active.length, attention.length ? `${attention.length} requires attention` : active.length ? 'Track your requests' : 'No active requests', '/app/requests'],
    ['Available Documents', FolderOpen, available.length, available.length ? 'View your documents' : 'No documents available', '/app/documents'],
    ['Upcoming Appointments', CalendarDays, appointments.length, appointments.length ? dateLabel(appointments[0].appointment_at, { year: undefined, hour: 'numeric', minute: '2-digit' }) : 'No appointments scheduled', '/app/appointments'],
    ['Outstanding Payments', CreditCard, money(due.reduce((sum, item) => sum + Number(item.amount), 0)), due.length ? `${due.length} ${due.length === 1 ? 'payment' : 'payments'} due` : 'No outstanding payments', '/app/payments'],
  ]
  const activity = data?.notifications || []
  const submitQuickAction = async event => {
    event.preventDefault()
    if (quickAction.label !== 'Report Concern') { setQuickConfirmation(quickAction.label); setQuickAction(null); return }
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()), file = event.currentTarget.querySelector('input[type="file"]')?.files?.[0]
    let attachment
    if (file) attachment = { name: file.name, type: file.type, data: await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(file) }) }
    try { await citizenApi('/applications', { method: 'POST', body: JSON.stringify({ service_name: 'Report a Concern', details: { purpose: `${values.Subject || 'Report a concern'}\n\nCategory: ${values['Concern category']}\nLocation: ${values['Location or barangay']}\nContact: ${values['Preferred contact method']}\n\n${values.Details}`, attachment } }) }); setQuickConfirmation(quickAction.label); setQuickAction(null) } catch { setQuickConfirmation('Report Concern') }
  }
  return <>
    <section className="citizen-welcome"><div><p className="portal-date">{new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p><h1>Welcome back, {name.trim().split(/\s+/)[0]}</h1><p>Manage your municipal services, applications and documents.</p></div><Link className="citizen-primary" to="/app/services"><Plus size={17}/>Request a Service</Link></section>
    <section className="citizen-stats" aria-label="Your account at a glance">{stats.map(([label, Icon, value, secondary, href]) => <Link className="citizen-stat" to={href} key={label}><div><span>{label}</span><Icon size={18}/></div><strong>{pending ? '—' : value}</strong><small>{pending ? loading ? 'Loading your records…' : 'Records unavailable' : secondary}<ArrowRight size={14}/></small></Link>)}</section>
    {!pending && (attention.length > 0 || due.length > 0) && <section className="portal-attention"><h2><CircleAlert size={20}/>Requires your attention<span>{attention.length + due.length}</span></h2>{attention.map(item => <article key={item.id}><div><h3>{item.service_name}</h3><p>{item.latest_note || 'Additional information is required to continue processing.'}</p></div><Link to={`/app/requests/${encodeURIComponent(item.id)}`}>Continue application<ArrowRight size={15}/></Link></article>)}{due.map(item => <article key={item.id}><div><h3>Payment required · {item.service_name || 'Municipal service'}</h3><p>{money(item.amount)} outstanding</p></div><Link to={`/app/payments?payment=${encodeURIComponent(item.id)}`}>View payment<ArrowRight size={15}/></Link></article>)}</section>}
    <section className="portal-quick"><h2>Quick actions</h2><div>{actions.map(([label, Icon]) => <button type="button" key={label} onClick={() => label === 'Book Appointment' ? navigate('/app/appointments?book=1') : setQuickAction({ label, Icon })}><Icon size={20}/><span>{label}</span></button>)}</div></section>
    <ServiceCategories/>
    <div className="citizen-lower">
      <Panel title="My applications" href="/app/requests"><DataState><ApplicationRows items={applications.slice(0, 4)}/></DataState></Panel>
      <Panel title="My documents" href="/app/documents"><DataState><DocumentRows items={documents.slice(0, 3)}/></DataState></Panel>
      <Panel title="Upcoming appointment" href="/app/appointments"><DataState><AppointmentRows items={appointments.slice(0, 1)}/></DataState></Panel>
      <Panel title="Recent activity" href="/app/notifications"><DataState>{activity.length ? <ol className="portal-activity">{activity.slice(0, 4).map(item => <li key={item.id}><span><Bell size={14}/></span><div><Link to={notificationLink(item)}>{item.title}</Link><p>{item.message}</p><time>{dateLabel(item.created_at, { hour: 'numeric', minute: '2-digit' })}</time></div></li>)}</ol> : <Empty icon={Bell} title="No activity yet" description="Your application updates, payments and document activity will appear here."/>}</DataState></Panel>
    </div>
    {quickAction && <div className="portal-action-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setQuickAction(null)}><section className="portal-action-modal" role="dialog" aria-modal="true" aria-labelledby="quick-action-title"><button type="button" className="portal-action-close" aria-label="Close dialog" onClick={() => setQuickAction(null)}><X size={18}/></button><h2 id="quick-action-title">{quickAction.label}</h2><p>Complete the details below to get started.</p>{quickAction.label === 'Pay Fees' && <p className="portal-validation-note">Your payment proof will be validated before the request is marked paid and any document is released.</p>}<form className="portal-action-form" onSubmit={submitQuickAction}>{quickFields[quickAction.label].map(([label, type, options]) => <label key={label}>{label}{label === 'Attach supporting file' && quickAction.label === 'Report Concern' ? ' (optional)' : ''}{label === 'Location or barangay' ? <BarangaySelect options={options}/> : type === 'select' ? <select name={label} required defaultValue=""><option value="" disabled>Select an option</option>{options.map(option => <option key={option}>{option}</option>)}</select> : type === 'textarea' ? <textarea name={label} required rows="3"/> : <input name={label} required={type !== 'file' || quickAction.label === 'Pay Fees'} type={type} accept={type === 'file' ? '.jpg,.jpeg,.png,.pdf,.doc,.docx' : undefined}/>}</label>)}<label className="portal-action-disclaimer"><input type="checkbox" required/> I confirm that the information provided is accurate and may be used to process this request.</label><div className="portal-action-form-actions"><button type="button" className="portal-action-secondary" onClick={() => setQuickAction(null)}>Cancel</button><button type="submit" className="citizen-primary">Continue</button></div></form></section></div>}
    {quickConfirmation && <div className="portal-action-backdrop portal-confirmation-backdrop" role="presentation"><section className="portal-action-modal portal-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirmation-title"><h2 id="confirmation-title">Request received</h2><p>Your {quickConfirmation.toLowerCase()} details were submitted successfully. We’ll review your request and provide an update through your account.</p><button type="button" className="citizen-primary" onClick={() => setQuickConfirmation('')}>Done</button></section></div>}
    {params.get('profile') === '1' && <div className="profile-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setParams({})}><section className="profile-modal-card"><ProfileForm onClose={() => setParams({})}/></section></div>}
  </>
}
