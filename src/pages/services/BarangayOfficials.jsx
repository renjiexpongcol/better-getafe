import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ErrorPage, ResourceNotFound } from '../../components/RouteStatusPages'
import { barangays as fallback } from '../../data/barangays'
import { publicApi } from '../../services/apiClient'

const slug = value => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const matches = (item, id) => slug(item?.id) === slug(id) || slug(item?.name) === slug(id)
const dateLabel = value => value ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${value}T00:00:00Z`)) : null

export default function BarangayOfficials() {
  const { id } = useParams()
  const [barangay, setBarangay] = useState(() => fallback.find(item => matches(item, id)) || null)
  const [officials, setOfficials] = useState([])
  const [loading, setLoading] = useState(!barangay)
  const [loadError, setLoadError] = useState(false)
  useEffect(() => {
    let active = true
    Promise.all([publicApi('/barangays'), publicApi('/officials/directory?barangay=' + encodeURIComponent(slug(id)))]).then(async ([items, directory]) => {
      const nextBarangay = items.find(item => matches(item, id)) || fallback.find(item => matches(item, id)) || null
      if (!active) return
      setBarangay(nextBarangay)
      setOfficials((directory.items || []).filter(item => item.term?.status !== 'previous' && item.term?.status !== 'future'))
    }).catch(() => { if (active) setLoadError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id])
  if (loading) return <main className="section"><div className="container"><p>Loading barangay officials…</p></div></main>
  if (loadError) return <ErrorPage code="503" title="Barangay officials are temporarily unavailable" message="Please try again later." secondaryAction={{ label: 'Browse Barangays', to: '/barangays' }} />
  if (!barangay) return <ResourceNotFound type="barangay" />
  const records = officials.length ? officials : (barangay.captain ? [{ id: slug(barangay.captain), slug: slug(barangay.captain), name: barangay.captain, role: 'Punong Barangay', term: { start: barangay.termStart, end: barangay.termEnd, status: 'unknown' } }] : [])
 return <main className="barangay-officials-directory"><section className="page-header"><div className="container page-header-inner"><Link className="barangay-detail-back" to={`/barangays/${barangay.id}`}><ArrowLeft size={16} /> Back to {barangay.name}</Link><p className="barangay-hero-eyebrow">BARANGAY GOVERNMENT · GETAFE, BOHOL</p><h1 className="page-title">Barangay Officials</h1></div></section><div className="container barangay-directory-content"><section className="official-directory-section"><p className="history-kicker">CURRENT LEADERSHIP</p><h2>{barangay.name} Barangay Government</h2><p className="official-directory-intro">Term dates are published only when verified by the Municipality of Getafe CMS.</p>{records.length ? <div className="official-directory-list">{records.map((official, index) => <Link className="official-directory-row" to={`/barangays/${barangay.id}/officials/${official.slug}`} key={official.publicKey || official.slug || `${official.name || 'official'}-${index}`}><span className="official-directory-avatar"><UserRound size={25} /></span><span><strong>{official.name}</strong><small>{official.role || official.position?.name} · {barangay.name}, Getafe, Bohol</small>{official.term?.start && official.term?.end && <small>Term: {dateLabel(official.term.start)} – {dateLabel(official.term.end)}</small>}</span><span className="official-current">{official.term?.status === 'current' ? 'Current' : 'CMS verified'}</span><ArrowRight size={17} /></Link>)}</div> : <p className="official-directory-empty">Official information for this barangay is not currently available.</p>}</section><section className="official-directory-note"><strong>Public records</strong><p>Officials and term information are maintained by authorized municipal administrators. Election data is not derived from municipal contests for barangay offices.</p></section></div></main>
}
