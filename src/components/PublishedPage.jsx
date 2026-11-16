import { Link, useLocation } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { usePublicConfig } from '../context/PublicConfig'
import { usePublishedContent } from '../hooks/usePublicResource'
import { EmptyState, ErrorState, LoadingState } from './ui/Primitives'
import ServicePageLayout from './ServicePageLayout'
import { trackServiceJourneyStep, trackContentView } from '../services/websiteAnalytics.js'

const SERVICE_PAGE_LINKS = {
  'page-certificates': [
    { label: 'Civil Registry Office', to: '/departments/civil-registry' },
    { label: 'Service directory', to: '/services/directory' },
  ],
  'page-health': [
    { label: 'Municipal Health Office', to: '/departments/health' },
    { label: 'Service directory', to: '/services/directory' },
  ],
  'page-education': [
    { label: 'Social Welfare Office', to: '/departments/social-welfare' },
    { label: 'Service directory', to: '/services/directory' },
  ],
  'page-barangay-clearance': [
    { label: 'Barangay directory', to: '/barangays' },
    { label: 'Municipal services', to: '/services' },
  ],
}

export default function PublishedPage({ contentKey, title, legalKey }) {
  const analyticsRoot = useRef(null)
  const resource = usePublishedContent(contentKey)
  const location = useLocation()
  const settings = usePublicConfig()
  const content = resource.content
  const legal = legalKey && settings[legalKey]
  const serviceLinks = SERVICE_PAGE_LINKS[contentKey] || []
  const analyticsServiceId = contentKey === 'page-barangay-clearance' ? 'barangay-clearance' : ''
  useEffect(() => {
    if (!content || content.service || !SERVICE_PAGE_LINKS[contentKey]) return
    trackContentView(contentKey, 'service', location.key)
  }, [content, contentKey, location.key])
  useEffect(() => {
    if (!analyticsServiceId) return undefined
    trackServiceJourneyStep(analyticsServiceId, 'service_viewed')
    const root = analyticsRoot.current
    if (!root || resource.loading) return undefined
    const sections = [...root.querySelectorAll('section, article, .published-content')]
    const target = sections.find(section => /requirements|instructions|how to apply/i.test(section.textContent || ''))
    if (!target) return undefined
    if (!('IntersectionObserver' in window)) { trackServiceJourneyStep(analyticsServiceId, 'requirements_opened'); return undefined }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { trackServiceJourneyStep(analyticsServiceId, 'requirements_opened'); observer.disconnect() }
    }, { threshold: 0.25 })
    observer.observe(target)
    return () => observer.disconnect()
  }, [analyticsServiceId, resource.loading, content])
  if (!resource.loading && !resource.error && content?.service) return <ServicePageLayout {...content.service} analyticsServiceId={analyticsServiceId} services={content.service.services || []} steps={content.service.steps || []} office={content.service.office || {}} contact={content.service.contact || {}} />
  const trackServiceLink = event => {
    if (!analyticsServiceId) return
    const link = event.target.closest?.('a[href]')
    if (!link) return
    const href = link.getAttribute('href') || ''
    if (link.hasAttribute('download') || /\.(?:pdf|docx?|xlsx?)$/i.test(href.split(/[?#]/, 1)[0])) trackServiceJourneyStep(analyticsServiceId, 'service_form_download_clicked')
    else if (/\/app\/(?:services|e-requests)|\bapply\b|application/i.test(`${href} ${link.textContent || ''}`)) trackServiceJourneyStep(analyticsServiceId, 'service_apply_clicked')
  }
  return (
    <main ref={analyticsRoot} onClickCapture={trackServiceLink} className="published-page">
      <div className="page-header">
        <div className="container page-header-inner">
          <div>
            <h1 className="page-title">{content?.title || title}</h1>
            {content?.subtitle && <p className="page-subtitle">{content.subtitle}</p>}
          </div>
        </div>
      </div>
      <div className={`content-page container${!resource.loading && !resource.error && !content && !legal ? ' content-page--empty' : ''}`}>
        {resource.loading ? <LoadingState label="Loading published information…" />
          : resource.error ? <ErrorState message={resource.error} onRetry={resource.reload} />
            : content ? <article>
              {content.body && <div className="published-content" dangerouslySetInnerHTML={{ __html: content.body }} />}
              {(content.sections || []).map((section, index) => (
                <section className="legal-section" key={section.id || index}>
                  <h2>{section.title}</h2>
                  <div className="published-content" dangerouslySetInnerHTML={{ __html: section.body || '' }} />
                </section>
              ))}
            </article>
              : legal ? <article>{String(legal).split(/\r?\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</article>
                : <EmptyState
                  title={serviceLinks.length ? 'Find current services' : 'Information is not available yet'}
                  description={serviceLinks.length
                    ? 'This page’s detailed guidance has not been published. Use these current municipal directories to find available services and the responsible office.'
                    : 'This information has not been published on the portal yet. Contact the municipality for assistance.'}
                  action={(
                    <div className="published-page-actions">
                      {serviceLinks.map(link => <Link className="ui-button ui-button--outline" to={link.to} key={link.to}>{link.label}</Link>)}
                      <Link className="ui-button ui-button--outline" to="/contact">Contact the municipality</Link>
                    </div>
                  )}
                />}
      </div>
    </main>
  )
}
