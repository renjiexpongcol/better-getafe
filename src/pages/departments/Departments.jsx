import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { departmentRequest } from '../../services/departments'
import './Departments.css'
export default function Departments() {
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    let active = true
    departmentRequest('/api/departments').then(data => { if (active) setState({ items: data.items }) }).catch(() => { if (active) setState({ error: true }) })
    return () => { active = false }
  }, [])
  return <main className="department-page"><header className="department-hero"><div className="container"><Link to="/">Home</Link><h1>Departments &amp; offices</h1><p>Find municipal offices, their services, and contact information.</p></div></header><section className="container department-section">{state.loading ? <p role="status">Loading offices…</p> : state.error ? <p role="alert">Office information is temporarily unavailable. Please try again later.</p> : state.items.length ? <ul className="department-index">{state.items.map(office => <li key={office.id}><Link to={`/departments/${encodeURIComponent(office.slug)}`}><h2>{office.name}</h2><p>{office.shortDescription}</p><span>View office →</span></Link></li>)}</ul> : <p>No office information has been published yet.</p>}</section></main>
}
