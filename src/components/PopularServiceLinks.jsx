import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from './ui/Primitives'
import { useEservice } from './EserviceUI'
import { routeRequest } from '../services/routeRequests'
import { navigationDestinationId } from '../services/websiteAnalytics.js'

export default function PopularServiceLinks() {
  const state = useEservice(signal => routeRequest('/api/popular-services?limit=6', { signal, ttl: 60000 }), [])
  const links = [...new Map((Array.isArray(state.data) ? state.data : []).filter(item => typeof item.href === 'string' && item.href.startsWith('/') && !item.href.startsWith('//')).map(item => [item.href, item])).values()]
  return <section className="mc-popular" aria-labelledby="popular-services-title">
    <header className="mc-header"><div><h2 id="popular-services-title">Popular services</h2><p>Quick links to frequently requested municipal services.</p></div></header>
    {state.loading ? <LoadingState label="Loading popular services…"/> : state.error ? <ErrorState message={state.error} onRetry={state.refresh}/> : links.length ? <ul className="mc-popular-list">{links.map(item => <li key={item.href}><Link to={item.href} data-analytics-placement="services.popular" data-analytics-destination={navigationDestinationId(item.href)}><strong>{item.label}</strong><span>View services <ArrowUpRight size={16} aria-hidden="true"/></span></Link></li>)}</ul> : <EmptyState title="No popular services listed" description="Browse the service catalog above for available services."/>}
  </section>
}
