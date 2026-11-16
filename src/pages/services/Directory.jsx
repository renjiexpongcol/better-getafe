import { useDataRevision } from '../../hooks/usePublicResource'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Building2, FileCheck2, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { publicApi } from '../../services/apiClient'
import { matchesDirectory } from '../../services/directorySearch'

export default function Directory() {
  const dataRevision = useDataRevision()
  const [params, setParams] = useSearchParams()
  const query = params.get('search') || params.get('department')?.replace(/-/g, ' ') || ''
  const [offices, setOffices] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.allSettled([
      publicApi('/departments', { force: attempt > 0 || dataRevision > 0, persist: false }),
      publicApi('/services', { force: attempt > 0 || dataRevision > 0, persist: false }),
    ]).then(([officeResult, serviceResult]) => {
      if (!active) return
      setOffices(officeResult.status === 'fulfilled' ? officeResult.value.items || [] : [])
      setCatalog(serviceResult.status === 'fulfilled' ? serviceResult.value.items || [] : [])
      setUnavailable(officeResult.status === 'rejected' || serviceResult.status === 'rejected')
      setLoading(false)
    })
    return () => { active = false }
  }, [attempt, dataRevision])
  const services = useMemo(() => catalog.map(service => ({ ...service, href: `/services/e-services/${encodeURIComponent(service.slug)}`, description: service.short_description })).filter(service => matchesDirectory(`${service.name} ${service.description || ''} ${service.department_name || ''}`, query)), [catalog, query])
  const results = offices.filter(office => matchesDirectory(`${office.name} ${office.shortDescription || ''} ${office.slug}`, query))
  return <main className="service-directory-page"><div className="page-header"><div className="container page-header-inner"><div><h1 className="page-title">Services &amp; offices</h1><p className="page-subtitle">Find requirements, service guidance, and the right municipal office.</p></div></div></div>
    <section className="service-directory-content section"><div className="container">
      <div className="service-directory-toolbar"><label className="service-directory-search"><span>Search services and offices</span><span className="service-directory-search-field"><Search size={18} aria-hidden="true" /><input value={query} onChange={event => setParams(event.target.value ? { search: event.target.value } : {}, { replace: true })} placeholder="e.g. business permit or RHU" type="search" /></span></label>{query && <button type="button" className="service-directory-clear" onClick={() => setParams({})}>Clear search</button>}</div>
      {loading && <p role="status">Loading published services and offices…</p>}
      {unavailable && <div className="homepage-state" role="status"><p>Live service or office information is unavailable. Please try again to load the published records.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}
      {query && !loading && <p className="service-directory-result-count" role="status">{services.length} {services.length === 1 ? 'service' : 'services'} and {results.length} {results.length === 1 ? 'office' : 'offices'} found</p>}
      {services.length > 0 && <section aria-labelledby="directory-services"><h2 id="directory-services">Services</h2><div className="service-directory-grid">{services.map(service => <article className="service-directory-card" key={service.id}><FileCheck2 size={22} aria-hidden="true" /><h3>{service.name}</h3><p>{service.description}</p>{typeof service.online_available === 'boolean' ? <p className="service-directory-availability">{service.online_available ? 'Start online' : 'Contact the office for availability'}</p> : <p className="service-directory-availability">Service guidance · confirm availability with the office</p>}<Link to={service.href} className="service-directory-link">View service information <ArrowRight size={16} aria-hidden="true" /></Link></article>)}</div></section>}
      {results.length > 0 && <section className="service-directory-offices" aria-labelledby="directory-offices"><h2 id="directory-offices">Offices</h2><div className="service-directory-grid service-directory-office-grid">{results.map(office => <article className="service-directory-card service-directory-office-card" key={office.id}><Building2 size={22} aria-hidden="true" /><h3>{office.name}</h3><p>{office.shortDescription}</p><Link to={`/departments/${encodeURIComponent(office.slug)}`} className="service-directory-link">View office information <ArrowRight size={16} aria-hidden="true" /></Link></article>)}</div></section>}
      {!loading && !unavailable && !services.length && !results.length && <div className="service-directory-empty" role="status"><h2>No results for “{query}”</h2><p>Try a service name, office name, or abbreviation such as RHU or BPLO.</p><button type="button" onClick={() => setParams({})}>Browse all</button> <Link to="/contact">Contact the municipality</Link></div>}
    </div></section>
  </main>
}
