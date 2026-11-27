# Environment variables

Vercel injects infrastructure values directly; production does not load a .env file. Local bootstrap reads .env.development.local and .env. Runtime environment files are ignored by Git and deployment uploads; commit only placeholder templates. Private repositories still enforce GitHub push protection. Connect managed providers through Vercel to provision deployed credentials automatically. Never put server secrets under VITE_. See .env.example for placeholder documentation.

| Variable | Requirement and meaning |
| --- | --- |
| APP_URL | Required exact HTTPS origin for Vercel; PUBLIC_SITE_URL is the retained alias. No trailing slash. |
| AUTH_SESSION_SECRET | Required stable signing key, at least 32 random characters; CMS_SESSION_SECRET and SESSION_SECRET are retained aliases. |
| SETTINGS_ENCRYPTION_KEY | Required existing 32-byte base64 key for encrypted settings. A new random value cannot decrypt saved configuration. |
| DATABASE_URL | Preferred runtime URL. Supabase Session pooler, 5432, required by session advisory locks. |
| MY_PREFIX_POSTGRES_URL_NON_POOLING | Existing Marketplace-generated runtime alias, used if DATABASE_URL is absent. |
| POSTGRES_URL_NON_POOLING | Standard Supabase Marketplace session/direct alias, used after the prefixed alias and before legacy CMS aliases. Transaction-pooler URLs remain rejected. |
| CMS_SUPABASE_DATABASE_URL / SUPABASE_DATABASE_URL | Retained server-side aliases, lower precedence than the integration URL. |
| DIRECT_DATABASE_URL | Direct/session URL for explicit migrations; never a transaction pooler. |
| SUPABASE_PROJECT_REF | Optional when the session-pooler username identifies the project; otherwise set explicitly. An explicit value must match that username. Production ref wrgbfwexraarwxpoqzpv remains rejected in Preview, including when inferred. |
| MY_REDIS_REDIS_URL | Existing Marketplace native Redis endpoint. TLS rediss:// required in Vercel. |
| REDIS_URL | Fallback alias; remove it if it conflicts with the integration value. |
| REDIS_PREFIX | Production default getafe retained. Preview adds environment/branch isolation; local adds NODE_ENV. |
| CMS_MEDIA_PROVIDER | azure for this migrated production installation. Vercel rejects local. |
| AZURE_STORAGE_ACCOUNT_NAME | Production lgumedia; must match the connection string. |
| AZURE_STORAGE_CONTAINER_NAME | Production portal-media; use an isolated Preview container. |
| AZURE_STORAGE_CONNECTION_STRING | Required server-only HTTPS shared-key credential. Never a browser value. |
| CRON_SECRET | Required for scheduled functions, at least 32 random characters. |
| PREVIEW_DATA_ISOLATED | Preview must explicitly set true after isolation is verified; production DB ref remains rejected. |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI | Optional sign-in tuple; exact APP_URL/auth/callback, separately registered per environment. |
| MFA_ENCRYPTION_KEY | Optional dedicated stable MFA key; existing signing key fallback retained. |
| SMTP_ENABLED / SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_FROM | Optional SMTP; all needed for enabled delivery. Missing SMTP must not authorize sign-in or bypass required verification. |
| OPENAI_API_KEY | Optional, server-only. AI flags and budgets remain controlled by AI Management. |
| RECAPTCHA_SITE_KEY / RECAPTCHA_SECRET_KEY | Optional public site key and server-only secret for enabled CAPTCHA. |
| INTEGRATION_VAULT_KEYS / INTEGRATION_VAULT_VERSION / INTEGRATION_ALLOWED_HOSTS | Required only for enabled external connectors; stable encryption keyring and exact approved hosts. |
| VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY | Public-only browser client values. Backing data still needs explicit public grants/RLS. |
| MY_PREFIX_VITE_SUPABASE_URLSUPABASE_URL / MY_PREFIX_VITE_SUPABASE_URLSUPABASE_PUBLISHABLE_KEY | Existing generated public aliases explicitly exposed by Vite; no server credential is exposed. |
| SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY | Standard Marketplace values mapped by the build to browser configuration. Prefixed Supabase and NEXT_PUBLIC aliases are also accepted. Only the exact URL and publishable key are exposed; secret/service-role/JWT values are never fallbacks. |
| VERCEL / VERCEL_ENV / VERCEL_URL / VERCEL_GIT_COMMIT_REF | Platform-managed deployment identity. Do not manually fake them in production. |
| HOST / PORT / VITE_PORT / BACKEND_PORT | Local persistent server settings; irrelevant to static production builds and function listening. |

