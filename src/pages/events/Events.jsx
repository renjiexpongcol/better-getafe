import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronRight, Images, Search } from 'lucide-react'
import { Link } from 'react-router-dom'

const fallbackEvents = [
  {
    title: 'Annual Fiesta',
    slug: 'annual-fiesta',
    excerpt: 'Getafeños gather every January to honor the town\'s patron, Santo Niño, with faith, music, dance, and community celebrations.',
    published_at: '2026-01-18T00:00:00.000Z',
    featured_image: '/assets/Getafe_Bohol_1.jpg',
    images: ['/assets/Getafe_Bohol_1.jpg', '/assets/cdg-getafe/309577993_205055401874207_4310045809763569344_n.jpg', '/assets/getafe-default/about-getafe.jpg'],
  },
  {
    title: 'Foundation Day',
    slug: 'foundation-day',
    excerpt: 'Every October, Getafe remembers its history and celebrates the people, work, and shared identity that continue to shape the municipality.',
    published_at: '2026-10-12T00:00:00.000Z',
    featured_image: '/assets/cdg-getafe/309577993_205055401874207_4310045809763569344_n.jpg',
    images: ['/assets/cdg-getafe/309577993_205055401874207_4310045809763569344_n.jpg', '/assets/getafe-default/profiles/getafe-municipal hall.jpg', '/assets/Getafe_Bohol_1.jpg'],
  },
]

const formatDate = (value) => new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value))

function galleryImages(event) {
  if (event.images?.length) return event.images
  return [event.featured_image || '/assets/Getafe_Bohol_1.jpg']
}

export default function Events() {
  const [events, setEvents] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [usingFallback, setUsingFallback] = useState(false)

  useEffect(() => {
    fetch('/api/news?category=events&limit=24')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Events unavailable')))
      .then((data) => {
        const items = data.items || []
        const mergedItems = items.map((item) => ({
          ...item,
          images: fallbackEvents.find((fallback) => fallback.slug === item.slug)?.images || [item.featured_image].filter(Boolean),
        }))
        setEvents(items.length ? mergedItems : fallbackEvents)
        setUsingFallback(!items.length)
      })
      .catch(() => {
        setEvents(fallbackEvents)
        setUsingFallback(true)
      })
      .finally(() => setLoading(false))
  }, [])

  const filteredEvents = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term ? events.filter((event) => `${event.title} ${event.excerpt}`.toLowerCase().includes(term)) : events
  }, [events, query])

  return (
    <main className="events-page">
      <section className="events-hero">
        <div className="container events-hero-inner">
          <div>
            <p className="events-kicker"><CalendarDays size={16} /> Life in Getafe</p>
            <h1>Gathered in celebration.</h1>
            <p className="events-hero-lead">A visual record of the traditions, milestones, and community moments that bring Getafe together.</p>
          </div>
          <div className="events-hero-mark"><Images size={34} /><span>Official event gallery</span></div>
        </div>
      </section>

      <section className="events-content">
        <div className="container">
          <div className="events-heading">
            <div><p className="events-label">Gallery of events</p><h2>Moments we remember.</h2></div>
            <label className="events-search"><Search size={17} /><span className="sr-only">Search events</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events" /></label>
          </div>

          {loading ? <p className="events-state">Loading the event gallery…</p> : filteredEvents.length ? (
            <div className="event-sections">
              {filteredEvents.map((event, index) => {
                const images = galleryImages(event)
                return (
                  <article className="event-story" key={event.id || event.slug}>
                    <div className="event-story-heading">
                      <div><p className="event-number">0{index + 1}</p><h3>{event.title}</h3></div>
                      <div className="event-date">{event.published_at && formatDate(event.published_at)}</div>
                    </div>
                    <div className="event-gallery">
                      {images.slice(0, 3).map((image, imageIndex) => <Link to={`/news/${event.slug}`} className={`event-photo event-photo-${imageIndex + 1}`} key={`${image}-${imageIndex}`}><img src={image} alt={`${event.title} gallery image ${imageIndex + 1}`} loading={index || imageIndex ? 'lazy' : 'eager'} /></Link>)}
                    </div>
                    <div className="event-story-footer"><p>{event.excerpt}</p><Link to={`/news/${event.slug}`}>View event story <ChevronRight size={16} /></Link></div>
                  </article>
                )
              })}
            </div>
          ) : <p className="events-state">No events match your search.</p>}

          {usingFallback && <p className="events-cms-note">Showing the starter gallery until published Events entries are available in the CMS.</p>}
        </div>
      </section>
    </main>
  )
}