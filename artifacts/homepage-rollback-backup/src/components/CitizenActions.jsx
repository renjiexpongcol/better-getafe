import { ArrowRight, Building2, ClipboardCheck, FileText, HelpCircle, MessageSquare, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

const actions = [
  ['Find a Service', 'Browse requirements and service information.', '/services/directory', FileText],
  ['Request a Document', 'Find certificate and record requirements.', '/services/certificates', ShieldCheck],
  ['Apply for a Permit', 'View business permit guidance and applications.', '/services/business-trade', Building2],
  ['Track My Request', 'Sign in to view your submitted requests.', '/app/requests', ClipboardCheck],
  ['Report a Concern', 'Contact the LGU about a concern or feedback.', '/contact?category=concern#contact-message', MessageSquare],
  ['Contact an Office', 'Find municipal departments and office contacts.', '/departments', HelpCircle],
]

export default function CitizenActions({ className = '' }) {
  return <div className={`home-action-grid ${className}`}>{actions.map(([title, description, url, Icon]) => <Link to={url} key={title}><span><Icon size={18} aria-hidden="true" /></span><div><strong>{title}</strong><small>{description}</small></div><ArrowRight size={15} aria-hidden="true" /></Link>)}</div>
}
