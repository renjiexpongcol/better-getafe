import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'

const formatDate = (value) => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' }).format(new Date(value))

export default function EventsSection() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/news?category=events&limit=3')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Events unavailable')))
      .then((data) => setEvents(data.items || []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [])

  return <section className="section home-events-section"><div className="container"><div className="home-subsection-head"><div><p className="eyebrow">Mark your calendar</p><h2>Upcoming events &amp; meetings</h2></div><Link to="/events">View calendar <ArrowRight size={15} /></Link></div>{loading ? <p className="home-news-state">Loading events…</p> : events.length ? <div className="home-event-grid">{events.map((event) => <article key={event.id}><time dateTime={event.published_at}><strong>{new Date(event.published_at).getDate()}</strong><span>{new Intl.DateTimeFormat('en-PH', { month: 'short' }).format(new Date(event.published_at)).toUpperCase()}</span></time><div><h3>{event.title}</h3><p>{event.excerpt}</p><Link to={`/news/${event.slug}`}>View details <ArrowRight size={14} /></Link></div></article>)}</div> : <div className="home-news-empty"><CalendarDays size={22} /><p>No upcoming events have been published yet.</p><Link to="/events">View event gallery</Link></div>}</div></section>
}
