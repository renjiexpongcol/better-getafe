import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Eye, Globe2, Search, Smartphone } from 'lucide-react'
import { routeRequest } from '../services/routeRequests.js'
import { PageHeader } from './ui/Primitives'
import './WebsiteAnalytics.css'

const number = value => new Intl.NumberFormat('en-PH').format(Number(value) || 0)
const dateValue = value => value ? new Date(`${value}T00:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }) : ''
const actionNames = { browse_services_click: 'Browse Services clicks', report_concern_click: 'Report a Concern clicks', open_data_xlsx_request: 'Open Data XLSX download requests' }
const sourceNames = { direct_or_unknown: 'Direct or unknown', internal: 'Internal', search: 'Search engine', external: 'External' }
const serviceStageNames = { service_viewed: 'Service views', requirements_opened: 'Requirements viewed', service_form_download_clicked: 'Form download clicks', service_apply_clicked: 'Apply clicks' }
const latencyLabel = value => typeof value === 'string' ? value : `${number(value)} ms`

export default function WebsiteAnalytics() {
  const [range, setRange] = useState('7d')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [dailyPage, setDailyPage] = useState(0)
  const [activeView, setActiveView] = useState('overview')
  const [contentTypeFilter, setContentTypeFilter] = useState('all')
  const [publicationFrom, setPublicationFrom] = useState('')
  const [publicationTo, setPublicationTo] = useState('')
  const [navigationViewport, setNavigationViewport] = useState('all')
  const requestUrl = useMemo(() => {
    const params = new URLSearchParams({ range })
    if (range === 'custom') { if (from) params.set('from', from); if (to) params.set('to', to) }
    return `/api/admin/analytics/website?${params}`
  }, [range, from, to])
  useEffect(() => {
    if (range === 'custom' && (!from || !to)) { setLoading(false); return }
    let active = true
    setLoading(true); setError('')
    routeRequest(requestUrl, { scope: 'cms' }).then(value => { if (active) setReport(value) }).catch(reason => { if (active) setError(reason.message || 'Website analytics could not be loaded.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [range, requestUrl, from, to])

  const pages = report?.topPages || []
  const daily = report?.daily || []
  const pageSize = 10
  const pagedPages = pages.slice(page * pageSize, (page + 1) * pageSize)
  const maxDaily = Math.max(1, ...daily.map(row => row.pageViews))
  const totals = report?.totals || { pageViews: 0, typedSearches: 0, chipClicks: 0, typedZeroResults: 0, chipZeroResults: 0, unmatchedSearches: 0, zeroResults: 0, zeroResultRate: null, zeroResultDenominator: 0 }
  return <section className="website-analytics citizen-panel" aria-label="Website Analytics">
    <PageHeader title="Website Analytics" description="Eligible public activity recorded in daily aggregates. Analytics is on by default in production and visitors can opt out. No unique-visitor metric is collected." />
    <div className="website-analytics-toolbar">
      <label htmlFor="analytics-range">Reporting period</label>
      <select id="analytics-range" value={range} onChange={event => { setPage(0); setRange(event.target.value) }}>
        <option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="custom">Custom range</option>
      </select>
      {range === 'custom' && <div className="website-analytics-custom"><label>From <input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label>To <input type="date" value={to} onChange={event => setTo(event.target.value)} /></label></div>}
      <span>Dates use {report?.timezone || 'Asia/Manila'}.</span>
    </div>
    {!report && loading && <p role="status">Loading website analytics…</p>}
    {error && <p className="website-analytics-error" role="alert">{error}</p>}
    {report && <>
      {!report.enabled && <div className="website-analytics-disabled" role="status">Collection is off in this environment. Production collection defaults on unless the server kill switch is set to false. Reports show retained historical aggregates only.</div>}
      <div className="website-analytics-cards">
        <Metric icon={Eye} label="Page views" value={totals.pageViews} />
        <Metric icon={Search} label="Typed search submissions" value={totals.typedSearches} />
        <Metric icon={BarChart3} label="Popular-chip clicks" value={totals.chipClicks} />
        <Metric icon={Search} label="Typed zero-result submissions" value={totals.typedZeroResults} note={`${number(totals.unmatchedSearches)} unmatched typed searches; text is not retained`} />
        <Metric icon={Search} label="Chip zero-result searches" value={totals.chipZeroResults} />
        <Metric icon={Globe2} label="Search zero-result rate" value={totals.zeroResultRate === null ? 'No searches' : `${(totals.zeroResultRate * 100).toFixed(1)}%`} note={totals.zeroResultRate === null ? 'No eligible search activity in this period.' : `${number(totals.zeroResults)} of ${number(totals.zeroResultDenominator)} submitted searches and chip clicks`} />
      </div>
      <div className="website-analytics-tabs" role="group" aria-label="Analytics reports">
        {[['overview', 'Overview'], ['content', 'Content'], ['navigation', 'Navigation'], ['services', 'Service Journeys'], ['search', 'Search Engagement'], ['open-data', 'Open Data'], ['reliability', 'Reliability']].map(([id, title]) => <button type="button" aria-pressed={activeView === id} className={activeView === id ? 'active' : ''} key={id} onClick={() => setActiveView(id)}>{title}</button>)}
      </div>
      <p className="website-analytics-instrumentation">Content and navigation instrumentation available since {dateValue(report.contentNavigationStart) || 'the migration cutover'}.</p>
      {activeView === 'content' && <ContentReport rows={report.contentReach || []} services={report.highTrafficServices || []} announcements={report.announcements || []} typeFilter={contentTypeFilter} setTypeFilter={setContentTypeFilter} from={publicationFrom} setFrom={setPublicationFrom} to={publicationTo} setTo={setPublicationTo} />}
      {activeView === 'navigation' && <NavigationReport rows={report.navigation || []} viewport={navigationViewport} setViewport={setNavigationViewport} />}
      {activeView === 'services' && <section className="website-analytics-panel"><h2>Service Journeys</h2><p className="website-analytics-caption">Step transition counts by public service ID and viewport size. Stages are counted once per service per browser document; they are not unique residents or completed applications. Apply clicks record a CTA click only.</p><AnalyticsTable headers={['Service ID', 'Viewport', 'Stage', 'Transitions']} rows={(report.serviceJourneys || []).map(row => [row.serviceId, row.viewport, serviceStageNames[row.stage] || row.stage, number(row.transitions)])} empty="No eligible service journey activity recorded in this period." /></section>}
      {activeView === 'search' && <section className="website-analytics-panel"><h2>Search Engagement</h2><div className="website-analytics-cards website-analytics-search-metrics"><Metric icon={Search} label="Result clicks" value={report.searchEngagement?.resultClicks || 0} note="Distinct result per completed submission; repeated clicks are deduplicated."/><Metric icon={Search} label="Searches with a result click" value={report.searchEngagement?.searchesWithClick || 0} note={report.searchEngagement?.submissions ? `${number(report.searchEngagement.searchesWithClick)} of ${number(report.searchEngagement.submissions)} eligible completed submissions` : 'No eligible completed submissions in this period.'}/><Metric icon={Search} label="Search click-through rate" value={report.searchEngagement?.clickThroughRate == null ? 'No searches' : `${(report.searchEngagement.clickThroughRate * 100).toFixed(1)}%`} note={report.searchEngagement?.submissions ? `${number(report.searchEngagement.searchesWithClick)} / ${number(report.searchEngagement.submissions)} submissions` : 'No eligible completed submissions in this period.'}/><Metric icon={Search} label="Zero-result rate" value={totals.zeroResultRate == null ? 'No searches' : `${(totals.zeroResultRate * 100).toFixed(1)}%`} note={totals.zeroResultRate == null ? 'No eligible completed submissions in this period.' : `${number(totals.zeroResults)} / ${number(totals.zeroResultDenominator)} submissions and chip clicks`}/></div><h3>Submissions by approved topic</h3><AnalyticsTable headers={['Topic ID', 'Source', 'Completed searches', 'Searches with click']} rows={(report.searchEngagement?.byTopic || []).map(row => [row.topicRef === 'unmatched' ? 'Unmatched' : row.topicRef, row.source === 'chip' ? 'Popular chip' : 'Typed', number(row.submissions), number(row.searchesWithClick)])} empty="No compatible search engagement data collected since this report went live."/><h3>Result clicks by type and position</h3><AnalyticsTable headers={['Topic ID', 'Source', 'Result type', 'Position', 'Clicks']} rows={(report.searchEngagement?.clicksByResult || []).map(row => [row.topicRef === 'unmatched' ? 'Unmatched' : row.topicRef, row.source === 'chip' ? 'Popular chip' : 'Typed', row.resultType, row.positionBucket, number(row.clicks)])} empty="No attributed result clicks recorded in this period."/></section>}
      {activeView === 'open-data' && <OpenDataReport rows={report.openData || []} reliability={report.reliability || []} />}
      {activeView === 'reliability' && <section className="website-analytics-panel"><h2>Reliability</h2><p className="website-analytics-caption">Server-generated request counts, bounded failure categories, cache outcomes, and histogram bucket percentiles. Operational metrics are recorded independently of visitor Analytics preferences.</p><AnalyticsTable headers={['Operation', 'Dataset ID', 'Requests', 'Success', 'Failures', 'Success rate', 'Cache', 'Latency p50 / p95']} rows={(report.reliability || []).map(row => [row.operation, row.datasetId === 'none' ? '—' : row.datasetId, number(row.requests), number(row.successes), number(row.failures), row.successRate == null ? 'No requests' : `${(row.successRate * 100).toFixed(1)}%`, row.cache.length ? row.cache.map(item => `${item.status}: ${number(item.count)}`).join(', ') : 'No cache data', row.latencyP50BucketMs == null ? '—' : `${latencyLabel(row.latencyP50BucketMs)} / ${latencyLabel(row.latencyP95BucketMs)}`])} empty="No server operation data recorded in this period."/><h3>404 responses</h3><AnalyticsTable headers={['Route family', 'Referring section', 'Responses']} rows={(report.public404 || []).map(row => [row.routeFamily, row.referringSection, number(row.responses)])} empty="No public 404 responses recorded in this period."/><p className="website-analytics-caption">Failure categories: {(report.reliability || []).flatMap(row => row.failureCategories || []).reduce((map, item) => map.set(item.category, (map.get(item.category) || 0) + item.count), new Map()).size ? [...(report.reliability || []).flatMap(row => row.failureCategories || []).reduce((map, item) => map.set(item.category, (map.get(item.category) || 0) + item.count), new Map())].map(([category, count]) => `${category}: ${number(count)}`).join(' · ') : 'None recorded.'}</p></section>}
      {activeView === 'overview' && <div className="website-analytics-grid">
        <section className="website-analytics-panel" aria-labelledby="analytics-trend-title"><h2 id="analytics-trend-title">Daily page views</h2>{totals.pageViews ? <><ol className="website-analytics-trend">{daily.slice(dailyPage * 10, dailyPage * 10 + 10).map(row => <li key={row.date}><time>{dateValue(row.date)}</time><span className="website-analytics-bar"><i style={{ width: `${Math.max(2, row.pageViews / maxDaily * 100)}%` }} /></span><strong>{number(row.pageViews)}</strong></li>)}</ol>{daily.length > 10 && <div className="website-analytics-pagination"><button type="button" className="citizen-secondary" disabled={dailyPage === 0} onClick={() => setDailyPage(value => Math.max(0, value - 1))}>Previous</button><span>Page {dailyPage + 1} of {Math.ceil(daily.length / 10)}</span><button type="button" className="citizen-secondary" disabled={(dailyPage + 1) * 10 >= daily.length} onClick={() => setDailyPage(value => value + 1)}>Next</button></div>}</> : <p className="website-analytics-empty">No eligible page views recorded in this period.</p>}</section>
        <section className="website-analytics-panel" aria-labelledby="analytics-viewports-title"><h2 id="analytics-viewports-title"><Smartphone size={18}/> Viewport sizes</h2><p className="website-analytics-caption">Based on CSS viewport width, not device type: mobile ≤720px, tablet 721–1120px, desktop &gt;1120px.</p><Breakdown rows={report.viewports || []} keyName="viewport" valueName="pageViews" labels={{ mobile: 'Mobile', tablet: 'Tablet', desktop: 'Desktop', unknown: 'Unknown' }} /></section>
        <section className="website-analytics-panel" aria-labelledby="analytics-sources-title"><h2 id="analytics-sources-title">Entry sources</h2><Breakdown rows={report.entrySources || []} keyName="entrySource" valueName="pageViews" labels={sourceNames} empty="No eligible entry sources recorded." /></section>
        <section className="website-analytics-panel" aria-labelledby="analytics-actions-title"><h2 id="analytics-actions-title">Selected actions</h2><Breakdown rows={report.actions || []} keyName="action" valueName="actions" labels={actionNames} empty="No selected actions recorded." /></section>
      </div>}
      {activeView === 'overview' && <section className="website-analytics-panel website-analytics-pages" aria-labelledby="analytics-pages-title"><h2 id="analytics-pages-title">Top public pages</h2>{pages.length ? <><ol>{pagedPages.map(row => <li key={row.routeKey}><code>{row.routeKey}</code><strong>{number(row.pageViews)} page views</strong></li>)}</ol>{pages.length > pageSize && <div className="website-analytics-pagination"><button type="button" className="citizen-secondary" disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>Previous</button><span>Page {page + 1} of {Math.ceil(pages.length / pageSize)}</span><button type="button" className="citizen-secondary" disabled={(page + 1) * pageSize >= pages.length} onClick={() => setPage(value => value + 1)}>Next</button></div>}</> : <p className="website-analytics-empty">No eligible public page views recorded in this period.</p>}</section>}
      <p className="website-analytics-note">These reports include eligible activity recorded while Analytics collection is enabled. Visitors who opt out, blocked requests, and database failures are outside the totals. Counts represent page views, submissions, and action requests—not people. Search topics and popular searches use the same daily search rollups shown in Search Management.</p>
    </>}
  </section>
}

function Metric({ icon: Icon, label, value, note }) { return <article className="website-analytics-metric"><Icon size={19} aria-hidden="true"/><span>{label}</span><strong>{typeof value === 'number' ? number(value) : value}</strong>{note && <small>{note}</small>}</article> }
function Breakdown({ rows, keyName, valueName, labels, empty = 'No eligible activity recorded.' }) { return rows.length ? <ul className="website-analytics-breakdown">{rows.map(row => <li key={row[keyName]}><span>{labels[row[keyName]] || row[keyName]}</span><strong>{number(row[valueName])}</strong></li>)}</ul> : <p className="website-analytics-empty">{empty}</p> }

function AnalyticsTable({ headers, rows, empty }) {
  if (!rows.length) return <p className="website-analytics-empty">{empty}</p>
  return <div className="website-analytics-table-wrap"><table className="website-analytics-table"><thead><tr>{headers.map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
}

function ContentReport({ rows, services, announcements, typeFilter, setTypeFilter, from, setFrom, to, setTo }) {
  const publishedRows = rows.filter(row => (typeFilter === 'all' || row.contentType === typeFilter)
    && (!from || row.publishedDate && row.publishedDate >= from)
    && (!to || row.publishedDate && row.publishedDate <= to))
  return <section className="website-analytics-panel"><h2>Content Reach</h2><p className="website-analytics-caption">Views use published news and event IDs and public service IDs. First seven days are measured from publication; last 30 days are a separate rolling window. Publication-date filters apply to the content list.</p>
    <div className="website-analytics-report-filters"><label>Content type<select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="all">All content</option><option value="news">News</option><option value="announcement">Announcements</option><option value="event">Events</option><option value="meeting">Meetings</option><option value="service">Service pages</option></select></label><label>Published from<input type="date" value={from} onChange={event => setFrom(event.target.value)}/></label><label>Published to<input type="date" value={to} onChange={event => setTo(event.target.value)}/></label></div>
    <AnalyticsTable headers={['Type', 'Title / public ID', 'Publication date', 'First 7 days', 'Window status', 'Last 30 days', 'Last updated']} rows={publishedRows.map(row => [row.contentType, row.title || row.contentId, row.publishedDate || 'Not recorded', number(row.firstSevenDays), row.firstSevenDaysInProgress === null ? 'Publication date unavailable' : row.firstSevenDaysInProgress ? 'In progress' : 'Complete', number(row.last30Days), row.lastUpdated || 'Not recorded'])} empty="No published content with recorded views matches these filters."/>
    <h3>High-traffic service pages</h3><p className="website-analytics-caption">Review priority is based on 25 or more page views in the last 30 days. No review schedule metadata exists for these records, so the date shown is labeled Last updated and does not imply the page is inaccurate.</p><AnalyticsTable headers={['Service', 'Public ID', 'Last 30 days', 'Last updated']} rows={services.map(row => [row.title || row.contentId, row.contentId, number(row.last30Days), row.lastUpdated || 'Not recorded'])} empty="No service pages reached the recent-traffic review threshold."/>
    <h3>Important-announcement popup</h3><p className="website-analytics-caption">Opens and dismissals are deduplicated once per popup impression. Rates use impressions as the denominator.</p><AnalyticsTable headers={['Article', 'Public ID', 'Impressions', 'Opens', 'Open rate (opens / impressions)', 'Dismissals', 'Dismiss rate (dismissals / impressions)']} rows={announcements.map(row => [row.title, row.articleId, number(row.impressions), number(row.opens), row.openRate == null ? 'Unavailable (0 impressions)' : `${(row.openRate * 100).toFixed(1)}% (${number(row.opens)} / ${number(row.impressions)})`, number(row.dismissals), row.dismissRate == null ? 'Unavailable (0 impressions)' : `${(row.dismissRate * 100).toFixed(1)}% (${number(row.dismissals)} / ${number(row.impressions)})`])} empty="No eligible announcement popup impressions were recorded in this period."/>
  </section>
}

function NavigationReport({ rows, viewport, setViewport }) {
  const filtered = rows.filter(row => viewport === 'all' || row.viewport === viewport)
  return <section className="website-analytics-panel"><h2>Navigation effectiveness</h2><p className="website-analytics-caption">An impression is recorded when an approved placement becomes visible during a public page visit. Clicks are shown separately; CTR uses impressions with at least one attributed click divided by eligible impressions.</p>
    <div className="website-analytics-report-filters"><label>Viewport size<select value={viewport} onChange={event => setViewport(event.target.value)}><option value="all">All viewport sizes</option><option value="mobile">Mobile</option><option value="tablet">Tablet</option><option value="desktop">Desktop</option><option value="unknown">Unknown</option></select></label></div>
    <AnalyticsTable headers={['Placement', 'Destination', 'Public destination ID', 'Quick-link slot', 'Viewport', 'Eligible impressions', 'Impressions with click', 'Click-through rate', 'Total clicks']} rows={filtered.map(row => [row.placementKey, row.destinationTitle || row.destinationId, row.destinationId, row.slotPosition ? `Slot ${row.slotPosition}` : '-', row.viewport, number(row.impressions), number(row.impressionsWithClick), row.clickThroughRate == null ? 'Unavailable (0 impressions)' : `${(row.clickThroughRate * 100).toFixed(1)}% (${number(row.impressionsWithClick)} / ${number(row.impressions)})`, number(row.clicks)])} empty="No eligible navigation placement activity matches this viewport."/>
  </section>
}

function OpenDataReport({ rows, reliability }) {
  const byDataset = new Map()
  const dataset = id => {
    if (!byDataset.has(id)) byDataset.set(id, { id, views: 0, queryClicks: 0, csvClicks: 0, xlsxClicks: 0, queryRequests: 0, querySuccesses: 0, queryFailures: 0 })
    return byDataset.get(id)
  }
  for (const row of rows) {
    const item = dataset(row.datasetId)
    if (row.activity === 'dataset_view') item.views += row.events
    if (row.activity === 'query_request') item.queryClicks += row.events
    if (row.activity === 'csv_download_click') item.csvClicks += row.events
    if (row.activity === 'xlsx_download_click') item.xlsxClicks += row.events
  }
  for (const row of reliability.filter(item => item.operation === 'dataset_query' && item.datasetId !== 'unknown')) {
    const item = dataset(row.datasetId)
    item.queryRequests += row.requests
    item.querySuccesses += row.successes
    item.queryFailures += row.failures
  }
  const items = [...byDataset.values()].sort((a, b) => b.views - a.views || a.id.localeCompare(b.id))
  const queries = reliability.filter(item => item.operation === 'dataset_query')
  const failures = queries.reduce((total, row) => total + row.failures, 0)
  const successes = queries.reduce((total, row) => total + row.successes, 0)
  const requests = successes + failures
  return <section className="website-analytics-panel"><h2>Open Data usage</h2><p className="website-analytics-caption">Dataset views, explicit query requests, and browser generated download clicks by public dataset ID. Visitor interaction counts respect Analytics preferences; query reliability is recorded by the server independently. This portal currently generates CSV and XLSX files in the browser, so export totals are clicks, not confirmed file saves.</p><div className="website-analytics-cards"><Metric icon={Globe2} label="Server query requests" value={requests} note={`${number(successes)} successful, ${number(failures)} failed`}/><Metric icon={Search} label="Query success rate" value={requests ? `${(successes / requests * 100).toFixed(1)}%` : 'No queries'} note={requests ? `${number(successes)} / ${number(requests)} server query requests` : 'No server query requests in this period.'}/><Metric icon={BarChart3} label="Public interaction events" value={rows.reduce((sum, row) => sum + row.events, 0)} note="Includes views, explicit query requests, and CSV/XLSX download clicks."/></div><AnalyticsTable headers={['Dataset ID', 'Views', 'Query requests', 'Server queries', 'Successful', 'Failed', 'Query success', 'CSV clicks', 'XLSX clicks']} rows={items.map(item => [item.id, number(item.views), number(item.queryClicks), number(item.queryRequests), number(item.querySuccesses), number(item.queryFailures), item.queryRequests ? `${(item.querySuccesses / item.queryRequests * 100).toFixed(1)}%` : 'No server queries', number(item.csvClicks), number(item.xlsxClicks)])} empty="No Open Data usage recorded in this period."/><h3>Query failures by category</h3><AnalyticsTable headers={['Failure category', 'Dataset ID', 'Requests']} rows={queries.flatMap(row => row.failureCategories.map(category => [category.category, row.datasetId, number(category.count)]))} empty="No server query failures recorded in this period."/></section>
}
