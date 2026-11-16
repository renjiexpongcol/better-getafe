import { useDataRevision } from '../hooks/usePublicResource'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { publicApi } from '../services/apiClient'
import { municipalDate, municipalDayKey } from '../services/homepagePresentation'

export default function EventCalendar() {
  const dataRevision = useDataRevision()
  const today = municipalDayKey()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selected, setSelected] = useState(today)
  const [state, setState] = useState({ loading: true, items: [] })
  const [attempt, setAttempt] = useState(0)
  const [year, monthNumber] = month.split('-').map(Number)
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay()
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const onDay = (event, key) => municipalDayKey(event.event_start_at) <= key && municipalDayKey(event.event_end_at || event.event_start_at) >= key
  useEffect(() => {
    let active = true
    setState({ loading: true, items: [] })
    const load = async () => {
      const items = []
      let page = 1, hasNext = true
      while (active && hasNext) {
        const data = await publicApi(`/news?display=events&month=${month}&sort=event_soonest&limit=100&page=${page}&public=true`, { force: attempt > 0 || dataRevision > 0, persist: false, cacheTtl: 60000 })
        items.push(...(data.items || []))
        hasNext = data.hasNext === true && page < data.pages
        page++
      }
      if (active) setState({ items, loading: false })
    }
    load().catch(() => { if (active) setState({ items: [], error: true, loading: false }) })
    return () => { active = false }
  }, [month, attempt, dataRevision])
  const move = offset => {
    const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1))
    const target = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    setMonth(target); setSelected(target + '-01')
  }
  const selectedEvents = state.items.filter(event => onDay(event, selected))
  return <section className="public-event-calendar" aria-label="Municipal event calendar">
    <div><div className="public-calendar-head"><h3>{municipalDate(month + '-01T00:00:00+08:00', { month: 'long', day: undefined, year: 'numeric' })}</h3><div><button type="button" onClick={() => move(-1)} aria-label="Previous month"><ChevronLeft size={18} aria-hidden="true" /></button><button type="button" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today) }}>Today</button><button type="button" onClick={() => move(1)} aria-label="Next month"><ChevronRight size={18} aria-hidden="true" /></button></div></div>
      <div className="public-calendar-grid"><div className="public-calendar-weekdays" aria-hidden="true">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day}>{day}</span>)}</div><div className="public-calendar-days">{Array.from({ length: firstDay + days }, (_, index) => {
        if (index < firstDay) return <span key={index} />
        const day = index - firstDay + 1, key = `${month}-${String(day).padStart(2, '0')}`
        const count = state.items.filter(event => onDay(event, key)).length
        return <button type="button" key={key} onClick={() => setSelected(key)} aria-pressed={selected === key} aria-current={key === today ? 'date' : undefined} aria-label={`${municipalDate(key + 'T00:00:00+08:00')}${count ? `, ${count} events` : ''}`}>{day}{count > 0 && <span aria-hidden="true">•</span>}</button>
      })}</div></div></div>
    <div aria-live="polite"><h3>{municipalDate(selected + 'T00:00:00+08:00')}</h3>{state.loading ? <p role="status">Loading this month's events…</p> : state.error ? <div role="status"><p>Calendar information is temporarily unavailable.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : selectedEvents.length ? selectedEvents.map(event => <article key={event.id}><h4><Link to={`/events/${encodeURIComponent(event.slug)}`}>{event.title}</Link></h4><p>{municipalDate(event.event_start_at, { hour: 'numeric', minute: '2-digit' })} (Philippine time)</p></article>) : <p>No published events are scheduled for this date.</p>}</div>
  </section>
}
