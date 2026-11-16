# Website analytics rollout

## Current implementation and search durability

`Search.jsx` sends `POST /api/search/complete` only after all public search sources have completed successfully and the visitor has not opted out. Typed submissions and popular-chip clicks use this one completion endpoint; page views, service journey steps, attributed result clicks, Open Data visitor events, and selected actions use `POST /api/analytics/events`. A direct or shared `/search?q=...` URL has no submission ID and therefore does not count as a search submission or result click.

`completeSearch()` validates an opaque UUID, source, result state, and optional topic. It inserts a receipt and increments the matching daily topic or unmatched rollup in the same PostgreSQL transaction. PostgreSQL `ON CONFLICT` makes repeated IDs contribute once, including across server instances. The endpoint retains `202` for compatibility, but it awaits `COMMIT` before sending the response. A successful response means the aggregate increment and receipt were committed; this is not an in-memory server queue. With PostgreSQL's normal durable-commit settings, counts survive an API process restart. Database errors return `503`, and the public search results remain independent of the best-effort completion request.

Previously recorded search aggregates remain physically present but are excluded from popularity and CMS analytics before the analytics cutover date. Migration `044_website_analytics.sql` sets that date to the next `Asia/Manila` calendar day so pre-implementation history is not presented as newly collected activity. Pinned published suggestions continue working regardless of Analytics preference.

## Data dictionary

| Event or record | When it fires | Stored fields | CMS total |
| --- | --- | --- | --- |
| Public page view | Once after a public route is ready on initial load, reload, or pathname navigation. Query/hash changes and rerenders do not add a view. | Manila date, stable route pattern, viewport category, first eligible document entry-source bucket, count. | Sum of `website_page_view_daily.views`; grouped for trends, top pages, viewport sizes, and entry sources. |
| Typed search | After a successful explicit typed search has loaded its public sources. | Opaque submission UUID, topic ID if matched, `typed`, zero-result boolean, date, expiry. No query text. | Sum of `search_topic_daily.typed_submissions` and `search_daily_unmatched.unmatched_typed_submissions`; zero-result numerator divided by typed submissions plus chip clicks. |
| Popular-chip click | After a chip-selected search has loaded its public sources. | Opaque submission UUID, topic ID, `chip`, zero-result boolean, date, expiry. | Sum of `search_topic_daily.chip_clicks`; used separately from typed submissions. Popular topic ranking uses typed submissions only. |
| Browse Services click | Click of the public homepage Browse Services link. | Allowlisted action key, Manila date, count. | Sum of `website_action_daily.actions` for `browse_services_click`. |
| Report a Concern click | Click of the public homepage Report a Concern link. | Allowlisted action key, Manila date, count. | Sum of `website_action_daily.actions` for `report_concern_click`. |
| Open Data XLSX download request | Click that starts generating the XLSX download from an open-data report. This is a request/click count, not proof the file was saved. | Allowlisted action key, Manila date, count. | Sum of `website_action_daily.actions` for `open_data_xlsx_request`. |
| Event receipt | Accepted page/action batch or search completion; expires after 7 days by default. | Random event/submission UUID, created/expiry timestamps, and the existing search receipt's aggregate metadata only. | Not displayed as an activity metric; used for idempotent retries. |
| Service journey step | When the supported public service page becomes visible, its requirements enter view, a form link is clicked, or an application CTA is clicked. | Manila date, existing public service ID, step, viewport category, count. No per-visit identifier. | Sum of transitions by service, step, and viewport. Counts are stage transitions, not completed applications or unique residents. Apply clicks mean CTA clicks. |
| Search result click | Click on a result only when the explicit search has a committed completion receipt. | Manila date, approved topic ID or `unmatched`, typed/chip source, result type, position bucket. A short-lived receipt stores a SHA-256 result key to deduplicate repeated clicks for that submission. | Sum result click rollups; distinct submissions with at least one click are updated once under a row lock. Click-through rate is submissions with click / eligible completed submissions. Zero-result and click-through rates both use the instrumentation cutover date. |
| Open Data visitor event | Dataset detail opened, explicit query submitted, or browser generated CSV/XLSX download clicked. | Manila date, public dataset ID, allowlisted activity. No filter values or dataset contents. | Sum visitor events by dataset and activity. Download totals are clicks, not proof of saved files. |
| Server operation | Production search completion/suggestion, public dataset query, or public 404 response. Independent of visitor Analytics preference. | Manila date, allowlisted operation, bounded dataset ID, outcome/category, cache bucket, latency histogram bucket. A 404 stores only route-family and referring-section buckets. | Requests and success/failure totals by operation; cache hit/miss counts; p50/p95 histogram bucket bounds over the selected range; 404 responses by bounded family/referrer buckets. |
| Published content view | A public news, announcement, event, meeting, or service detail finishes loading. | Manila date, existing public content/service ID, type, count. | Resolve display titles and publication/update dates from existing news, managed-page, and published-service records. Show views in the first seven days after publication (with an in-progress label) and in the rolling last 30 days. |
| Important-announcement popup | The configured modal becomes visible; a resident follows its article link; or they close/dismiss it. | Manila date, article ID, impression/open/dismiss aggregate. A short-lived impression receipt deduplicates opens and dismissals once per impression. | Show article, impressions, opens/impressions, and dismissals/impressions. A CTA open is not also counted as a dismissal. |
| Navigation placement impression/click | An allowlisted homepage quick link, hero action, service catalog/popular-service action, header menu link, or footer link becomes visible or is clicked. | Manila date, placement key, destination ID/route key, viewport, quick-link slot where applicable, impression/click aggregates. Receipt IDs expire after 7 days. | Show total clicks and impressions separately; CTR is impressions with at least one attributed click / eligible impressions. Homepage pinned quick links are limited to three slots and reported by slot. Other placements without impressions show no impression-based rate. |

