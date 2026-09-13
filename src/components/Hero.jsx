import { ArrowRight, Search } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

export default function Hero() {
  const navigate = useNavigate()

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <h1>Access government services for Getafe, Bohol.</h1>
            <p className="hero-text">
              Find information, apply for local permits, connect with barangays,
              and stay updated on public programs designed to serve every Getafeño.
            </p>

            <form className="search-box" aria-label="Search local services" onSubmit={(event) => { event.preventDefault(); const query = new FormData(event.currentTarget).get('query')?.trim(); navigate(query ? `/services/directory?search=${encodeURIComponent(query)}` : '/services/directory') }}>
              <Search size={19} aria-hidden="true" />
              <label className="sr-only" htmlFor="hero-service-search">Search local services</label>
              <input id="hero-service-search" name="query" type="search" placeholder="Search services, permits, and offices" />
              <button type="submit">Search <ArrowRight size={16} /></button>
            </form>

            <div className="quick-links" aria-label="Basic services links">
              <Link to="/services/certificates">National ID</Link>
              <Link to="/services/business-trade">Business Permit</Link>
              <Link to="/services/directory?search=clearance">Barangay Clearance</Link>
            </div>
          </div>
        </div>
      </section>

    </>
  )
}
