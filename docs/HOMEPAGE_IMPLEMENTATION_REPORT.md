# Status update: previous landing page restored

At the user's request, the homepage redesign, header, footer, news, events preview, announcements, hero and shortcut presentation were rolled back. The implementation report below describes the earlier redesign and is retained as historical documentation; its browser results do not describe the restored layout. Unrelated application and backend work was preserved.

# Homepage implementation report

Date: 7 October 2026. Scope: Municipality of Getafe / BetterGetafe public homepage and directly related navigation, directory, consent, events and public configuration behavior.

The implementation keeps the navy municipal identity and puts resident tasks first. Published municipal data remains authoritative. Browser fixtures are test-only and were not inserted into production. No database schema changes, deployment or commit were made. This workspace already contained substantial unrelated changes; the file list below identifies this task's contributions, including small additions to files that were already modified.

## Implemented

| Problem and root cause | Files | Implementation and resulting behavior |
|---|---|---|
| The homepage competed for attention with repeated actions, promotional sections and oversized navigation. | Home.jsx, Home.css, Header.jsx, Hero.jsx, CitizenActions.jsx, main.jsx, index.css | A single six-action grid follows a concise service-search hero. The page proceeds through municipal updates, events, destinations, current mayor, municipal information and contact. Navy identity is retained; homepage composition styles are extracted into Home.css. Compact sticky navigation uses five clear categories, with online services clearly labeled. Weather and a minute-resolution clock are secondary. |
| Search did not adequately connect residents' everyday vocabulary to offices and service guidance. | Directory.jsx, directorySearch.js, Hero.jsx | Services and offices are separate result groups. RHU, BPLO, civil registry, PWD, cedula and related terms are normalized. Query strings are safely encoded. No-results and partial API failures provide useful contact/guidance routes and retry. Online availability is shown only when published data explicitly supports it. |
| A National ID shortcut could misrepresent generic certificate guidance. | Hero.jsx, publicApiDtos.js | Hero guidance links to birth-certificate information at the civil registry. A legacy National ID label pointing to generic certificate guidance becomes “Certificates & IDs” in the public presentation; records and schemas are preserved. |
| Request tracking and concern actions lacked clear expectations. | CitizenActions.jsx, Contact.jsx | Tracking goes to the existing authenticated requests page, with sign-in explained. Report a concern opens the existing contact form with its supported complaint/feedback category selected. No new reporting workflow is invented. |
| Important announcements interrupted the page and could disappear before being read. | ImportantAnnouncement.jsx, EmergencyAlert.jsx, homepagePresentation.js | Notices are inline, category-driven and have no ten-second auto-hide. Dismissal uses the existing 24-hour policy keyed to ID and material version, so changed content returns. Duplicate important notices are suppressed. Urgent-load failures expose retry and emergency contacts. |
| Configuration outages could replace the entire public experience, and fallback values could loosen sensitive settings. | PublicConfig.jsx, App.jsx, MaintenancePage.jsx, homepagePresentation.js, server/index.js | Startup visibly loads configuration, then public pages can retain an identity-only shell with an outage explanation and retry. Protected applications fail closed. Known maintenance restrictions are preserved. No fallback enables registration/uploads or supplies authorization flags. Bounded freshness/retry avoids request storms. MaintenancePage no longer calls an authentication hook outside its provider. |
| One failing content area could disrupt unrelated homepage content. | HomeSectionBoundary.jsx, Home.jsx, MunicipalityUpdatesSection.jsx | Section error boundaries, independent request states and real refetch buttons preserve working content. Empty news/tourism sections retain headings and useful archive links. Internal errors are not exposed to residents. |
| News used a moving layout and Facebook was tightly coupled to its height/loading. | NewsSection.jsx, MunicipalityUpdatesSection.jsx, FacebookPageFeed.jsx, Home.css | First-party news uses one featured story plus three static supporting cards. Facebook is secondary, uses a validated maintained page URL, and loads only after an explicit “Load Facebook updates” action. Its height no longer tracks news. Images have dimensions and below-fold loading is deferred. |
| A full homepage calendar consumed space, and capped event fetching could omit relevant events. | EventsSection.jsx, EventCalendar.jsx, Events.jsx, server/index.js, homepagePresentation.js | The homepage requests the next three relevant published events with sorting/filtering before pagination. A full calendar opens on the Events page, with Today, month navigation and selected-day events. Month filtering includes overlapping events and rejects malformed months. Calendar dates use Asia/Manila rather than the device timezone. |
| Tourism failures removed context, and municipal leadership/contact content was incomplete or hardcoded. | DiscoverGetafe.jsx, Home.jsx, homepagePresentation.js | Tourism retains a useful empty/error state. The mayor is selected from the published current officials directory, with maintained biography excerpt and profile link, conditional photo and explicit missing-data states. Address, phone and email reuse existing municipal contact information. No welcome message, office hours or event details are fabricated. |
| Declining optional cookies could be confused with an unacknowledged choice, and optional persistence was not consistently respected. | cookiePreferences.js, CookieCacheBanner.jsx, apiClient.js, PublicConfig.jsx, App.jsx | Essential acknowledgment is independent of optional preferences. Both optional choices default off; existing acknowledged decline remains recognized. Saved preferences reopen from the footer. Native modal behavior supplies focus containment/isolation and restoration. Persistent public caching requires explicit opt-in; memory caching remains available. |
| Navigation disclosures did not consistently support keyboard, Escape and mobile viewport limits. | Header.jsx, Home.css | Pointer and keyboard use the same explicit toggle. Collapsed menus are hidden from interaction. Outside dismissal, focus-out dismissal and Escape restoration are supported. On mobile, first Escape closes the submenu and second closes the main menu. Long menus scroll within the viewport. |
| The footer mixed decorative trust indicators and unmaintained external accounts with essential links. | Footer.jsx, FacebookPageFeed.jsx, Home.css | Resident services, municipality and government resources are grouped. Contacts are clickable. Privacy, terms, accessibility, sitemap and cookie preferences are discoverable. Nonlinked transparency/FOI badges and an unsolicited Discord account are removed. Configured official Facebook and RSS remain. External destinations identify new-tab behavior. |
| Homepage SEO lacked descriptive initial sharing metadata and private route indexing controls. | PageTitleManager.jsx, index.html, homepageMetadata.js, server/index.js, apiEndpointPolicies.js | Descriptive title/description, canonical, Open Graph, Twitter card and GovernmentOrganization metadata are provided. The server supplies sharing tags in initial homepage HTML for crawlers that do not run JavaScript. The configured origin is validated and escaped. Private route families receive noindex/nofollow metadata and headers and are disallowed in robots.txt. The new public HTML route is explicitly classified in the route policy inventory. |

