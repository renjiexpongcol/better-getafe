import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Compass, Leaf, Search, Waves } from 'lucide-react'
import { Link } from 'react-router-dom'

const fallbackPlaces = [
  { title: 'Man-made Mangrove Forest', slug: 'man-made-mangrove-forest', excerpt: 'Walk beneath a living canopy and experience one of Getafe\'s most distinctive coastal landscapes.', featured_image: '/assets/Getafe_Bohol_1.jpg', category: { name: 'Nature' } },
  { title: 'Pandanon Island Resort', slug: 'pandanon-island', excerpt: 'Discover island horizons, quiet shorelines, clear blue water, and the easy pace of Getafe\'s coastal communities.', featured_image: '/assets/tourism/pandanon-1.jpg', category: { name: 'Island escape' } },
  { title: 'Handumon Marine Sanctuary', slug: 'handumon-marine-sanctuary', excerpt: 'Explore a protected marine landscape shaped by community stewardship, mangroves, seahorses, and clear Visayan waters.', featured_image: '/assets/tourism/pandanon-1.jpg', category: { name: 'Marine life' } },
  { title: 'Corte Paradise Resort', slug: 'corte-paradise-resort', excerpt: 'Make time for a restful stay surrounded by riverside views, spring water, and the scenery of coastal Getafe.', featured_image: '/assets/tourism/pandanon-1.jpg', category: { name: 'Stay & unwind' } },
  { title: 'Verador Hill', slug: 'verador-hill', excerpt: 'Take in open views and a slower, greener side of the municipality from the hills above town.', featured_image: '', category: { name: 'Scenic views' } },
]

function cardImage(place) {
  return place.featured_image || '/assets/Getafe_Bohol_1.jpg'
}

function placeUrl(place) {
  if (place.slug === 'man-made-mangrove-forest') return '/tourism/banacon'
  if (place.slug === 'pandanon-island') return '/tourism/pandanon'
  if (place.slug === 'corte-paradise-resort') return '/tourism/corte-paradise'
  if (place.slug === 'handumon-marine-sanctuary') return '/tourism/handumon'
  if (place.slug === 'verador-hill') return '/tourism/verador'
  return `/news/${place.slug}`
}

export default function Tourism() {
  const [places, setPlaces] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [usingFallback, setUsingFallback] = useState(false)

  useEffect(() => {
    fetch('/api/news?category=tourism&limit=24')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Tourism content unavailable')))
      .then((data) => {
        const items = data.items || []
        const featuredFallbacks = fallbackPlaces.filter((place) => ['man-made-mangrove-forest', 'verador-hill'].includes(place.slug))
        const missingFeatured = featuredFallbacks.filter((place) => !items.some((item) => item.slug === place.slug))
        setPlaces(items.length ? [...missingFeatured, ...items] : fallbackPlaces)
        setUsingFallback(!items.length)
      })
      .catch(() => {
        setPlaces(fallbackPlaces)
        setUsingFallback(true)
      })
      .finally(() => setLoading(false))
  }, [])

  const filteredPlaces = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized
      ? places.filter((place) => `${place.title} ${place.excerpt}`.toLowerCase().includes(normalized))
      : places
  }, [places, query])

  return (
    <main className="tourism-page">
      <section className="tourism-hero">
        <div className="container tourism-hero-inner">
          <div className="tourism-hero-copy">
            <p className="tourism-kicker"><Compass size={15} /> Getafe, Bohol</p>
            <h1>Where the coast keeps its stories.</h1>
            <p className="tourism-lead">Find mangrove paths, island waters, marine sanctuaries, and quiet places to stay in the municipality of Getafe.</p>
            <a className="tourism-hero-link" href="#destinations">Explore destinations <ArrowUpRight size={17} /></a>
          </div>
          <div className="tourism-hero-image">
            <img src="/assets/tourism/pandanon-1.jpg" alt="Pandanon Island in Getafe, Bohol" />
            <span><Waves size={16} /> Coastal Getafe</span>
          </div>
        </div>
      </section>

      <section className="tourism-intro" id="destinations">
        <div className="container">
          <div className="tourism-section-heading">
            <div>
              <p className="tourism-label">Plan your visit</p>
              <h2>Places worth taking the long way to.</h2>
            </div>
            <p>Official destination information from the Getafe CMS, curated for residents, visitors, and local tourism partners.</p>
          </div>

          <div className="tourism-toolbar">
            <label className="tourism-search"><Search size={18} /><span className="sr-only">Search destinations</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search destinations" /></label>
            <span className="tourism-count">{filteredPlaces.length} destination{filteredPlaces.length === 1 ? '' : 's'}</span>
          </div>

          {loading ? <p className="tourism-state">Loading destinations…</p> : filteredPlaces.length ? (
            <div className="tourism-grid">
              {filteredPlaces.map((place, index) => (
                <article className={`tourism-card ${index === 0 ? 'tourism-card-featured' : ''}`} key={place.id || place.slug}>
                  <Link to={placeUrl(place)} className="tourism-card-image">
                    <img src={cardImage(place)} alt="" loading={index > 1 ? 'lazy' : 'eager'} />
                    <span>{place.category?.name || 'Destination'}</span>
                  </Link>
                  <div className="tourism-card-body">
                    <h3><Link to={placeUrl(place)}>{place.title}</Link></h3>
                    <p>{place.excerpt}</p>
                    <Link className="tourism-card-link" to={placeUrl(place)}>View destination <ArrowUpRight size={15} /></Link>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="tourism-state">No destinations match your search.</p>}

          {usingFallback && <p className="tourism-cms-note"><Leaf size={15} /> Showing the municipal destination guide while CMS entries are being prepared. Published Tourism entries will appear here automatically.</p>}
        </div>
      </section>
    </main>
  )
}
