import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { usePublicResource } from '../hooks/usePublicResource'
import { EmptyState, ErrorState, LoadingState } from './ui/Primitives'
export default function ServicesSection() {
  const resource = usePublicResource('/services')
  const categories = [...new Map((resource.data?.items || []).filter(service => service.category_id).map(service => [service.category_id, { id: service.category_id, name: service.category_name }])).values()]
  return <section className="section services-section"><div className="container"><h2>Municipal services</h2>{resource.loading ? <LoadingState /> : resource.error ? <ErrorState message={resource.error} onRetry={resource.reload} /> : categories.length ? <div className="services-grid">{categories.map(category => <Link className="service-card" key={category.id} to={`/services/e-services/${encodeURIComponent(category.id)}`}><h3>{category.name}</h3><span>View services <ArrowRight size={16}/></span></Link>)}</div> : <EmptyState title="No published services" />}</div></section>
}
