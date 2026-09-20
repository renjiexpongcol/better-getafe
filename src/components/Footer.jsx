import { usePublicConfig } from '../context/PublicConfig';
import { Link } from 'react-router-dom';
import {
  FaFacebookF, FaGithub, FaInstagram, FaYoutube, FaXTwitter, FaRss,
} from 'react-icons/fa6';

const EXPLORE_LINKS = [
  { name: 'About Us', url: '/info/about' },
  { name: 'Municipal Officials', url: '/info/officials' },
  { name: 'History & Hymn', url: '/info/history' },
  { name: 'Barangays of Getafe', url: '/services/barangays' },
  { name: 'Municipal Services', url: '/services' },
  { name: 'Services & Departments', url: '/services/directory' },
  { name: 'Emergency Hotlines', url: '/services/hotlines' },
  { name: 'News & Updates', url: '/news' },
  { name: 'Weather Updates', url: '/weather' },
  { name: 'Discover Getafe', url: '/tourism' },
  { name: 'Gallery of Events', url: '/events' },
  { name: 'Accessibility', url: '/info/accessibility' },
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

// Social media accounts. Set the corresponding VITE_GETAFE_*_URL env var
// to show an account's icon; unset accounts are automatically hidden below.
const SOCIAL_LINKS = [
  {
    name: 'Facebook',
    url: import.meta.env.VITE_GETAFE_FACEBOOK_URL || 'https://web.facebook.com/profile.php?id=61577786097184&locale=en_US',
    icon: FaFacebookF,
  },
  {
    name: 'Instagram',
    url: import.meta.env.VITE_GETAFE_INSTAGRAM_URL || '',
    icon: FaInstagram,
  },
  {
    name: 'YouTube',
    url: import.meta.env.VITE_GETAFE_YOUTUBE_URL || '',
    icon: FaYoutube,
  },
  {
    name: 'X',
    url: import.meta.env.VITE_GETAFE_X_URL || '',
    icon: FaXTwitter,
  },
  {
    name: 'GitHub',
    url: import.meta.env.VITE_GETAFE_GITHUB_URL || '',
    icon: FaGithub,
  },
  {
    name: 'Discord',
    url: 'https://discord.gg/URZKjsFNq',
    iconPath: '/assets/icons/icon%20pack/discord.png',
  },
  {
    name: 'RSS Feed',
    url: '/rss.xml',
    icon: FaRss,
  },
].filter((link) => Boolean(link.url));

export default function Footer() {
  const settings = usePublicConfig();
  return (
    <footer className="site-footer" style={{ borderTop: '4px solid #3b82f6' }}>
      <div className="container footer-grid" style={{ paddingTop: '4rem', paddingBottom: '3rem' }}>

        {/* Column 1: Municipality Branding */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div className="brand-wrap footer-brand" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <img src={settings['general.logo'] || '/assets/getafe-seal.png'} alt="Municipality of Getafe Logo" style={{ height: '64px', width: 'auto', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))' }} />
            <div>
              <div className="brand-name" style={{ fontSize: '1.25rem', fontWeight: '800', letterSpacing: '-0.025em', whiteSpace: 'nowrap', color: '#fff' }}>{settings['general.company'] || 'Municipality of Getafe'}</div>
            </div>
          </div>

          <p style={{ margin: 0, lineHeight: '1.55', fontSize: '0.88rem', color: '#d1d5db', maxWidth: '320px' }}>
            The official digital portal of the Municipality of Getafe, Bohol, providing accessible government services, information, programs, and updates for the people of Getafe.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', gap: '8px', fontSize: '0.9rem' }}>
              <strong style={{ color: '#fff' }}>Address:</strong>
              <span style={{ color: '#d1d5db' }}>Municipal Hall, Poblacion, Getafe, Bohol</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', fontSize: '0.9rem' }}>
              <strong style={{ color: '#fff' }}>E-mail:</strong>
              <a href="mailto:lgugetafe@yahoo.com" style={{ color: '#93c5fd', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = '#fff'} onMouseLeave={(e) => e.currentTarget.style.color = '#93c5fd'}>lgugetafe@yahoo.com</a>
            </div>
          </div>

          {SOCIAL_LINKS.length > 0 && (
            <div className="footer-socials" aria-label="Official social media links">
              <span>Follow Getafe</span>
              <div>
                {SOCIAL_LINKS.map(({ name, url, icon: Icon, iconPath }) => (
                  <a href={url} target="_blank" rel="noreferrer" aria-label={name} title={name} key={name}>
                    {iconPath ? <img src={iconPath} alt="" aria-hidden="true" /> : <Icon size={18} aria-hidden="true" />}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: '0.5rem' }}>
            <div style={{ color: '#9ca3af', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem', fontWeight: '600' }}>Government Partners</div>
            <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* FOI image has ~26% internal padding, so render it larger so its visible glyph matches the seals */}
              <img src="/assets/FOI-logo.png" alt="FOI Logo" style={{ height: '53px', width: '53px', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }} />
              <img src="/assets/transparency-seal.png" alt="Transparency Seal" style={{ height: '40px', width: '40px', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }} />
              <img src="/assets/transeal.png" alt="Transparency Seal" style={{ height: '46px', width: '46px', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }} />
            </div>
          </div>
        </div>

        {/* Column 2: Explore the portal */}
        <div>
          <h4 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem' }}>Explore Getafe</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {EXPLORE_LINKS.map(link => (
              <li key={link.name}>
                <Link to={link.url} style={{ color: '#d1d5db', textDecoration: 'none', transition: 'color 0.2s', fontSize: '0.95rem' }} onMouseEnter={(e) => e.currentTarget.style.color = '#60a5fa'} onMouseLeave={(e) => e.currentTarget.style.color = '#d1d5db'}>{link.name}</Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Column 3: Government Links */}
        <div>
          <h4 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem' }}>Government Links</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {GOV_LINKS.map(link => (
              <li key={link.name}>
                <a href={link.url} target="_blank" rel="noreferrer" style={{ color: '#d1d5db', textDecoration: 'none', transition: 'color 0.2s', fontSize: '0.95rem' }} onMouseEnter={(e) => e.currentTarget.style.color = '#60a5fa'} onMouseLeave={(e) => e.currentTarget.style.color = '#d1d5db'}>{link.name}</a>
              </li>
            ))}
          </ul>
        </div>

        {/* Column 4: Judiciary Links */}
        <div>
          <h4 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem' }}>Judiciary</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {JUDICIARY_LINKS.map(link => (
              <li key={link.name}>
                <a href={link.url} target="_blank" rel="noreferrer" style={{ color: '#d1d5db', textDecoration: 'none', transition: 'color 0.2s', fontSize: '0.95rem' }} onMouseEnter={(e) => e.currentTarget.style.color = '#60a5fa'} onMouseLeave={(e) => e.currentTarget.style.color = '#d1d5db'}>{link.name}</a>
              </li>
            ))}
          </ul>
        </div>

      </div>

      {/* Footer Bottom Bar */}
      <div className="container footer-bottom" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '1.5rem 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#9ca3af', fontSize: '0.875rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span>© {new Date().getFullYear()} Municipality of Getafe, Bohol. All Rights Reserved.</span>
          <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Official Government Website</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', alignItems: 'flex-end' }}>
          <div className="footer-credit">This page was created by Renjie Pongcol, inspired by BetterGov.</div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link to="/legal/privacy" style={{ color: '#9ca3af', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = '#fff'} onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}>Privacy Policy</Link>
          <span style={{ opacity: 0.5 }}>·</span>
          <Link to="/legal/terms" style={{ color: '#9ca3af', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = '#fff'} onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}>Terms of Use</Link>
          <span style={{ opacity: 0.5 }}>·</span>
          <Link to="/info/accessibility" style={{ color: '#9ca3af', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = '#fff'} onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}>Accessibility</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

