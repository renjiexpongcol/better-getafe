import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Search as SearchIcon } from 'lucide-react'
import { Button } from '@getafe/ui'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { publicRoutes } from '../../routes'
import { publicApi } from '../../services/apiClient'
import { requestJson } from '../../services/apiTransport.js'
import { publicData, apiData, collection, label } from '../../services/publicDataApi.js'
import { makeSearchSubmission, resolveSearchTopic, searchResultsPath } from '../../services/siteSearch.js'
import { shouldRecordSearchSubmission, trackSearchResultClick } from '../../services/websiteAnalytics.js'

const pageKeywords = {
  '/info/about': 'municipality town local government profile',
  '/info/history': 'municipality town seal hymn heritage',
  '/officials': 'mayor vice mayor councilors elected government',
  '/contact': 'phone email address feedback concern report',
  '/departments': 'offices municipal hall staff government',
  '/services/directory': 'permits requirements offices directory',
  '/services/certificates': 'and ids certificates national id civil registry',
  '/services/hotlines': 'emergency police fire ambulance rescue',
  '/barangays': 'village communities captain local officials',
  '/news': 'updates announcements advisories notices',
  '/events': 'activities meetings calendar gallery',
  '/tourism': 'travel destinations visit attractions',
  '/discover': 'places attractions destinations community',
  '/weather': 'forecast rainfall typhoon storm',
  '/data': 'open statistics reports datasets',
  '/data/datasets': 'open statistics download',
  '/accessibility': 'assistive access inclusion',
  '/legal/privacy': 'personal information data protection',
  '/legal/terms': 'terms conditions',
}

const searchText = value => String(value || '').replace(/&/g, ' and ').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const matches = (query, value) => {
  const words = searchText(query).split(/\s+/).filter(Boolean)
  const text = searchText(value)
  return words.every(word => text.includes(word))
}
const records = value => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : []
const newsParams = (query, display) => new URLSearchParams({ search: query, display, public: 'true', page: '1', limit: '100' }).toString()