There is no unique-visitor metric. Viewport categories use CSS viewport width: mobile `<=720px`, tablet `721-1120px`, desktop `>1120px`, and `unknown`. Entry source is classified in the browser once per document as direct/unknown, internal, search engine, or external; later SPA views use `none`. Raw referrers are not sent. Current supported service pages record requirements when the section enters view; no standalone public form-download control exists on the dynamic service detail page yet.

## Default-on preference, privacy, and switches

- Analytics is on by default for new visitors and can be turned off in Cookie settings. A saved opt-out remains in effect. The choice is stored with other browser preferences in local storage; there is no analytics cookie or persistent visitor ID. `getafe_cache` separately records only the public-cache choice.
- Production client and server collection default to on. `VITE_WEBSITE_ANALYTICS_ENABLED=false` disables the client at build time; `WEBSITE_ANALYTICS_ENABLED=false` is the immediate server kill switch. The API and client remain disabled outside production so development traffic is excluded. Portal search, suggestions, sign-in, and CMS functions do not depend on analytics collection.
- The browser waits for `analytics.collectionEnabled` from `GET /api/public/config` and still honors the visitor’s Analytics preference. The public configuration reports collection as disabled during maintenance. A stale client gets `403 ANALYTICS_DISABLED` and discards pending events. This does not disable the permission-protected historical reports.
- The ingestion route returns `202` with `committed: true` after PostgreSQL commits the event receipts and rollups. A temporary write failure returns `503 ANALYTICS_UNAVAILABLE`, with `Retry-After` for transient database conditions the server can classify. The browser keeps the same event IDs, backs off for 5–60 seconds unless the server asks it to wait longer, and attempts each event at most three times.
- For a 503, correlate `X-Request-Id` with `website_analytics_ingest_failed` and any matching `api_security_decision` entry. Check CMS database readiness, the migration ledger for 043–046, and the app role’s SELECT, INSERT, and UPDATE privileges on the analytics tables. Startup and maintenance responses may be generated before the API security decision is logged.
- Events are held in a bounded in-memory browser queue, batched at up to 20 events / 8 KiB, flushed on a short timer, the batch limit, or page hide. Retries keep the same UUID and are capped at three attempts. Turning Analytics off aborts the outstanding request where possible and clears unsent events.
- The API accepts strict page-view/action/service/search/Open Data allowlists, rejects unsupported fields, uses the existing traffic-protection rate limiter, and logs only endpoint metadata/error codes. It suppresses synthetic browser checks that explicitly send `X-Analytics-Synthetic: true`. Application analytics code does not log request bodies, query strings, referrers, event payloads, or visitor IDs. Reverse-proxy and host request-log settings still need production review.
- Server reliability rollups run only in production and independently of the visitor cookie choice. Development and synthetic traffic are excluded. They contain fixed operation, outcome, failure, cache, route-family, and latency-bucket dimensions only.
- CMS report APIs require `analytics.view`; search topic configuration retains `search.manage`. Counts are shared with the existing Search Management page via the same PostgreSQL daily search tables.
- The user-facing notice is in the cookie banner, Cookies page, and Privacy Policy. Municipal privacy-owner review of the inventory, retention, notice, contact route, and default-on preference is still pending. The privacy contact routes to the Municipality's Contact page because a verified direct privacy-officer email is not configured in this repository.

## PostgreSQL and cleanup

