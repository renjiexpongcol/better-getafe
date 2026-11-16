import { Link } from 'react-router-dom'
import { FaFacebookF, FaGithub, FaInstagram, FaYoutube, FaXTwitter, FaRss } from 'react-icons/fa6'
import { Mail, MapPin, Phone } from 'lucide-react'
import { usePublicConfig } from '../context/PublicConfig'
import { useRef, useState } from 'react'
import { routeRequest } from '../services/routeRequests.js'
import { navigationDestinationId } from '../services/websiteAnalytics.js'
import './Footer.css'

const EXPLORE_LINKS = [
  ['About Us', '/info/about'], ['Municipal Officials', '/officials'], ['History & Hymn', '/info/history'],
  ['Barangays of Getafe', '/barangays'], ['Municipal Services', '/services'], ['Services & Departments', '/services/directory'],
  ['Emergency Hotlines', '/services/hotlines'], ['News & Updates', '/news'], ['Weather Updates', '/weather'],
  ['Tourism guides', '/tourism'], ['Discover Getafe', '/discover'], ['Gallery of Events', '/events'],
  ['Accessibility', '/accessibility'], ['Sitemap', '/info/sitemap'], ['Open Data & Statistics', '/data'],
].map(([name, url]) => ({ name, url }))
const GOV_LINKS = [
  ['GOV.PH', 'https://www.gov.ph/'], ['Open Data Philippines', 'https://data.gov.ph/'],
  ['Official Gazette', 'https://www.officialgazette.gov.ph/'], ['Office of the President', 'https://op-proper.gov.ph/'],
  ['Office of the Vice President', 'https://ovp.gov.ph/'], ['Senate of the Philippines', 'https://senate.gov.ph/'],
  ['House of Representatives', 'https://congress.gov.ph/'],
].map(([name, url]) => ({ name, url }))
const JUDICIARY_LINKS = [
  ['Supreme Court', 'https://sc.judiciary.gov.ph/'], ['Court of Appeals', 'https://ca.judiciary.gov.ph/'],
  ['Sandiganbayan', 'https://sb.judiciary.gov.ph/'],
].map(([name, url]) => ({ name, url }))

const safeExternalUrl = value => {
  if (!value) return ''
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : '' } catch { return '' }
}

