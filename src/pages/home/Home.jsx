import Hero from '../../components/Hero'
import NewsSection from '../../components/NewsSection'
import EmergencyAlert from '../../components/EmergencyAlert'
import ImportantAnnouncement from '../../components/ImportantAnnouncement'
import EventsSection from '../../components/EventsSection'
import CitizenActions from '../../components/CitizenActions'
import { ArrowRight, FileText, Flag, Landmark, Newspaper } from 'lucide-react'
import { Link } from 'react-router-dom'

const governmentLinks = [
  ['Transparency', '/info/about', Flag],
  ['Budget & procurement', '/info/about', Landmark],
  ["Citizen's Charter", '/services', FileText],
  ['Ordinances & policies', '/news', Newspaper],
]

function MayorCorner() {
  return <section className="section mayor-corner" aria-labelledby="mayor-corner-title"><div className="container mayor-corner-inner"><div className="mayor-corner-photo-wrap"><div className="mayor-corner-photo-accent" aria-hidden="true" /><img className="mayor-corner-photo" src="/assets/icons/officials/mayor/camacho.png" alt="Cary M. Camacho, Municipal Mayor of Getafe" /></div><div className="mayor-corner-copy"><p className="eyebrow">A message from our municipal mayor</p><h2 id="mayor-corner-title">MAYOR'S CORNER</h2><div className="mayor-corner-line" aria-hidden="true" /><p className="mayor-corner-welcome">Welcome to Getafe, Bohol!</p><p>As one town and one people, we take pride and are so honored to be part of the world wide web. In our aim to extend our functionality as a local government unit, we have created this website to make Getafe more accessible to the public. We hope that you find all the information useful and satisfactory.</p><div className="mayor-corner-signature"><strong>CARY M. CAMACHO</strong><span>MUNICIPAL MAYOR</span></div></div></div></section>
}

function HomeHelp() {
  return <><section className="section home-help-section"><div className="container home-help-inner"><div><p className="eyebrow">Need help from the LGU?</p><h2>We can point you in the right direction.</h2><p>Use these shortcuts to begin a request, find a document, or contact the right municipal office.</p></div><CitizenActions className="home-help-grid" /></div></section><section className="section home-open-section"><div className="container home-open-inner"><div><p className="eyebrow">Open government</p><h2>Public information should be easy to find.</h2><p>Explore official information, policies, and civic resources from Getafe.</p></div><div className="home-action-grid">{governmentLinks.map(([label, url, Icon]) => <Link to={url} key={label}><span><Icon size={18} aria-hidden="true" /></span><div><strong>{label}</strong><small>View official information.</small></div><ArrowRight size={15} aria-hidden="true" /></Link>)}</div></div></section><section className="section home-about-section"><div className="container home-about-inner"><div className="home-about-seal"><img src="/assets/getafe-seal.png" alt="Municipality of Getafe seal" /></div><div><p className="eyebrow">About Getafe</p><h2>One town, one people.</h2><p>Learn about the municipality, its officials, barangays, history, and the people who make Getafe home.</p><div className="home-about-links"><Link to="/info/about">Municipality</Link><Link to="/info/officials">Officials</Link><Link to="/services/barangays">Barangays</Link><Link to="/info/history">History</Link></div></div></div></section></>
}

export default function Home() {
  return (
    <main id="home">
      <ImportantAnnouncement />
      <EmergencyAlert />
      <Hero />
      <section className="section home-help-links"><div className="container"><div className="section-head"><p className="eyebrow">Start with what you need</p><h2>What can we help you with?</h2></div><CitizenActions /></div></section>
      <NewsSection />
      <EventsSection />
      <MayorCorner />
      <HomeHelp />
    </main>
  )
}
