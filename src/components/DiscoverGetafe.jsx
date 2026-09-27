import { Link } from 'react-router-dom'
import { useDestinations } from '../services/destinations'
import './DiscoverGetafe.css'
export function DestinationCard({ destination, headingLevel = 3 }) {
  const Heading = `h${headingLevel}`
  return <article className="discover-card">
    {destination.imageUrl && <div className="discover-image"><img src={destination.imageUrl} alt={destination.imageAlt} loading="lazy" decoding="async" width="800" height="450" /></div>}
    <div className="discover-card-content"><Heading>{destination.title}</Heading><p>{destination.shortDescription}</p><Link className="read-more discover-action" to={`/discover/${encodeURIComponent(destination.slug)}`} aria-label={`Learn more about ${destination.title}`}>Learn More <span aria-hidden="true">→</span></Link></div>
  </article>
}
export function DestinationSkeleton() {
  return <div role="status" aria-label="Loading destinations"><div className="discover-grid" aria-hidden="true">{[1, 2, 3].map(key => <div className="discover-card discover-skeleton" key={key}><div className="discover-image"/><div className="discover-card-content"><div/><div/><div/></div></div>)}</div></div>
}
export default function DiscoverGetafe() {
  const { data, loading, error } = useDestinations('/api/discover?featured=true')
  if (error || (!loading && !data?.items?.length)) return null
  return <section className="section discover-section" aria-labelledby="discover-getafe-title"><div className="container">
    <div className="discover-heading"><div><h2 id="discover-getafe-title">Discover Getafe</h2><p>Home to the phenomenal Danajon Double Barrier Reef, rich cultural heritage, and islands waiting to be explored.</p></div>{data?.total > data?.items?.length && <Link className="read-more" to="/discover">View All Destinations <span aria-hidden="true">→</span></Link>}</div>
    {loading ? <DestinationSkeleton/> : <div className="discover-grid">{data.items.map(destination => <DestinationCard key={destination.id} destination={destination}/>)}</div>}
  </div></section>
}