Environment origin, OAuth and Azure values override saved settings. Database URLs always resolve from server bootstrap. Other application settings retain the existing documented database/environment behavior. Required-vs-optional status depends on enabled features; optional does not mean a security mechanism can be skipped.

The initial Vercel metadata already contained database/Redis integration aliases, a legacy CMS session secret, OAuth values and B2 values. Azure, the stable settings key, APP_URL and CRON_SECRET were absent. The user is configuring missing values directly in Vercel. Presence alone is not validation; sensitive values pull as unusable placeholders. Do not paste keys into chat or logs.

## Source inventory

The following inventory includes retained compatibility, local/test and operational switches found in source, plus environment-backed settings. Entries not required above are optional or internal; consult the listed resolver before using an advanced switch. Dynamic externally generated provider variables that the code never reads are not part of this contract.

| Variable | Resolver/source |
| --- | --- |
| `ACCUWEATHER_API_KEY` | `setting: weather.accuWeatherApiKey` |
| `API_CLIENT_ID` | `setting: integrations.clientId` |
| `API_CLIENT_SECRET` | `setting: integrations.clientSecret` |
| `API_CORS_ORIGINS` | `server/src/services/adminUsersRoutes.js`, `server/src/services/requestOrigin.js` |
| `API_KEY` | `setting: integrations.apiKey` |
| `APP_CURRENCY` | `setting: general.currency` |
| `APP_LOCALE` | `setting: general.locale` |
| `APP_NAME` | `setting: general.name` |
| `APP_TIMEZONE` | `setting: general.timezone` |
| `APP_URL` | `setting: general.url`, `server/src/config/deployment.js`, `server/src/services/requestOrigin.js` |
| `AUTH_DEBUG` | `setting: advanced.authDebug`, `server/src/services/authDiagnostics.js` |
| `AUTH_LOCAL_FALLBACK` | `server/src/repositories/cmsUserRepository.js`, `server/src/repositories/portalUserRepository.js` |
| `AUTH_LOCAL_FILE` | `server/src/services/authState.js` |
| `AUTH_RATE_LIMIT_BURST` | `server/src/services/trafficProtection.js` |
| `AUTH_RATE_LIMIT_MAX` | `server/src/services/trafficProtection.js` |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `server/src/services/trafficProtection.js` |
| `AUTH_SESSION_IDLE_ENABLED` | `setting: authentication.sessionIdleEnabled` |
| `AUTH_SESSION_IDLE_MINUTES` | `setting: authentication.sessionIdleMinutes` |
| `AUTH_SESSION_SECRET` | `server/index.js`, `server/src/services/authSecurity.js`, `server/src/services/mfa.js` |
| `AZURE_MEDIA_MIGRATION_VERIFIED` | `server/src/services/storage.js` |
| `AZURE_STORAGE_ACCOUNT_NAME` | `setting: storage.azureAccount` |
| `AZURE_STORAGE_CONNECTION_STRING` | `setting: storage.azureConnectionString` |
| `AZURE_STORAGE_CONTAINER_NAME` | `setting: storage.azureContainer` |
| `B2_APPLICATION_KEY` | `setting: storage.applicationKey` |
| `B2_BUCKET_NAME` | `setting: storage.bucket` |
| `B2_ENDPOINT` | `setting: storage.endpoint` |
| `B2_KEY_ID` | `setting: storage.keyId` |
| `B2_PUBLIC_BASE_URL` | `setting: storage.publicBaseUrl` |
| `B2_REGION` | `setting: storage.region` |
| `BACKEND_PORT` | `scripts/backend-connection.mjs` |
| `CI` | `server/src/config/supabaseSetup.js` |
| `CMS_DB_CONNECT_TIMEOUT_MS` | `setting: database.connectTimeout` |
| `CMS_DB_CONNECTION_LIMIT` | `setting: database.connectionLimit` |
| `CMS_DB_IDLE_TIMEOUT_MS` | `setting: database.idleTimeout` |
| `CMS_DB_QUEUE_LIMIT` | `setting: database.queueLimit` |
| `CMS_MEDIA_PROVIDER` | `setting: storage.provider`, `server/src/config/deployment.js` |
| `CMS_SESSION_SECRET` | `server/index.js`, `server/src/services/authSecurity.js`, `server/src/services/mfa.js` |
| `CMS_SUPABASE_DATABASE_URL` | `server/src/config/supabaseSetup.js`, `server/src/services/postgres.js`, `scripts/test-postgres-lease.mjs` |
| `COMPANY_NAME` | `setting: general.company` |
| `CONFIG_LOCAL_FILE` | `server/src/config/DatabaseSettingsProvider.js` |
| `CONTACT_ADDRESS` | `setting: contact.address` |
| `CONTACT_EMAIL` | `setting: contact.email` |
| `CONTACT_HOURS` | `setting: contact.hours` |
| `CONTACT_NOTIFICATION_EMAIL` | `server/src/services/contactRoutes.js` |
| `CONTACT_PHONE` | `setting: contact.phone` |
| `CRON_SECRET` | `server/src/services/scheduledJobs.js` |
| `DATABASE_URL` | `server/src/services/postgres.js`, `scripts/test-config-service.mjs` |
| `DB_CONNECT_TIMEOUT_MS` | `server/src/config/DatabaseSettingsProvider.js` |
| `DB_CONNECTION_LIMIT` | `server/src/config/DatabaseSettingsProvider.js` |
| `DB_IDLE_TIMEOUT_MS` | `server/src/config/DatabaseSettingsProvider.js` |
| `DB_QUERY_TIMEOUT_MS` | `server/src/config/DatabaseSettingsProvider.js` |
| `DEPLOYMENT_RETRIES` | `scripts/test-deployment-runtime.mjs` |
| `DEPLOYMENT_TIMEOUT_MS` | `scripts/test-deployment-runtime.mjs` |
| `DEPLOYMENT_URL` | `scripts/test-deployment-runtime.mjs` |
| `DEV` | `src/App.jsx`, `src/components/RouteStatusPages.jsx` |
| `DIRECT_DATABASE_URL` | `scripts/migrate-postgresql.mjs` |
| `ERROR_LOG_RETENTION_DAYS` | `server/src/services/errorHandling.js` |
| `GCP_PROJECT_ID` | `setting: security.recaptchaProjectId` |
| `GOOGLE_CLIENT_ID` | `setting: google.clientId` |
| `GOOGLE_CLIENT_SECRET` | `setting: google.clientSecret` |
| `GOOGLE_CLOUD_PROJECT` | `setting: security.recaptchaProjectId` |
| `GOOGLE_REDIRECT_URI` | `setting: google.redirectUri` |
| `HOST` | `server/index.js` |
| `INTEGRATION_ALLOWED_HOSTS` | `server/src/integrationHub/registry.js`, `server/src/services/integrations.js` |
| `INTEGRATION_GOOGLE_REDIRECT_URI` | `server/src/integrationHub/oauth.js` |
| `INTEGRATION_HISTORY_RETENTION_DAYS` | `server/src/integrationHub/repository.js` |
| `INTEGRATION_VAULT_KEYS` | `server/managed-worker.js`, `server/src/integrationHub/security.js` |
| `INTEGRATION_VAULT_VERSION` | `server/src/integrationHub/security.js` |
| `INTERNAL_SERVICE_ID` | `server/src/services/trafficProtection.js` |
| `INTERNAL_SERVICE_MAX_SKEW_MS` | `server/src/services/trafficProtection.js` |
| `INTERNAL_SERVICE_SECRET` | `server/src/services/trafficProtection.js` |
| `LOCAL_STORAGE_PATH` | `setting: storage.localPath` |
| `LOCATION_LABEL` | `setting: general.locationLabel` |
| `MEDIA_MIGRATION_FREEZE` | `server/index.js`, `server/src/services/mediaWriteGate.js`, `server/src/services/storage.js` |
| `MFA_ENCRYPTION_KEY` | `server/src/services/mfa.js` |
| `MOBILE_VERIFICATION_ENABLED` | `setting: authentication.mobileVerificationEnabled` |
| `MY_PREFIX_POSTGRES_URL_NON_POOLING` | `server/src/services/postgres.js` |
| `MY_PREFIX_VITE_SUPABASE_URLSUPABASE_PUBLISHABLE_KEY` | `src/utils/supabase.js`, `vite.config.js` |
| `MY_PREFIX_VITE_SUPABASE_URLSUPABASE_URL` | `src/utils/supabase.js`, `vite.config.js` |
| `MY_REDIS_REDIS_URL` | `server/src/infrastructure/redis/redisConfiguration.js` |
| `NODE_ENV` | `server/index.js`, `server/src/config/bootstrap.js`, `server/src/config/ConfigService.js` |
| `OAUTH_CLIENT_SECRET` | `setting: integrations.oauthClientSecret` |
| `OPENAI_API_KEY` | `setting: ai.openaiApiKey`, `server/src/services/aiManagement.js` |
| `OPENWEATHER_API_KEY` | `setting: weather.openWeatherApiKey` |
| `OTP_RATE_LIMIT_BURST` | `server/src/services/trafficProtection.js` |
| `OTP_RATE_LIMIT_MAX` | `server/src/services/trafficProtection.js` |
| `OTP_RATE_LIMIT_WINDOW_MS` | `server/src/services/trafficProtection.js` |
| `PLAYWRIGHT_CHANNEL` | `scripts/test-session-timeout-ui.mjs` |
| `PORT` | `server/index.js`, `scripts/backend-connection.mjs`, `scripts/dev-runner.mjs` |
| `PORTAL_DB_CONNECT_TIMEOUT_MS` | `setting: portalDatabase.connectTimeout` |
| `PORTAL_DB_CONNECTION_LIMIT` | `setting: portalDatabase.connectionLimit` |
| `PORTAL_DB_IDLE_TIMEOUT_MS` | `setting: portalDatabase.idleTimeout` |
| `PORTAL_DB_QUEUE_LIMIT` | `setting: portalDatabase.queueLimit` |
| `PORTAL_SERVERLESS` | `server/src/config/deployment.js`, `server/src/services/websiteAnalyticsRoutes.js` |
| `PORTAL_STARTUP_ATTEMPT_ID` | `server.js` |
| `PORTAL_UNIFIED_DEV_SERVER` | `server/index.js`, `vite.config.js` |
| `PREVIEW_DATA_ISOLATED` | `server/src/config/deployment.js` |
| `PROD` | `src/services/websiteAnalytics.js` |
| `PSGC_API_TOKEN` | `setting: integrations.psgcApiToken` |
| `PSGC_API_VERSION` | `setting: integrations.psgcApiVersion` |
| `PUBLIC_CONTENT_DEBUG` | `server/index.js` |
| `PUBLIC_SITE_URL` | `setting: general.url`, `server/index.js`, `server/src/config/deployment.js` |
| `RATE_LIMIT_ADMIN_BURST` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_ADMIN_MAX_DELAY_MS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_ADMIN_PER_MINUTE` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_ADMIN_STAFF_BURST` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_ADMIN_STAFF_MAX` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_ADMIN_STAFF_WINDOW_MS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_API_BURST` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_API_MAX_DELAY_MS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_API_PER_MINUTE` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_AUTH_BURST` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_AUTH_MAX` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_AUTH_SUSTAINED_BURST` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_AUTH_SUSTAINED_MAX` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_AUTH_SUSTAINED_WINDOW_MS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_AUTH_WINDOW_MS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_AUTHENTICATED_BURST` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_AUTHENTICATED_MAX` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_AUTHENTICATED_WINDOW_MS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_CONTACT_BURST` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_CONTACT_MAX` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_CONTACT_WINDOW_MS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_DEBUG` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_ENABLED` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_EXPENSIVE_BURST` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_EXPENSIVE_MAX` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_EXPENSIVE_WINDOW_MS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_GENERAL_BURST` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_GENERAL_MAX` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_GENERAL_WINDOW_MS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_MAX_ACTIVE_REQUESTS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_MAX_DELAYED_REQUESTS_PER_CLIENT` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_MAX_GLOBAL_DELAYED_REQUESTS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_MAX_QUEUE_DEPTH` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_MEDIA_READ_BURST` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_MEDIA_READ_MAX_DELAY_MS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_MEDIA_READ_PER_MINUTE` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_OTP_BURST` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_OTP_MAX` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_OTP_SUSTAINED_BURST` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_OTP_SUSTAINED_MAX` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_OTP_SUSTAINED_WINDOW_MS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_OTP_WINDOW_MS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_PUBLIC_BURST` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_PUBLIC_MAX_DELAY_MS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_PUBLIC_PER_MINUTE` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_SIGNED_IN_BURST` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_SIGNED_IN_MAX` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_SIGNED_IN_WINDOW_MS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_STAFF_BURST` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_STAFF_MAX` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_STAFF_WINDOW_MS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_TRUSTED_PROXY_CIDRS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_UPLOADS_BURST` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_UPLOADS_MAX_DELAY_MS` | `server/src/services/trafficProtection.js` |
| `RATE_LIMIT_UPLOADS_PER_MINUTE` | `server/src/services/trafficProtection.js` |
| `RECAPTCHA_SECRET_KEY` | `setting: security.recaptchaSecretKey` |
| `RECAPTCHA_SITE_KEY` | `setting: security.recaptchaSiteKey` |
| `REDIS_CONNECT_TIMEOUT_MS` | `server/src/infrastructure/redis/redisClient.js` |
| `REDIS_PREFIX` | `server/src/infrastructure/redis/redisClient.js` |
| `REDIS_RECONNECT_MAX_DELAY_MS` | `server/src/infrastructure/redis/redisClient.js` |
| `REDIS_URL` | `server/src/infrastructure/redis/redisConfiguration.js` |
| `REQUIRE_MOBILE_VERIFICATION` | `setting: authentication.requireMobileVerification` |
| `SEMAPHORE_API_KEY` | `setting: authentication.smsApiKey` |
| `SEMAPHORE_SENDER_NAME` | `setting: authentication.smsSenderName` |
| `SESSION_SECRET` | `server/index.js`, `server/src/services/authSecurity.js`, `server/src/services/mfa.js` |
| `SETTINGS_ENCRYPTION_KEY` | `server/src/config/deployment.js`, `server/src/config/SecretProvider.js` |
| `SETTINGS_ENCRYPTION_KEY_FILE` | `server/src/config/SecretProvider.js` |
| `SMTP_ENABLED` | `setting: email.enabled` |
| `SMTP_FROM` | `setting: email.senderEmail` |
| `SMTP_FROM_NAME` | `setting: email.senderName` |
| `SMTP_HOST` | `setting: email.smtpHost` |
| `SMTP_PASS` | `setting: email.password` |
| `SMTP_PASSWORD` | `setting: email.password` |
| `SMTP_PORT` | `setting: email.smtpPort` |
| `SMTP_REPLY_TO` | `setting: email.replyTo` |
| `SMTP_SECURITY` | `setting: email.security` |
| `SMTP_USER` | `setting: email.username` |
| `STATISTICS_API_URL` | `server/src/services/statisticsService.js` |
| `STORAGE_PROVIDER` | `setting: storage.provider`, `server/src/config/deployment.js` |
| `STORAGE_PUBLIC_BASE_URL` | `setting: storage.publicBaseUrl` |
| `SUPABASE_DATA_API_PUBLISHABLE_KEY` | `server/src/services/supabaseDataApi.js` |
| `SUPABASE_DATA_API_URL` | `server/src/services/supabaseDataApi.js` |
| `SUPABASE_DATABASE_URL` | `server/src/services/postgres.js` |
| `SUPABASE_PROJECT_REF` | `server/src/services/postgres.js` |
| `VERCEL` | `server/src/config/ConfigService.js`, `server/src/config/deployment.js`, `server/src/infrastructure/redis/redisConfiguration.js` |
| `VERCEL_ENV` | `server/src/config/ConfigService.js`, `server/src/config/deployment.js`, `server/src/infrastructure/redis/redisClient.js` |
| `VERCEL_GIT_COMMIT_REF` | `server/src/infrastructure/redis/redisClient.js` |
| `VERCEL_URL` | `server/src/config/deployment.js`, `server/src/infrastructure/redis/redisClient.js` |
| `VITE_ANNOUNCEMENT_DISMISS_DURATION_HOURS` | `src/services/announcementDismissals.js` |
| `VITE_APP_SURFACE` | `src/App.jsx`, `src/routes.js` |
| `VITE_BACKEND_URL` | `scripts/backend-connection.mjs`, `scripts/dev-runner.mjs` |
| `VITE_GETAFE_FACEBOOK_URL` | `setting: general.facebookUrl`, `src/components/FacebookPageFeed.jsx`, `src/components/Footer.jsx` |
| `VITE_GETAFE_GITHUB_URL` | `src/components/Footer.jsx` |
| `VITE_GETAFE_INSTAGRAM_URL` | `src/components/Footer.jsx` |
| `VITE_GETAFE_X_URL` | `src/components/Footer.jsx` |
| `VITE_GETAFE_YOUTUBE_URL` | `src/components/Footer.jsx` |
| `VITE_PORT` | `server/index.js`, `scripts/dev-runner.mjs` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `src/utils/supabase.js` |
| `VITE_SUPABASE_URL` | `src/utils/supabase.js` |
| `VITE_WEBSITE_ANALYTICS_ENABLED` | `src/services/websiteAnalytics.js` |
| `WEBSITE_ANALYTICS_CLEANUP_BATCH_SIZE` | `server/scripts/cleanupWebsiteAnalytics.js` |
| `WEBSITE_ANALYTICS_CLEANUP_MAX_BATCHES` | `server/scripts/cleanupWebsiteAnalytics.js` |
| `WEBSITE_ANALYTICS_ENABLED` | `server/src/services/websiteAnalyticsRoutes.js` |
| `WEBSITE_ANALYTICS_RECEIPT_DAYS` | `server/src/services/searchRoutes.js`, `server/src/services/websiteAnalyticsRoutes.js` |
| `WEBSITE_ANALYTICS_ROLLUP_MONTHS` | `server/scripts/cleanupWebsiteAnalytics.js`, `server/src/services/websiteAnalyticsRoutes.js` |
