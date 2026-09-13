import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Building2, ClipboardCheck, FileCheck2, HeartHandshake, Landmark, Map, Search, Users, WalletCards } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

const fallbackServices = [
  ['Executive', 'The Office of the Mayor and executive offices coordinate municipal programs, policy, and public service delivery.', Landmark],
  ['Engineering', 'Find municipal engineering information, infrastructure coordination, and public works support.', Building2],
  ['Zoning/Planning', 'Get guidance on land use, development planning, zoning clearances, and local planning requirements.', Map],
  ['Treasury', 'Access local tax, payment, business, and revenue-related information from the Municipal Treasurer.', WalletCards],
  ['Assessment', 'Learn about property assessment, tax declarations, and assessment office transactions.', ClipboardCheck],
  ['Civil Registry', 'Find information about birth, marriage, death, and other civil registry document requests.', FileCheck2],
  ['Health', 'Connect with municipal health programs, public health services, and rural health support.', HeartHandshake],
  ['Social Welfare', 'Find assistance programs and social welfare support for families, children, senior citizens, and vulnerable residents.', Users],
].map(([title, excerpt, Icon]) => ({ title, excerpt, Icon, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-') }))

export default function Directory() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = searchParams.get('department') || searchParams.get('search') || ''
  const [services, setServices] = useState([])
  const [query, setQuery] = useState(selected.replace(/-/g, ' '))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/news?category=services&limit=24')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Services unavailable')))
      .then((data) => {
        const items = data.items || []
        setServices(items.length ? items : fallbackServices)
      })
      .catch(() => {
        setServices(fallbackServices)
      })
      .finally(() => setLoading(false))
  }, [])

  const filteredServices = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term ? services.filter((service) => `${service.title} ${service.excerpt}`.toLowerCase().includes(term)) : services
  }, [query, services])

  const chooseDepartment = (value) => {
    setQuery(value)
    setSearchParams(value ? { department: value.toLowerCase().replace(/[^a-z0-9]+/g, '-') } : {})
  }

  return (
    <main className="service-directory-page">
      <div className="page-header">
        <div className="container page-header-inner">
          <div>
            <p className="service-directory-kicker">Municipal offices</p>
            <h1 className="page-title">Services &amp; departments</h1>
            <p className="page-subtitle">Find the right municipal office, requirements, and service information for your next transaction.</p>
          </div>
        </div>
      </div>
      <section className="service-directory-content section">
        <div className="container">
          <div className="service-directory-toolbar">
            <label className="service-directory-search"><Search size={18} /><span className="sr-only">Search departments</span><input value={query} onChange={(event) => chooseDepartment(event.target.value)} placeholder="Search departments" /></label>
            {query && <button type="button" className="service-directory-clear" onClick={() => chooseDepartment('')}>Show all departments</button>}
          </div>
          {loading ? <p>Loading municipal departments…</p> : filteredServices.length ? (
            <div className="service-directory-grid">
              {filteredServices.map((service) => {
                const Icon = service.Icon || Building2
                return <article className="service-directory-card" key={service.id || service.slug}>
                  <div className="service-directory-icon"><Icon size={22} aria-hidden="true" /></div>
                  <p className="service-directory-label">Municipal office</p>
                  <h2>{service.title}</h2>
                  <p>{service.excerpt}</p>
                  <Link to={`/news/${service.slug}`} className="service-directory-link">View office information <ArrowUpRight size={15} /></Link>
                </article>
              })}
            </div>
          ) : <p className="service-directory-empty">No department matches your search.</p>}
        </div>
      </section>
    </main>
  )
}
