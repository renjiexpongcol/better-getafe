import { Link, useParams } from 'react-router-dom'
import { useDestinations } from '../../services/destinations'
import { ResourceNotFound } from '../../components/RouteStatusPages'
import '../../components/DiscoverGetafe.css'
export default function Destination({ legacyKey } = {}) {
  const { slug } = useParams()
  const { data, loading, error, retry } = useDestinations(legacyKey ? `/api/discover/legacy/${encodeURIComponent(legacyKey)}` : `/api/discover/${encodeURIComponent(slug)}`)
  if (loading) return <main className="container discover-page" role="status">Loading destination…</main>
  if (error?.status === 404) return <ResourceNotFound title="Destination not found" message="This destination may have been removed or is not currently published." browseLabel="Discover Getafe" browseTo="/discover"/>
  if (error) return <main className="container discover-page"><h1>Destination information unavailable</h1><p>Please try again later.</p><button className="btn btn-primary" onClick={retry}>Try again</button><Link to="/discover">Back to Discover Getafe</Link></main>
  return <main className="container discover-page"><article className="discover-detail"><h1>{data.title}</h1>{data.category && <p>{data.category}</p>}{data.imageUrl && <img src={data.imageUrl} alt={data.imageAlt} width="1200" height="675"/>}<p>{data.shortDescription}</p>{data.fullDescription && <section><h2>About the destination</h2><p>{data.fullDescription}</p></section>}{data.location && <section><h2>Location</h2><p>{data.location}</p></section>}<p className="discover-crosslink"><Link to="/discover">← All destinations</Link></p></article></main>
}
