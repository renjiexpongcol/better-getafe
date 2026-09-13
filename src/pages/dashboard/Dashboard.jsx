import { ArrowRight, Bell, CalendarDays, CircleAlert, CreditCard, FilePlus2, FileText, FolderOpen, MessageSquare, Plus, ShieldCheck, Upload, UserRound, BriefcaseBusiness } from 'lucide-react'
import { Link } from 'react-router-dom'
import CitizenLayout from '../../components/CitizenLayout'
import { ApplicationRows, AppointmentRows, DataState, DocumentRows, Empty, Panel, ServiceCategories, ServiceSearch } from '../../components/CitizenWidgets'
import { useAuth } from '../../context/AuthContext'
import { useCitizen } from '../../context/CitizenContext'
import { dateLabel, isActive, money, needsAction, notificationLink, paymentDue, upcomingAppointments } from '../../services/citizenData'

const actions = [
  ['Request Document', FilePlus2, '/app/services?category=certificates'], ['Apply for Permit', BriefcaseBusiness, '/app/services?category=business'],
  ['Book Appointment', CalendarDays, '/app/appointments?book=1'], ['Upload Document', Upload, '/app/documents?upload=1'],
  ['Pay Fees', CreditCard, '/app/payments'], ['Report Concern', MessageSquare, '/app/requests/new?service=concern'],
]
export default function Dashboard() { return <CitizenLayout title="Dashboard"><DashboardContent/></CitizenLayout> }
function DashboardContent() {
  const { user } = useAuth(), { data, loading, error } = useCitizen()
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
  const fields = [profile?.full_name, user.email, profile?.mobile, profile?.barangay, profile?.house_lot || profile?.street || profile?.purok_sitio]
  const completion = Math.round(fields.filter(value => String(value || '').trim()).length / fields.length * 100)
  const activity = data?.notifications || []
  return <>
    <section className="citizen-welcome"><div><p className="portal-date">{new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p><h1>Welcome back, {name.trim().split(/\s+/)[0]}</h1><p>Manage your municipal services, applications and documents.</p></div><Link className="citizen-primary" to="/app/services"><Plus size={17}/>Request a Service</Link></section>
    <section className="citizen-stats" aria-label="Your account at a glance">{stats.map(([label, Icon, value, secondary, href]) => <Link className="citizen-stat" to={href} key={label}><div><span>{label}</span><Icon size={18}/></div><strong>{pending ? '—' : value}</strong><small>{pending ? loading ? 'Loading your records…' : 'Records unavailable' : secondary}<ArrowRight size={14}/></small></Link>)}</section>
    {!pending && (attention.length > 0 || due.length > 0) && <section className="portal-attention"><h2><CircleAlert size={20}/>Requires your attention<span>{attention.length + due.length}</span></h2>{attention.map(item => <article key={item.id}><div><h3>{item.service_name}</h3><p>{item.latest_note || 'Additional information is required to continue processing.'}</p></div><Link to={`/app/requests/${encodeURIComponent(item.id)}`}>Continue application<ArrowRight size={15}/></Link></article>)}{due.map(item => <article key={item.id}><div><h3>Payment required · {item.service_name || 'Municipal service'}</h3><p>{money(item.amount)} outstanding</p></div><Link to={`/app/payments?payment=${encodeURIComponent(item.id)}`}>View payment<ArrowRight size={15}/></Link></article>)}</section>}
    <ServiceSearch/>
    <section className="portal-quick"><h2>Quick actions</h2><div>{actions.map(([label, Icon, href]) => <Link to={href} key={label}><Icon size={20}/><span>{label}</span></Link>)}</div></section>
    <ServiceCategories/>
    <div className="citizen-lower">
      <Panel title="My applications" href="/app/requests"><DataState><ApplicationRows items={applications.slice(0, 4)}/></DataState></Panel>
      <Panel title="My documents" href="/app/documents"><DataState><DocumentRows items={documents.slice(0, 3)}/></DataState><Link className="portal-panel-action" to="/app/documents?upload=1"><Upload size={16}/>Upload Document</Link></Panel>
      <Panel title="Upcoming appointment" href="/app/appointments"><DataState><AppointmentRows items={appointments.slice(0, 1)}/></DataState></Panel>
      <Panel title="Recent activity" href="/app/notifications"><DataState>{activity.length ? <ol className="portal-activity">{activity.slice(0, 4).map(item => <li key={item.id}><span><Bell size={14}/></span><div><Link to={notificationLink(item)}>{item.title}</Link><p>{item.message}</p><time>{dateLabel(item.created_at, { hour: 'numeric', minute: '2-digit' })}</time></div></li>)}</ol> : <Empty icon={Bell} title="No activity yet" description="Your application updates, payments and document activity will appear here."/>}</DataState></Panel>
    </div>
    {!pending && completion < 100 && <section className="portal-completion"><span className="portal-document-icon"><UserRound size={22}/></span><div><h2>Complete your profile <span>{completion}% complete</span></h2><progress value={completion} max="100" aria-label="Profile completion"/><p>Add your contact and address information to make future applications faster.</p></div><Link to="/app/profile">Complete profile<ArrowRight size={16}/></Link></section>}
    <footer className="portal-footer"><span><ShieldCheck size={15}/>Municipality of Getafe · Citizen Portal</span><Link to="/app/help">Need assistance? Help &amp; Support<ArrowRight size={14}/></Link></footer>
  </>
}
