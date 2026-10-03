import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { publicApi } from '../services/apiClient'

const dateKey = (value) => {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const localDate = (key) => {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const eventDate = (event) => event.event_start_at
const monthLabel = (date) => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(date)
const selectedDayLabel = (key) => `${new Intl.DateTimeFormat('en-PH', { weekday: 'long' }).format(localDate(key))} · ${new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }).format(localDate(key))}`
const selectedMonthDay = (key) => new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric' }).format(localDate(key))
const shortMonth = (value) => new Intl.DateTimeFormat('en-PH', { month: 'short' }).format(localDate(dateKey(value))).toUpperCase()
const dayLabel = (value) => new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(localDate(value))

function eventDays(event) {
  const occurrences = Array.isArray(event.event_occurrences) ? event.event_occurrences : Array.isArray(event.occurrences) ? event.occurrences : null
  if (occurrences) {
    return [...new Set(occurrences.map((occurrence) => dateKey(typeof occurrence === 'string' ? occurrence : occurrence?.date || occurrence?.event_date || occurrence?.start_at)).filter(Boolean))].sort()
  }

  const start = dateKey(event.event_start_at)
  if (!start) return []
  const end = dateKey(event.event_end_at) || start
  const startDate = localDate(start)
  const endDate = localDate(end)
  if (endDate < startDate) return [start]

  const days = []
  for (const date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    days.push(dateKey(date))
  }
  return days
}

function Calendar({ activeMonth, eventsByDate, onMonthChange, onSelectDate, selectedDate }) {
  const year = activeMonth.getFullYear()
  const month = activeMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = dateKey(new Date())
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, index) => index < firstDay ? null : index - firstDay + 1)

  return <section className="home-calendar" aria-label={`${monthLabel(activeMonth)} calendar`}>
    <div className="home-calendar-head"><h3>{monthLabel(activeMonth)}</h3><div className="home-calendar-actions"><button type="button" onClick={() => onMonthChange(-1)} aria-label="Previous month" data-icon-button="ghost"><ChevronLeft size={17} /></button><button type="button" onClick={() => onMonthChange(1)} aria-label="Next month" data-icon-button="ghost"><ChevronRight size={17} /></button></div></div>
    <div className="home-calendar-weekdays" aria-hidden="true">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="home-calendar-days">{cells.map((day, index) => {
      if (!day) return <span className="home-calendar-blank" key={`blank-${index}`} />
      const key = dateKey(new Date(year, month, day))
      const hasEvents = (eventsByDate.get(key)?.length || 0) > 0
      const isSelected = key === selectedDate
      const isToday = key === today
      const label = hasEvents ? `${eventsByDate.get(key).length} ${eventsByDate.get(key).length === 1 ? 'event' : 'events'} on ${dayLabel(key)}` : dayLabel(key)
      return <button type="button" className={`home-calendar-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${hasEvents ? 'has-events' : ''}`} onClick={() => onSelectDate(key)} aria-label={label} aria-pressed={isSelected} key={key}><span>{day}</span>{hasEvents && <i aria-hidden="true" />}</button>
    })}</div>
  </section>
}

function EventRow({ event, displayDate }) {
  const date = eventDate(event)
  const occurrences = Array.isArray(event.event_occurrences) ? event.event_occurrences : Array.isArray(event.occurrences) ? event.occurrences : []
  const occurrence = occurrences.find((item) => dateKey(typeof item === 'string' ? item : item?.date || item?.event_date || item?.start_at) === displayDate)
  const time = occurrence?.start_time || occurrence?.startTime || occurrence?.time || event.startTime || event.start_time || event.time || (() => {
    const parsed = new Date(date)
    return Number.isNaN(parsed.getTime()) || (parsed.getHours() === 0 && parsed.getMinutes() === 0) ? '' : new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(parsed)
  })()
  const endTime = occurrence?.end_time || occurrence?.endTime || event.endTime || event.end_time
  const schedule = time ? `${time}${endTime ? ` – ${endTime}` : ''}` : ''
  const location = event.location || event.venue
  const key = dateKey(displayDate || date)

  return <article className="home-event-row"><time className="home-event-date" dateTime={displayDate || date}><span>{shortMonth(displayDate || date)}</span><strong>{localDate(key).getDate()}</strong></time><div className="home-event-copy">{event.category?.name && <p className="home-event-category">{event.category.name}</p>}<h4>{event.title}</h4>{(location || schedule) && <p className="home-event-meta">{location && <><MapPin size={13} aria-hidden="true" />{location}</>}{location && schedule && <span aria-hidden="true"> · </span>}{schedule && <><Clock3 size={13} aria-hidden="true" />{schedule}</>}</p>}{event.excerpt && <p className="home-event-description">{event.excerpt}</p>}<Link to={`/events/${event.slug}`}>View details <ArrowRight size={14} aria-hidden="true" /></Link></div></article>
}

