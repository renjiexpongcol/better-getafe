import { useDataRevision } from '../hooks/usePublicResource'
import { ArrowRight, Info, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { publicApi } from '../services/apiClient'
import { makeSearchSubmission, searchResultsPath } from '../services/siteSearch'
import { navigationDestinationId, trackPublicAction } from '../services/websiteAnalytics'

const HERO_SUBTITLES = [
  'Find municipal services, permits, and offices.',
  'Explore local services, programs, and community updates.',
  'Stay informed about Getafe news, events, and notices.',
]
const HERO_ACCESSIBLE_SUBTITLE = HERO_SUBTITLES.join(' ')
const prefersReducedMotion = () => typeof window !== 'undefined'
  && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)

export default function Hero() {
  const dataRevision = useDataRevision()
  const navigate = useNavigate()
  const [searchSuggestions, setSearchSuggestions] = useState({ pinned: [], popular: [], terms: [] })
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion)
  const [typedSubtitle, setTypedSubtitle] = useState(() => prefersReducedMotion() ? HERO_SUBTITLES[0] : '')
  const timer = useRef(null)

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = event => setReducedMotion(event.matches)
    motionPreference.addEventListener?.('change', updatePreference)
    return () => motionPreference.removeEventListener?.('change', updatePreference)
  }, [])

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    if (reducedMotion) {
      setTypedSubtitle(HERO_SUBTITLES[0])
      return undefined
    }

    let phraseIndex = 0
    let characterIndex = 0
    let erasing = false
    setTypedSubtitle('')
    const animate = () => {
      const phrase = HERO_SUBTITLES[phraseIndex]
      if (erasing) {
        characterIndex = Math.max(0, characterIndex - 1)
      } else {
        characterIndex = Math.min(phrase.length, characterIndex + 1)
      }
      setTypedSubtitle(phrase.slice(0, characterIndex))

      if (!erasing && characterIndex === phrase.length) {
        timer.current = window.setTimeout(() => { erasing = true; animate() }, 2000)
      } else if (erasing && characterIndex === 0) {
        timer.current = window.setTimeout(() => {
          phraseIndex = (phraseIndex + 1) % HERO_SUBTITLES.length
          erasing = false
          animate()
        }, 500)
      } else {
        timer.current = window.setTimeout(animate, erasing ? 24 : 36)
      }
    }
    timer.current = window.setTimeout(animate, 36)

    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [reducedMotion])

  useEffect(() => {
    let active = true
    publicApi('/search/suggestions', { persist: false })
      .then(value => {
        const pinned = Array.isArray(value?.pinned) ? value.pinned : []
        const pinnedIds = new Set(pinned.map(topic => topic.id))
        const popular = (Array.isArray(value?.popular) ? value.popular : []).filter(topic => !pinnedIds.has(topic.id)).slice(0, 5)
        if (active) setSearchSuggestions({ pinned, popular, terms: Array.isArray(value?.terms) ? value.terms : [] })
      })
      .catch(() => {})
    return () => { active = false }
  }, [dataRevision])

  const searchWebsite = (event) => {
    event.preventDefault()
    const query = new FormData(event.currentTarget).get('query')?.toString().trim() || ''
    if (!query) return
    const search = makeSearchSubmission(query, searchSuggestions, 'typed')
    navigate(searchResultsPath(search.query), { state: { searchSubmission: search.submission } })
  }

  const searchTopic = topic => {
    const search = makeSearchSubmission(topic.canonicalQuery, searchSuggestions, 'chip')
    navigate(searchResultsPath(search.query), { state: { searchSubmission: { ...search.submission, topicId: topic.id } } })
  }

  const quickLinks = searchSuggestions.pinned.slice(0, 3)

  return (
    <>
      <section className="hero" aria-labelledby="home-hero-title">
        <div className="container hero-grid">
          <div className="hero-copy">
            <h1 id="home-hero-title">Welcome to Getafe</h1>
            <p className="hero-text hero-subtitle">
              <span className="hero-typewriter-visual" aria-hidden="true">
                {typedSubtitle}
                {!reducedMotion && <span className="hero-typewriter-cursor" />}
              </span>
              <span className="sr-only">{HERO_ACCESSIBLE_SUBTITLE}</span>
            </p>
            <div className="hero-service-finder">
              <form className="service-finder-search" aria-label="Search the Getafe website" onSubmit={searchWebsite}>
                <Search size={20} aria-hidden="true" />
                <label className="sr-only" htmlFor="hero-service-search">Search pages, services, news, and offices</label>
                <input id="hero-service-search" name="query" type="search" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} placeholder="Search pages, services, news, and offices" />
                <button type="submit">Search <ArrowRight size={16} aria-hidden="true" /></button>
              </form>
              {quickLinks.length > 0 && (
                <nav className="service-finder-popular service-finder-quick-links" aria-label="Quick links">
                  <span>Quick links:</span>
                  {quickLinks.map((topic, index) => (
                    <div className="service-finder-quick-link" key={topic.id}>
                      {index > 0 && <span aria-hidden="true">·</span>}
                      <Link
                        to={searchResultsPath(topic.canonicalQuery)}
                        data-analytics-placement="home.quick-links"
                        data-analytics-destination={`topic:${topic.id}`}
                        data-analytics-position={index + 1}
                        onClick={event => {
                          if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return
                          event.preventDefault()
                          searchTopic(topic)
                        }}
                      >
                        {topic.label}
                      </Link>
                    </div>
                  ))}
                </nav>
              )}
              {searchSuggestions.popular.length > 0 && <nav className="service-finder-popular" aria-label="Popular searches"><span>Popular searches:</span>{searchSuggestions.popular.map(topic => <button type="button" className="service-finder-chip" onClick={() => searchTopic(topic)} key={topic.id}>{topic.label}</button>)}</nav>}
            </div>
            <div className="hero-cta-row">
              <Link className="hero-cta hero-cta-primary" to="/services/directory" data-analytics-placement="home.hero-cta" data-analytics-destination={navigationDestinationId('/services/directory')} onClick={() => trackPublicAction('browse_services_click')}>Browse services <ArrowRight size={17} aria-hidden="true" /></Link>
              <Link className="hero-cta hero-cta-secondary" to="/contact" data-analytics-placement="home.hero-cta" data-analytics-destination="/contact" onClick={() => trackPublicAction('report_concern_click')}><Info size={17} aria-hidden="true" /> Report a Concern</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
