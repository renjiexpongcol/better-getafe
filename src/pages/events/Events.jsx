import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Search, X } from 'lucide-react'
import { Link } from 'react-router-dom'

const formatDate = (value) => new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value))

export default function Events() {
  const [events, setEvents] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/news?display=events&limit=24&public=true')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Events unavailable')))
      .then((data) => {
        const items = data.items || []
        const mergedItems = items.map((item) => ({
          ...item,
          images: item.images || [item.featured_image].filter(Boolean),
        }))
        setEvents(mergedItems)
      })
      .catch(() => {
        setEvents([])
      })
      .finally(() => setLoading(false))
  }, [])

  const filteredEvents = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term ? events.filter((event) => {
      const eventDate = event.event_start_at || event.published_at
      return `${event.title} ${event.excerpt} ${event.content_type || ''} ${event.category?.name || ''} ${eventDate ? formatDate(eventDate) : ''}`.toLowerCase().includes(term)
    }) : events
  }, [events, query])

  return (
    <main className="events-page">
      <section className="events-hero">
        <div className="container events-hero-inner">
          <div>
            <h1>Gathered in celebration.</h1>
            <p className="events-hero-lead">Celebrating the people, traditions, and special moments that make Getafe feel like home.</p>
          </div>
        </div>
      </section>

      <section className="events-content">
        <div className="container">
          <div className="events-heading">
            <div><h2>Moments we remember.</h2></div>
            <label className="events-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search events</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear event search"><X size={15} /></button>}</label>
          </div>

          {query && !loading && <p className="events-result-count" role="status">Showing {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}</p>}

          {loading ? <p className="events-state">Loading the event gallery…</p> : filteredEvents.length ? (
            <div className="event-sections">
              {filteredEvents.map((event, index) => {
                const date = event.event_start_at || event.published_at
                const image = event.featured_image || event.images?.[0] || '/assets/Getafe_Bohol_1.jpg'
                return (
                  <article className="event-story" key={event.id || event.slug}>
                    <Link to={`/news/${event.slug}`} className="event-photo" aria-label={`View ${event.title}`}><img src={image} alt={`${event.title} event`} loading={index ? 'lazy' : 'eager'} /></Link>
                    <div className="event-story-content"><div className="event-story-meta">{date && <time dateTime={date}>{formatDate(date)}</time>}</div><h3>{event.title}</h3><p>{event.excerpt}</p><Link className="event-story-link" to={`/news/${event.slug}`} aria-label={`View event story: ${event.title}`}>View event story <ChevronRight size={16} aria-hidden="true" /></Link></div>
                  </article>
                )
              })}
            </div>
          ) : <div className="events-empty"><h3>No events found</h3><p>{query ? 'Try another search term or clear your search.' : 'No public events have been published yet.'}</p>{query && <button type="button" onClick={() => setQuery('')}>Clear search</button>}</div>}

        </div>
      </section>
    </main>
  )
}
