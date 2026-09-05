import { ArrowRight, Building2, CalendarDays, FileText, HelpCircle, MessageSquare, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

const actions = [
  ['Apply for a service', 'Find municipal services and requirements.', '/services/directory', FileText],
  ['Get a permit', 'Business, building, and other permits.', '/services/business-trade', Building2],
  ['Request a document', 'Certificates, records, and official documents.', '/services/certificates', ShieldCheck],
  ['Report an issue', 'Send an inquiry or concern to the municipality.', '/contact', MessageSquare],
  ['Contact the LGU', 'Find office contact information and hours.', '/contact', HelpCircle],
  ['Events & meetings', 'View published government activities.', '/events', CalendarDays],
]

export default function CitizenActions({ className = '' }) {
  return <div className={`home-action-grid ${className}`}>{actions.map(([title, description, url, Icon]) => <Link to={url} key={title}><span><Icon size={18} aria-hidden="true" /></span><div><strong>{title}</strong><small>{description}</small></div><ArrowRight size={15} aria-hidden="true" /></Link>)}</div>
}
