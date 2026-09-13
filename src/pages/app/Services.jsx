import { Link, useSearchParams } from 'react-router-dom'
import AppPage from './AppPage'
import { Empty, ServiceSearch } from '../../components/CitizenWidgets'
import { citizenServices, serviceCategories, serviceLink } from '../../data/citizenServices'
import { ArrowRight, FileText } from 'lucide-react'
export default function Services() {
  const [params] = useSearchParams(), category = params.get('category') || ''
  const services = citizenServices.filter(item => !category || item.category === category)
  return <AppPage title="Browse municipal services"><ServiceSearch autoFocus={params.has('search')}/><nav className="portal-filters" aria-label="Service categories"><Link className={!category ? 'active' : ''} to="/app/services">All services</Link>{serviceCategories.map(item => <Link className={category === item.id ? 'active' : ''} key={item.id} to={`/app/services?category=${item.id}`}>{item.name}</Link>)}</nav><p className="portal-muted">Select a service to submit a request. The responsible office will review your information and advise you of requirements and fees.</p><div className="citizen-service-grid">{services.map(service => <Link className="citizen-service" key={service.id} to={serviceLink(service)}><span><FileText size={20}/></span><strong>{service.name}</strong><p>{serviceCategories.find(item => item.id === service.category)?.description}</p><small>Start application<ArrowRight size={16}/></small></Link>)}</div>{!services.length && <Empty title="No services in this category" href="/app/services" action="View all services"/>}</AppPage>
}
