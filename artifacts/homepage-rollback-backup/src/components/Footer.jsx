import { usePublicConfig } from '../context/PublicConfig';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { getFacebookPageUrl } from './FacebookPageFeed';
import { MUNICIPAL_CONTACT } from '../services/homepagePresentation';
import {
  FaFacebookF, FaRss,
} from 'react-icons/fa6';

const EXPLORE_LINKS = [
  { name: 'About Us', url: '/info/about' },
  { name: 'Municipal Officials', url: '/officials' },
  { name: 'History & Hymn', url: '/info/history' },
  { name: 'Barangays of Getafe', url: '/barangays' },
  { name: 'Municipal Services', url: '/services' },
  { name: 'Services & Departments', url: '/services/directory' },
  { name: 'Emergency Hotlines', url: '/services/hotlines' },
  { name: 'News & Updates', url: '/news' },
  { name: 'Weather Updates', url: '/weather' },
  { name: 'Tourism guides', url: '/tourism' },
  { name: 'Discover Getafe', url: '/discover' },
  { name: 'Gallery of Events', url: '/events' },
  { name: 'Accessibility', url: '/accessibility' },
  { name: 'Sitemap', url: '/info/sitemap' },
  { name: 'Open Data & Statistics', url: '/data' },
];

const GOV_LINKS = [
  { name: 'GOV.PH', url: 'https://www.gov.ph/' },
  { name: 'Open Data Philippines', url: 'https://data.gov.ph/' },
  { name: 'Official Gazette', url: 'https://www.officialgazette.gov.ph/' },
  { name: 'Office of the President', url: 'https://op-proper.gov.ph/' },
  { name: 'Office of the Vice President', url: 'https://ovp.gov.ph/' },
  { name: 'Senate of the Philippines', url: 'https://senate.gov.ph/' },
  { name: 'House of Representatives', url: 'https://congress.gov.ph/' },
];

const JUDICIARY_LINKS = [
  { name: 'Supreme Court', url: 'https://sc.judiciary.gov.ph/' },
  { name: 'Court of Appeals', url: 'https://ca.judiciary.gov.ph/' },
  { name: 'Sandiganbayan', url: 'https://sb.judiciary.gov.ph/' },
];

const residentNames = new Set(['Municipal Services', 'Services & Departments', 'Emergency Hotlines', 'Accessibility'])
const residentLinks = [
  { name: 'Find a Service', url: '/services/directory' },
  { name: 'Departments & Offices', url: '/departments' },
  { name: 'Track My Request', url: '/app/requests' },
  { name: 'Emergency Hotlines', url: '/services/hotlines' },
]

export default function Footer() {
  const settings = usePublicConfig()
  const facebook = getFacebookPageUrl(settings)
  const email = settings['general.supportEmail'] || MUNICIPAL_CONTACT.email
  const external = link => <li key={link.name}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.name} <ExternalLink size={12} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a></li>
  return <footer className="site-footer homepage-footer"><div className="container footer-grid">
    <div><Link to="/" className="homepage-footer-brand"><img src={settings['general.logo'] || '/assets/getafe-seal.png'} alt="Municipality of Getafe seal" loading="lazy" width="56" height="56" /><strong>{settings['general.company'] || 'Municipality of Getafe'}</strong></Link>
      <p>{MUNICIPAL_CONTACT.address}</p><p><a href={`tel:${MUNICIPAL_CONTACT.phone.replace(/[^0-9+]/g, '')}`}>{MUNICIPAL_CONTACT.phone}</a></p><p><a href={`mailto:${email}`}>{email}</a></p><Link to="/contact">Contact information &amp; office hours</Link>
      <div className="footer-socials" aria-label="Municipal channels">{facebook && <a href={facebook} target="_blank" rel="noopener noreferrer"><FaFacebookF aria-hidden="true" /> Facebook<span className="sr-only"> (opens in a new tab)</span></a>}<a href="/rss.xml"><FaRss aria-hidden="true" /> RSS</a></div>
    </div>
    <div><h2>Resident Services</h2><ul>{residentLinks.map(link => <li key={link.name}><Link to={link.url}>{link.name}</Link></li>)}</ul></div>
    <div><h2>Municipality</h2><ul>{EXPLORE_LINKS.filter(link => !residentNames.has(link.name) && !['Accessibility', 'Sitemap'].includes(link.name)).map(link => <li key={link.name}><Link to={link.url}>{link.name}</Link></li>)}</ul></div>
    <div><h2>Government Resources</h2><ul>{[...GOV_LINKS, ...JUDICIARY_LINKS].map(external)}</ul></div>
  </div><div className="container footer-bottom footer-legal"><nav className="homepage-legal-links" aria-label="Policies and accessibility"><Link to="/legal/privacy">Privacy</Link><Link to="/legal/terms">Terms</Link><Link to="/accessibility">Accessibility</Link><Link to="/info/sitemap">Sitemap</Link><button type="button" onClick={() => window.dispatchEvent(new Event('open-cookie-preferences'))}>Cookie preferences</button></nav><p>© {new Date().getFullYear()} Municipality of Getafe, Bohol.</p><p>All content is in the public domain unless otherwise stated.</p></div></footer>
}
