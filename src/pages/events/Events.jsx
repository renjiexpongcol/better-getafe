import { useDataRevision } from '../../hooks/usePublicResource'
import { SearchInput, LoadingState, ErrorState, EmptyState, Button } from '../../components/ui/Primitives'
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { publicApi } from '../../services/apiClient'
import EventCalendar from '../../components/EventCalendar'
import { municipalDate } from '../../services/homepagePresentation'

const formatDate = value => municipalDate(value, { month: 'long' })

export default function Events() {
  const dataRevision = useDataRevision()
  const [events, setEvents] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [showCalendar, setShowCalendar] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError('')
    publicApi('/news?display=events&limit=24&public=true', { force: retry > 0 || dataRevision > 0, persist: false })
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
        setError('We could not load the event calendar right now.')
      })
      .finally(() => setLoading(false))
  }, [retry, dataRevision])

  const filteredEvents = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term ? events.filter((event) => {
      const eventDate = event.event_start_at
      return `${event.title} ${event.excerpt} ${event.content_type || ''} ${event.category?.name || ''} ${eventDate ? formatDate(eventDate) : ''}`.toLowerCase().includes(term)
    }) : events
  }, [events, query])

  return (
    <main className="events-page">
      <section className="events-hero">
        <div className="container events-hero-inner">
          <div>
            <h1>Events in Getafe</h1>
            <p className="events-hero-lead">Community celebrations, municipal activities, and local events.</p>
          </div>
        </div>
      </section>

      <section className="events-content">
        <div className="container">
          <div className="events-heading">
            <div><h2>Community events</h2></div>
            <button type="button" className="public-calendar-toggle" aria-expanded={showCalendar} aria-controls="full-event-calendar" onClick={() => setShowCalendar(value => !value)}>{showCalendar ? 'Close calendar' : 'View calendar'}</button>
            <SearchInput label="Search events" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search events" />
          </div>
          <div id="full-event-calendar">{showCalendar && <EventCalendar />}</div>

          {query && !loading && <p className="events-result-count" role="status">Showing {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}</p>}

          {loading ? <LoadingState label="Loading events…"/> : error ? <ErrorState message={error} onRetry={() => setRetry(value => value + 1)}/> : filteredEvents.length ? (
            <div className="event-sections">
              {filteredEvents.map((event, index) => {
                const date = event.event_start_at
                const image = event.featured_image || event.images?.[0] || '/assets/Getafe_Bohol_1.jpg'
                return (
                  <article className="event-story" key={event.id || event.slug}>
                    <Link to={`/events/${event.slug}`} className="event-photo" aria-label={`View ${event.title}`}><img src={image} alt={`${event.title} event`} loading={index ? 'lazy' : 'eager'} /></Link>
                    <div className="event-story-content"><div className="event-story-meta">{date && <time dateTime={date}>{formatDate(date)}</time>}</div><h3>{event.title}</h3><p>{event.excerpt}</p><Link className="event-story-link" to={`/events/${event.slug}`} aria-label={`View event story: ${event.title}`}>View event story <ChevronRight size={16} aria-hidden="true" /></Link></div>
                  </article>
                )
              })}
            </div>
          ) : <EmptyState title="No events found" description={query ? 'Try another search term or clear your search.' : 'No public events have been published yet.'} action={query && <Button variant="outline" onClick={() => setQuery('')}>Clear search</Button>}/>}

        </div>
      </section>
    </main>
  )
}
