import { Link } from 'react-router-dom'
import { Phone, MapPin, Clock, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'

// Shared layout for LGU service category pages (Business, Certificates,
// Education, Health). Each page passes in its own content.
export default function ServicePageLayout({
  kicker,
  title,
  subtitle,
  intro,
  services,
  steps,
  office,
  contact,
  related,
  backLabel,
  showBackLink = true,
  requirementsTitle = 'Services we offer',
  stepsTitle = 'How to apply',
  variant = '',
}) {
  return (
    <main className={`service-detail ${variant}`}>
      <div className="page-header">
        <div className="container page-header-inner">
          <div>
            {backLabel && <button type="button" className="service-hero-back" onClick={() => window.history.back()}><ArrowLeft size={18} strokeWidth={2.4} aria-hidden="true" /> {backLabel}</button>}
            <p className="service-detail-kicker">{kicker}</p>
            <h1 className="page-title">{title}</h1>
            {subtitle && <p className="page-subtitle">{subtitle}</p>}
          </div>
        </div>
      </div>

      <div className="content-page container">
        <p className="service-intro">{intro}</p>

        <div className="service-detail-grid">
          <div className="service-detail-main">
            <section className="service-block">
              <h2>{requirementsTitle}</h2>
              <div className="service-items">
                {services.map((s) => (
                  <article className="service-item" key={s.name}>
                    <h3>{s.name}</h3>
                    {s.desc && <p>{s.desc}</p>}
                    <div className="service-req">
                      <strong>Common requirements</strong>
                      <ul>
                        {s.requirements.map((r) => (
                          <li key={r}><CheckCircle2 size={14} /> {r}</li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="service-block">
              <h2>{stepsTitle}</h2>
              <ol className="service-steps">
                {steps.map((step, index) => (
                  <li key={`${step.n ?? index}-${step.text ?? ''}`}>
                    <span className="service-step-num">{step.n}</span>
                    <span>{step.text}</span>
                  </li>
                ))}
              </ol>
            </section>

            {related && related.length > 0 && (
              <section className="service-block">
                <h2>Related institutions</h2>
                <div className="service-related">
                  {related.map((r) => (
                    <a
                      key={r.name}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="service-related-card"
                    >
                      {r.img && <img src={r.img} alt={`${r.name} logo`} className="service-related-img" />}
                      <div>
                        <strong>{r.name}</strong>
                        {r.desc && <p>{r.desc}</p>}
                        {r.email && (
                          <a href={`mailto:${r.email}`} className="service-related-email">{r.email}</a>
                        )}
                      </div>
                      <ArrowRight size={16} />
                    </a>
                  ))}
                </div>
              </section>
            )}

          </div>

          <aside className="service-sidebar">
            <div className="service-info-card">
              <span className="service-info-icon"><MapPin size={20} /></span>
              <h3>Where to go</h3>
              <p className="service-info-name">{office.name}</p>
              <p>{office.location}</p>
            </div>
            <div className="service-info-card">
              <span className="service-info-icon"><Clock size={20} /></span>
              <h3>Office hours</h3>
              <p>{office.hours}</p>
            </div>
            <div className="service-info-card">
              <span className="service-info-icon"><Phone size={20} /></span>
              <h3>Contact</h3>
              <p><a href={`tel:${contact.phone}`}>{contact.phone}</a></p>
              <p><a href={`mailto:${contact.email}`}>{contact.email}</a></p>
            </div>
            <div className="service-info-note">
              Requirements and fees may vary. Verify with the concerned office before applying.
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
