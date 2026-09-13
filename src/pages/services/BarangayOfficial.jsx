import { useEffect, useState } from 'react'
import { ArrowLeft, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { barangays as fallback } from '../../data/barangays'

export default function BarangayOfficial() {
  const { id } = useParams()
  const [barangay, setBarangay] = useState(() => fallback.find((item) => item.id === id) || null)
  useEffect(() => { fetch('/api/barangays').then((r) => r.ok ? r.json() : Promise.reject()).then((items) => setBarangay(items.find((item) => item.id === id) || barangay)).catch(() => {}) }, [id])
  if (!barangay) return <main className="section"><div className="container"><h1>Official not found</h1><Link to="/services/barangays">Back to Barangays</Link></div></main>
  const format = (date) => date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) : null
  return <main className="barangay-official-page"><section className="page-header"><div className="container official-profile-header"><Link className="barangay-detail-back" to={`/services/barangays/${barangay.id}`}><ArrowLeft size={16} /> Back to {barangay.name}</Link><div className="official-profile-icon"><UserRound size={30} /></div><p className="barangay-hero-eyebrow">PUNONG BARANGAY · GETAFE, BOHOL</p><h1>{barangay.captain || 'Barangay Official'}</h1><p>{barangay.name} Barangay</p></div></section><div className="container official-profile-content"><article className="barangay-detail-card"><p className="history-kicker">OFFICIAL PROFILE</p><h2>About the Punong Barangay</h2>{barangay.captainBio ? <p>{barangay.captainBio}</p> : <p>Biography information for {barangay.captain || 'this official'} is not currently available.</p>}{barangay.captainDetails && <div className="barangay-rich-content" dangerouslySetInnerHTML={{ __html: barangay.captainDetails }} />}{barangay.termStart || barangay.termEnd ? <p className="official-term"><strong>Term:</strong> {format(barangay.termStart) || '—'} – {format(barangay.termEnd) || 'Present'}</p> : null}</article></div></main>
}
