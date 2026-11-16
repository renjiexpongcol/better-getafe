# Backend configuration sources

The backend `ConfigService` is the runtime resolver for settings shown under
Admin → Settings. Feature handlers and settings responses must read this same
snapshot through `config.get()` or the settings test candidate. Secret values
are encrypted in PostgreSQL and are returned only as configured status.

## Precedence

| Category | Precedence and activation |
| --- | --- |
| Bootstrap | Process/deployment environment, then local `.env` in development. `CMS_SUPABASE_DATABASE_URL`, session signing keys, `SETTINGS_ENCRYPTION_KEY`, and provider infrastructure credentials are bootstrap inputs. Changing them requires restarting the backend and any workers. |
| Google OAuth | In local development, a complete `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_REDIRECT_URI` tuple intentionally overrides saved values and is read-only in Settings. Clear that tuple to manage OAuth in PostgreSQL. In production, saved PostgreSQL settings take precedence over environment fallback. New flows use the resolved tuple immediately; existing flows keep their saved state and fail closed if the client ID changed. |
| Database pools | CMS and resident services use the single backend `CMS_SUPABASE_DATABASE_URL`. There is no local PostgreSQL host/password fallback or separate portal URL. Pool sizing values are resolved through settings and pool changes reconnect immediately. |
| Storage | A configured deployment provider environment variable controls provider selection where present; Settings displays the resolved provider. Credentials and provider parameters use saved PostgreSQL values, with environment fallback. Saving active storage settings prepares and swaps the runtime client before success is returned. |
| Email, SMS, weather, PSGC, integrations | Saved PostgreSQL setting, then backend environment fallback, then default. Runtime callers use the resolver. SMTP and storage resources are re-created before a save is activated; SMS and API credentials are read on each request. PSGC schedule changes are restarted on save. |
| Session, security, feature, public content, and legal settings | Saved PostgreSQL setting, then backend environment fallback, then default. Request handlers read the resolver dynamically, so changes apply immediately. |
| Vite/browser | Only explicitly public `VITE_*` variables may be compiled into browser code. Never place secrets or database/bootstrap credentials in Vite variables. Admin settings are fetched from the backend; the browser is not a second configuration store. |

`.env.example` lists supported local/deployment variables with safe empty or
placeholder values. Keep real local credentials in ignored `.env`; do not copy
them into this example or frontend code. `SETTINGS_ENCRYPTION_KEY` must remain
stable across restarts and instances because it decrypts admin-managed secrets.

## OAuth verification

For local Google sign-in, the provider OAuth client must authorize the exact
redirect URI `http://localhost:5173/auth/callback`. The value sent
to Google and the token exchange value are taken from the same resolved Google
settings, and the callback URL is pinned in the short-lived OAuth state. A
configured client is not considered verified until a browser flow completes
token exchange, verified-user lookup, and session creation with those values.
