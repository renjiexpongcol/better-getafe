# Prompt: review and overhaul the Getafe Portal UI

You are reviewing an existing municipal portal for a planned UI overhaul. Read the supplied `UI_BLUEPRINT.md`, `UI_BLUEPRINT.json`, and `UI_ROUTE_INVENTORY.md` before recommending changes. They describe the current local source structure; the recommended target structure is explicitly separate from existing implementation.

## Objective

Find inconsistencies and usability defects across the public website, authentication, resident portal, staff portal and admin/CMS. Produce a coherent shared design system and staged migration plan that improves the UI while preserving established behavior.

## First deliverable: evidence-based audit

1. Map every route/view to its shell, feature component, stylesheet owner and permission persona. Distinguish canonical routes, compatibility redirects, shell-owned views and configurable CMS content.
2. Examine typography, spacing, color, button hierarchy, icon controls, fields/dropdowns, tables, status badges, navigation, tabs, modal/drawer/popover behavior, feedback/recovery and responsive layouts.
3. Compare shared patterns across surfaces. Preserve justified differences between public editorial content and staff/admin operational tools.
4. Treat parallel legacy and configurable request/payment flows as separate contracts until their data and behavior have been mapped. Do not delete one because its label looks redundant.
5. Inspect computed styles and screenshots before calling an old CSS declaration an active visual defect. Consider stylesheet order, specificity, theme attributes and focus/icon override layers.
6. Label each finding **runtime-reproduced**, **source-confirmed**, or **hypothesis**. Do not invent findings for screens you cannot access.
7. For each finding provide route, screen state, viewport, persona, component/source files, severity, evidence, user impact, proposed shared fix and verification steps. Use the finding schema in the blueprint.

If you have only the blueprint and no repository/browser access, clearly limit the result to architecture risks, design recommendations and a verification plan. Request the relevant source/screens when needed; do not claim runtime reproduction.

## Second deliverable: design system and migration blueprint

- Define semantic tokens for color, typography, spacing, borders, radius, elevation, motion and stacking. Include light/dark/high contrast where supported.
- Specify reusable Button/IconButton, form controls, field error, dialog/drawer/popover, tabs/section navigation, table/filter/pagination, status/feedback, metadata/timeline and processing-panel patterns.
- Define desktop/mobile shell behavior for all five surfaces, with consistent keyboard and touch interaction.
- Define list/detail, application wizard, record-processing, billing/payment, account/settings, CMS editor/media-selector and public-content patterns.
- Identify existing components to extend, replace or retain, plus CSS blocks that can be removed only after consumers migrate.
- Prioritize shared primitives and shells before individual-page polish. Provide a phased plan with validation and rollback boundaries.

## Behavior that must survive the overhaul

- Keep routes/redirects, safe return navigation, anonymous/authenticated separation and setup/permission gates.
- Keep staff permission groups and servicing department memberships separate from profile department text. Do not grant assessment/payment rights through a styling change.
- Use configured service revisions/snapshots, fields, requirements, fees and workflow transitions. Never hard-code one workflow for all services.
- Preserve assessment issuance/replacement, payment submission, pending verification, verified payment, official receipts, reversals and completion as distinct operations. Navigation must not create financial records.
- Preserve draft saving and isolation by record, independent employee-profile drafts, required selections, validation, upload privacy/replacement rules and failed-save recovery.
- Preserve server-backed appointment availability, disabled unavailable dates/slots and conflict recovery.
- Keep icon-only utility controls visually transparent with adequate invisible hit targets and accessible keyboard focus. Keep intentional text-button surfaces.
- Preserve Philippine date/time display, preference/language handling and supported accessibility settings.

## Acceptance criteria

Test 320, 390, 768, 1024 and 1440px; keyboard, mouse and touch; long content; empty/loading/error/retry/busy/success/conflict states; and resident, department-only staff, assessor, payment verifier, admin and super-admin personas. Include denied-access states and account-setup requirements.

Use existing browser/domain regression tests as a starting point, not as proof that every live configuration is correct. The final output should contain the audit findings, design-system specification, before/after patterns, staged migration plan and verification matrix. Do not implement backend/domain changes as part of a visual overhaul without separately identifying and justifying them.