export default function Footer() {
  const [emailValue, setEmailValue] = useState('')
  const [subscription, setSubscription] = useState({ status: 'idle', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const submissionInFlight = useRef(false)
  const settings = usePublicConfig()
  const company = settings['general.company'] || 'Municipality of Getafe'
  const address = settings['contact.address'] || 'Municipal Hall, Poblacion, Getafe, Bohol'
  const email = settings['contact.email'] || settings['general.supportEmail'] || 'lgugetafe@yahoo.com'
  const social = [
    ['Facebook', safeExternalUrl(import.meta.env.VITE_GETAFE_FACEBOOK_URL || 'https://web.facebook.com/profile.php?id=61577786097184&locale=en_US'), FaFacebookF],
    ['Instagram', safeExternalUrl(import.meta.env.VITE_GETAFE_INSTAGRAM_URL), FaInstagram],
    ['YouTube', safeExternalUrl(import.meta.env.VITE_GETAFE_YOUTUBE_URL), FaYoutube],
    ['X', safeExternalUrl(import.meta.env.VITE_GETAFE_X_URL), FaXTwitter],
    ['GitHub', safeExternalUrl(import.meta.env.VITE_GETAFE_GITHUB_URL), FaGithub],
    ['RSS Feed', '/rss.xml', FaRss],
  ].filter(([, url]) => url)
  const groups = [['Explore Getafe', EXPLORE_LINKS], ['Government Links', GOV_LINKS], ['Judiciary', JUDICIARY_LINKS]]
  const subscribe = async event => {
    event.preventDefault()
    if (submissionInFlight.current) return
    submissionInFlight.current = true
    setSubmitting(true)
    setSubscription({ status: 'pending', message: '' })
    try {
      await routeRequest('/api/newsletter/subscriptions', { method: 'POST', body: JSON.stringify({ email: emailValue }) })
      setSubscription({ status: 'success', message: 'Thanks for submitting your newsletter request.' })
      setEmailValue('')
    } catch (error) {
      setSubscription({ status: 'error', message: error.message || 'We could not save your subscription. Please try again.' })
    } finally {
      submissionInFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-column footer-about">
          <div className="footer-brand">
            <img src={settings['general.logo'] || '/assets/getafe-seal.png'} alt="Municipality of Getafe seal" width="68" height="68" />
            <strong>{company}</strong>
          </div>
          <p className="footer-description">The official digital portal of the Municipality of Getafe, Bohol, providing accessible government services, information, programs, and updates for the people of Getafe.</p>
          <div className="footer-contact" aria-label="Municipality contact information">
            <p><MapPin size={16} aria-hidden="true" /><span>{address}</span></p>
            {settings['contact.phone'] && <p><Phone size={16} aria-hidden="true" /><a href={`tel:${settings['contact.phone'].replace(/[^0-9+]/g, '')}`}>{settings['contact.phone']}</a></p>}
            {email && <p><Mail size={16} aria-hidden="true" /><a href={`mailto:${email}`}>{email}</a></p>}
          </div>
          <section className="footer-newsletter" aria-labelledby="footer-newsletter-title">
            <div className="footer-newsletter-inner">
              <div className="footer-newsletter-copy">
                <h2 id="footer-newsletter-title">Want to hear what’s happening in Getafe?</h2>
                <p>Subscribe for local news, community events, and municipal service updates.</p>
              </div>
              <form className="footer-newsletter-form" onSubmit={subscribe}>
                <label className="sr-only" htmlFor="footer-newsletter-email">Email address</label>
                <input id="footer-newsletter-email" type="email" autoComplete="email" placeholder="Your email address" value={emailValue} onChange={event => setEmailValue(event.target.value)} required disabled={submitting} />
                <button type="submit" disabled={submitting} aria-label={submitting ? 'Subscribing' : 'Subscribe'} aria-busy={submitting}>
                  {submitting ? <span className="footer-newsletter-spinner" aria-hidden="true" /> : 'Subscribe'}
                </button>
              </form>
              <p className={`footer-newsletter-message footer-newsletter-message-${subscription.status}`} role="status" aria-live="polite">{subscription.message}</p>
            </div>
          </section>
          <div className="footer-utility-row">
            <div className="footer-socials" aria-label="Official social media links">
              <span>Follow Getafe</span>
              <div>{social.map(([name, url, Icon]) => <a href={url} target="_blank" rel="noreferrer" aria-label={name} title={name} key={name}><Icon aria-hidden="true" /></a>)}</div>
            </div>
            <div className="footer-partners">
              <span>Government partners</span>
              <div>
                <img src="/assets/FOI-logo.png" alt="Freedom of Information Philippines" />
                <img src="/assets/transparency-seal.png" alt="Transparency Seal" />
                <img src="/assets/transeal.png" alt="Transparency Seal" />
              </div>
            </div>
          </div>
        </div>
        {groups.map(([title, links]) => <div className="footer-column footer-navigation" key={title}>
          <h4>{title}</h4>
          <ul>{links.map(link => { const analytics = { 'data-analytics-placement': `footer.${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, 'data-analytics-destination': navigationDestinationId(link.url) }; return <li key={link.name}>{link.url.startsWith('/') ? <Link to={link.url} {...analytics}>{link.name}</Link> : <a href={link.url} target="_blank" rel="noreferrer" {...analytics}>{link.name}</a>}</li> })}</ul>
        </div>)}
      </div>
      <div className="container footer-bottom footer-legal">
        <div className="footer-legal-links">
          <span>© {new Date().getFullYear()} {company}</span>
          <Link to="/legal/privacy">Privacy</Link>
          <Link to="/legal/terms">Terms</Link>
          <Link to="/legal/cookies">Cookies</Link>
        </div>
        <p className="footer-public-domain">All content is in the public domain unless otherwise stated.</p>
      </div>
    </footer>
  )
}
