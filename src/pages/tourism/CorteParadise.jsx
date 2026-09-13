import { useEffect, useState } from 'react'
import { ArrowLeft, Compass, ExternalLink, Leaf, Phone, Waves } from 'lucide-react'
import { Link } from 'react-router-dom'

const fallback = {
  title: 'Corte Paradise Resort',
  excerpt: 'A riverside and beachside resort in Barangay Corte-Baud with pools, cottages, accommodations, and views across Getafe’s coast.',
  content: `<p>Whether you are an overworked employee longing for a much-needed vacation, an event planner looking for a birthday or wedding venue, a budget-conscious homemaker planning a weekend with the kids, a local resident ready to sing along to the latest hits, or a traveler looking for an affordable place to relax, there is always something in store for you at Corte Paradise Resort.</p><p>Corte Paradise Resort is a riverside and beachside resort conveniently situated along the shores of Barangay Corte-Baud. During daytime, visitors can unwind while enjoying the scenic view of its mangrove-lined riverbanks. At night, guests can enjoy the romantic ambience of the beachside view toward Cebu’s city lights while savoring the freshness of the gentle sea breeze.</p><p>In addition to picnic cottages, guest accommodations, and other amenities, the resort also boasts a spring-water swimming pool. It is the only pool within the area that receives direct freshwater replenishment from a subterranean spring-water basin located 150 meters above sea level within the slopes of Mt. Corte. The resort continues to add amenities and services for its valued customers.</p><h2>A complete Getafe experience</h2><p>No visit to Getafe would ever be complete without relishing the Corte Paradise Resort experience.</p>`,
}

export default function CorteParadise() {
  const [page, setPage] = useState(fallback)

  useEffect(() => {
    fetch('/api/news/corte-paradise-resort')
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(value => setPage(value))
      .catch(() => {})
  }, [])

  return <main className="tourism-detail corte-detail">
    <section className="tourism-detail-hero corte-hero">
      <div className="container">
        <Link to="/tourism" className="tourism-detail-back"><ArrowLeft size={16} /> Discover Getafe</Link>
        <p className="tourism-kicker"><Compass size={15} /> Stay & unwind · Getafe, Bohol</p>
        <h1>{page.title}</h1>
        <p>{page.excerpt}</p>
      </div>
    </section>
    <article className="container tourism-detail-content">
      <img className="corte-detail-image" src="/assets/tourism/pandanon-1.jpg" alt="Coastal resort scenery in Getafe, Bohol" />
      <div className="tourism-detail-label"><Waves size={16} /> Riverside, beachside & spring water</div>
      <div className="tourism-detail-body" dangerouslySetInnerHTML={{ __html: page.content }} />
      <section className="corte-contact" aria-labelledby="corte-contact-title">
        <div><p className="tourism-label">Contact the resort</p><h2 id="corte-contact-title">Plan your visit</h2></div>
        <div className="corte-contact-links"><a href="tel:+639204876264"><Phone size={16} /> +63 920 487 6264 <small>Smart</small></a><a href="tel:+639236626391"><Phone size={16} /> +63 923 662 6391 <small>Sun</small></a><a href="https://www.facebook.com/pages/Corte-Paradise/186863917062" target="_blank" rel="noreferrer"><ExternalLink size={16} /> Facebook Page</a></div>
      </section>
      <div className="pandanon-detail-note"><Leaf size={17} /><span>Support local tourism and follow resort and community guidance during your stay.</span></div>
    </article>
  </main>
}
