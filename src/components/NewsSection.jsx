export default function NewsSection() {
  return (
    <section className="section muted" id="news">
      <div className="container">
        <div className="section-head">
          <p className="eyebrow">Government services</p>
          <h2>Explore by category</h2>
        </div>

        <div className="category-wrap">
          <div className="category-block">
            <h3>Business & Trade</h3>
            <a href="#services">Business permit and trade licensing</a>
            <a href="#services">Tax registration</a>
            <a href="#services">Compliance requirements</a>
            <a href="#services">View all</a>
          </div>
          <div className="category-block">
            <h3>Certificates & IDs</h3>
            <a href="#services">Certificates</a>
            <a href="#services">Clearances</a>
            <a href="#services">Barangay ID</a>
            <a href="#services">View all</a>
          </div>
          <div className="category-block">
            <h3>Health</h3>
            <a href="#services">Medical assistance</a>
            <a href="#services">Programs</a>
            <a href="#services">Health updates</a>
            <a href="#services">View all</a>
          </div>
          <div className="category-block">
            <h3>Education</h3>
            <a href="#services">Scholarships</a>
            <a href="#services">Financial assistance</a>
            <a href="#services">Skills training</a>
            <a href="#services">View all</a>
          </div>
        </div>
      </div>
    </section>
  )
}
