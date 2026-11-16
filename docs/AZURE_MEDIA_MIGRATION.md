# Better Getafe media migration

The target is the private container `portal-media` in `lgumedia` (resource group `lgu-getafe-media`, Malaysia West). Disable anonymous blob access on the account. Save the account-key connection string in Admin → Settings → Storage or inject `AZURE_STORAGE_CONNECTION_STRING` into the backend process. The migration command uses the process variable when set and otherwise reads the saved credential. It also needs the Backblaze S3 endpoint, bucket, and read/list credentials.

## Admin workflow

1. Apply PostgreSQL migration `047_azure_media_migration.sql` using `npm run migrate:postgres`. Restart the backend from the updated application. Use a backend host with access to both storage services and enough execution time for the copy. A backend restart interrupts a running job. **Resume migration** inventories again and verifies existing copies without overwriting them.
2. Open **Admin → Settings → Storage → Migrate media to Azure**. Run the inventory first, then start the migration. The private PostgreSQL tables hold object keys, checksums, progress, and reference backups. The admin response contains aggregate counts and reference locations only.
3. Resolve missing keys and conflicting objects. Replace direct B2 links identified by the audit with the appropriate portal media reference for that content. Public and restricted files use different access flows, so the migration blocks on direct links for review instead of publishing them through a new generic URL.
4. Deploy this migration workflow to every backend. Pause any external Backblaze writers, then click **Switch to Azure**. The portal pauses its own Backblaze writes in PostgreSQL, waits for production upload links to expire, and verifies files and references again. If verification fails, portal writes resume.
5. After final verification, click **Activate Azure**. The backend tests the private Azure container, commits the verified reference changes, and loads Azure in the running process. Other updated backend instances pick up the committed activation. Uploads stay paused while you check folders, featured images, galleries, PDFs, and authorized downloads.
6. Click **Accept cutover** after those checks to resume uploads on Azure. Verify a nested upload and reload. Keep Backblaze credentials and its bucket available during the rollback window. If rollback is needed, freeze writes first, preserve media created on Azure since cutover, and restore provider and bucket metadata from `media_migration_reference_backup` before bringing Backblaze back. Removing the Backblaze implementation and secrets is a separate deployment after acceptance and rollback. Bucket deletion is separate.

Run the inventory from a host with access to both providers. Save the manifest outside the repository and web roots because keys can identify restricted files.

```powershell
node --env-file=.env scripts/migrate-b2-to-azure.mjs --manifest C:\workspace\getafe-media.jsonl
node --env-file=.env scripts/migrate-b2-to-azure.mjs --manifest C:\workspace\getafe-media.jsonl --copy
node --env-file=.env scripts/migrate-b2-to-azure.mjs --manifest C:\workspace\getafe-media.jsonl --audit-references
```

The default command makes no cloud writes. It reports source and destination counts and bytes, missing destination objects, destination-only objects, and verification results for objects present on both sides. Copy mode adds missing blobs and checks size, streamed SHA-256, HTTP headers, and custom metadata. It verifies existing blobs on rerun so an interrupted run can be resumed. Review the latest complete summary by run ID. A run without a summary did not finish. Process each source bucket into a separate inventory and resolve overlapping keys before using a shared container.

`--audit-references` also reports active Backblaze media records whose source key is missing or whose Azure copy could not be verified. It does not rewrite PostgreSQL references. The command exits unsuccessfully if any of those references or copies are unresolved.

## Work required before switching

- Reconcile the inventory with database media records, pending uploads, news and draft images and galleries, public content and settings, official and department photos, attachments, resident profiles, and e-service documents. Scan stored HTML and JSON for direct Backblaze URLs. Report database references missing in Backblaze and objects with no known reference. The copy command inventories objects independently of those references.
- Update mapped Backblaze URLs and provider metadata in a reversible database change with a saved before-image. Azure uses the authenticated CMS upload proxy and blob-scoped read URLs. Private workflow downloads continue through their authorized backend routes.
- Pause all media mutations across instances and maintenance jobs. Let pending writes settle, repeat the inventory, and reconcile changed and deleted keys. The command flags mismatches and destination-only files for review. Resume with the original provider if the final verification is incomplete.
- After verifying the final counts, byte totals, checksums, and references, set `AZURE_MEDIA_MIGRATION_VERIFIED=true` and `CMS_MEDIA_PROVIDER=azure` in the backend deployment environment. Restart the backend and check the homepage image, a news gallery, PDF, restricted access, and CMS upload, refresh, replacement, and deletion with disposable media. Check provider traffic and configuration before ending the migration window.
  For local development, update those values in `.env` and remove or update any conflicting process environment values. Stop the existing process before running `npm run dev`, since the runner reuses a healthy server on port 5173.
  Azure becomes active after startup confirms that the private container supports writing, reading, and deleting a temporary blob. Verify **Active provider** in Admin → Settings → Storage after restart.
- Keep Backblaze intact for rollback. Before switching back, pause mutations, reconcile Azure additions, replacements, and deletions back to the rollback store, and restore the matching database reference state. Remove provider code and credentials after acceptance and the rollback window. Review old bucket deletion separately.
