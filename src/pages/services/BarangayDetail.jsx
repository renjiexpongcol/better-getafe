import { useDataRevision } from '../../hooks/usePublicResource'
import { useEffect, useState } from 'react'
import { ArrowRight, MapPin } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import OpenStreetMap from '../../components/OpenStreetMap'
import BarangayRelatedSection from '../../components/BarangayRelatedSection'
import ModalDialog from '../../components/ModalDialog'
import { ErrorPage, ResourceNotFound } from '../../components/RouteStatusPages'
import { publicApi } from '../../services/apiClient'
import { securityFetch } from '../../services/securityFetch.js'
import { usePublicConfig } from '../../context/PublicConfig'

const externalUrl = value => {
  if (typeof value !== 'string') return ''
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '' } catch { return '' }
}

export default function BarangayDetail() {
  const settings = usePublicConfig() || {}
  const captchaEnabled = settings['security.contactCaptcha'] === true && Boolean(settings['security.recaptchaSiteKey'])
  const captchaV3 = settings['security.recaptchaVersion'] === 'v3'
  const captchaEnterprise = settings['security.recaptchaProvider'] === 'google-enterprise'
  const dataRevision = useDataRevision()
  const { id } = useParams()
  const [barangay, setBarangay] = useState(null)
  const [loadState, setLoadState] = useState('loading')
  const [reportOpen, setReportOpen] = useState(false)
  const [reportSending, setReportSending] = useState(false)
  const [reportNotice, setReportNotice] = useState('')
  const [reportError, setReportError] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const [imageSlide, setImageSlide] = useState(0)
  const [imageUnavailable, setImageUnavailable] = useState(false)
  const [reportForm, setReportForm] = useState({ name: '', email: '', field: 'Postal code', currentValue: '', correctedValue: '', details: '' })
  useEffect(() => {
    let active = true
    const localRecord = null
    setBarangay(localRecord)
    setLoadState(localRecord ? 'ready' : 'loading')
    publicApi('/barangays')
      .then((items) => {
        const record = items.find((item) => item.id === id || item.slug === id)
        if (!active) return
        setBarangay(record || localRecord)
        setLoadState(record || localRecord ? 'ready' : 'not-found')
      })
      .catch(() => { if (active) setLoadState(localRecord ? 'ready' : 'error') })
    return () => { active = false }
  }, [id, dataRevision])
  useEffect(() => {
    if (!captchaEnabled || !reportOpen) return undefined
    setCaptchaToken('')
    let script = document.querySelector('script[data-recaptcha]')
    if (!script) {
      script = document.createElement('script')
      script.src = captchaEnterprise ? `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(settings['security.recaptchaSiteKey'])}` : captchaV3 ? `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(settings['security.recaptchaSiteKey'])}` : 'https://www.google.com/recaptcha/api.js?render=explicit'
      script.async = true; script.defer = true; script.dataset.recaptcha = 'true'
      script.dataset.recaptchaVersion = captchaV3 ? 'v3' : 'v2'
      script.dataset.recaptchaProvider = captchaEnterprise ? 'google-enterprise' : 'google-standard'
      document.head.appendChild(script)
    }
    const render = () => {
      const node = document.getElementById('barangay-data-report-recaptcha')
      const api = captchaEnterprise ? window.grecaptcha?.enterprise : window.grecaptcha
      if (!captchaV3 && api && node && !node.dataset.rendered) {
        api.render(node, { sitekey: settings['security.recaptchaSiteKey'], callback: setCaptchaToken, 'expired-callback': () => setCaptchaToken(''), 'error-callback': () => setCaptchaToken('') })
        node.dataset.rendered = 'true'
      }
    }
    script.addEventListener('load', render)
    const timer = window.setInterval(render, 250)
    return () => { script.removeEventListener('load', render); window.clearInterval(timer) }
  }, [captchaEnabled, captchaV3, captchaEnterprise, reportOpen, settings['security.recaptchaSiteKey']])
  useEffect(() => { setImageSlide(0); setImageUnavailable(false) }, [id])
  if (loadState === 'loading') return <main className="section"><div className="container"><p role="status">Loading barangay information…</p></div></main>
  if (loadState === 'error') return <ErrorPage code="503" title="Barangay information is temporarily unavailable" message="Please try again later." secondaryAction={{ label: 'Browse Barangays', to: '/barangays' }} />
  if (!barangay) return <ResourceNotFound type="barangay" />
  const formatDate = (date) => date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : null
  const research = barangay.researchData || {}
  const administrative = research.administrative || {}
  const sourceCoordinates = research?.philAtlas?.coordinates || barangay.coords
  const map = sourceCoordinates && `https://www.openstreetmap.org/?mlat=${sourceCoordinates.lat}&mlon=${sourceCoordinates.lng}#map=15/${sourceCoordinates.lat}/${sourceCoordinates.lng}`
  const psgcPopulation2024 = research?.psgcData?.populationData?.find(row => Number(row.year) === 2024)?.population
  const currentPopulation = research?.population2024 ?? barangay.population ?? psgcPopulation2024
  const reportCurrentValue = reportForm.field === 'Postal code' ? '6334' : String(reportForm.field === 'Population' ? currentPopulation ?? '' : reportForm.field === 'Punong Barangay' ? barangay.captain || '' : '')
  const submitDataReport = async (event) => {
    event.preventDefault()
    if (captchaEnabled && !captchaV3 && !captchaToken) { setReportError('Please complete the verification and try again.'); return }
    setReportSending(true); setReportError(''); setReportNotice('')
    try {
      let token = captchaToken
      if (captchaEnabled && captchaV3) token = await new Promise((resolve, reject) => { const api = captchaEnterprise ? window.grecaptcha?.enterprise : window.grecaptcha; if (!api) return reject(new Error('Verification is loading. Please try again.')); api.ready(() => api.execute(settings['security.recaptchaSiteKey'], { action: 'contact' }).then(resolve, reject)) })
      const response = await securityFetch('/api/contact/data-correction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: reportForm.name, email: reportForm.email, barangay: barangay.name, field: reportForm.field, currentValue: reportCurrentValue, correctedValue: reportForm.correctedValue, details: reportForm.details, pageUrl: window.location.href, captchaToken: token }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 429) throw new Error('Too many reports were sent recently. Please wait a while and try again.')
        if ([400, 422].includes(response.status) && ['Please complete the verification and try again.', 'Complete your name, valid email, barangay, and the corrected information.'].includes(data.error)) throw new Error(data.error)
        throw new Error('We couldn’t send your report right now. Please try again later.')
      }
      setReportNotice(`Report sent. Reference: ${data.referenceNumber}`)
      setReportForm(current => ({ ...current, correctedValue: '', details: '' }))
    } catch (error) {
      const safeMessages = ['Too many reports were sent recently. Please wait a while and try again.', 'Please complete the verification and try again.', 'Complete your name, valid email, barangay, and the corrected information.', 'Verification is loading. Please try again.']
      setReportError(safeMessages.includes(error.message) ? error.message : 'We couldn’t send your report right now. Please try again later.')
    }
    finally { setReportSending(false) }
  }
  const sourceLinks = (Array.isArray(research.sources) ? research.sources : []).filter(source => {
    try { return ['https:', 'http:'].includes(new URL(source.url).protocol) } catch { return false }
  })
  const imageSlides = [
    ...(Array.isArray(research.images) ? research.images : []).map(image => ({
      url: externalUrl(image?.url),
      alt: String(image?.alt || `Barangay ${barangay.name}`).slice(0, 255),
      caption: String(image?.caption || '').slice(0, 500),
      sourceLabel: String(image?.sourceLabel || image?.source || '').slice(0, 160),
      sourceUrl: externalUrl(image?.sourceUrl),
    })).filter(image => image.url),
    ...(externalUrl(barangay.cover_image) && !(Array.isArray(research.images) ? research.images : []).some(image => externalUrl(image?.url) === externalUrl(barangay.cover_image)) ? [{ url: externalUrl(barangay.cover_image), alt: barangay.cover_image_alt || `Barangay ${barangay.name}`, caption: barangay.cover_image_alt || '', sourceLabel: '', sourceUrl: '' }] : []),
  ]
  const activeImageSlide = imageSlides.length ? imageSlide % imageSlides.length : 0
  return (
    <main className="barangay-detail">
      <section className="page-header barangay-hero barangay-detail-header">
        <div className="container page-header-inner">
          <div className="barangay-hero-content">
            <p className="barangay-hero-eyebrow">MUNICIPALITY OF GETAFE · BOHOL</p>
            <h1 className="page-title">Barangay {barangay.name}</h1>
            <p className="page-subtitle">Barangay information and community profile.</p>
          </div>
        </div>
      </section>

      <div className="container barangay-detail-content">
        <article className="barangay-detail-card" aria-labelledby="barangay-article-title">
          <h2 id="barangay-article-title">Overview</h2>
          <p>{barangay.description?.trim() || `Barangay ${barangay.name} is a local community in the Municipality of Getafe, Bohol, Philippines.`}{research.classification ? ` The PSA classifies it as ${research.classification.toLowerCase()}.` : ''}</p>
          {imageSlides.length > 0 && <figure className="barangay-overview-gallery" aria-label={`Barangay ${barangay.name} photo gallery`}>
            {!imageUnavailable ? <img src={imageSlides[activeImageSlide].url} alt={imageSlides[activeImageSlide].alt} loading="lazy" onError={() => setImageUnavailable(true)} /> : <div className="barangay-overview-gallery-unavailable">This image is unavailable.</div>}
            {(imageSlides[activeImageSlide].caption || imageSlides[activeImageSlide].sourceUrl) && <figcaption>{imageSlides[activeImageSlide].caption}{imageSlides[activeImageSlide].sourceUrl && <span>{imageSlides[activeImageSlide].caption ? ' · ' : ''}Photo: <a href={imageSlides[activeImageSlide].sourceUrl} target="_blank" rel="noreferrer">{imageSlides[activeImageSlide].sourceLabel || 'View source'}</a></span>}</figcaption>}
            {imageSlides.length > 1 && <div className="barangay-overview-gallery-controls"><button type="button" aria-label="Previous photo" onClick={() => { setImageSlide((activeImageSlide + imageSlides.length - 1) % imageSlides.length); setImageUnavailable(false) }}>‹</button><span>{activeImageSlide + 1} / {imageSlides.length}</span><button type="button" aria-label="Next photo" onClick={() => { setImageSlide((activeImageSlide + 1) % imageSlides.length); setImageUnavailable(false) }}>›</button></div>}
          </figure>}
          <section id="barangay-context" className="barangay-research-section" aria-labelledby="barangay-context-title">
            <h2 id="barangay-context-title">Municipal context</h2>
            <p>{research.municipalContext || `Barangay ${barangay.name} is one of the 24 barangays that make up the Municipality of Getafe. Municipal services and community programs are coordinated through the local government.`}</p>
          </section>
          {research?.philAtlas && <>
            <section className="barangay-research-section barangay-demographics" aria-labelledby="barangay-demographics-title">
              <h2 id="barangay-demographics-title">Demographics</h2>
              <p>{research.philAtlas.demographicsSummary || `The population figures below are historical census records for Barangay ${barangay.name}. The latest available count is shown in the facts panel.`}</p>
              <div className="barangay-table-wrap"><table><caption>Population history · PhilAtlas, citing census records</caption><thead><tr><th scope="col">Census year</th><th scope="col">Population</th><th scope="col">Change from previous listed count</th><th scope="col">Annual growth rate</th></tr></thead><tbody>{research.philAtlas.populationHistory.map((row, index, rows) => <tr key={row.year}><th scope="row">{row.year}</th><td>{row.population.toLocaleString('en-PH')}</td><td>{index === 0 ? '—' : `${row.population - rows[index - 1].population > 0 ? '+' : ''}${(row.population - rows[index - 1].population).toLocaleString('en-PH')}`}</td><td>{typeof row.annualGrowthRate === 'number' ? `${row.annualGrowthRate.toFixed(2)}%` : '—'}</td></tr>)}</tbody></table></div>
              <h3>2015 household and age profile</h3>
              <p>The 2015 household population was {research.philAtlas.householdPopulation2015.toLocaleString('en-PH')} across {research.philAtlas.households2015} households, averaging {research.philAtlas.householdSize2015.toFixed(2)} people per household. The reported median age was {research.philAtlas.medianAge2015} years.</p>
              <details className="barangay-age-details"><summary>View household counts by census year</summary><div className="barangay-table-wrap"><table><caption>Household trends · PhilAtlas, citing PSA census records</caption><thead><tr><th scope="col">Census year</th><th scope="col">Household population</th><th scope="col">Households</th><th scope="col">Average household size</th></tr></thead><tbody>{research.philAtlas.householdHistory.map(row => <tr key={row.year}><th scope="row">{row.year}</th><td>{row.population.toLocaleString('en-PH')}</td><td>{row.households.toLocaleString('en-PH')}</td><td>{row.averageHouseholdSize.toFixed(2)}</td></tr>)}</tbody></table></div></details>
              <details className="barangay-age-details"><summary>View 2015 population by age group</summary><div className="barangay-table-wrap"><table><caption>Age distribution · PhilAtlas, citing the 2015 census</caption><thead><tr><th scope="col">Age group</th><th scope="col">Population</th><th scope="col">Share of 2015 population</th></tr></thead><tbody>{research.philAtlas.ageGroups2015.map(row => <tr key={row.age}><th scope="row">{row.age}</th><td>{row.population.toLocaleString('en-PH')}</td><td>{typeof row.percentage === 'number' ? `${row.percentage.toFixed(2)}%` : `${(row.population / research.philAtlas.householdPopulation2015 * 100).toFixed(2)}%`}</td></tr>)}</tbody></table></div></details>
            </section>
            {research.philAtlas.adjacentBarangays.length > 0 && <section className="barangay-research-section" aria-labelledby="barangay-neighbors-title">
              <h2 id="barangay-neighbors-title">Adjacent barangays</h2>
              <p>Communities listed by PhilAtlas as sharing a boundary with Barangay {barangay.name}:</p>
              <ul className="barangay-neighbor-list">{research.philAtlas.adjacentBarangays.map(place => <li key={`${place.municipality}-${place.name}`}>{place.slug ? <Link to={`/barangays/${place.slug}`}>{place.name}</Link> : place.name}, {place.municipality}, Bohol</li>)}</ul>
            </section>}
          </>}
          {barangay.more_information?.trim() && <section className="barangay-rich-content" aria-label={`More information about Barangay ${barangay.name}`} dangerouslySetInnerHTML={{ __html: barangay.more_information }} />}
          {barangay.captain && (barangay.captainBio || barangay.captainDetails) && <section id="barangay-leadership" className="barangay-leadership-summary" aria-labelledby="barangay-leadership-heading">
            <h2 id="barangay-leadership-heading">Barangay leadership</h2>
            {barangay.captainPhoto && <img src={barangay.captainPhoto} alt={`Photo of ${barangay.captain}`} loading="lazy" />}
            <h3>{barangay.captain}</h3>
            {barangay.captainBio && <p>{barangay.captainBio}</p>}
            {barangay.captainDetails && <div className="barangay-rich-content" dangerouslySetInnerHTML={{ __html: barangay.captainDetails }} />}
          </section>}
        </article>

        <aside className="barangay-detail-stats" aria-labelledby="barangay-facts-title">
          <h2 id="barangay-facts-title">Summary data</h2>
          <dl className="barangay-facts-list">
            {administrative.country && <div><dt>Country</dt><dd>{administrative.country}</dd></div>}
            {administrative.region && <div><dt>Region</dt><dd>{administrative.region}</dd></div>}
            {administrative.province && <div><dt>Province</dt><dd>{administrative.province}</dd></div>}
            {administrative.municipality && <div><dt>Municipality</dt><dd>{administrative.municipality}</dd></div>}
            <div><dt>Barangay</dt><dd>{barangay.name}</dd></div>
            {administrative.barangayCount && <div><dt>Barangays in Getafe</dt><dd><Link to="/barangays">{administrative.barangayCount} communities <ArrowRight size={14} aria-hidden="true" /></Link></dd></div>}
            {research?.classification && <div><dt>PSGC classification</dt><dd>{research.classification}</dd></div>}
            {(research?.psgcData?.psgcCode || research?.psgc) && <div><dt>PSGC code</dt><dd>{research?.psgcData?.psgcCode || research.psgc}</dd></div>}
            {research?.psgcData?.correspondenceCode && <div><dt>PSA correspondence code</dt><dd>{research.psgcData.correspondenceCode}</dd></div>}
            {typeof currentPopulation === 'number' && <div><dt>Population</dt><dd>{currentPopulation.toLocaleString('en-PH')}</dd><small><a href={research?.psgcData?.sourceUrl || 'https://psa.gov.ph/classification/psgc/barangays/0701226000'} target="_blank" rel="noreferrer">PSA 2024 POPCEN · Getafe</a></small></div>}
            {typeof research?.philAtlas?.population2020 === 'number' && <div><dt>Population (2020)</dt><dd>{research.philAtlas.population2020.toLocaleString('en-PH')}</dd><small>PhilAtlas · PSA Census</small></div>}
            {typeof research?.philAtlas?.householdPopulation2015 === 'number' && <div><dt>Household population (2015)</dt><dd>{research.philAtlas.householdPopulation2015.toLocaleString('en-PH')}</dd></div>}
            {typeof research?.philAtlas?.households2015 === 'number' && <div><dt>Households (2015)</dt><dd>{research.philAtlas.households2015.toLocaleString('en-PH')}</dd></div>}
            {typeof research?.philAtlas?.householdSize2015 === 'number' && <div><dt>Average household size</dt><dd>{research.philAtlas.householdSize2015.toFixed(2)}</dd></div>}
            {typeof research?.philAtlas?.medianAge2015 === 'number' && <div><dt>Median age (2015)</dt><dd>{research.philAtlas.medianAge2015} years</dd></div>}
            <div><dt>Punong Barangay</dt><dd>{barangay.captain?.trim() || 'Not currently listed'}</dd>{barangay.captain?.trim() && <small><Link to={`/barangays/${barangay.id}/official`}>View official profile <ArrowRight size={14} aria-hidden="true" /></Link></small>}</div>
            <div><dt>Barangay officials</dt><dd><Link to={`/barangays/${barangay.id}/officials`}>View directory <ArrowRight size={14} aria-hidden="true" /></Link></dd></div>
            <div><dt>Barangay Services</dt><dd><Link to={`/services/barangay/${encodeURIComponent(barangay.id)}`}>Browse services <ArrowRight size={14} aria-hidden="true" /></Link></dd></div>
            {(barangay.termStart || barangay.termEnd) && <div><dt>Term</dt><dd>{formatDate(barangay.termStart) || '—'} – {formatDate(barangay.termEnd) || 'Present'}</dd></div>}
            <div><dt>Postal code</dt><dd>6334</dd><small><a href="https://phlpost.gov.ph/post-office-locator/" target="_blank" rel="noreferrer">Getafe · PhilPost</a></small></div>
          </dl>
          <section className="barangay-facts-location" aria-labelledby="barangay-location-title">
            <h3 id="barangay-location-title"><MapPin size={16} aria-hidden="true" /> Location</h3>
            {map ? <><div className="barangay-map-preview"><OpenStreetMap lat={Number(sourceCoordinates.lat)} lng={Number(sourceCoordinates.lng)} title={`${barangay.name} location map`} /></div><a className="barangay-map-link" href={map} target="_blank" rel="noreferrer">Open map ↗</a></> : <p>Location map unavailable.</p>}
            {sourceCoordinates && <p className="barangay-coordinates">Coordinates: {Number(sourceCoordinates.lat).toFixed(4)}° N, {Number(sourceCoordinates.lng).toFixed(4)}° E{research.coordinateSource ? ` · ${research.coordinateSource}` : ''}</p>}
            {research?.philAtlas?.elevationMeters && <p className="barangay-coordinates">Estimated elevation: {research.philAtlas.elevationMeters} m above sea level{research.coordinateSource ? ` · ${research.coordinateSource}` : ''}</p>}
          </section>
          {sourceLinks.length > 0 && <section className="barangay-facts-sources" aria-labelledby="barangay-sources-title">
            <h3 id="barangay-sources-title">Sources and further reading</h3>
            <ul>{sourceLinks.map((source, index) => <li key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noreferrer">{source.label || source.url}</a></li>)}</ul>
          </section>}
          <p className="barangay-data-report-prompt">Found outdated or incorrect data? <button type="button" className="barangay-data-report-trigger" onClick={() => { setReportError(''); setReportNotice(''); setCaptchaToken(''); setReportOpen(true) }}>Report it</button></p>
        </aside>
      </div>
      {reportOpen && <ModalDialog backdropClass="barangay-report-backdrop" labelledBy="barangay-report-title" busy={reportSending} onClose={() => setReportOpen(false)}><form className="barangay-report-dialog" onSubmit={submitDataReport}><button className="barangay-report-close" type="button" aria-label="Close dialog" disabled={reportSending} onClick={() => setReportOpen(false)} data-icon-button="ghost">×</button><h2 id="barangay-report-title">Report incorrect barangay data</h2><p>Your report will be sent to the website team for review and correction.</p>{reportNotice ? <p className="barangay-report-success" role="status">{reportNotice}</p> : <><label>Your name<input required maxLength="100" value={reportForm.name} onChange={event => setReportForm({ ...reportForm, name: event.target.value })} /></label><label>Email address<input required type="email" maxLength="254" value={reportForm.email} onChange={event => setReportForm({ ...reportForm, email: event.target.value })} /></label><label>Data to correct<select value={reportForm.field} onChange={event => setReportForm({ ...reportForm, field: event.target.value })}><option>Postal code</option><option>Population</option><option>Punong Barangay</option><option>Other barangay information</option></select></label><label>Correct information<input required maxLength="500" value={reportForm.correctedValue} onChange={event => setReportForm({ ...reportForm, correctedValue: event.target.value })} placeholder="Enter the correct value" /></label><label>Additional details<textarea maxLength="2000" rows="3" value={reportForm.details} onChange={event => setReportForm({ ...reportForm, details: event.target.value })} placeholder="Source or explanation (optional)" /></label>{captchaEnabled && <div id="barangay-data-report-recaptcha" className="barangay-report-captcha" aria-label="Spam prevention verification" />}{reportError && <p className="barangay-report-error" role="alert">{reportError}</p>}<div className="barangay-report-actions"><button type="button" disabled={reportSending} onClick={() => setReportOpen(false)}>Cancel</button><button type="submit" disabled={reportSending}>{reportSending ? 'Sending…' : 'Send report'}</button></div></>}{reportNotice && <div className="barangay-report-actions"><button type="button" onClick={() => setReportOpen(false)}>Close</button></div>}</form></ModalDialog>}
      <BarangayRelatedSection barangay={barangay} />
    </main>
  )
}
