import { useState } from 'react'
import { MapPin, Mail, Clock, Send, User, Building2, MessageSquare, Landmark, CheckCircle2 } from 'lucide-react'

const CONTACT_EMAIL = 'lgugetafe@yahoo.com'
const CONTACT_PHONE = '(038) 502-9088'

const contactCards = [
  { icon: MapPin, title: 'Visit us', lines: ['Municipal Hall, Poblacion', 'Getafe, Bohol, Philippines'] },
  { img: '/assets/vector/email.png', title: 'E-mail', lines: [CONTACT_EMAIL] },
  { img: '/assets/vector/telephone-call.png', title: 'Call us', lines: [CONTACT_PHONE] },
  { icon: Clock, title: 'Office hours', lines: ['Monday – Friday', '8:00 AM – 5:00 PM'] },
]

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [sent, setSent] = useState(false)

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    const subject = encodeURIComponent(`[Getafe Portal] ${form.subject || 'Inquiry'}`)
    const body = encodeURIComponent(`Name: ${form.name}\nE-mail: ${form.email}\n\n${form.message}`)
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`
    setSent(true)
  }

  return (
    <main id="contact">
      <div className="page-header">
        <div className="container page-header-inner">
          <div>
            <h1 className="page-title">Contact Us</h1>
            <p className="page-subtitle">Reach the municipal offices of Getafe, Bohol.</p>
          </div>
        </div>
      </div>

      <div className="content-page container">
        <div className="contact-cards">
          {contactCards.map(({ icon: Icon, img, title, lines }) => (
            <div className="contact-card" key={title}>
              <span className="contact-card-icon">
                {img ? <img src={img} alt="" className="contact-card-icon-img" /> : <Icon size={20} />}
              </span>
              <h3>{title}</h3>
              {lines.map((l) => (
                l === CONTACT_EMAIL
                  ? <a key={l} href={`mailto:${l}`}>{l}</a>
                  : l === CONTACT_PHONE
                    ? <a key={l} href={`tel:${l.replace(/[^0-9+]/g, '')}`}>{l}</a>
                    : <p key={l}>{l}</p>
              ))}
            </div>
          ))}
        </div>

        <div className="contact-main">
          <section className="contact-form-card">
            <h2><MessageSquare size={18} /> Send us a message</h2>
            {sent ? (
              <div className="contact-success">
                <CheckCircle2 size={40} />
                <h3>Thank you!</h3>
                <p>
                  Your e-mail app has been opened with your message. If it did not open, please send your
                  message directly to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
                </p>
                <button type="button" onClick={() => { setSent(false); setForm({ name: '', email: '', subject: '', message: '' }) }}>
                  Send another message
                </button>
              </div>
            ) : (
              <form className="contact-form" onSubmit={handleSubmit}>
                <div className="contact-field">
                  <label htmlFor="c-name"><User size={15} /> Full name</label>
                  <input id="c-name" type="text" required value={form.name} onChange={update('name')} placeholder="Juan Dela Cruz" />
                </div>
                <div className="contact-field">
                  <label htmlFor="c-email"><Mail size={15} /> E-mail address</label>
                  <input id="c-email" type="email" required value={form.email} onChange={update('email')} placeholder="you@example.com" />
                </div>
                <div className="contact-field">
                  <label htmlFor="c-subject"><Building2 size={15} /> Subject</label>
                  <input id="c-subject" type="text" value={form.subject} onChange={update('subject')} placeholder="e.g. Inquiry about a business permit" />
                </div>
                <div className="contact-field">
                  <label htmlFor="c-message"><MessageSquare size={15} /> Message</label>
                  <textarea id="c-message" required rows={5} value={form.message} onChange={update('message')} placeholder="Write your message here..." />
                </div>
                <button type="submit" className="contact-submit"><Send size={16} /> Send message</button>
              </form>
            )}
          </section>

          <aside className="contact-aside">
            <div className="contact-aside-card">
              <span className="contact-aside-icon"><Landmark size={20} /></span>
              <h3>Municipal Hall</h3>
              <p>Municipal Hall, Poblacion, Getafe, Bohol</p>
            </div>
            <div className="contact-aside-card">
              <span className="contact-aside-icon"><Clock size={20} /></span>
              <h3>Office hours</h3>
              <p>Monday – Friday, 8:00 AM – 5:00 PM</p>
              <p>Closed on weekends and holidays.</p>
            </div>
            <p className="contact-aside-note">
              For emergencies, please call <strong>911</strong> or visit the{' '}
              <a href="/services/hotlines">Emergency Hotlines</a> page.
            </p>
          </aside>
        </div>
      </div>
    </main>
  )
}
