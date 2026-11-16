# Getafe Portal Architecture Implementation Status

## Scope of this increment

This increment establishes the first non-breaking foundation for the modular platform migration:

- npm workspace boundaries for public web, resident app, administration, API, workers, and shared packages;
- stable package names for design system, UI, API client, authentication client, validation, configuration, shared types, and utilities;
- a deployment validation command that runs lint, the existing production build, API route inventory, and readiness checks;
- explicit documentation that the orchestrator never performs destructive database migrations.
- independent Vite build entry points and release output directories for the public, resident, and administration surfaces;
- a runtime surface policy that prevents a surface build from serving routes owned by another application.
- surface-specific route module discovery so each independent build only emits the route chunks it owns.
- workspace-backed design-system tokens, status semantics, and UI primitives with compatibility shims for existing imports.
- a resident authentication client contract for session, login, registration, MFA, and logout operations, with the existing React context retained as its lifecycle adapter.
- centralized role and permission predicates for the administration and staff shells, consumed by protected routing and module access checks.
- a non-breaking `/api/v1` compatibility alias and shared API client contract; aliases normalize before CORS, policy, validation, and authorization middleware so both URL forms use the same security rules.
- independent static app images, an API image, and a host-aware reverse proxy with health-gated Compose dependencies;
- a post-start deployment smoke check covering proxy health, all three surfaces, and API v1 readiness.

The current React application, Express API, routes, database, and Docker Compose behavior remain in place. No route or data migration has been performed. The root build continues to discover every route as a rollback path, while the three independent builds use explicit public, resident, and admin route globs.

## Current-to-target transition

The workspace packages are intentionally small contracts at this stage. Existing application imports have not been moved yet. This keeps the increment reversible while the clean baseline and route ownership are reviewed.

Next extraction order:

1. Add release observability and rollback metadata around the independent deployment artifacts.

The three build commands are now available through `npm run build:apps` and write to `dist/apps/public-web`, `dist/apps/resident-app`, and `dist/apps/admin-portal`. Public output excludes resident/admin route chunks; resident output excludes public content route chunks; admin output contains the admin shell and staff entry route only.

## Deployment validation

```bash
npm run deploy:local
npm run deploy:staging
npm run deploy:production
```

The command validates configuration, runs the existing lint and build checks, inventories API routes, and verifies `/api/ready`. Local validation tolerates an API that is not running so the build can be checked independently. Staging and production require readiness.

Use `--skip-build` or `--skip-lint` only for a controlled diagnostic run. Database migrations remain a separate approved operation.
