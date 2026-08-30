export default function Hero() {
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Welcome to the local government portal</p>
            <h1>Access government services for Getafe, Bohol.</h1>
            <p className="hero-text">
              Find information, apply for local permits, connect with barangays,
              and stay updated on public programs designed to serve every Getafeño.
            </p>

            <form className="search-box" aria-label="Search local services" onSubmit={(e) => e.preventDefault()}>
              <input type="text" placeholder="Search services, permits, and offices" />
              <button type="submit">Search</button>
            </form>

            <div className="quick-links" aria-label="Basic services links">
              <a href="#services">National ID</a>
              <a href="#services">Business Permit</a>
              <a href="#services">Barangay Clearance</a>
            </div>
          </div>

        </div>
      </section>

      <section className="section muted" style={{paddingTop: '2rem', paddingBottom: '2rem'}}>
        <div className="container">
          <div style={{maxWidth: '760px', margin: '0 auto', backgroundColor: '#fff', padding: '1.75rem 2rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}>
            <div style={{display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center'}}>
              <img
                src="/assets/getafe-seal.png"
                alt="Municipality of Getafe seal"
                style={{width: '92px', height: '92px', flexShrink: 0, objectFit: 'contain', borderRadius: '50%', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '8px'}}
              />
              <div style={{flex: '1 1 320px', minWidth: 0}}>
                <h3 style={{fontFamily: 'Georgia, serif', fontSize: '1.5rem', margin: '0 0 0.75rem'}}>Welcome to Getafe, Bohol!</h3>
                <p style={{fontFamily: 'Georgia, serif', lineHeight: '1.7', color: '#4b5563', margin: 0}}>
                  As one town and one people, we take pride and are so honored to be part of the world wide web. In our aim to extend our functionality as a local government unit, we have created this website to make Getafe more accessible to the public. We hope that you find all the information useful and satisfactory.
                </p>
                <div style={{marginTop: '1.25rem'}}>
                  <p style={{fontFamily: 'Georgia, serif', fontWeight: 'bold', fontSize: '1.25rem', margin: 0}}>CARY M. CAMACHO</p>
                  <p style={{fontFamily: 'Georgia, serif', color: '#6b7280', margin: 0}}>MUNICIPAL MAYOR</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
