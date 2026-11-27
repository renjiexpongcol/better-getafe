# Database-first cloud setup

Credentials are injected by the existing Vercel integrations, not committed to Git. The Vercel account inspection confirmed Supabase resource `lgu-getafe-db` and Redis resource `redis-bistre-prism` connected to project `better-getafe`, team `lgu-getafe`. No replacement resources or paid plans were provisioned.

## Connect and verify Supabase first

Run `npm run setup:database`. This uses the configured Supabase connection and executes a read-only SELECT. It does not require the portal schema, Redis, storage, sessions, an encryption key or browser build tools, and never starts a worker or server. The existing `npm run setup` still checks the full portal schema.

The supplied development database `dddezkhdlboujgivqvgg` has passed this connection check. At the earlier read-only inventory it had zero public tables. A connection pass does not mean portal tables or administrator accounts exist. Reviewed initialization/migrations are a separate step; this workflow never runs them automatically.

## Use the existing provider authorization screens

```powershell
npm run setup:cloud
npm run setup:cloud -- --open supabase
npm run setup:cloud -- --open redis
```

The first command checks the linked project, inspects existing resources and verifies the local database. The other commands call Vercel's native authenticated integration SSO flow to open the existing provider resource. They do not install new integrations, create resources, accept billing terms, rotate credentials or change production settings. Browser consent, if requested, happens on the provider/Vercel screen. Temporary SSO output is withheld from terminal logs.

For project/environment attachment, open [the project's Storage tab](https://vercel.com/lgu-getafe/better-getafe/stores), select the existing resource and manage its project connection. The Supabase integration syncs credentials to connected Vercel projects automatically. The native Redis integration already supplies its Redis URL. This avoids typing credentials into repository files for deployed use.

The backend accepts `DATABASE_URL`, `MY_PREFIX_POSTGRES_URL_NON_POOLING`, `POSTGRES_URL_NON_POOLING`, `CMS_SUPABASE_DATABASE_URL`, then `SUPABASE_DATABASE_URL`, in that order. It requires TLS and the Session pooler on port 5432 in Vercel; port 6543 transaction URLs are unsuitable for the application's advisory locks. A project ref can be inferred from the authenticated pooler username; an explicit conflicting ref is rejected. The existing production project remains forbidden in Preview.

The browser build maps only Supabase URL/publishable-key aliases, including standard Marketplace names. It does not expose the rest of the provider environment. A secret key supplied in a browser publishable-key setting fails the build. Native Redis URL handling is unchanged: MY_REDIS_REDIS_URL, then REDIS_URL.

Vercel sensitive variables cannot be pulled as usable local secret values. The local read-only check uses the credentials already stored securely in the ignored local env file; the cloud uses injected values. Opening the provider dashboard does not itself prove database/Redis connectivity from a deployed function.

## Finish the remaining portal configuration later

Connecting providers is the first stage. Running the complete portal also requires reviewed schema initialization, session signing material, the existing stable settings-encryption key (or initial key for a genuinely new database), functioning Redis sessions, configured storage and environment-appropriate origins. Preserve existing keys for saved encrypted settings. Additional provider settings can then be managed through the authenticated administration screens.

Preview requires verified isolation of database, Redis namespace and media container. Do not assert PREVIEW_DATA_ISOLATED merely to clear a bootstrap error. The current app cannot offer an unauthenticated page that accepts administrator database credentials or authorizes itself before its security dependencies exist. Use the existing Vercel/provider authorization screens for that bootstrap stage.

## Repair the rejected push

GitHub rejected the unpublished `1ee5fe3` commit because it contained the real local env file. The introducing commit was amended, and the local env contents were preserved while its index entry was removed. A later deletion commit alone would not repair a push containing the original secret-bearing commit.

Runtime env files are ignored again. The credential-approval baseline and its exception logic were removed; actual credentials are no longer allowlisted for commits. The scanner now explicitly recognizes Supabase secret keys in addition to Azure account keys and existing rules.

Before pushing, fetch the intended base and run:

```powershell
npm run verify:push -- origin/update-portal
npm run audit:secrets
npm run verify:deployment
```

The first command inspects every outgoing commit tree for runtime env files, even if a later commit deletes them. It permits placeholder example/sample/template files. The credential scan also checks code/history for recognized secret formats and prints only locations and fingerprints. A local scan does not replace GitHub's own push protection. Never use GitHub's unblock links to publish these real credentials.

GitHub metadata at this checkpoint reports the repository visibility as public and its default branch as update-portal. This differs from the earlier assumption that it was private. No repository visibility or GitHub protection setting was changed. Use a separate review/Preview branch while production verification remains incomplete.

References: [GitHub push-protection repair](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/work-with-leak-prevention/push-protection-on-the-command-line), [Supabase Marketplace credential synchronization](https://supabase.com/docs/guides/integrations/vercel-marketplace).