## API / backend changes

- `GET /api/news`: remains public for published reads. Optional `month=YYYY-MM` is strictly validated and filters event/meeting overlap in Philippine civil time before pagination. The existing upcoming/temporal/sort options supply the homepage's next three events. Public DTO adds only a publication/update-derived version for notice dismissal; no drafts, autosave or private fields are added.
- Public popular-service DTO: corrects only a misleading legacy National ID label when it points to generic certificate guidance.
- Public configuration fallback: preserves known maintenance restrictions and does not enable sensitive capabilities. Frontend fallback contains municipal identity only. Private route decisions remain unavailable during failed configuration loading.
- `GET /`: public initial homepage HTML now includes escaped sharing metadata and structured municipal identity. It is classified explicitly as PUBLIC and served with no-store. Authentication is not required and no session-dependent content is injected.
- `GET /robots.txt`: protected route families are excluded. Protected frontend route responses additionally receive `X-Robots-Tag: noindex, nofollow`.
- Existing officials, departments, services, contact and tourism endpoints are reused. Contact submission, request tracking, CMS permissions, rate controls and mutation behavior are unchanged.
- Persistent public client caching is optional and consent-controlled. Published in-memory caching remains; forced retries actually refetch. Facebook embeds are deferred until requested.
- No schema migration is required.

## Security review

Public content reads remain separate from resident/staff/admin operations. Published-content DTO protections and rejection of draft-oriented public queries were tested. Authenticated request tracking and role/session isolation remain enforced. Configuration dependency failures do not grant access or switch maintenance off. Existing CSRF, origin, input, rate-limit and upload protections were not weakened. Month input is constrained, search URLs are encoded, Facebook destinations are validated, and HTML metadata is escaped. Existing sanitized error handling is used. Automated security and live HTTP checks are recorded below; this is not a claim of an independent penetration test.

## Accessibility

- Visible search label, descriptive task actions and meaningful empty/error messages.
- Static news cards and readable inline announcements without automatic dismissal.
- Keyboard-operated navigation, hidden collapsed disclosures, Escape and outside dismissal, restored focus.
- Native cookie dialog isolation and focus behavior, saved choices and explicit reopening.
- Calendar buttons expose selected/current states and useful date/event labels.
- Improved light-on-navy text contrast in featured news and mayor links; enlarged text and narrow-screen wrapping.
- Existing shared focus styles were checked across 29 stylesheets and custom controls, including validation, disabled controls, high contrast and forced colors.
- Automated keyboard/browser checks passed. A screen-reader walkthrough and full WCAG conformance audit remain recommended before release.

## Responsive testing

Automated browser screenshots and overflow/reflow checks cover widths 320, 375, 390, 768, 1024 and 1440 pixels, plus 844-pixel landscape and 200% font sizing at narrow width. Tests cover mobile menu scrolling, submenu dismissal/focus, calendar reflow and independently failed content areas. Screenshots are under `artifacts/homepage-improvements/`. These fixtures verify states consistently; actual local production content was also inspected in the browser. They are not screenshots of fabricated database content.

## Tests

