import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'

const dateKey = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const eventDate = (event) => event.event_start_at || event.startDate || event.start_date || event.event_date || event.date || event.published_at
const monthLabel = (date) => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(date)
const shortMonth = (value) => new Intl.DateTimeFormat('en-PH', { month: 'short' }).format(new Date(value)).toUpperCase()
const dayLabel = (value) => new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value))

function Calendar({ activeMonth, eventsByDate, onMonthChange, onSelectDate, selectedDate }) {
  const year = activeMonth.getFullYear()
  const month = activeMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = dateKey(new Date())
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, index) => index < firstDay ? null : index - firstDay + 1)

  return <section className="home-calendar" aria-label={`${monthLabel(activeMonth)} calendar`}>
    <div className="home-calendar-head"><h3>{monthLabel(activeMonth)}</h3><div className="home-calendar-actions"><button type="button" onClick={() => onMonthChange(-1)} aria-label="Previous month"><ChevronLeft size={17} /></button><button type="button" onClick={() => onMonthChange(1)} aria-label="Next month"><ChevronRight size={17} /></button></div></div>
    <div className="home-calendar-weekdays" aria-hidden="true">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="home-calendar-days">{cells.map((day, index) => {
      if (!day) return <span className="home-calendar-blank" key={`blank-${index}`} />
      const key = dateKey(new Date(year, month, day))
      const count = eventsByDate.get(key)?.length || 0
      const isSelected = key === selectedDate
      const isToday = key === today
      const label = count ? `${count} ${count === 1 ? 'event' : 'events'} on ${dayLabel(new Date(year, month, day))}` : dayLabel(new Date(year, month, day))
      return <button type="button" className={`home-calendar-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${count ? 'has-events' : ''}`} onClick={() => onSelectDate(key)} aria-label={label} aria-pressed={isSelected} key={key}><span>{day}</span>{count > 0 && <i aria-hidden="true" />}</button>
    })}</div>
  </section>
}

function EventRow({ event }) {
  const date = eventDate(event)
  const time = event.startTime || event.start_time || event.time
  const endTime = event.endTime || event.end_time
  const schedule = time ? `${time}${endTime ? ` – ${endTime}` : ''}` : ''
  const location = event.location || event.venue

  return <article className="home-event-row"><time className="home-event-date" dateTime={date}><span>{shortMonth(date)}</span><strong>{new Date(date).getDate()}</strong></time><div className="home-event-copy">{event.category?.name && <p className="home-event-category">{event.category.name}</p>}<h4>{event.title}</h4>{location && <p><MapPin size={14} aria-hidden="true" />{location}</p>}{schedule && <p><Clock3 size={14} aria-hidden="true" />{schedule}</p>}{event.excerpt && <p className="home-event-description">{event.excerpt}</p>}<Link to={`/news/${event.slug}`}>View details <ArrowRight size={14} aria-hidden="true" /></Link></div></article>
}

export default function EventsSection() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeMonth, setActiveMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState('')

  useEffect(() => {
    fetch('/api/news?display=upcoming&temporal=upcoming&limit=24&public=true')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Events unavailable')))
      .then((data) => setEvents((data.items || []).filter((event) => dateKey(eventDate(event)))))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [])

  const eventsByDate = useMemo(() => {
    const grouped = new Map()
    events.forEach((event) => { const key = dateKey(eventDate(event)); grouped.set(key, [...(grouped.get(key) || []), event]) })
    return grouped
  }, [events])
  const monthEvents = useMemo(() => events.filter((event) => { const date = new Date(eventDate(event)); return date.getFullYear() === activeMonth.getFullYear() && date.getMonth() === activeMonth.getMonth() }).sort((a, b) => new Date(eventDate(a)) - new Date(eventDate(b))), [activeMonth, events])
  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) || []) : monthEvents
  const selectedLabel = selectedDate ? `Events on ${dayLabel(selectedDate)}` : 'Upcoming events'
  const changeMonth = (offset) => { setActiveMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1)); setSelectedDate('') }

  return <section className="section home-events-section"><div className="container"><div className="home-subsection-head"><div><p className="eyebrow">Mark your calendar</p><h2>Upcoming events &amp; meetings</h2></div><Link to="/events">View full calendar <ArrowRight size={15} /></Link></div><div className="home-events-layout"><Calendar activeMonth={activeMonth} eventsByDate={eventsByDate} onMonthChange={changeMonth} onSelectDate={setSelectedDate} selectedDate={selectedDate} /><section className="home-events-list" aria-live="polite"><div className="home-events-list-head"><h3>{selectedLabel}</h3>{selectedDate && <button type="button" onClick={() => setSelectedDate('')}>Show all upcoming events</button>}</div>{loading ? <p className="home-events-state">Loading events…</p> : selectedEvents.length ? selectedEvents.map((event) => <EventRow event={event} key={event.id || event.slug} />) : <div className="home-events-empty"><CalendarDays size={21} aria-hidden="true" /><div><strong>{selectedDate ? 'No events scheduled for this date.' : 'No upcoming events have been published yet.'}</strong><p>{selectedDate ? 'Choose another date or view all upcoming events.' : 'Please check back for future municipal activities and announcements.'}</p><Link to="/events">View all upcoming events <ArrowRight size={14} /></Link></div></div>}</section></div></div></section>
}