Migration `044_website_analytics.sql` creates the base page-view/action rollups and receipts. Migration `045_website_analytics_engagement.sql` adds service journey, result-click, Open Data, reliability, and 404 rollups, a unique per-submission result receipt, and the next-day `search_engagement_start` cutover. Migration `046_content_navigation_analytics.sql` adds content reach, popup interaction, and navigation placement aggregates and receipts; `content_navigation_start` is the Manila date on which the migration runs, since these tables have no preexisting activity. Counters are `BIGINT` with composite keys and indexed date/dimension paths. Event/result/impression receipts have indexed expiry and default to 7 days; daily rollups are retained for 13 months by default. `WEBSITE_ANALYTICS_RECEIPT_DAYS` and `WEBSITE_ANALYTICS_ROLLUP_MONTHS` are bounded server settings.

Apply migrations after taking the usual staging snapshot and confirming all earlier migrations are current. Keep collection disabled during migration and staging validation:

```powershell
$env:CMS_SUPABASE_DATABASE_URL = '<staging Supabase PostgreSQL connection from the secret store>'
npm run migrate:postgres
```

The runner applies every pending PostgreSQL migration in filename order, so verify its pending migration list/target before running it in an environment. Treat the URL as a production secret; do not echo it or place it in frontend variables.

The application schedules bounded cleanup against its configured Supabase PostgreSQL pool every six hours while the API process is running. The standalone `npm run analytics:cleanup` command uses the same `CMS_SUPABASE_DATABASE_URL` resolver as the application. Apply pending migrations and verify the Supabase target before enabling collection in production. Staging deployments should set both collection switches to `false`; the production release should omit them or set them to `true` after checks pass.

Both cleanup paths use bounded batches controlled by `WEBSITE_ANALYTICS_CLEANUP_BATCH_SIZE` and `WEBSITE_ANALYTICS_CLEANUP_MAX_BATCHES`, and log only per-table deletion totals. Verify the API cleanup log and PostgreSQL row counts in staging before enabling production collection. If using the standalone script, verify its exit code and PostgreSQL row counts as well.

## Rollout and rollback

1. Keep both server and client switches false during migration rollout and staging validation. Confirm the approved privacy notice, privacy contact, reverse-proxy logs, and request-body logging.
2. Apply migrations 044, 045, and 046 in staging. Confirm the PostgreSQL analytics cutover dates, table/index creation, grants, and bounded cleanup behavior.
3. Deploy the API with `WEBSITE_ANALYTICS_ENABLED=false` and a client build with `VITE_WEBSITE_ANALYTICS_ENABLED=false`. Run API, authorization, search-flow, and failure-recovery checks.
4. After checks pass, municipal privacy-owner review is complete, and migrations 044, 045, and 046 are applied in production, remove both switches or set them to `true`. Production collection then applies by default to visitors without a saved opt-out; saved opt-outs remain excluded.
5. To stop collection independently of public service availability, set the server switch to false first. Optionally publish a client build with the Vite switch false. Keep reports available for authorized CMS readers unless the database/API itself is disabled.

## Verification status

| Check | Result |
| --- | --- |
| Content/navigation schema and persistence scenarios | `node scripts/test-website-analytics.mjs` passed 9/9, including public content validation, repeat popup opens, the same quick-link destination in two slots, and repeat clicks counted once for impression CTR while total clicks remain separate. Persistence assertions use a transactional mock pool. |
| Production build | `npm run build` passed after adding the Content and Navigation reports. |
| API route and permission policy | `node scripts/test-api-security.mjs` passed: 282 policy entries and 239 declared handlers audited. The analytics report route remains protected by `analytics.view`. |
| Local preference UI and real PostgreSQL opt-out-to-count drilldown | Not completed in this environment. |
| Two-instance concurrent duplicate delivery and invalid-payload no-write check | Unit-level behavior is covered; staging PostgreSQL concurrency remains pending. |
| Migration application, timeout recovery, PostgreSQL cleanup, grants, and anonymous CMS-report denial | Staging/production checks pending; no migration was run against the configured `.env` database. |
| Real PostgreSQL totals and CMS report values for popup, quick-link slots, and clicks | Staging verification pending. The unit scenario confirms transaction writes and dedupe behavior against a mock pool; it does not establish committed totals in the deployment database. |
| Ingestion p50/p95 `<=250ms`, CMS 30-day summary p95 `<=1s`, PostgreSQL CPU/connections/locks/storage | Targets only; no representative staging traffic measurement is available. |
| LCP `<=2.5s`, INP `<=200ms`, CLS `<=0.1` at p75 | Google good thresholds; before/after staging results and field percentiles remain pending. |

No ingestion or Core Web Vitals performance result is inferred from unit-test duration. There is not enough field data in this change to establish mobile or desktop p75 percentiles.
