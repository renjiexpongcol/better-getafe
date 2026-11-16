import PublishedPage from '../../components/PublishedPage'

export default function Page() {
  return <>
    <PublishedPage contentKey="page-cookies" title="Cookie policy" legalKey="legal.cookies" />
    <section className="published-page analytics-privacy-disclosure">
      <div className="content-page container"><article><section className="legal-section">
        <h2>Analytics preference</h2>
        <p>Analytics is on by default and can be turned off using the preference controls below. When collection is enabled by the production server, first-party reports count public page and content views, broad CSS viewport sizes, entry-source categories, announcement popup impressions/opens/dismissals, navigation placement impressions/clicks, service journey steps, search result clicks, dataset views, explicit query requests, and CSV/XLSX download clicks. No visitor ID or analytics cookie is created.</p>
        <p>Your Analytics choice is saved with other preferences in local browser storage. The separate <code>getafe_cache</code> cookie records whether public-file caching is enabled; it does not hold analytics events. Browser-generated exports are counted as download clicks, not confirmed file saves. Server operational reliability metrics are described separately in the <a href="/legal/privacy">Privacy Policy</a>.</p>
        <button type="button" className="cookie-policy-settings" onClick={() => window.dispatchEvent(new Event('open-cookie-preferences'))}>Manage cookie preferences</button>
      </section></article></div>
    </section>
  </>
}
