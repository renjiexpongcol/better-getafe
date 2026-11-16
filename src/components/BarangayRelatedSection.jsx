import { ArrowRight, Newspaper } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePublicResource } from '../hooks/usePublicResource'
import { EmptyState, ErrorState, LoadingState } from './ui/Primitives'
export default function BarangayRelatedSection({ barangay }) {
  const resource = usePublicResource('/news?limit=24')
  const name = barangay.name.toLowerCase()
  const items = (resource.data?.items || []).filter(item => `${item.title} ${item.excerpt || ''} ${item.content || ''}`.toLowerCase().includes(name)).slice(0, 3)
  return <section className="barangay-related section"><div className="container"><div className="barangay-related-head"><div><p className="eyebrow">More from {barangay.name}</p><h2>Explore {barangay.name}</h2><p>News and community announcements from Getafe.</p></div><Link to="/news" className="barangay-related-all">View all updates <ArrowRight size={16} /></Link></div>
    {resource.loading ? <LoadingState /> : resource.error ? <ErrorState message={resource.error} onRetry={resource.reload} /> : !items.length ? <div className="barangay-related-empty"><EmptyState icon={Newspaper} title={`No updates mention ${barangay.name} yet`} description="Check all municipal updates for the latest news and announcements." /></div> : <div className="barangay-related-grid">{items.map(item => <Link className="barangay-related-card" to={`/news/${item.slug}`} key={item.id || item.slug}><div className="barangay-related-icon"><Newspaper size={18} /></div><div><span>COMMUNITY UPDATE</span><h3>{item.title}</h3>{item.excerpt && <p>{item.excerpt}</p>}<strong>View details <ArrowRight size={14} /></strong></div></Link>)}</div>}
  </div></section>
}