| Command | Result |
|---|---|
| `npm run lint` | Passed, zero warnings |
| `npm run lint:undefined` | Passed, zero warnings |
| `npm run build` | Passed; 2,024 modules, homepage chunk about 18.24 kB / 5.15 kB gzip |
| `node --test scripts/test-homepage.mjs scripts/test-api-transport.mjs scripts/test-routing.mjs scripts/test-time-aware-officials.mjs scripts/test-security-boundaries.mjs scripts/test-runtime-resilience.mjs scripts/test-media-security.mjs scripts/test-google-onboarding-security.mjs` | 48 passed, 0 failed |
| `node scripts/test-homepage-ui.mjs` | 15 passed, 0 failed |
| `node scripts/test-homepage-http.mjs` | 8 passed, 0 failed against local API |
| `node scripts/test-startup-ui.mjs` | 2 startup/outage browser scenarios passed |
| `node scripts/test-focus-ui.mjs` | Passed desktop/mobile dialog and announcement checks and shared focus/custom-control/high-contrast checks across 29 stylesheets |
| `npm run test:api-security` | Passed: 231 policy entries, 206 declared handlers audited |
| `npm run test:api-security-http` | Passed live public DTO, draft-query and private-boundary checks |
| `npm run test:auth-isolation` | 7 scenarios passed |
| `npm run test:eservices` | 26 passed, 0 failed |

A timing assertion in the focus test initially sampled an error-border CSS transition before it finished; the test now waits for the resolved design-system error color. Adding the initial HTML route initially triggered the exact-route security inventory check; an explicit PUBLIC policy was added rather than bypassing the inventory.

## Remaining issues and recommendations

1. **Publish notice expiry metadata and review existing notices.** An actual important power notice describes 30 September but remains published on 7 October. No dedicated expiry field is available. The implementation does not infer expiry from prose. An editor should deactivate outdated notices; structured expiry needs a separate CMS/backend change and migration design.
2. **Complete verified municipal information.** Confirm office hours, publish an authored mayor's welcome message and maintained portrait where appropriate, and review official contact/social settings. The homepage does not invent these details.
3. **Improve event records.** Venue, organizer and cancellation status are absent from the current public DTO. Add maintained fields through a separately scoped data-model change if needed. Date/time correctness is implemented, but the UI cannot supply unpublished event details.
4. **Measure performance in deployment.** Deferred Facebook, lazy images, image dimensions, static content and fewer font weights reduce avoidable work. Core Web Vitals were not measured, and targets are not claimed. Generate responsive image variants, review the large shared stylesheet and measure LCP/CLS/INP on representative Philippine mobile connections.
5. **Complete human accessibility review.** Test with actual screen readers, high zoom and representative residents. Automated focus/reflow checks do not certify WCAG compliance.
6. **Validate service coverage with offices.** Directory synonyms and truthful fallbacks help discovery; office owners should verify published requirements, online availability, and service-specific destinations. Guidance links are not presented as completed online transactions.
7. **Release checks.** Confirm canonical production origin, preview social cards against the restarted production server, verify government-resource links and approve maintained content before deployment. Server changes require a restart; this task did not deploy.

## Files changed by this task

Created:
- `src/services/homepagePresentation.js`
- `src/services/cookiePreferences.js`
- `src/services/directorySearch.js`
- `src/components/HomeSectionBoundary.jsx`
- `src/components/EventCalendar.jsx`
- `src/pages/home/Home.css`
- `server/src/services/homepageMetadata.js`
- `scripts/test-homepage.mjs`
- `scripts/test-homepage-ui.mjs`
- `scripts/test-homepage-http.mjs`
- `docs/HOMEPAGE_IMPLEMENTATION_REPORT.md`

Modified, including files with pre-existing changes:
- `src/context/PublicConfig.jsx`
- `src/App.jsx`
- `src/components/ImportantAnnouncement.jsx`
- `src/components/EmergencyAlert.jsx`
- `src/components/CookieCacheBanner.jsx`
- `src/services/apiClient.js`
- `src/components/Hero.jsx`
- `src/components/CitizenActions.jsx`
- `src/pages/info/Contact.jsx`
- `src/components/Header.jsx`
- `src/components/NewsSection.jsx`
- `src/components/EventsSection.jsx`
- `src/components/MunicipalityUpdatesSection.jsx`
- `src/components/FacebookPageFeed.jsx`
- `src/components/DiscoverGetafe.jsx`
- `src/pages/home/Home.jsx`
- `src/index.css`
- `src/main.jsx`
- `src/components/Footer.jsx`
- `src/components/MaintenancePage.jsx`
- `src/components/PageTitleManager.jsx`
- `index.html`
- `src/pages/events/Events.jsx`
- `src/pages/services/Directory.jsx`
- `server/index.js`
- `server/src/services/publicApiDtos.js`
- `server/src/services/apiEndpointPolicies.js`
- `scripts/test-startup-ui.mjs`
- `scripts/test-focus-ui.mjs`

Deleted: none. Test-generated screenshots are under `artifacts/homepage-improvements/`; they are verification artifacts rather than production assets.


