import { usePublicResource } from '../../hooks/usePublicResource'
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Primitives'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Landmark, Users, MapPin, Building2 } from 'lucide-react'

const PLACEHOLDER = '/assets/brgy-user-vector/profile-circle.svg'
const officialId = (name) => String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const officialKey = (official, index = 0) => official?.publicKey || official?.slug || `${officialId(official?.name)}-${official?.position?.slug || official?.role || 'official'}-${index}`
const formatDate = value => {
  if (!value) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(date)
}
const termLabel = term => {
  const start = formatDate(term?.start)
  const end = formatDate(term?.end)
  return start && end ? `${start} – ${end}` : null
}

function OfficialCard({ official, lead = false }) {
  const term = termLabel(official.term)
  const isCurrent = official.term?.status === 'current'
  return <article className={`official-card ${lead ? 'lead' : ''}`}>
    <img src={official.photo || PLACEHOLDER} alt={`${official.name} profile`} className="official-img" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = PLACEHOLDER }} />
    <div>
      <Link to={`/officials/${official.slug || officialId(official.name)}`}><strong>{official.name}</strong></Link>
      <span>{official.role || official.position?.name}</span>
      {term ? <small className="official-term-context">{isCurrent ? 'Current term · ' : ''}{term}</small> : <small className="official-term-context muted">Term information unavailable</small>}
    </div>
  </article>
}

export default function Officials() {
  const resource = usePublicResource('/officials/directory')
  const directory = resource.data || { items: [], meta: {} }
  const [view, setView] = useState('current')
  const all = directory.items || []
  const current = useMemo(() => all.filter(item => item.term?.status === 'current'), [all])
  const previous = useMemo(() => all.filter(item => item.term?.status === 'previous'), [all])
  const awaitingTerms = useMemo(() => all.filter(item => item.term?.status === 'unknown'), [all])
  const visible = view === 'previous' ? previous : current
  const municipal = visible.filter(item => item.jurisdiction?.type === 'municipal')
  const barangayOfficials = visible.filter(item => item.jurisdiction?.type === 'barangay')
  const elected = municipal.filter(item => ['municipal-mayor', 'municipal-vice-mayor', 'sangguniang-bayan-member', 'abc-president'].includes(item.position?.slug))
  const leaders = elected.filter(item => ['municipal-mayor', 'municipal-vice-mayor'].includes(item.position?.slug))
  const council = elected.filter(item => !['municipal-mayor', 'municipal-vice-mayor'].includes(item.position?.slug))
  const departmentHeads = municipal.filter(item => !elected.includes(item))
  const shownBarangays = barangayOfficials

  return <main id="officials">
    <section className="about-hero officials-hero"><div className="about-hero-bg"><img src="/assets/pages/bg/Municipal-Officials.png" alt="Getafe Municipal Hall" /><div className="about-hero-overlay" /></div><div className="container about-hero-inner"><p className="about-hero-kicker">Municipality of Getafe • Bohol</p><h1>Municipal Officials</h1><p className="about-hero-sub">Current and historical public officeholders, with verified term information where available.</p></div></section>
    <div className="content-page container">
      {resource.loading && <LoadingState />}
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.loading && !resource.error && !all.length && <EmptyState title="No officials published yet" />}
      <div className="official-view-toggle" role="group" aria-label="Officials shown"><button className={view === 'current' ? 'active' : ''} type="button" onClick={() => setView('current')}>Current</button><button className={view === 'previous' ? 'active' : ''} type="button" onClick={() => setView('previous')}>Previous</button></div>
      {municipal.length ? <>
        <section className="history-block"><div className="history-head"><span className="history-head-icon"><Landmark size={22} /></span><div><h2>{view === 'current' ? 'Current Municipal Officials' : 'Previous Municipal Officials'}</h2><p>{view === 'current' ? 'The executive and legislative leadership of Getafe.' : 'Historical officeholders retained by the Municipality of Getafe.'}</p></div></div>
          {leaders.length > 0 && <div className="officials-lead">{leaders.map((item, index) => <OfficialCard official={item} lead key={officialKey(item, index)} />)}</div>}
          {council.length > 0 && <><h3 className="officials-subhead"><Users size={16} /> Sangguniang Bayan</h3><div className="officials-grid">{council.map((item, index) => <OfficialCard official={item} key={officialKey(item, index)} />)}</div></>}
          {!leaders.length && !council.length && <div className="officials-grid">{municipal.map((item, index) => <OfficialCard official={item} key={officialKey(item, index)} />)}</div>}
        </section>
        {departmentHeads.length > 0 && <section className="history-block"><div className="history-head"><span className="history-head-icon"><Building2 size={22} /></span><div><h2>{view === 'current' ? 'Department Heads' : 'Previous Department Heads'}</h2><p>Municipal officers with public-service roles.</p></div></div><div className="dept-grid">{departmentHeads.map((item, index) => <OfficialCard official={item} key={officialKey(item, index)} />)}</div></section>}
      </> : null}
      {view === 'current' && awaitingTerms.some(item => item.jurisdiction?.type === 'municipal') && <section className="history-block"><div className="history-head"><span className="history-head-icon"><Users size={22} /></span><div><h2>Municipal officials — term information pending</h2><p>These CMS profiles are retained, but are not labelled as current until the Municipality verifies their tenure.</p></div></div><div className="officials-grid">{awaitingTerms.filter(item => item.jurisdiction?.type === 'municipal').map((item, index) => <OfficialCard official={item} key={officialKey(item, index)} />)}</div></section>}
      {view === 'current' && <section className="history-block"><div className="history-head"><span className="history-head-icon"><MapPin size={22} /></span><div><h2>Punong Barangays</h2><p>Barangay officials use verified Municipality of Getafe CMS information.</p></div></div><div className="brgy-officials-grid">{shownBarangays.map((item, index) => <OfficialCard official={item} key={officialKey(item, index)} />)}</div></section>}
    </div>
  </main>
}
