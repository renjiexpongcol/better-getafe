import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useDestinations } from '../../services/destinations'
import { DestinationCard, DestinationSkeleton } from '../../components/DiscoverGetafe'
export default function Discover() {
  const [offset, setOffset] = useState(0)
  const { data, loading, error, retry } = useDestinations(`/api/discover?offset=${offset}`)
  return <main className="container discover-page"><nav aria-label="Breadcrumb"><Link to="/">Home</Link> / <span aria-current="page">Discover Getafe</span></nav><h1>Discover Getafe</h1><p>Explore the islands, coastal communities, natural environments, and cultural destinations of Getafe, Bohol.</p><p className="discover-crosslink"><Link to="/tourism">Read tourism guides and stories →</Link></p>
    {loading ? <DestinationSkeleton/> : error ? <div className="discover-state" role="alert"><p>Destination information is temporarily unavailable.</p><button className="btn btn-primary" onClick={retry}>Try again</button></div> : data.items.length ? <><div className="discover-grid">{data.items.map(destination => <DestinationCard key={destination.id} headingLevel={2} destination={destination}/>)}</div><nav className="discover-pagination" aria-label="Destination pages">{offset > 0 && <button className="btn btn-primary" onClick={() => setOffset(offset - 100)}>Previous destinations</button>}{offset + data.items.length < data.total && <button className="btn btn-primary" onClick={() => setOffset(offset + 100)}>Next destinations</button>}</nav></> : <p>Destination information will be published here when available.</p>}
  </main>
}
