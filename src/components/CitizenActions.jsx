import { ArrowRight, Building2, CalendarDays, FileText, HelpCircle, MessageSquare, ShieldCheck } from 'lucide-react'
import { usePublishedContent } from '../hooks/usePublicResource'
import { Link } from 'react-router-dom'
import { navigationDestinationId } from '../services/websiteAnalytics.js'

const icons = { Building2, CalendarDays, FileText, HelpCircle, MessageSquare, ShieldCheck }
export default function CitizenActions({ className = '' }) {
  const { content } = usePublishedContent('actions')
  const actions = (content?.items || []).map(item => [item.title, item.description, item.url, icons[item.icon] || FileText])
  return <div className={`home-action-grid ${className}`}>{actions.map(([title, description, url, Icon]) => <Link to={url} data-analytics-placement="home.actions" data-analytics-destination={navigationDestinationId(url)} key={title}><span><Icon size={18} aria-hidden="true" /></span><div><strong>{title}</strong><small>{description}</small></div><ArrowRight size={15} aria-hidden="true" /></Link>)}</div>
}
