import { ArrowRight, Bell, CalendarDays, CircleAlert, CreditCard, FilePlus2, FileText, FolderOpen, MessageSquare, Plus, BriefcaseBusiness } from 'lucide-react'
import { Link } from 'react-router-dom'
import CitizenLayout from '../../components/CitizenLayout'
import { ApplicationRows, AppointmentRows, DataState, DocumentRows, Empty, Panel, ServiceCategories } from '../../components/CitizenWidgets'
import { useAuth } from '../../context/AuthContext'
import { useCitizen } from '../../context/CitizenContext'
import { dateLabel, isActive, money, needsAction, notificationLink, paymentDue, upcomingAppointments } from '../../services/citizenData'
import { formatResidentDate } from '../../services/residentPreferences'
import { ROUTES } from '../../routeRegistry'

const actions = [
  ['Request Document', FilePlus2, `${ROUTES.app.services}?category=certificates`], ['Apply for Permit', BriefcaseBusiness, `${ROUTES.app.services}?category=business`],
  ['Book Appointment', CalendarDays, `${ROUTES.app.appointments}?book=1`],
  ['Pay Fees', CreditCard, ROUTES.app.payments], ['Report Concern', MessageSquare, `${ROUTES.app.help}?report=1`],
]
export default function Dashboard() { return <CitizenLayout title="Dashboard"><DashboardContent/></CitizenLayout> }
function DashboardContent() {
  const { user } = useAuth(), { data, loading, error } = useCitizen()
  const profile = data?.profile, name = profile?.full_name || user.name || 'Citizen'
  const applications = data?.applications || [], documents = data?.documents || [], payments = data?.payments || [], appointments = upcomingAppointments(data?.appointments || [])
  const active = applications.filter(isActive), attention = applications.filter(needsAction), due = payments.filter(paymentDue)
  const available = documents.filter(item => item.downloadable), pending = loading || error || !data
  const stats = [
    ['In progress', FileText, active.length, attention.length ? `${attention.length} needs your attention` : active.length ? 'Track your requests' : 'No active requests', ROUTES.app.requests],
    ['Documents ready', FolderOpen, available.length, available.length ? 'View your documents' : 'No documents available', ROUTES.app.documents],
    ['Next appointment', CalendarDays, appointments.length, appointments.length ? dateLabel(appointments[0].appointment_at, { year: undefined, hour: 'numeric', minute: '2-digit' }) : 'Nothing scheduled', ROUTES.app.appointments],
    ['Balance due', CreditCard, money(due.reduce((sum, item) => sum + Number(item.amount), 0)), due.length ? `${due.length} ${due.length === 1 ? 'payment' : 'payments'} due` : 'Nothing due', ROUTES.app.payments],
  ]
  const activity = data?.notifications || []
  return <>
    <section className="citizen-welcome"><div><p className="portal-date">{formatResidentDate(new Date(), { weekday: 'long' })}</p><h1>Welcome back, {name.trim().split(/\s+/)[0]}</h1><p>Requests, records, and appointments in one place.</p></div><Link className="citizen-primary" to={ROUTES.app.services}><Plus size={17}/>Start a request</Link></section>
    <section className="citizen-stats" aria-label="Your account at a glance">{stats.map(([label, Icon, value, secondary, href]) => <Link className="citizen-stat" to={href} key={label}><div><span>{label}</span><Icon size={18}/></div><strong>{pending ? '—' : value}</strong><small>{pending ? loading ? 'Loading your records…' : 'Records unavailable' : secondary}<ArrowRight size={14}/></small></Link>)}</section>
    {!pending && (attention.length > 0 || due.length > 0) && <section className="portal-attention"><h2><CircleAlert size={20}/>Requires your attention<span>{attention.length + due.length}</span></h2>{attention.map(item => <article key={item.id}><div><h3>{item.service_name}</h3><p>{item.latest_note || 'Additional information is required to continue processing.'}</p></div><Link to={ROUTES.app.request(item.id)}>Continue application<ArrowRight size={15}/></Link></article>)}{due.map(item => <article key={item.id}><div><h3>Payment required · {item.service_name || 'Municipal service'}</h3><p>{money(item.amount)} outstanding</p></div><Link to={ROUTES.app.payments}>View payment<ArrowRight size={15}/></Link></article>)}</section>}
    <section className="portal-quick"><h2>Start a task</h2><div>{actions.map(([label, Icon, href]) => <Link key={label} to={href}><Icon size={20}/><span>{label}</span></Link>)}</div></section>
    <ServiceCategories/>
    <div className="citizen-lower">
      <Panel title="My applications" href={ROUTES.app.requests}><DataState><ApplicationRows items={applications.slice(0, 4)}/></DataState></Panel>
      <Panel title="My documents" href={ROUTES.app.documents}><DataState><DocumentRows items={documents.slice(0, 3)}/></DataState></Panel>
      <Panel title="Upcoming appointment" href={ROUTES.app.appointments}><DataState><AppointmentRows items={appointments.slice(0, 1)}/></DataState></Panel>
      <Panel title="Recent activity" href={ROUTES.app.notifications}><DataState>{activity.length ? <ol className="portal-activity">{activity.slice(0, 4).map(item => <li key={item.id}><span><Bell size={14}/></span><div><Link to={notificationLink(item)}>{item.title}</Link><p>{item.message}</p><time>{dateLabel(item.created_at, { hour: 'numeric', minute: '2-digit' })}</time></div></li>)}</ol> : <Empty icon={Bell} title="No activity yet" description="Updates from your requests will appear here."/>}</DataState></Panel>
    </div>
  </>
}
