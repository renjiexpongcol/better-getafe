import PublishedPage from '../../components/PublishedPage'

export default function Page() {
  return <>
    <PublishedPage contentKey="page-privacy" title="Privacy policy" legalKey="legal.privacy" />
    <section className="published-page analytics-privacy-disclosure">
      <div className="content-page container"><article><section className="legal-section">
        <h2>Website analytics and service reliability</h2>
        <p>Optional visitor analytics is on by default unless you turn it off using the preference controls on the Cookies &amp; Cache Notice page. It helps the Municipality understand how public pages, services, search, and Open Data features are used. Collection also depends on the municipality's server-side kill switch. Visitors who opt out are not sent interaction events.</p>
        <p>Visitor analytics stores Manila calendar dates, stable public content, service, dataset, and destination IDs, content type, allowlisted navigation placement and homepage quick-link slot, viewport categories (mobile up to 720 CSS pixels, tablet 721-1120 CSS pixels, desktop above 1120 CSS pixels, or unknown), allowlisted event types, approved search topic IDs or unmatched status, typed versus popular-chip source, result type, and result position bucket. It counts published content views and announcement popup impressions, opens, and dismissals. Navigation placement impressions and clicks are aggregated by destination and viewport. Service journey stages are service views, requirements viewed, form download clicks where supported, and Apply clicks. Search result clicks are deduplicated per result and submission. The portal counts searches with a result click separately from total result clicks. Open Data export events currently mean browser CSV/XLSX download clicks; the portal does not claim that a file was saved. Query selections and dataset contents are not collected.</p>
        <p>Server reliability records are separate from optional visitor analytics and are collected independently of Cookie settings. They contain daily counts of selected server operations, success or failure category, bounded cache status, public dataset ID where relevant, and latency histogram bucket. Public 404 reporting stores only an allowlisted route family and referring section. These records are used to monitor service availability and improve reliability.</p>
        <p>The portal does not create a visitor identifier or unique-visitor metric. Analytics records do not contain raw search terms, full URLs, query strings, raw referrers, exact screen dimensions, IP addresses, user IDs, browser fingerprints, form contents, filter values, or dataset contents. Temporary random event receipts used for duplicate suppression are deleted after 7 days. Daily usage and reliability aggregates are retained for up to 13 months.</p>
        <p>Aggregated visitor reports are available to CMS accounts granted the Website Analytics permission and authorized database operators. Your Analytics preference is stored with this device's other preferences; it is not an analytics cookie. The separate <code>getafe_cache</code> cookie records only the public-cache setting. For privacy questions, contact the Municipality through the <a href="/contact">Contact page</a>.</p>
      </section></article></div>
    </section>
  </>
}
