import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { barangays as fallback } from '../../data/barangays'

const slug = value => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const matches = (item, id) => slug(item?.id) === slug(id) || slug(item?.name) === slug(id)

export default function BarangayOfficials() {
  const { id } = useParams()
  const [barangay, setBarangay] = useState(() => fallback.find(item => matches(item, id)) || null)
  const [loading, setLoading] = useState(!barangay)
  useEffect(() => { fetch('/api/barangays').then(r => r.ok ? r.json() : Promise.reject()).then(items => setBarangay(items.find(item => matches(item, id)) || fallback.find(item => matches(item, id)) || null)).catch(() => {}).finally(() => setLoading(false)) }, [id])
  if (loading) return <main className="section"><div className="container"><p>Loading barangay officials…</p></div></main>
  if (!barangay) return <main className="section"><div className="container"><h1>Barangay not found</h1><Link to="/services/barangays">Back to Barangays</Link></div></main>
  const officials = barangay.captain ? [{ name: barangay.captain, position: 'Punong Barangay', slug: slug(barangay.captain), current: true }] : []
  return <main className="barangay-officials-directory"><section className="page-header"><div className="container page-header-inner"><Link className="barangay-detail-back" to={`/services/barangays/${barangay.id}`}><ArrowLeft size={16}/> Back to {barangay.name}</Link><p className="barangay-hero-eyebrow">BARANGAY GOVERNMENT · GETAFE, BOHOL</p><h1 className="page-title">Barangay Officials</h1><p className="page-subtitle">{barangay.name} Barangay · Current public officials and leadership.</p></div></section><div className="container barangay-directory-content"><div className="directory-breadcrumb"><Link to="/">Home</Link><span>›</span><Link to="/services/barangays">Barangays</Link><span>›</span><span>{barangay.name}</span><span>›</span><strong>Officials</strong></div><section className="official-directory-section"><p className="history-kicker">CURRENT LEADERSHIP</p><h2>{barangay.name} Barangay Government</h2><p className="official-directory-intro">Public-service information for the officials currently serving this barangay.</p>{officials.length ? <div className="official-directory-list">{officials.map(official => <Link className="official-directory-row" to={`/services/barangays/${barangay.id}/officials/${official.slug}`} key={official.slug}><span className="official-directory-avatar"><UserRound size={25}/></span><span><strong>{official.name}</strong><small>{official.position} · {barangay.name}, Getafe, Bohol</small></span><span className="official-current">Currently serving</span><ArrowRight size={17}/></Link>)}</div> : <p className="official-directory-empty">Official information for this barangay is not currently available.</p>}</section><section className="official-directory-note"><strong>Public records</strong><p>Officials and public contact details are published by authorized municipal administrators. Personal information is not displayed.</p></section></div></main>
}
