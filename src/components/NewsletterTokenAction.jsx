import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { securityFetch as fetch } from '../services/securityFetch.js'
import './NewsletterTokenAction.css'

export default function NewsletterTokenAction({ action }) {
  const { token = '' } = useParams()
  const isUnsubscribe = action === 'unsubscribe'
  const [state, setState] = useState({ status: 'loading', message: '' })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading', message: '' })
    fetch(`/api/newsletter/${isUnsubscribe ? 'unsubscribe' : 'confirm'}/${encodeURIComponent(token)}`, {
      method: 'GET', credentials: 'omit', cache: 'no-store', signal: controller.signal,
    }).then(async response => {
      const message = await response.text()
      if (!response.ok) throw new Error(message || 'This newsletter link could not be used.')
      setState({ status: 'success', message })
    }).catch(error => {
      if (!controller.signal.aborted) setState({ status: 'error', message: error.message || 'This newsletter link could not be used.' })
    })
    return () => controller.abort()
  }, [isUnsubscribe, token])

  const title = state.status === 'loading'
    ? (isUnsubscribe ? 'Updating your subscription' : 'Confirming your subscription')
    : state.status === 'success'
      ? (isUnsubscribe ? 'You’re unsubscribed' : 'Subscription confirmed')
      : (isUnsubscribe ? 'Unsubscribe link unavailable' : 'Confirmation link unavailable')

  return (
    <main id="main-content" className="newsletter-token-page">
      <section className="newsletter-token-panel" aria-labelledby="newsletter-token-title">
        <span className="newsletter-token-eyebrow">Municipality of Getafe</span>
        <h1 id="newsletter-token-title">{title}</h1>
        <p role="status" aria-live="polite">
          {state.status === 'loading'
            ? 'Please wait while we update your newsletter preferences.'
            : state.message}
        </p>
        {state.status !== 'loading' && <Link className="newsletter-token-home" to="/">Return to Getafe</Link>}
      </section>
    </main>
  )
}
