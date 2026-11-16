const sections = [
  {
    title: 'Information we collect',
    body: 'We may collect personal information that you voluntarily provide when you use our online services, such as your name, contact details, and information required to process applications for permits, certificates, and other government transactions.',
  },
  {
    title: 'How we use your information',
    body: 'Information collected is used solely to deliver, process, and improve government services, respond to inquiries, and comply with legal and regulatory obligations. We do not sell, rent, or trade your personal information.',
  },
  {
    title: 'Data protection',
    body: 'The Municipality of Getafe is committed to protecting your personal data in accordance with the Data Privacy Act of 2012 (RA 10173). We implement appropriate technical and organizational measures to safeguard your information against unauthorized access, disclosure, alteration, or destruction.',
  },
  {
    title: 'Cookies and analytics',
    body: 'Our website may use cookies and similar technologies to improve your browsing experience and gather aggregate statistics about site usage. You may adjust your browser settings to refuse cookies; however, some features may not function properly as a result.',
  },
  {
    title: 'Third-party links',
    body: 'Our website may contain links to external websites, including national government portals. We are not responsible for the privacy practices or content of these external sites and encourage you to review their respective privacy policies.',
  },
  {
    title: 'Your rights',
    body: 'Under the Data Privacy Act, you have the right to be informed, to access, to object, to rectify, and to erase your personal data, as well as to file a complaint with the National Privacy Commission. To exercise these rights, you may contact our Data Protection Officer.',
  },
]

export default function PrivacyPolicy() {
  const config = usePublicConfig()
  const custom = config['legal.privacy']
  return (
    <main id="privacy-policy">
      <div className="page-header">
        <div className="container page-header-inner">
          <div>
            <h1 className="page-title">Privacy Policy</h1>
            <p className="page-subtitle">How the Municipality of Getafe handles your personal information</p>
          </div>
        </div>
      </div>

      <div className="content-page container">
        <div className="legal-page card" style={{ maxWidth: '860px', margin: '0 auto', padding: '40px' }}>
          <p className="legal-updated">Last updated: {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p className="legal-intro">
            This Privacy Policy describes how the official web portal of the Municipality of Getafe collects, uses,
            and protects the personal information of its users, in line with the <strong>Data Privacy Act of 2012</strong>.
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
              For questions or concerns regarding this Privacy Policy, you may reach us at{' '}
              <a href="mailto:lgugetafe@yahoo.com">lgugetafe@yahoo.com</a> or visit the Municipal Hall,
              Poblacion, Getafe, Bohol.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
import { usePublicConfig } from '../../context/PublicConfig'
