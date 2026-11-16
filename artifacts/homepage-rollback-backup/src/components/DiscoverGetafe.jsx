import { Link } from 'react-router-dom'
import { useDestinations } from '../services/destinations'
import './DiscoverGetafe.css'
export function DestinationCard({ destination, headingLevel = 3 }) {
  const Heading = `h${headingLevel}`
  return <article className="discover-card">
    {destination.imageUrl && <div className="discover-image"><img src={destination.imageUrl} alt={destination.imageAlt} loading="lazy" decoding="async" width="800" height="450" /></div>}
    <div className="discover-card-content"><Heading>{destination.title}</Heading><p>{destination.shortDescription}</p><Link className="read-more discover-action" to={`/discover/${encodeURIComponent(destination.slug)}`} aria-label={`Explore ${destination.title}`}>Explore destination <span aria-hidden="true">→</span></Link></div>
  </article>
}
export function DestinationSkeleton() {
  return <div role="status" aria-label="Loading destinations"><div className="discover-grid" aria-hidden="true">{[1, 2, 3].map(key => <div className="discover-card discover-skeleton" key={key}><div className="discover-image"/><div className="discover-card-content"><div/><div/><div/></div></div>)}</div></div>
}
export default function DiscoverGetafe() {
  const { data, loading, error, retry } = useDestinations('/api/discover?featured=true')
  return <section className="section discover-section" aria-labelledby="discover-getafe-title"><div className="container">
    <div className="discover-heading"><div><h2 id="discover-getafe-title">Discover Getafe</h2><p>Explore the places and experiences that make Getafe worth discovering.</p></div><Link className="read-more" to="/discover">View all destinations <span aria-hidden="true">→</span></Link></div>
    {loading ? <DestinationSkeleton/> : error ? <div className="homepage-state" role="status"><p>Destination information is temporarily unavailable.</p><button type="button" onClick={retry}>Try again</button> <Link to="/tourism">Tourism information</Link></div> : !data?.items?.length ? <div className="homepage-state" role="status"><p>No featured destinations are available.</p><Link to="/tourism">Tourism information</Link></div> : <div className={`discover-grid discover-grid--${Math.min(data.items.length, 4)}${data.items.length === 1 ? ' discover-grid--featured' : ''}`}>{data.items.map(destination => <DestinationCard key={destination.id} destination={destination}/>)}</div>}
  </div></section>
}