export default function Search() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const query = (params.get('q') || '').trim()
  const [draft, setDraft] = useState(query)
  const [suggestions, setSuggestions] = useState({ pinned: [], popular: [], terms: [] })
  const [suggestionsReady, setSuggestionsReady] = useState(false)
  const [suggestionsAvailable, setSuggestionsAvailable] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(Boolean(query))
  const [searchError, setSearchError] = useState('')
  const [retry, setRetry] = useState(0)
  const completedSubmissionIds = useRef(new Set())
  const completedSubmissionPromises = useRef(new Map())
  const submission = location.state?.searchSubmission || null

  useEffect(() => { setDraft(query) }, [query, location.key])
  useEffect(() => {
    let active = true
    publicApi('/search/suggestions', { persist: false })
      .then(value => { if (active) { setSuggestions({ pinned: value.pinned || [], popular: value.popular || [], terms: value.terms || [] }); setSuggestionsAvailable(true) } })
      .catch(() => { if (active) { setSuggestions({ pinned: [], popular: [], terms: [] }); setSuggestionsAvailable(false) } })
      .finally(() => { if (active) setSuggestionsReady(true) })
    return () => { active = false }
  }, [retry])

  const topic = useMemo(() => resolveSearchTopic(query, suggestions), [query, suggestions])
  const effectiveQuery = topic?.canonicalQuery || query

  useEffect(() => {
    if (!query) { setData(null); setLoading(false); return undefined }
    if (!suggestionsReady) { setData(null); setLoading(true); return undefined }
    let active = true
    setLoading(true)
    setSearchError('')
    setData(null)
    const requests = [
      publicApi('/services', { persist: false }),
      publicApi('/departments', { persist: false }),
      publicApi('/barangays', { persist: false }),
      publicApi(`/news?${newsParams(effectiveQuery, 'news')}`, { persist: false }),
      publicApi(`/news?${newsParams(effectiveQuery, 'events')}`, { persist: false }),
      publicData(`/datasets?${new URLSearchParams({ q: effectiveQuery, availability: 'all', sort: 'recommended', page: '1', pageSize: '100' })}`),
    ]
    Promise.allSettled(requests).then(results => {
      if (!active) return
      const [serviceResult, officeResult, barangayResult, newsResult, eventResult, datasetResult] = results
      const sourceSucceeded = suggestionsAvailable && results.every(result => result.status === 'fulfilled')
      setData({
        query,
        effectiveQuery,
        sourceSucceeded,
        services: serviceResult.status === 'fulfilled' ? records(serviceResult.value) : [],
        offices: officeResult.status === 'fulfilled' ? records(officeResult.value) : [],
        barangays: barangayResult.status === 'fulfilled' ? records(barangayResult.value) : [],
        news: newsResult.status === 'fulfilled' ? records(newsResult.value) : [],
        newsTotal: newsResult.status === 'fulfilled' ? Number(newsResult.value.total) || records(newsResult.value).length : 0,
        events: eventResult.status === 'fulfilled' ? records(eventResult.value) : [],
        eventsTotal: eventResult.status === 'fulfilled' ? Number(eventResult.value.total) || records(eventResult.value).length : 0,
        datasets: datasetResult.status === 'fulfilled' ? collection(apiData(datasetResult.value)) : [],
        datasetTotal: datasetResult.status === 'fulfilled' ? Number(apiData(datasetResult.value).total) || collection(apiData(datasetResult.value)).length : 0,
      })
      if (!sourceSucceeded) setSearchError(!suggestionsAvailable ? 'Search topics are temporarily unavailable, so aliases may not resolve and this search will not be counted.' : 'Some public listings could not be searched. Try again before relying on these results.')
      setLoading(false)
    })
    return () => { active = false }
  }, [effectiveQuery, query, suggestionsAvailable, suggestionsReady, retry])

  const pages = useMemo(() => publicRoutes
    .filter(route => route.path !== '/search')
    .map(route => ({
      title: route.title,
      href: route.path,
      category: route.folder === 'info' ? 'Information' : route.folder === 'services' ? 'Services' : route.folder === 'data' ? 'Open Data' : route.folder[0]?.toUpperCase() + route.folder.slice(1),
      searchable: `${route.title} ${route.path.replaceAll('/', ' ')} ${pageKeywords[route.path] || route.folder}`,
    }))
    .filter(page => matches(effectiveQuery, page.searchable)), [effectiveQuery])
  const serviceItems = (data?.services || []).filter(item => matches(effectiveQuery, `${item.name} ${item.short_description || ''} ${item.department_name || ''}`))
  const officeItems = (data?.offices || []).filter(item => matches(effectiveQuery, `${item.name} ${item.shortDescription || ''} ${item.slug || ''}`))
  const barangayItems = (data?.barangays || []).filter(item => matches(effectiveQuery, `${item.name} ${item.description || ''} ${item.slug || ''} ${item.captain || ''}`))
  const newsItems = (data?.news || []).filter(item => matches(effectiveQuery, `${item.title} ${item.excerpt || ''} ${item.content || ''}`))
  const eventItems = (data?.events || []).filter(item => matches(effectiveQuery, `${item.title} ${item.excerpt || ''} ${item.content || ''}`))
  const datasetItems = (data?.datasets || []).filter(item => matches(effectiveQuery, `${label(item)} ${item.description || ''} ${item.topic || ''} ${item.coverage || ''}`))
  const resultCount = pages.length + serviceItems.length + officeItems.length + barangayItems.length
    + Math.max(newsItems.length, data?.newsTotal || 0) + Math.max(eventItems.length, data?.eventsTotal || 0)
    + Math.max(datasetItems.length, data?.datasetTotal || 0)

  let resultPosition = 0
  const pageResults = pages.map(item => ({ item, position: ++resultPosition }))
  const indexedResults = (items, type, keyOf) => items.slice(0, 30).map(item => ({ item, type, resultId: String(keyOf(item) || ''), position: ++resultPosition }))
  const serviceResults = indexedResults(serviceItems, 'service', item => item.id || item.slug)
  const officeResults = indexedResults(officeItems, 'office', item => item.id || item.slug)
  const barangayResults = indexedResults(barangayItems, 'barangay', item => item.id || item.slug)
  const newsResults = indexedResults(newsItems, 'news', item => item.id || item.slug)
  const eventResults = indexedResults(eventItems, 'event', item => item.id || item.slug)
  const datasetResults = indexedResults(datasetItems, 'dataset', item => item.id || item.dataset_id || item.code)
  const recordResultClick = (resultType, resultId, position) => () => {
    if (!submission?.submissionId || !shouldRecordSearchSubmission()) return
    const completion = completedSubmissionPromises.current.get(submission.submissionId)
    if (!completion) return
    void completion.then(accepted => {
      if (accepted) trackSearchResultClick({
        submissionId: submission.submissionId,
        topicId: submission.topicId || topic?.topicId || null,
        source: submission.source === 'chip' ? 'chip' : 'typed',
        resultType,
        resultId,
        positionBucket: position === 1 ? '1' : position <= 3 ? '2-3' : position <= 10 ? '4-10' : '11+',
      })
    })
  }

  useEffect(() => {
    if (!submission?.submissionId || !shouldRecordSearchSubmission() || !data?.sourceSucceeded || loading || !suggestionsReady || searchError) return
    if (completedSubmissionIds.current.has(submission.submissionId)) return
    completedSubmissionIds.current.add(submission.submissionId)
    const completion = requestJson('/api/search/complete', {
      method: 'POST',
      body: JSON.stringify({
        submissionId: submission.submissionId,
        topicId: submission.topicId || topic?.topicId || null,
        source: submission.source === 'chip' ? 'chip' : 'typed',
        zeroResults: resultCount === 0,
      }),
    }).then(() => true).catch(() => false)
    completedSubmissionPromises.current.set(submission.submissionId, completion)
  }, [data, loading, resultCount, searchError, submission, suggestionsReady, topic])

  const submitSearch = event => {
    event.preventDefault()
    const value = draft.trim().replace(/\s+/g, ' ')
    if (!value) return
    const resolved = makeSearchSubmission(value, suggestions, 'typed')
    navigate(searchResultsPath(resolved.query), { state: { searchSubmission: resolved.submission } })
  }

  const destinations = [
    { title: 'Services & offices', href: '/services/directory' },
    { title: 'Barangays', href: '/barangays' },
    { title: 'News & Updates', href: '/news' },
    { title: 'Events & Meetings', href: '/events' },
    { title: 'Open Data', href: '/data/datasets' },
  ]
  const searchPending = loading || !suggestionsReady || data?.query !== query || data?.effectiveQuery !== effectiveQuery
  const showNoResults = !searchPending && data?.sourceSucceeded && resultCount === 0

  return <main className="service-directory-page site-search-page">
    <div className="page-header"><div className="container page-header-inner"><div><h1 className="page-title">Search the website</h1><p className="page-subtitle">Find public pages, municipal services, barangays, news, events, and open data.</p></div></div></div>
    <section className="service-directory-content section"><div className="container">
      <form className={`service-directory-toolbar site-search-toolbar${query ? ' has-query' : ''}`} role="search" onSubmit={submitSearch}>
        <label className="sr-only" htmlFor="site-search-query">Search all public pages and content</label>
        <span className="service-directory-search-field site-search-bar"><SearchIcon size={18} aria-hidden="true"/><input id="site-search-query" type="search" name="query" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Try barangay, business permit, news, or tourism"/><Button type="submit" variant="primary">Search <ArrowRight size={16} aria-hidden="true"/></Button></span>
        {query && <Button type="button" variant="outline" size="small" className="service-directory-clear" onClick={() => navigate('/search')}>Clear search</Button>}
      </form>
      <hr className="site-search-divider" aria-hidden="true" />
      {!query ? <div className="service-directory-empty"><h2>What are you looking for?</h2><p>Search page names, services, permits, offices, barangay profiles, news, events, and public datasets.</p></div> : <>
        <p className="service-directory-result-count" role="status">{searchPending ? 'Searching public pages and listings…' : `${resultCount} ${resultCount === 1 ? 'result' : 'results'} for “${query}”`}</p>
        {searchError && <p className="search-results-warning" role="status">{searchError} <button type="button" onClick={() => { setSuggestionsReady(false); setRetry(value => value + 1) }}>Retry search</button></p>}
        {pages.length > 0 && <section aria-labelledby="site-search-pages"><h2 id="site-search-pages">Website pages</h2><div className="service-directory-grid">{pageResults.map(({ item: page, position }) => <article className="service-directory-card" key={page.href}><p className="service-directory-label">{page.category}</p><h2>{page.title}</h2><p>Open this public section of the Getafe website.</p><Link to={page.href} onClick={recordResultClick('page', page.href.replace(/^\//, '') || 'home', position)} className="service-directory-link">View page <ArrowRight size={16} aria-hidden="true"/></Link></article>)}</div></section>}
        {serviceItems.length > 0 && <ResultSection title="Services" items={serviceResults} render={({ item, position, resultId }) => <ResultCard key={resultId} category="Municipal service" title={item.name} description={item.short_description || item.department_name || 'Municipal service information.'} href={`/services/e-services/${encodeURIComponent(item.slug)}`} action="View service" onClick={recordResultClick('service', resultId, position)}/>}/>}
        {officeItems.length > 0 && <ResultSection title="Offices" items={officeResults} render={({ item, position, resultId }) => <ResultCard key={resultId} category="Municipal office" title={item.name} description={item.shortDescription || 'Office information and contact details.'} href={`/departments/${encodeURIComponent(item.slug)}`} action="View office" onClick={recordResultClick('office', resultId, position)}/>}/>}
        {barangayItems.length > 0 && <ResultSection title="Barangays" items={barangayResults} render={({ item, position, resultId }) => <ResultCard key={resultId} category="Barangay profile" title={item.name} description={item.description || item.more_information || 'Barangay information and local services.'} href={`/barangays/${encodeURIComponent(item.slug || item.id)}`} action="View barangay" onClick={recordResultClick('barangay', resultId, position)}/>}/>}
        {newsItems.length > 0 && <ResultSection title="News & Updates" items={newsResults} render={({ item, position, resultId }) => <ResultCard key={resultId} category="News & Updates" title={item.title} description={item.excerpt || ''} href={`/news/${encodeURIComponent(item.slug)}`} action="Read update" onClick={recordResultClick('news', resultId, position)}/>}/>}
        {eventItems.length > 0 && <ResultSection title="Events & Meetings" items={eventResults} render={({ item, position, resultId }) => <ResultCard key={resultId} category="Event or meeting" title={item.title} description={item.excerpt || ''} href={`/events/${encodeURIComponent(item.slug)}`} action="View event" onClick={recordResultClick('event', resultId, position)}/>}/>}
        {datasetItems.length > 0 && <ResultSection title="Open Data" items={datasetResults} render={({ item, position, resultId }) => <ResultCard key={resultId || label(item)} category="Public dataset" title={label(item)} description={item.description || item.topic || ''} href={resultId ? `/data/datasets/${encodeURIComponent(resultId)}` : '/data/datasets'} action="View dataset" onClick={recordResultClick('dataset', resultId, position)}/>}/>}
        {showNoResults && (
          <section className="service-directory-empty search-empty-results" aria-labelledby="site-search-empty-title">
            <h2 id="site-search-empty-title">No results found</h2>
            <p>Check your spelling, try fewer words, or browse a section below.</p>
            <nav aria-label="Suggested public destinations">
              {destinations.map(({ href, title }) => (
                <Link className="service-directory-link" key={href} to={href}>
                  {title} <ArrowRight size={16} aria-hidden="true" />
                </Link>
              ))}
            </nav>
          </section>
        )}
      </>}
    </div></section>
  </main>
}

function ResultSection({ title, items, render }) {
  return <section className="service-directory-offices" aria-label={title}><h2>{title}</h2><div className="service-directory-grid">{items.slice(0, 30).map(render)}</div></section>
}

function ResultCard({ category, title, description, href, action, onClick }) {
  return <article className="service-directory-card"><p className="service-directory-label">{category}</p><h2>{title}</h2><p>{description}</p><Link to={href} onClick={onClick} className="service-directory-link">{action} <ArrowRight size={16} aria-hidden="true"/></Link></article>
}
