import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
const PLACEHOLDER = '/assets/brgy-user-vector/profile-circle.svg'
const officialId = (name) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
export default function OfficialProfile() {
  const { id } = useParams(); const [official, setOfficial] = useState(null)
  useEffect(() => { fetch('/api/officials').then((r) => r.ok ? r.json() : Promise.reject()).then((data) => { const people = [data.mayor, data.viceMayor, data.abcPresident, ...(data.sbMembers || []), ...(data.punongBarangays || []), ...(data.deptHeads || [])].filter(Boolean); setOfficial(people.find((person) => officialId(person.name || '') === id) || null) }).catch(() => {}) }, [id])
  if (!official) return <main className="section"><div className="container"><h1>Official not found</h1><Link to="/info/officials">Back to Municipal Officials</Link></div></main>
  return <main className="barangay-official-page"><section className="page-header"><div className="container official-profile-header"><Link className="barangay-detail-back" to="/info/officials"><ArrowLeft size={16} /> Municipal Officials</Link><img className="official-profile-photo" src={official.photo || PLACEHOLDER} alt={`${official.name} profile`} /><p className="barangay-hero-eyebrow">MUNICIPALITY OF GETAFE · BOHOL</p><h1>{official.name}</h1><p>{official.role}</p></div></section><div className="container official-profile-content"><article className="barangay-detail-card"><p className="history-kicker">OFFICIAL PROFILE</p><h2>Biography</h2>{official.biography ? <p>{official.biography}</p> : <p>Biography information for {official.name} is not currently available.</p>}</article></div></main>
}
