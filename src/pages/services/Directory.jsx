import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ArrowUpRight, Building2, ClipboardCheck, FileCheck2, HeartHandshake, Landmark, Map, Search, Users, WalletCards } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { citizenServices, serviceCategories } from '../../data/citizenServices'
import { publicApi } from '../../services/apiClient'

const fallbackServices = [
  ['Executive', 'The Office of the Mayor and executive offices coordinate municipal programs, policy, and public service delivery.', Landmark],
  ['Engineering', 'Find municipal engineering information, infrastructure coordination, and public works support.', Building2],
  ['Zoning/Planning', 'Get guidance on land use, development planning, zoning clearances, and local planning requirements.', Map],
  ['Treasury', 'Access local tax, payment, business, and revenue-related information from the Municipal Treasurer.', WalletCards],
  ['Assessment', 'Learn about property assessment, tax declarations, and assessment office transactions.', ClipboardCheck],
  ['Civil Registry', 'Find information about birth, marriage, death, and other civil registry document requests.', FileCheck2],
  ['Health', 'Connect with municipal health programs, public health services, rural health support, and the Getafe RHU.', HeartHandshake],
  ['Social Welfare', 'Find assistance programs and social welfare support for families, children, senior citizens, and vulnerable residents.', Users],
].map(([title, excerpt, Icon]) => ({ title, excerpt, Icon, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-') }))
const matchesQuery = (value, query) => {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const haystack = value.toLowerCase()
  return words.every(word => haystack.includes(word))
}

export default function Directory() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = searchParams.get('department') || searchParams.get('search') || ''
  const [services, setServices] = useState([])
  const [query, setQuery] = useState(selected.replace(/-/g, ' '))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    publicApi('/news?category=services&limit=24')
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
    return query.trim() ? services.filter((service) => matchesQuery(`${service.title} ${service.excerpt} ${service.slug || ''}`, query)) : services
  }, [query, services])

  const filteredCitizenServices = useMemo(() => {
    if (!query.trim()) return []
    return citizenServices.filter((service) => {
      const category = serviceCategories.find((item) => item.id === service.category)
      return matchesQuery(`${service.name} ${category?.name || ''} ${category?.description || ''}`, query)
    })
  }, [query])

  const serviceHref = (service) => {
    if (service.id === 'barangay-clearance') return '/services/barangay-clearance'
    if (service.category === 'business') return '/services/business-trade'
    if (service.category === 'treasury') return '/services/offices/treasury'
    return `/services/${service.category}`
  }

  const officeHref = (service) => `/departments/${encodeURIComponent(service.slug)}`

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
          {loading ? <p>Loading municipal departments…</p> : (filteredCitizenServices.length || filteredServices.length) ? <>
            {filteredCitizenServices.length > 0 && <div className="service-directory-grid">
              {filteredCitizenServices.map((service) => {
                const category = serviceCategories.find((item) => item.id === service.category)
                return <article className="service-directory-card" key={service.id}>
                  <div className="service-directory-icon"><FileCheck2 size={22} aria-hidden="true" /></div>
                  <p className="service-directory-label">Municipal service</p>
                  <h2>{service.name}</h2>
                  <p>{category?.description || 'Municipal service information and requirements.'}</p>
                  <Link to={serviceHref(service)} className="service-directory-link">View service information <ArrowUpRight size={15} /></Link>
                </article>
              })}
            </div>}
            {filteredServices.length > 0 && <section className="service-directory-offices" aria-labelledby="related-offices-title"><h2 id="related-offices-title">Related municipal offices</h2><div className="service-directory-grid service-directory-office-grid">
              {filteredServices.map((service) => {
                const Icon = service.Icon || Building2
                const destination = officeHref(service)
                const officeLink = <>View office information <ArrowRight size={15} aria-hidden="true" /></>
                return <article className="service-directory-card service-directory-office-card" key={service.id || service.slug}>
                  <div className="service-directory-office-identity">
                    <div className="service-directory-icon"><Icon size={20} aria-hidden="true" /></div>
                    <div className="service-directory-office-heading">
                      <p className="service-directory-label">Municipal office</p>
                      <h2>{service.title}</h2>
                    </div>
                  </div>
                  <p>{service.excerpt}</p>
                  <Link to={destination} className="service-directory-link">{officeLink}</Link>
                </article>
              })}
            </div></section>}
          </> : <div className="service-directory-empty" role="status">
            {query ? <>
              <h2>No services found for “{query}”</h2>
              <p>Try another search or browse all municipal services.</p>
              <Link to="/services" className="service-directory-link">Browse all services <ArrowRight size={15} aria-hidden="true" /></Link>
            </> : <p>No municipal services are available right now.</p>}
          </div>}
        </div>
      </section>
    </main>
  )
}
