import { useMemo, useState } from 'react'
import { ArrowUpRight, Compass, Search, Waves } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useDestinations } from '../../services/destinations'
import '../../components/DiscoverGetafe.css'

export default function Tourism() {
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const { data, loading, error, retry } = useDestinations(`/api/discover?offset=${offset}`)
  const places = data?.items || []

  const filteredPlaces = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized
      ? places.filter((place) => `${place.title} ${place.shortDescription} ${place.location} ${place.category}`.toLowerCase().includes(normalized))
      : places
  }, [places, query])

  return (
    <main className="tourism-page">
      <section className="tourism-hero">
        <div className="container tourism-hero-inner">
          <div className="tourism-hero-copy">
            <p className="tourism-kicker"><Compass size={15} /> Getafe, Bohol</p>
            <h1>Tourism in Getafe</h1>
            <p className="tourism-lead">Find mangrove paths, island waters, marine sanctuaries, and quiet places to stay in the municipality of Getafe.</p>
            <a className="tourism-hero-link" href="#destinations">Read tourism guides <ArrowUpRight size={17} /></a>
          </div>
          <div className="tourism-hero-image">
            <img src="/assets/tourism/pandanon-1.jpg" alt="Pandanon Island in Getafe, Bohol" />
            <span><Waves size={16} /> Coastal Getafe</span>
          </div>
        </div>
      </section>

      <div className="container tourism-discover-link"><Link to="/discover">Browse Discover Getafe destinations <ArrowUpRight size={17} aria-hidden="true" /></Link></div>

      <section className="tourism-intro" id="destinations">
        <div className="container">
          <div className="tourism-section-heading">
            <div>
              <p className="tourism-label">Plan your visit</p>
              <h2>Tourism guides & stories</h2>
            </div>
            <p>Explore published destination profiles from the municipality. Destination information is shared with Discover Getafe.</p>
          </div>

          {!loading && !error && places.length > 0 && <div className="tourism-toolbar">
            <label className="tourism-search"><Search size={18} /><span className="sr-only">Search destinations on this page</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search destinations on this page" /></label>
            <span className="tourism-count" role="status">{filteredPlaces.length} guide{filteredPlaces.length === 1 ? '' : 's'}</span>
          </div>}

          {loading ? <p className="tourism-state" role="status">Loading tourism guides…</p> : error ? <div className="tourism-state" role="alert"><p>Tourism guides are temporarily unavailable.</p><button className="btn btn-primary" onClick={retry}>Try again</button></div> : filteredPlaces.length ? (
            <div className="tourism-grid">
              {filteredPlaces.map((place, index) => (
                <article className={`tourism-card ${index === 0 ? 'tourism-card-featured' : ''}`} key={place.id || place.slug}>
                  <div className="tourism-card-image">
                    {place.imageUrl ? <img src={place.imageUrl} alt={place.imageAlt} loading="lazy" decoding="async" width="800" height="450" /> : <Compass size={40} aria-hidden="true" />}
                    <span>{place.category || 'Destination'}</span>
                  </div>
                  <div className="tourism-card-body">
                    <h3><Link to={`/discover/${encodeURIComponent(place.slug)}`}>{place.title}</Link></h3>
                    <p>{place.shortDescription}</p>
                    <Link className="tourism-card-link" to={`/discover/${encodeURIComponent(place.slug)}`} aria-label={`View ${place.title}`}>Read guide <ArrowUpRight size={15} /></Link>
                  </div>
                </article>
              ))}
            </div>
          ) : <div className="tourism-state"><p>{places.length ? 'No tourism guides match your search.' : 'Tourism guides will appear here when published.'}</p>{places.length > 0 && <button className="btn btn-primary" onClick={() => setQuery('')}>Clear search</button>}<p><Link to="/discover">Explore Discover Getafe</Link></p></div>}

          {!loading && !error && <nav className="discover-pagination" aria-label="Tourism destination pages">
            {offset > 0 && <button className="btn btn-primary" onClick={() => { setOffset(offset - 100); setQuery('') }}>Previous destinations</button>}
            {offset + places.length < data.total && <button className="btn btn-primary" onClick={() => { setOffset(offset + 100); setQuery('') }}>Next destinations</button>}
          </nav>}

        </div>
      </section>
    </main>
  )
}
