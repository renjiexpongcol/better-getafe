import { ArrowRight, Info, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { publicApi } from '../services/apiClient'

const FALLBACK_POPULAR_SERVICES = [
  { id: 'national-id', label: 'National ID', href: '/services/certificates' },
  { id: 'business-permit', label: 'Business Permit', href: '/services/business-trade' },
  { id: 'barangay-clearance', label: 'Barangay Clearance', href: '/services/barangay-clearance' },
]

const validPopularServices = value => (Array.isArray(value) ? value : [])
  .filter(item => item && typeof item.id === 'string' && typeof item.label === 'string' && typeof item.href === 'string' && item.href.startsWith('/') && !item.href.startsWith('//'))
  .slice(0, 3)

export default function Hero() {
  const navigate = useNavigate()
  const [popularServices, setPopularServices] = useState(FALLBACK_POPULAR_SERVICES)

  useEffect(() => {
    let active = true
    publicApi('/popular-services?limit=3')
      .then(value => {
        const services = validPopularServices(value)
        if (active && services.length) setPopularServices(services)
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const searchServices = (event) => {
    event.preventDefault()
    const query = new FormData(event.currentTarget).get('query')?.trim()
    navigate(query ? `/services/directory?search=${encodeURIComponent(query)}` : '/services/directory')
  }

  return (
    <>
      <section className="hero" aria-labelledby="home-hero-title">
        <div className="container hero-grid">
          <div className="hero-copy">
            <h1 id="home-hero-title">Getafe services,<br className="hero-title-break" /> closer to home.</h1>
            <p className="hero-text">
              Find municipal services, local updates, and support from the Municipality of Getafe in one place.
            </p>
            <div className="hero-service-finder">
              <form className="service-finder-search" aria-label="Search local services" onSubmit={searchServices}>
                <Search size={20} aria-hidden="true" />
                <label className="sr-only" htmlFor="hero-service-search">Search services, permits, and offices</label>
                <input id="hero-service-search" name="query" type="search" placeholder="Search services, permits, and offices" />
                <button type="submit">Search <ArrowRight size={16} aria-hidden="true" /></button>
              </form>
              <nav className="service-finder-popular" aria-label="Popular services">
                <span>Popular:</span>
                {popularServices.map(service => <Link to={service.href} key={`${service.id}-${service.href}`}>{service.label}</Link>)}
              </nav>
            </div>
            <div className="hero-cta-row">
              <Link className="hero-cta hero-cta-primary" to="/services/directory">Browse services <ArrowRight size={17} aria-hidden="true" /></Link>
              <Link className="hero-cta hero-cta-secondary" to="/contact"><Info size={17} aria-hidden="true" /> Report a Concern</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
