# Getafe Portal route and stylesheet inventory

Snapshot: 4 October 2026, Asia/Manila. Generated from local source, not from live CMS content.

### public

| Path | Source / owner | Registration |
| --- | --- | --- |
| `/` | `src/pages/home/Home.jsx` | page-manifest |
| `/accessibility` | `src/pages/info/Accessibility.jsx` | page-manifest |
| `/barangays` | `src/pages/services/Barangays.jsx` | page-manifest |
| `/barangays/:id` | `src/pages/services/BarangayDetail.jsx` | page-manifest |
| `/barangays/:id/official` | `src/pages/services/BarangayOfficial.jsx` | page-manifest |
| `/barangays/:id/officials` | `src/pages/services/BarangayOfficials.jsx` | page-manifest |
| `/barangays/:id/officials/:officialSlug` | `src/pages/services/BarangayOfficialProfile.jsx` | page-manifest |
| `/community/civictech` | `src/pages/community/CivicTechCommunity.jsx` | page-manifest |
| `/contact` | `src/pages/info/Contact.jsx` | page-manifest |
| `/data` | `src/pages/data/Data.jsx` | page-manifest |
| `/data/barangays` | `src/pages/data/Barangays.jsx` | page-manifest |
| `/data/barangays/:slug` | `src/pages/data/BarangayStatistics.jsx` | page-manifest |
| `/data/datasets` | `src/pages/data/Datasets.jsx` | page-manifest |
| `/data/datasets/:id` | `src/pages/data/DatasetDetail.jsx` | page-manifest |
| `/departments` | `src/pages/departments/Departments.jsx` | page-manifest |
| `/departments/:slug` | `src/pages/departments/Department.jsx` | page-manifest |
| `/discover` | `src/pages/discover/Discover.jsx` | page-manifest |
| `/discover/:slug` | `src/pages/discover/Destination.jsx` | page-manifest |
| `/events` | `src/pages/events/Events.jsx` | page-manifest |
| `/events/:slug` | `src/pages/events/EventArticle.jsx` | page-manifest |
| `/info/about` | `src/pages/info/AboutUs.jsx` | page-manifest |
| `/info/history` | `src/pages/info/History.jsx` | page-manifest |
| `/info/sitemap` | `src/pages/info/Sitemap.jsx` | page-manifest |
| `/legal/cookies` | `src/pages/legal/Cookies.jsx` | page-manifest |
| `/legal/privacy` | `src/pages/legal/PrivacyPolicy.jsx` | page-manifest |
| `/legal/terms` | `src/pages/legal/TermsOfUse.jsx` | page-manifest |
| `/news` | `src/pages/news/News.jsx` | page-manifest |
| `/news/:slug` | `src/pages/news/Article.jsx` | page-manifest |
| `/officials` | `src/pages/info/Officials.jsx` | page-manifest |
| `/officials/:id` | `src/pages/info/OfficialProfile.jsx` | page-manifest |
| `/services` | `src/pages/services/Services.jsx` | page-manifest |
| `/services/barangay-clearance` | `src/pages/services/BarangayClearance.jsx` | page-manifest |
| `/services/business-trade` | `src/pages/services/BusinessTrade.jsx` | page-manifest |
| `/services/certificates` | `src/pages/services/Certificates.jsx` | page-manifest |
| `/services/directory` | `src/pages/services/Directory.jsx` | page-manifest |
| `/services/e-services/:slug` | `src/pages/services/Eservice.jsx` | page-manifest |
| `/services/education` | `src/pages/services/Education.jsx` | page-manifest |
| `/services/health` | `src/pages/services/Health.jsx` | page-manifest |
| `/services/hotlines` | `src/pages/services/EmergencyHotlines.jsx` | page-manifest |
| `/services/offices/:slug` | `src/pages/services/OfficeDetail.jsx` | page-manifest |
| `/tourism` | `src/pages/tourism/Tourism.jsx` | page-manifest |
| `/tourism/banacon` | `src/pages/tourism/Banacon.jsx` | page-manifest |
| `/tourism/corte-paradise` | `src/pages/tourism/CorteParadise.jsx` | page-manifest |
| `/tourism/handumon` | `src/pages/tourism/Handumon.jsx` | page-manifest |
| `/tourism/pandanon` | `src/pages/tourism/Pandanon.jsx` | page-manifest |
| `/tourism/verador` | `src/pages/tourism/Verador.jsx` | page-manifest |
| `/weather` | `src/pages/weather/Weather.jsx` | page-manifest |

### authentication

| Path | Source / owner | Registration |
| --- | --- | --- |
| `/auth/forgot-password` | `src/pages/auth/ForgotPassword.jsx` | page-manifest |
| `/auth/login` | `src/pages/auth/Login.jsx` | page-manifest |

### resident

