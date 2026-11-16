const sections = [
  {
    title: 'Acceptance of terms',
    body: 'By accessing or using the official web portal of the Municipality of Getafe, you agree to be bound by these Terms of Use. If you do not agree with any part of these terms, please discontinue use of the portal.',
  },
  {
    title: 'Use of the portal',
    body: 'The portal is provided for lawful purposes, including accessing government information and availing of municipal services. You agree not to misuse the portal, attempt to gain unauthorized access, or use it in any way that disrupts its operation.',
  },
  {
    title: 'Accuracy of information',
    body: 'The Municipality of Getafe strives to keep the information on this portal accurate and up to date. However, information is provided "as is" without warranties of any kind. Users should verify critical information with the concerned municipal office.',
  },
  {
    title: 'Intellectual property',
    body: 'Content published on this portal, including text, graphics, logos, and the municipal seal, is the property of the Municipality of Getafe unless otherwise stated and may not be reproduced without appropriate authorization.',
  },
  {
    title: 'External links',
    body: 'This portal may contain links to third-party websites. The Municipality of Getafe does not endorse and is not responsible for the content or practices of external sites.',
  },
  {
    title: 'Limitation of liability',
    body: 'The Municipality of Getafe shall not be held liable for any loss or damage arising from the use of, or reliance on, information obtained through this portal, to the fullest extent permitted by law.',
  },
  {
    title: 'Changes to these terms',
    body: 'We may update these Terms of Use from time to time. Continued use of the portal after any changes constitutes acceptance of the revised terms.',
  },
]

export default function TermsOfUse() {
  const config = usePublicConfig()
  const custom = config['legal.terms']
  return (
    <main id="terms-of-use">
      <div className="page-header">
        <div className="container page-header-inner">
          <div>
            <h1 className="page-title">Terms of Use</h1>
            <p className="page-subtitle">Guidelines for using the official web portal of Getafe</p>
          </div>
        </div>
      </div>

      <div className="content-page container">
        <div className="legal-page card" style={{ maxWidth: '860px', margin: '0 auto', padding: '40px' }}>
          <p className="legal-updated">Last updated: {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p className="legal-intro">
            These Terms of Use govern your access to and use of the official web portal of the Municipality of
            Getafe, Bohol.
          </p>

          {custom ? custom.split(/\n\s*\n/).filter(Boolean).map((body, index) => (
            <section className="legal-section" key={index}><p>{body}</p></section>
          )) : sections.map((s) => (
            <section className="legal-section" key={s.title}>
              <h2>{s.title}</h2>
              <p>{s.body}</p>
            </section>
          ))}

          <section className="legal-section">
            <h2>Contact</h2>
            <p>
              Questions about these Terms of Use may be directed to{' '}
              <a href="mailto:lgugetafe@yahoo.com">lgugetafe@yahoo.com</a> or the Municipal Hall,
              Poblacion, Getafe, Bohol.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
import { usePublicConfig } from '../../context/PublicConfig'
