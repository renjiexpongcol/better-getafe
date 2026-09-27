import { ArrowRight, Search } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

export default function Hero() {
  const navigate = useNavigate()

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
            <h1 id="home-hero-title">Welcome to the Official<br className="hero-title-break" /> Portal of Getafe</h1>
            <p className="hero-text">
              Providing modern digital services, transparent governance, and localized public assistance to the people, businesses, and visitors of Getafe, Bohol.
            </p>
            <div className="hero-cta-row">
              <Link className="hero-cta hero-cta-primary" to="/services/directory">Access Online Services <ArrowRight size={17} aria-hidden="true" /></Link>
              <Link className="hero-cta hero-cta-secondary" to="/contact">Report a Concern</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="service-finder" aria-labelledby="service-finder-title">
        <div className="container service-finder-inner">
          <div className="service-finder-heading">
            <p className="service-finder-kicker">Municipal services</p>
            <h2 id="service-finder-title">How can we help?</h2>
          </div>
          <form className="service-finder-search" aria-label="Search local services" onSubmit={searchServices}>
            <Search size={20} aria-hidden="true" />
            <label className="sr-only" htmlFor="hero-service-search">Search services, permits, and offices</label>
            <input id="hero-service-search" name="query" type="search" placeholder="Search services, permits, and offices" />
            <button type="submit">Search <ArrowRight size={16} aria-hidden="true" /></button>
          </form>
          <nav className="service-finder-popular" aria-label="Popular services">
            <span>Popular:</span>
            <Link to="/services/certificates">National ID</Link>
            <Link to="/services/business-trade">Business Permit</Link>
            <Link to="/services/barangay-clearance">Barangay Clearance</Link>
          </nav>
        </div>
      </section>
    </>
  )
}
