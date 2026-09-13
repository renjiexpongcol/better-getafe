import { useEffect, useState } from 'react'
import { ArrowLeft, Compass, Leaf, Waves } from 'lucide-react'
import { Link } from 'react-router-dom'

const fallback = {
  title: 'Pandanon Island Resort',
  excerpt: 'A sandy island escape between Bohol and Cebu, with clear blue water, sunset views, and a growing wakeboarding community.',
  content: `<p>Pandanon is one of the 9 island barangays of Getafe. It is located approximately midway from Bohol to Cebu. Part of the island is a strip of sandy paradise. This place was once a secret getaway for residents and local visitors alike, before gaining popularity and being introduced to tourists.</p><p>Aside from its long powdery sand bar, one could not resist taking a refreshing dip in its cool, clear blue waters. It is a very good place to relax, have drinks with friends and family, and take in the mesmerizing sunset view. Beach volleyball, skimboarding, and frisbee are only a few of the activities you can enjoy during your stay.</p><h2>Bohol's first wakeboarding destination</h2><p>In 2012, Bohol Wakefest was held at Pandanon, signifying the resort's becoming the first wakeboarding destination in Bohol. Wakeboarders and wakeskaters, foreigners and Filipinos alike, participated in the event. Tourists and local visitors were entertained as wakeboarders showed astonishing tricks to amaze the crowd.</p>`,
}

export default function Pandanon() {
  const [page, setPage] = useState(fallback)

  useEffect(() => {
    fetch('/api/news/pandanon-island')
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(value => setPage(value))
      .catch(() => {})
  }, [])

  return <main className="tourism-detail pandanon-detail">
    <section className="tourism-detail-hero pandanon-hero">
      <div className="container">
        <Link to="/tourism" className="tourism-detail-back"><ArrowLeft size={16} /> Discover Getafe</Link>
        <p className="tourism-kicker"><Compass size={15} /> Island escape · Getafe, Bohol</p>
        <h1>{page.title}</h1>
        <p>{page.excerpt}</p>
      </div>
    </section>
    <article className="container tourism-detail-content">
      <img className="pandanon-detail-image" src="/assets/tourism/pandanon-1.jpg" alt="Pandanon Island Resort in Getafe, Bohol" />
      <div className="tourism-detail-label"><Waves size={16} /> Coast, culture & adventure</div>
      <div className="tourism-detail-body" dangerouslySetInnerHTML={{ __html: page.content }} />
      <div className="pandanon-detail-note"><Leaf size={17} /><span>Plan a respectful visit: keep the sand bar clean, follow local guidance, and support the island community.</span></div>
    </article>
  </main>
}