| Path | Source / owner | Registration |
| --- | --- | --- |
| `/app` | `src/pages/dashboard/Dashboard.jsx` | App.jsx explicit route |
| `/app/appointments` | `src/pages/app/Appointments.jsx` | page-manifest |
| `/app/dashboard` | `src/pages/dashboard/Dashboard.jsx` | Redirect → /app |
| `/app/documents` | `src/pages/app/Documents.jsx` | page-manifest |
| `/app/e-billing/:kind` | `src/pages/app/Ebilling.jsx` | page-manifest |
| `/app/e-payment/:id` | `src/pages/app/Epayment.jsx` | page-manifest |
| `/app/e-requests` | `src/pages/app/Erequests.jsx` | page-manifest |
| `/app/e-requests/:id` | `src/pages/app/Erequest.jsx` | page-manifest |
| `/app/help` | `src/pages/app/Help.jsx` | page-manifest |
| `/app/notifications` | `src/pages/app/Notifications.jsx` | page-manifest |
| `/app/payments` | `src/pages/app/Payments.jsx` | page-manifest |
| `/app/profile` | `src/pages/dashboard/Profile.jsx` | page-manifest |
| `/app/requests` | `src/pages/app/Requests.jsx` | page-manifest |
| `/app/requests/:id` | `src/pages/app/Application.jsx` | page-manifest |
| `/app/requests/new` | `src/pages/dashboard/RequestDocument.jsx` | page-manifest |
| `/app/services` | `src/pages/app/Services.jsx` | page-manifest |
| `/app/services/:slug` | `src/pages/app/Eservice.jsx` | page-manifest |
| `/app/settings` | `src/pages/app/Settings.jsx` | page-manifest |
| `/app/setup` | `src/pages/app/Setup.jsx` | page-manifest |

### staff

| Path | Source / owner | Registration |
| --- | --- | --- |
| `/app/staff` | `src/pages/app/StaffSysparm.jsx` | page-manifest |
| `/app/staff/e-requests` | `src/pages/app/StaffSysparm.jsx` | App.jsx explicit route |
| `/app/staff/e-requests/:id` | `src/pages/app/StaffSysparm.jsx` | App.jsx explicit route |
| `/app/staff/help` | `src/pages/app/StaffSysparm.jsx` | App.jsx explicit route |
| `/app/staff/notifications` | `src/pages/app/StaffSysparm.jsx` | App.jsx explicit route |
| `/app/staff/requests` | `src/pages/app/StaffSysparm.jsx` | App.jsx explicit route |
| `/app/staff/requests/:id` | `src/pages/app/StaffSysparm.jsx` | App.jsx explicit route |
| `/app/staff/settings` | `src/pages/app/StaffSysparm.jsx` | App.jsx explicit route |

### admin

| Path | Source / owner | Registration |
| --- | --- | --- |
| `/admin` | `src/pages/admin/Admin.jsx` | page-manifest |
| `/admin/access` | `src/pages/admin/Admin.jsx` | admin shell module |
| `/admin/access/groups` | `src/pages/admin/Admin.jsx` | admin shell module |
| `/admin/access/permissions` | `src/pages/admin/Admin.jsx` | admin shell module |
| `/admin/access/policies` | `src/pages/admin/Admin.jsx` | admin shell module |
| `/admin/audit` | `src/pages/admin/Admin.jsx` | admin shell module |
| `/admin/barangays` | `src/pages/admin/Admin.jsx` | admin shell module |
| `/admin/categories` | `src/pages/admin/Admin.jsx` | admin shell module |
| `/admin/departments` | `src/pages/admin/Admin.jsx` | admin shell module |
| `/admin/discover` | `src/pages/admin/Admin.jsx` | admin shell module |
| `/admin/editor` | `src/pages/admin/Admin.jsx` | admin shell module |
| `/admin/media` | `src/pages/admin/Admin.jsx` | admin shell module |
| `/admin/news` | `src/pages/admin/Admin.jsx` | admin shell module |
| `/admin/officials` | `src/pages/admin/Admin.jsx` | admin shell module |
| `/admin/privacy` | `src/pages/admin/Admin.jsx` | admin shell module |
| `/admin/service-catalog` | `src/pages/admin/Admin.jsx` | admin shell module |
| `/admin/settings/:category` | `src/components/AdminSettings.jsx` | admin shell; validated category slug |
| `/admin/settings/general` | `src/pages/admin/Admin.jsx` | admin shell module |
| `/admin/system/errors` | `src/pages/admin/Admin.jsx` | admin shell module |
| `/admin/users` | `src/pages/admin/Admin.jsx` | admin shell module |

## Compatibility aliases

- `/login` → `/auth/login`
- `/dashboard` → `/app`
- `/dashboard/profile` → `/app/profile`
- `/dashboard/request-document` → `/app/requests/new`
- `/account` → `/app/profile`
- `/settings` → `/app/settings`
- `/app/dashboard` → `/app`
- `/app/staff-syparm` → `/app/staff`
- `/hotlines` → `/services/hotlines`
- `/info/accessibility` → `/accessibility`
- `/info/officials` → `/officials`
- `/services/barangays` → `/barangays`

Dynamic legacy redirects for officials/barangays and query-based module routing also live in App.jsx / routeRegistry.js. Dev-only error-preview routes and wildcard error fallbacks are excluded from the page inventory. Route entries include page manifests and shell-owned views; a registry module sharing a dashboard path does not create a separate page.

## Largest stylesheet sources

| File | Lines | Bytes | Literal hex occurrences |
| --- | ---: | ---: | ---: |
| `src/index.css` | 10384 | 475160 | 2381 |
| `src/citizen.css` | 1404 | 148989 | 859 |
| `src/pages/admin/AdminDashboard.css` | 462 | 39566 | 256 |
| `src/components/AdminSettings.css` | 384 | 35331 | 216 |
| `src/components/EserviceUI.css` | 345 | 12958 | 69 |
| `src/components/AdminUsers.css` | 19 | 12462 | 93 |
| `src/components/AdminAccessManagement.css` | 9 | 11010 | 94 |
| `src/pages/data/publicData.css` | 2 | 7620 | 87 |

Metrics describe source text, not final CSS bundle size or active computed styles. Full JSX/CSS import ownership and media-query inventory are in UI_BLUEPRINT.json.
