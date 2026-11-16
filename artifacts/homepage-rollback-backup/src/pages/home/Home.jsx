import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DiscoverGetafe from '../../components/DiscoverGetafe'
import Hero from '../../components/Hero'
import MunicipalityUpdatesSection from '../../components/MunicipalityUpdatesSection'
import EmergencyAlert from '../../components/EmergencyAlert'
import ImportantAnnouncement from '../../components/ImportantAnnouncement'
import EventsSection from '../../components/EventsSection'
import CitizenActions from '../../components/CitizenActions'
import HomeSectionBoundary from '../../components/HomeSectionBoundary'
import { usePublicConfig } from '../../context/PublicConfig'
import { publicApi } from '../../services/apiClient'
import { MUNICIPAL_CONTACT, municipalDate } from '../../services/homepagePresentation'

function MayorCorner() {
  const [state, setState] = useState({ loading: true })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setState({ loading: true })
    publicApi('/officials/directory?status=current', { force: attempt > 0, persist: false })
      .then(data => { if (active) setState({ mayor: data.items?.find(item => item.position?.slug === 'municipal-mayor' && item.term?.status === 'current') }) })
      .catch(() => { if (active) setState({ error: true }) })
    return () => { active = false }
  }, [attempt])
  const mayor = state.mayor
  const biography = mayor?.biography ? new DOMParser().parseFromString(mayor.biography, 'text/html').body.textContent.trim() : ''
  const excerpt = biography.length > 260 ? biography.slice(0, 257).replace(/\s+\S*$/, '') + '…' : biography
  return <section className="section mayor-corner" aria-labelledby="mayor-corner-title"><div className="container mayor-corner-inner">
    {mayor?.photo && <div className="mayor-corner-photo-wrap"><img className="mayor-corner-photo" src={mayor.photo} alt={mayor.name} loading="lazy" decoding="async" width="360" height="420" /></div>}
    <div className="mayor-corner-copy"><h2 id="mayor-corner-title">Mayor's office</h2>
      {state.loading ? <p role="status">Loading municipal leadership…</p> : mayor ? <><p className="mayor-corner-welcome">{mayor.name}</p><p>Municipal Mayor{mayor.term?.start && <> · Term: {municipalDate(mayor.term.start)}{mayor.term.end && <> – {municipalDate(mayor.term.end)}</>}</>}</p>{excerpt && <p>{excerpt}</p>}<Link to={`/officials/${encodeURIComponent(mayor.slug)}`}>View mayor's profile</Link></> : <p role="status">Current mayor information is {state.error ? 'temporarily unavailable' : 'awaiting publication'}.</p>}
      {state.error && <button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button>}
      <Link to="/departments/executive">Contact the mayor's office</Link>
    </div>
  </div></section>
}

function MunicipalInformation() {
  const settings = usePublicConfig()
  return <><section className="section home-about-section"><div className="container home-about-inner"><div className="home-about-seal"><img src="/assets/getafe-seal.png" alt="Municipality of Getafe seal" loading="lazy" width="140" height="140" /></div><div><h2>About Getafe</h2><p>Municipal information, leadership, and barangays.</p><nav className="home-about-links" aria-label="Municipality information"><Link to="/info/about">Municipality</Link><Link to="/officials">Officials</Link><Link to="/barangays">Barangays</Link><Link to="/info/history">History, seal &amp; hymn</Link></nav></div></div></section>
    <section className="section homepage-contact" aria-labelledby="homepage-contact-title"><div className="container"><h2 id="homepage-contact-title">Contact the municipality</h2><div className="homepage-contact-grid"><div><h3>Municipal Hall</h3><p>{MUNICIPAL_CONTACT.address}</p><Link to="/contact">Contact information &amp; office hours</Link></div><div><h3>Call or email</h3><a href={`tel:${MUNICIPAL_CONTACT.phone.replace(/[^0-9+]/g, '')}`}>{MUNICIPAL_CONTACT.phone}</a><a href={`mailto:${settings['general.supportEmail'] || MUNICIPAL_CONTACT.email}`}>{settings['general.supportEmail'] || MUNICIPAL_CONTACT.email}</a></div><div><h3>Find the right office</h3><Link to="/departments">Departments &amp; offices</Link><Link to="/services/hotlines">Emergency contacts</Link><Link to="/accessibility">Accessibility preferences</Link></div></div></div></section></>
}

export default function Home() {
  const settings = usePublicConfig()
  return <main id="home">
    {settings.unavailable && <aside className="homepage-outage container" role="status"><strong>Some online information is temporarily unavailable.</strong><p>You can still find service guidance and municipal contact information. Online transactions require the service to be available.</p><button type="button" onClick={() => window.dispatchEvent(new Event('configuration-changed'))}>Retry connection</button></aside>}
    <HomeSectionBoundary title="Municipal advisories" to="/news"><ImportantAnnouncement /><EmergencyAlert /></HomeSectionBoundary>
    <Hero />
    <section className="section home-help-links" aria-labelledby="home-help-links-title"><div className="container"><div className="section-head"><h2 id="home-help-links-title">What can we help you with?</h2></div><CitizenActions /></div></section>
    <MunicipalityUpdatesSection />
    <HomeSectionBoundary title="Upcoming events" to="/events"><EventsSection /></HomeSectionBoundary>
    <HomeSectionBoundary title="Discover Getafe" to="/tourism"><DiscoverGetafe /></HomeSectionBoundary>
    <HomeSectionBoundary title="Mayor's office" to="/officials"><MayorCorner /></HomeSectionBoundary>
    <MunicipalInformation />
  </main>
}
