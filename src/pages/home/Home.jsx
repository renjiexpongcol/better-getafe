import DiscoverGetafe from '../../components/DiscoverGetafe'
import Hero from '../../components/Hero'
import MunicipalityUpdatesSection from '../../components/MunicipalityUpdatesSection'
import EmergencyAlert from '../../components/EmergencyAlert'
import ImportantAnnouncement from '../../components/ImportantAnnouncement'
import EventsSection from '../../components/EventsSection'
import CitizenActions from '../../components/CitizenActions'
import { usePublishedContent, usePublicResource } from '../../hooks/usePublicResource'
import { Link } from 'react-router-dom'
import './Home.css'

function MayorCorner() {
  const { content } = usePublishedContent('home')
  const { data } = usePublicResource('/officials')
  const mayor = data?.mayor
  if (!mayor?.name || !content?.mayorMessage) return null
  return <section className="section mayor-corner"><div className="container mayor-corner-inner">{mayor.photo && <div className="mayor-corner-photo-wrap"><img className="mayor-corner-photo" src={mayor.photo} alt={mayor.name} /></div>}<div className="mayor-corner-copy"><h2>Mayor’s message</h2><div className="published-content" dangerouslySetInnerHTML={{ __html: content.mayorMessage }} /><div className="mayor-corner-signature"><strong>{mayor.name}</strong><span>{mayor.role}</span></div></div></div></section>
}

function HomeHelp() {
  const { content } = usePublishedContent('home')
  if (!content) return null
  return <><section className="section home-help-section"><div className="container home-help-inner"><div><p className="eyebrow">Need help from the LGU?</p><h2>{content.helpTitle}</h2><p>{content.helpBody}</p></div><CitizenActions className="home-help-grid" /></div></section><section className="section home-about-section"><div className="container home-about-inner"><div className="home-about-seal"><img src="/assets/getafe-seal.png" alt="Municipality of Getafe seal" /></div><div><p className="eyebrow">About Getafe</p><h2>{content.aboutTitle}</h2><p>{content.aboutBody}</p><div className="home-about-links"><Link to="/info/about">Municipality</Link><Link to="/officials">Officials</Link><Link to="/barangays">Barangays</Link><Link to="/info/history">History</Link></div></div></div></section></>
}

export default function Home() {
  return (
    <main id="home">
      <ImportantAnnouncement />
      <EmergencyAlert />
      <Hero />
      <section className="section home-help-links" aria-labelledby="home-help-links-title"><div className="container"><div className="section-head"><p className="eyebrow">Start with what you need</p><h2 id="home-help-links-title">What can we help you with?</h2></div><CitizenActions /></div></section>
      <MunicipalityUpdatesSection />
      <EventsSection />
      <DiscoverGetafe />
      <MayorCorner />
      <HomeHelp />
    </main>
  )
}