export default function EventsSection() {
  const today = dateKey(new Date())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [activeMonth, setActiveMonth] = useState(() => { const date = new Date(); return new Date(date.getFullYear(), date.getMonth(), 1) })
  const [selectedDate, setSelectedDate] = useState(today)

  useEffect(() => {
    setLoading(true)
    setError('')
    publicApi('/news?display=events&limit=100&public=true')
      .then((data) => setEvents((data.items || []).filter((event) => eventDays(event).length)))
      .catch(() => { setEvents([]); setError('The event calendar is temporarily unavailable.') })
      .finally(() => setLoading(false))
    return undefined
  }, [retry])

  const eventsByDate = useMemo(() => {
    const grouped = new Map()
    events.forEach((event) => eventDays(event).forEach((key) => grouped.set(key, [...(grouped.get(key) || []), event])))
    return grouped
  }, [events])
  const eventsForSelectedDate = selectedDate ? (eventsByDate.get(selectedDate) || []) : []
  const upcomingEvents = useMemo(() => events
    .map((event) => ({ event, nextDate: eventDays(event).find((key) => key >= today) }))
    .filter(({ nextDate }) => nextDate)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate) || new Date(eventDate(a.event)) - new Date(eventDate(b.event))), [events, today])

  const changeMonth = (offset) => {
    const target = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + offset, 1)
    const day = localDate(selectedDate).getDate()
    const targetDay = Math.min(day, new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate())
    setActiveMonth(target)
    setSelectedDate(dateKey(new Date(target.getFullYear(), target.getMonth(), targetDay)))
  }

  return <section className="section home-events-section"><div className="container"><div className="home-subsection-head"><div><p className="eyebrow">Mark your calendar</p><h2>Upcoming events &amp; meetings</h2></div><Link to="/events">View full calendar <ArrowRight size={15} /></Link></div><div className="home-events-layout"><div className="home-calendar-column"><Calendar activeMonth={activeMonth} eventsByDate={eventsByDate} onMonthChange={changeMonth} onSelectDate={setSelectedDate} selectedDate={selectedDate} /></div><section className="home-selected-events" aria-live="polite"><div className="home-events-list-head"><h3>Events</h3></div><div className="home-events-scroll" tabIndex={0} role="region" aria-label="Selected date events"><p className="home-selected-date"><time dateTime={selectedDate}>{selectedDayLabel(selectedDate)}</time></p>{loading ? <p className="home-events-state" role="status">Loading events…</p> : error ? <p className="home-events-state" role="alert">{error}</p> : eventsForSelectedDate.length ? eventsForSelectedDate.map((event) => <EventRow event={event} displayDate={selectedDate} key={event.id || event.slug} />) : <div className="home-selected-empty"><strong>No events scheduled</strong><p>There are no events scheduled for {selectedMonthDay(selectedDate)}.</p></div>}</div></section><section className="home-events-list" aria-live="polite"><div className="home-events-list-head"><h3>Upcoming events</h3></div><p className="home-upcoming-context">Next scheduled events</p><div className="home-events-scroll" tabIndex={0} role="region" aria-label="Upcoming events">{loading ? <p className="home-events-state" role="status">Loading events…</p> : error ? <div className="list-state-card" role="alert"><strong>Events are temporarily unavailable</strong><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></div> : upcomingEvents.length ? upcomingEvents.slice(0, 3).map(({ event, nextDate }) => <EventRow event={event} displayDate={nextDate} key={event.id || event.slug} />) : <div className="home-events-empty"><CalendarDays size={21} aria-hidden="true" /><div><strong>No upcoming events have been published yet.</strong><p>Please check back for future municipal activities and announcements.</p><Link to="/events">View all events <ArrowRight size={14} /></Link></div></div>}</div></section></div></div></section>
}
