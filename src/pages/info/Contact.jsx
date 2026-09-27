import { useEffect, useState } from 'react'
import { MapPin, Mail, Clock, Send, User, Building2, MessageSquare, Landmark, CheckCircle2, Phone } from 'lucide-react'
import { usePublicConfig } from '../../context/PublicConfig'

const CONTACT_EMAIL = 'lgugetafe@yahoo.com'
const CONTACT_PHONE = '(038) 502-9088'
const CATEGORY_OPTIONS = [
  'General inquiry',
  'Business permits',
  'Civil registry',
  'Real property / taxation',
  'Social services',
  'Engineering / building permits',
  'Tourism',
  'Complaint or feedback',
  'Other',
]

const contactCards = [
  { icon: MapPin, title: 'Visit us', lines: ['Municipal Hall, Poblacion', 'Getafe, Bohol, Philippines'] },
  { icon: Mail, title: 'E-mail', lines: [CONTACT_EMAIL] },
  { icon: Phone, title: 'Call us', lines: [CONTACT_PHONE] },
  { icon: Clock, title: 'Office hours', lines: ['Monday – Friday', '8:00 AM – 5:00 PM'] },
]

export default function Contact() {
  const settings = usePublicConfig() || {}
  const [form, setForm] = useState({ name: '', email: '', category: '', subject: '', message: '', website: '' })
  const [errors, setErrors] = useState({})
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [referenceNumber, setReferenceNumber] = useState('')
  const [acknowledgementStatus, setAcknowledgementStatus] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const captchaEnabled = settings['security.contactCaptcha'] === true && Boolean(settings['security.recaptchaSiteKey'])

  useEffect(() => {
    if (!captchaEnabled) return undefined
    let script = document.querySelector('script[data-recaptcha]')
    if (!script) {
      script = document.createElement('script')
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.dataset.recaptcha = 'true'
      document.head.appendChild(script)
    }
    const render = () => {
      const node = document.getElementById('contact-recaptcha-widget')
      if (window.grecaptcha && node && !node.dataset.rendered) {
        window.grecaptcha.render(node, {
          sitekey: settings['security.recaptchaSiteKey'],
          callback: setCaptchaToken,
          'expired-callback': () => setCaptchaToken(''),
          'error-callback': () => setCaptchaToken(''),
        })
        node.dataset.rendered = 'true'
      }
    }
    script.addEventListener('load', render)
    const timer = window.setInterval(render, 250)
    return () => { script.removeEventListener('load', render); window.clearInterval(timer) }
  }, [captchaEnabled, settings['security.recaptchaSiteKey']])

  const validateField = (key, value) => {
    const trimmed = value.trim()
    if (key === 'name' && !trimmed) return 'Please enter your full name.'
    if (key === 'name' && trimmed.length > 100) return 'Please keep your name to 100 characters or fewer.'
    if (key === 'email' && !trimmed) return 'Please enter your e-mail address.'
    if (key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Please enter a valid e-mail address.'
    if (key === 'email' && trimmed.length > 254) return 'Please keep your e-mail to 254 characters or fewer.'
    if (key === 'category' && !trimmed) return 'Please select a category.'
    if (key === 'subject' && !trimmed) return 'Please enter a subject.'
    if (key === 'subject' && trimmed.length > 200) return 'Please keep your subject to 200 characters or fewer.'
    if (key === 'message' && !trimmed) return 'Please enter your message.'
    if (key === 'message' && trimmed.length > 5000) return 'Please keep your message to 5,000 characters or fewer.'
    return ''
  }

  const validate = () => {
    const nextErrors = ['name', 'email', 'category', 'subject', 'message'].reduce((result, key) => {
      const error = validateField(key, form[key])
      if (error) result[key] = error
      return result
    }, {})
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const update = (key) => (e) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      const error = validateField(key, value)
      if (error) next[key] = error
      else delete next[key]
      return next
    })
  }

  const blur = (key) => () => {
    const error = validateField(key, form[key])
    setErrors((current) => {
      const next = { ...current }
      if (error) next[key] = error
      else delete next[key]
      return next
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (sending || !validate()) return
    if (captchaEnabled && !captchaToken) {
      setErrors((current) => ({ ...current, captcha: 'Please complete the verification.' }))
      return
    }
    setSubmitError('')
    setSending(true)
    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GetafeCitizenPortal' },
      body: JSON.stringify({ ...form, captchaToken }),
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) {
          if (body.fields) setErrors((current) => ({ ...current, ...body.fields }))
          throw new Error(response.status === 429 ? 'Please wait a little before sending another message.' : (body.error || 'We couldn’t send your message right now. Please try again.'))
        }
        setReferenceNumber(body.referenceNumber || '')
        setAcknowledgementStatus(body.acknowledgementStatus || 'disabled')
        setSent(true)
      })
      .catch((error) => setSubmitError(error.message || 'We couldn’t send your message right now. Please try again.'))
      .finally(() => setSending(false))
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
          {contactCards.map(({ icon: Icon, title, lines }) => (
            <div className="contact-card" key={title}>
              <span className="contact-card-icon">
                <Icon size={20} aria-hidden="true" />
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
            <div className="contact-form-heading">
              <div>
                <p className="contact-section-kicker">We’re here to help</p>
                <h2><MessageSquare size={18} /> Send us a message</h2>
              </div>
              <span className="contact-form-badge">Usually replies by e-mail</span>
            </div>
            <p className="contact-form-intro">Tell us what you need and the appropriate municipal office will be able to follow up.</p>
            {sent ? (
              <div className="contact-success" role="status" aria-live="polite">
                <CheckCircle2 size={40} />
                <h3>Message received</h3>
                <p>Thank you for contacting the Municipality of Getafe. We’ve received your message.</p>
                {acknowledgementStatus === 'sent' && <p className="contact-acknowledgement">An acknowledgement was sent to <strong>{form.email.replace(/^(.)(.*?)(@.*)$/, '$1***$3')}</strong>.</p>}
                {acknowledgementStatus !== 'sent' && <p className="contact-acknowledgement">If email delivery is available, you may also receive an acknowledgement at the address you provided.</p>}
                <p className="contact-reference">Reference number: <strong>{referenceNumber}</strong><br /><small>Please keep this reference number if you need to follow up.</small></p>
                <button type="button" onClick={() => { setSent(false); setReferenceNumber(''); setAcknowledgementStatus(''); setSubmitError(''); setCaptchaToken(''); setErrors({}); setForm({ name: '', email: '', category: '', subject: '', message: '', website: '' }) }}>
                  Send another message
                </button>
              </div>
            ) : (
              <form className="contact-form" noValidate onSubmit={handleSubmit}>
                <div className="contact-honeypot" aria-hidden="true">
                  <label htmlFor="c-website">Website</label>
                  <input id="c-website" name="website" tabIndex="-1" autoComplete="off" value={form.website} onChange={update('website')} />
                </div>
                <div className="contact-field">
                  <label htmlFor="c-name"><User size={15} /> Full name <span aria-hidden="true">*</span></label>
                  <input id="c-name" type="text" autoComplete="name" required aria-required="true" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'c-name-error' : undefined} value={form.name} onChange={update('name')} onBlur={blur('name')} placeholder="Juan Dela Cruz" />
                  {errors.name && <small id="c-name-error" className="contact-field-error" role="alert">{errors.name}</small>}
                </div>
                <div className="contact-field">
                  <label htmlFor="c-email"><Mail size={15} /> E-mail address <span aria-hidden="true">*</span></label>
                  <input id="c-email" type="email" autoComplete="email" required aria-required="true" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'c-email-error' : undefined} value={form.email} onChange={update('email')} onBlur={blur('email')} placeholder="you@example.com" />
                  {errors.email && <small id="c-email-error" className="contact-field-error" role="alert">{errors.email}</small>}
                </div>
                <div className="contact-field">
                  <label htmlFor="c-category"><Building2 size={15} /> What do you need help with? <span aria-hidden="true">*</span></label>
                  <select id="c-category" required aria-required="true" aria-invalid={Boolean(errors.category)} aria-describedby={errors.category ? 'c-category-error' : undefined} value={form.category} onChange={update('category')} onBlur={blur('category')}>
                    <option value="">Select a category</option>
                    {CATEGORY_OPTIONS.map((option) => <option value={option} key={option}>{option}</option>)}
                  </select>
                  {errors.category && <small id="c-category-error" className="contact-field-error" role="alert">{errors.category}</small>}
                </div>
                <div className="contact-field">
                  <label htmlFor="c-subject"><Building2 size={15} /> Subject <span aria-hidden="true">*</span></label>
                  <input id="c-subject" type="text" required aria-required="true" aria-invalid={Boolean(errors.subject)} aria-describedby={errors.subject ? 'c-subject-error' : undefined} value={form.subject} onChange={update('subject')} onBlur={blur('subject')} placeholder="e.g. Inquiry about a business permit" />
                  {errors.subject && <small id="c-subject-error" className="contact-field-error" role="alert">{errors.subject}</small>}
                </div>
                <div className="contact-field">
                  <label htmlFor="c-message"><MessageSquare size={15} /> Message <span aria-hidden="true">*</span></label>
                  <textarea id="c-message" required aria-required="true" aria-invalid={Boolean(errors.message)} aria-describedby={errors.message ? 'c-message-help c-message-error' : 'c-message-help'} rows={5} value={form.message} onChange={update('message')} onBlur={blur('message')} placeholder="Write your message here..." />
                  <small id="c-message-help" className="contact-field-help">Please do not include passwords or sensitive financial information.</small>
                  {errors.message && <small id="c-message-error" className="contact-field-error" role="alert">{errors.message}</small>}
                </div>
                {captchaEnabled && <div className="contact-captcha contact-field"><div id="contact-recaptcha-widget" aria-label="Verification" />{errors.captcha && <small className="contact-field-error" role="alert">{errors.captcha}</small>}</div>}
                {submitError && <p className="contact-submit-error" role="alert" aria-live="assertive">{submitError}</p>}
                <button type="submit" className="contact-submit" disabled={sending}><Send size={16} /> {sending ? 'Sending…' : 'Send message'}</button>
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
