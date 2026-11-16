# Getafe Portal UI implementation audit

5 October 2026 · Asia/Manila

## Scope and existing work

Audited the five shells, route registry, existing route inventory and architectural handoff, global and feature stylesheets, resident widgets, service discovery/detail, configurable applications, staff queues, billing, CMS, employee/access interfaces and existing browser checks. The checkout already contained workflow, employee, access and scheduling work; those changes were preserved. No backend file, API adapter, route, guard, permission, ownership rule, financial operation or persisted request definition was changed by this UI work.

The original inventory remains in `UI_ROUTE_INVENTORY.md` and `UI_BLUEPRINT.md`. They cover more routes and configurations than the automated visual checks below; screenshot coverage is not a claim that every live content variation was inspected.

## Findings and implementation

| Finding | Implementation |
| --- | --- |
| Many repeated literals and competing green/teal/navy themes | Central semantic tokens in `src/design-tokens.css`; 842 repeated color values migrated across 25 stylesheet consumers, followed by 481 private text/icon declarations moved onto theme-aware roles. Chart/financial semantics and imagery retained. |
| Inherited aliases fail to update when private preferences change | Scoped alias bindings for private shells/portaled overlays; existing preference attributes retained. Corrected dark primary-action contrast and high-contrast surfaces. |
| Several button/header/feedback families | Shared Button/IconButton, PageHeader/SectionHeader, Field/FormSection, SearchInput, StatusBadge, Alert, EmptyState/LoadingState/ErrorState, Toolbar/Pagination/Table/MetadataList. Existing native controls and specialized behaviors remain. |
| Decorative resident dashboard and equally weighted cards | Plain task-oriented header, a compact account-summary strip, restrained quick tasks and divided record sections. All account data still comes from CitizenContext. |
| Parallel request and financial contracts | Shared route navigation exposes service requests/document applications and fees/receipts/billing orders without merging data or routes. Search copy accurately describes service search. |
| Configurable requests use operational status wording | Shared frontend status presenter. Server-imported PUBLIC_STATUS remains unchanged because it controls resident filters, notification text and history. Raw status and financial states are never rewritten. The resident filter now sends the already-supported canonical enum while displaying plain labels, including explicit review/assessment/approval stage choices, so Approved and Payment received remain independently filterable. |
| Desktop request tables overflow or lose context on mobile | Shared semantic table with caption, keyboard-focusable scroll region, labelled stacked records below 768px; every column remains available. |
| Service filters and failure recovery vary | Shared labelled fields, count announcement, retry action, filtered-empty recovery, preserved requirements/eligibility/fees preview and real API results. |
| Auth layout clips input controls at 320px | Centered auth form with constrained grid tracks and natural page scrolling; sign-in/registration tabs have roving focus and Arrow/Home/End behavior. MFA/email/password-recovery logic and safe return routing retained. |
| eGovPH appears actionable without an adapter | Existing no-op sign-in control is visibly unavailable; no sign-in functionality is fabricated. Google retains its existing adapter. |
| Category management uses browser alerts | Labelled creation form, preserved input after failures, inline status, native confirmation dialog, focus trap/Escape/focus return and duplicate-operation guard. API methods and paths retained. |
| Draft feedback is ambiguous | Explicit Saving/Uploading/Submitting, Unsaved changes, Draft saved/Changes saved states; autosave, versions, uploads, declaration, appointment rules and navigation-save guard retained. Internal account UUID removed from the resident summary; ownership binding retained. |
| Theme/layout drift in staff/admin/public content | Navy active navigation, compact staff summary and queue sections, common titles, neutral CMS workspace and editorial public service/tourism surfaces. |
| Duplicate CSS and invalid related-service link nesting | Removed 14 identical superseded rules. Migrated the remaining status consumers before removing obsolete status rules and `CitizenWidgets.css`. Related institution/email links no longer nest anchors. |

## Design system use

Use `src/components/ui/Primitives.jsx` for new or migrated UI. Page titles are 28px (24px on narrow shared headers); section titles 20px, body 16px, compact labels 14px and metadata 12px. Spacing uses the centralized 4/8/12/16/20/24/32/40/48/64 scale. Controls use a 6px radius, panels 8px, dialogs 12px. Elevation belongs to overlays; content sections use borders and spacing.

Public content remains editorial. Resident surfaces prioritize tasks and records. Staff/admin use compact operational groupings. Native HTML inputs, selects, checkboxes and radios retain their semantics; the Field primitive binds label, hint, validation and required state. Existing complex editors and access controls preserve specialized interaction logic.

Native ModalDialog retains existing default dimensions and behavior. Explicit small/standard/large/workflow size variants are available. Category deletion uses the small variant. Do not reduce complex configuration dialogs merely to apply a size.

Keep `[data-icon-button="ghost"]` explicit for icon-only utility controls. Text actions use button variants. Route changes use links; auth mode changes use real tabs. Semantic status colors always accompany text.

## Verification

- Production build and lint of modified UI components.
- Routing: 12 tests; resident preferences: 5; settings navigation: 3; authentication: 5.
- Full e-service/billing suite: 27 tests passed, including PostgreSQL/HTTP lifecycle, ownership, department permissions, private uploads, concurrency, assessments, partial payment, verification, official receipts, reversals, business billing and completion.
- Service detail: desktop/tablet/mobile content variants, business selection, loading/failure, existing requests, keyboard access and start flow.
- E-service UI: 1440/390/768px catalog → service → account/business profile → draft → configuration-driven sections, billing unavailable states, CMS editor and direct staff links.
- Resident/staff audit: 27 routes at 320/390/768/1024/1280/1440px, including concern failure/retry, appointment keyboard focus, staff search/upload, nested dialogs and Back navigation.
- Cross-surface visual check: 25 public/auth/resident/staff/admin screens at all six widths. Screenshots and per-route overflow report are in `artifacts/ui-overhaul/screens`.
- Ghost utility controls: 83 named controls; default/hover/active/mouse/keyboard/disabled/dark-surface rules and 15 desktop/mobile routes.
- Added interaction check: auth keyboard tabs, 320px registration layout, category failure/input preservation/retry/delete confirmation/focus return, and dark/high-contrast previews at 320/390/768/1440px.

Browser-only visual fixtures are isolated from production data. The application continues to use its existing APIs. Lifecycle tests use their existing controlled database setup.

## Practical limits

This is a broad frontend implementation and incremental consolidation, not a replacement of the domain model. Existing feature-specific styles still own specialized editors, data visualizations and workflow layouts. Large historical stylesheets were not deleted wholesale. The extracted route inventory, full live CMS contents, every effective-access combination, every long real record, screen-reader announcements and all publication/upload-provider journeys still warrant review with real accounts and production-like data. Automated layout checks and sampled contrast checks do not establish complete WCAG 2.2 AA certification.

No deployment, publishing or real-user financial action was performed. The eGovPH adapter remains a separately documented functionality gap.
