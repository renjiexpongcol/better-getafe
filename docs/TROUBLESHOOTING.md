# Troubleshooting

| Symptom | Check and correction |
| --- | --- |
| Liveness 200, readiness 503 | Liveness only proves the process can answer. Check required database/configuration state and restricted diagnostics. |
| Public reads work, sign-in returns 503 | Verify managed Redis URL/TLS, alias conflicts, registry health and capacity. Never bypass session validation. |
| Every function returns 503 | Verify APP_URL, stable settings encryption key, session secret and database pooler/project ref. Preview isolation is mandatory. Raw bootstrap errors are intentionally not returned to callers. |
| Preview refuses the database | Configure an isolated project/branch ref; the production ref is deliberately rejected. Do not weaken the guard. |
| Local startup asks for Supabase | Provide the intended Development connection securely in .env.development.local, or use npm run setup. Vercel sensitive values cannot be downloaded as usable secrets. |
| Builder rejects a backend port | Production builds must not resolve local backend proxy settings. The Vite configuration now skips them in production. Remove HOST/PORT/VITE_PORT from Vercel when no longer needed. |
| Native Vercel CLI Windows EPERM | This host cannot create builder symbolic links. Use a supported Linux build runner, enable the required Windows capability through the operator, or use the recorded JavaScript CLI diagnostic fallback. Do not change application permissions to hide this. |
| Azure uploads fail before finalization | Check exact-origin Blob CORS, the BlockBlob header, SAS expiry and HTTPS. The container stays private. |
| Media rows exist but previews fail | Distinguish Azure object absence, provider/container mismatch and expired signing credentials. Do not recreate IDs or fall back silently to B2. |
| Settings cannot decrypt | Recover the original SETTINGS_ENCRYPTION_KEY; a fresh key cannot decrypt saved settings. |
| OAuth redirect mismatch | Register APP_URL/auth/callback exactly, with environment-specific ID/secret/redirect tuple. HTTPS and trusted-origin checks remain enabled. |
| Jobs stay pending | Provision the external worker; check its singleton lock, dependency access and persisted heartbeat. A Vercel function does not run it in the background. |
| Cron says already claimed | Inspect scheduled_job_runs. A completed daily run is idempotently skipped; an interrupted run waits for lease expiry and failed work waits for backoff. |
| Database pool exhaustion | Check active function instances times the bounded pool, worker pools and the verified 60-connection server limit. Session locks prevent an unreviewed switch to transaction pooling. |

Run `npm test`, `npm run test:production`, `npm run test:redis`, `npm run lint` and `npm run build` after a configuration or architecture repair. The isolated session browser check is `npm run test:session-timeout-ui`. Do not run dependency installation concurrently with tests in the same working directory; installation replaces node_modules.

