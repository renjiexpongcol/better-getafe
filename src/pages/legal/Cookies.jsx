import { usePublicConfig } from '../../context/PublicConfig'

const sections = [
  ['Essential cookies', 'The portal uses an essential session cookie to keep you signed in and protect authenticated requests. It is HttpOnly and is not used for advertising or cross-site tracking. Sign-in and citizen services may not work if essential cookies are blocked.'],
  ['Google sign-in', 'If you choose Google sign-in or sign-up, Google and this portal use temporary authentication state to complete the secure sign-in exchange. The temporary state is cleared when the exchange finishes or expires.'],
  ['Caching and private data', 'Public, versioned website assets may be cached to improve loading speed. Account pages, authentication responses, citizen records, and other private API responses are marked no-store so browsers and shared caches should not retain them.'],
  ['Your choices', 'You can manage cookies through your browser settings. Blocking essential cookies may prevent sign-in, account access, and other protected services from working. The portal does not require non-essential advertising cookies.'],
]

export default function Cookies() {
  const config = usePublicConfig(), custom = config['legal.cookies']
  return <main id="cookies"><div className="page-header"><div className="container page-header-inner"><div><h1 className="page-title">Cookies & Cache</h1><p className="page-subtitle">How the Municipality of Getafe uses cookies and browser caching</p></div></div></div><div className="content-page container"><div className="legal-page card" style={{ maxWidth: '860px', margin: '0 auto', padding: '40px' }}><p className="legal-updated">Last updated: {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p><p className="legal-intro">We use the minimum technology needed to provide a secure and reliable government service portal. We do not sell personal information or use cookies for advertising.</p>{custom ? custom.split(/\n\s*\n/).filter(Boolean).map((body, index) => <section className="legal-section" key={index}><p>{body}</p></section>) : sections.map(([title, body]) => <section className="legal-section" key={title}><h2>{title}</h2><p>{body}</p></section>)}<section className="legal-section"><h2>Related information</h2><p>See our <a href="/legal/privacy">Privacy Policy</a> for information about personal data and your rights.</p></section></div></div></main>
}
