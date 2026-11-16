import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'
import { publicApi } from '../services/apiClient'
import { municipalDate } from '../services/homepagePresentation'

export default function EventsSection() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError(false)
    // Temporal filtering and ordering happen before server pagination, and the
    // public query cannot include drafts even for a signed-in CMS visitor.
    publicApi('/news?display=upcoming&temporal=upcoming&sort=event_soonest&limit=3&public=true', { force: attempt > 0, cacheTtl: 60000, persist: false })
      .then(data => { if (active) setEvents(data.items || []) })
      .catch(() => { if (active) { setEvents([]); setError(true) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attempt])
  return <section className="section home-events-section" aria-labelledby="homepage-events-title"><div className="container">
    <div className="home-subsection-head"><h2 id="homepage-events-title">Upcoming events</h2><Link to="/events">View all events <ArrowRight size={16} aria-hidden="true" /></Link></div>
    {loading ? <p className="homepage-state" role="status">Loading upcoming events…</p> : error ? <div className="homepage-state" role="status"><h3>Events are temporarily unavailable</h3><p>Please try again or visit the events page.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button> <Link to="/events">All events</Link></div> : events.length ? <div className="homepage-upcoming-list">{events.map(event => <article className="homepage-event" key={event.id}>
      <CalendarDays size={24} aria-hidden="true" /><div><time dateTime={event.event_start_at}>{municipalDate(event.event_start_at, { hour: 'numeric', minute: '2-digit' })} (Philippine time)</time>
      <h3><Link to={`/events/${encodeURIComponent(event.slug)}`}>{event.title}</Link></h3>{event.excerpt && <p>{event.excerpt}</p>}
      <Link to={`/events/${encodeURIComponent(event.slug)}`}>Event details <ArrowRight size={16} aria-hidden="true" /></Link></div>
    </article>)}</div> : <div className="homepage-state" role="status"><p>No upcoming events have been published yet.</p><Link to="/events">View events</Link></div>}
  </div></section>
}
