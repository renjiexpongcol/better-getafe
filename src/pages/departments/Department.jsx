import { Building2, Landmark, WalletCards, HeartHandshake, Users, Map, ClipboardCheck, FileCheck2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorPage, ResourceNotFound } from '../../components/RouteStatusPages'
import { departmentRequest } from '../../services/departments'
import './Departments.css'

const TextSection = ({ title, text }) => text ? <section className="department-section"><h2>{title}</h2><p className="department-prose">{text}</p></section> : null

export default function Department() {
  const { slug } = useParams()
  const [state, setState] = useState({ loading: true })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setState({ loading: true })
    departmentRequest(`/api/departments/${encodeURIComponent(slug)}`)
      .then(data => { if (active) setState({ data }) })
      .catch(error => { if (active) setState({ error: error.status || 503 }) })
    return () => { active = false }
  }, [slug, retry])
  useEffect(() => {
    if (!state.data) return undefined
    const office = state.data
    const title = `${office.name} | Municipality of Getafe, Bohol`
    document.title = title
    const values = [{ selector: 'meta[name="description"]', attr: 'content', value: office.shortDescription, key: 'name', label: 'description' }, { selector: 'link[rel="canonical"]', attr: 'href', value: `${window.location.origin}/departments/${encodeURIComponent(office.slug)}`, key: 'rel', label: 'canonical' }, { selector: 'meta[property="og:title"]', attr: 'content', value: title, key: 'property', label: 'og:title' }, { selector: 'meta[property="og:description"]', attr: 'content', value: office.shortDescription, key: 'property', label: 'og:description' }]
    const restore = values.map(({ selector, attr, value, key, label }) => {
      const existing = document.head.querySelector(selector)
      const node = existing || document.createElement(key === 'rel' ? 'link' : 'meta')
      const previous = node.getAttribute(attr)
      node.setAttribute(key, label); node.setAttribute(attr, value || '')
      if (!existing) document.head.append(node)
      return () => { if (!existing) node.remove(); else if (previous === null) node.removeAttribute(attr); else node.setAttribute(attr, previous) }
    })
    return () => restore.forEach(fn => fn())
  }, [state.data])
  if (state.loading) return <main className="section"><div className="container"><p role="status">Loading office information…</p></div></main>
  if (state.error === 404) return <ResourceNotFound type="service" title="Office not found" message="This office page is unavailable or has not been published." browseLabel="Browse departments" browseTo="/departments" />
  if (state.error) return <ErrorPage code="503" title="Office information is temporarily unavailable" message="Please try again later." primaryAction={{ label: 'Try again', onClick: () => setRetry(value => value + 1) }} secondaryAction={{ label: 'Browse departments', to: '/departments' }} />
  const office = state.data
  const Icon = { Building2, Landmark, WalletCards, HeartHandshake, Users, Map, ClipboardCheck, FileCheck2 }[office.icon] || Building2
  return <main className="department-page">
    <header className="department-hero"><div className="container"><nav aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true"> / </span><Link to="/departments">Departments</Link><span aria-hidden="true"> / </span><span>{office.name}</span></nav><p className="eyebrow"><Icon size={20} aria-hidden="true" /> Departments &amp; offices</p><h1>{office.name}</h1><p>{office.shortDescription}</p>{office.imageUrl && <img src={office.imageUrl} alt={office.imageAlt} />}</div></header>
    <div className="container department-content">
      <article><TextSection title="About the Office" text={office.description} />{office.slug === 'executive' && !office.official && <section className="department-section"><h2>Mayor &amp; municipal leadership</h2><Link className="department-link" to="/officials">View municipal officials →</Link></section>}<TextSection title="Responsibilities & functions" text={office.responsibilities} />
        <section className="department-section"><h2>Services &amp; transactions</h2>{office.services.length ? <ul className="department-services">{office.services.map(service => <li key={service.id}><div><h3>{service.name}</h3><span>Municipal service</span></div><Link to={service.href}>{service.category === 'treasury' ? 'Pay online' : 'Request service'} <span aria-hidden="true">→</span></Link></li>)}</ul> : <p>No online services are currently available for this office.</p>}{office.slug === 'health' && <Link className="department-link" to="/services/health">Health services, programs &amp; RHU information →</Link>}{office.slug === 'civil-registry' && <Link className="department-link" to="/services/certificates">View certificate requirements →</Link>}</section>
        {office.services.some(service => ['certificates', 'health', 'business', 'education'].includes(service.category)) && <Link className="department-link" to="/app/appointments?book=1">Book an appointment →</Link>}
        <TextSection title="Programs & initiatives" text={office.programs} />
        {office.documents.length > 0 && <section className="department-section"><h2>Published documents</h2><ul>{office.documents.map(document => <li key={document.url}><a className="department-link" href={document.url}>{document.name}</a></li>)}</ul></section>}
        {office.announcements.length > 0 && <section className="department-section"><h2>Announcements &amp; updates</h2>{office.announcements.map(item => <article className="department-update" key={item.id}><h3><Link to={`/news/${encodeURIComponent(item.slug)}`}>{item.title}</Link></h3>{item.publishedAt && <time dateTime={item.publishedAt}>{new Date(item.publishedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</time>}<p>{item.excerpt}</p></article>)}</section>}
        <section className="department-section"><h2>Related services</h2><Link className="department-link" to="/services">Browse municipal services →</Link></section>
      </article>
      <aside className="department-office"><h2>Office information</h2>{office.official && <div className="department-official">{office.official.photo && <img src={office.official.photo} alt={office.official.name} />}<h3>{office.official.name}</h3><p>{office.official.role || office.official.position?.name}</p><Link className="department-link" to={`/officials/${encodeURIComponent(office.official.slug)}`}>View profile →</Link></div>}<dl>{[['Office hours', office.hours], ['Location', office.location], ['Telephone', office.phone], ['Email', office.email]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{label === 'Email' ? <a href={`mailto:${value}`}>{value}</a> : value}</dd></div>)}</dl>{!office.hours && !office.location && !office.phone && !office.email && <p>Contact information has not yet been published.</p>}<Link className="department-link" to="/contact">Contact the municipality →</Link></aside>
    </div>
  </main>
}
