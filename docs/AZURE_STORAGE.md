# Azure Blob Storage

Intended destination: resource group `lgu-getafe-media`, account `lgumedia`, private container `portal-media`, requested region Malaysia West. The Supabase migration journal records an accepted cutover and all 45 media rows identify Azure. These database facts do not independently verify Azure resources, bytes, region or credentials.

Configure `CMS_MEDIA_PROVIDER=azure`, `AZURE_STORAGE_ACCOUNT_NAME`, `AZURE_STORAGE_CONTAINER_NAME` and server-only `AZURE_STORAGE_CONNECTION_STRING`. Runtime currently requires an HTTPS account-key connection string matching the account. The existing managed-identity diagnostic does not establish that managed identity works from Vercel; runtime selection rejects that unsupported authentication mode. Scope credentials and network access deliberately.

`server/src/services/storage.js` centralizes upload, metadata, private access URLs, deletion, listing, health and retrieval. It uses the official Azure SDK, checks private access at activation and during cached health refreshes, and never substitutes B2 when Azure is unavailable. Production local storage is rejected. Saved provider selection and the accepted cutover journal remain in force.

## Direct uploads

1. The authenticated media-management API validates permission, filename, extension, allowed MIME, expected size and configured limits.
2. It persists an expiring upload grant owned by the requesting administrator, using a unique blob key.
3. It returns a create-only, HTTPS, single-blob SAS, valid at most 15 minutes.
4. The browser PUTs the file directly to Azure with `Content-Type` and `x-ms-blob-type: BlockBlob`. Application cookies and CSRF headers are not sent to Azure.
5. The completion API checks owner, grant expiry, actual size/type, image signature and checksum, then saves metadata while preserving media identifiers and captions.
6. Azure bytes are read with the observed ETag during validation to reject a changed version. Create-only SAS permissions prevent overwriting a finalized object through the same grant.

Azure does not enforce the declared application file size in this SAS; finalization enforces it. A malicious grantee can leave an oversized unregistered object until cleanup. Apply storage quotas, monitoring and orphan cleanup accordingly. The browser cannot list, read, delete or overwrite through the upload SAS. The server retains separate read signing authority. No account key reaches the browser.

Configure Blob service CORS outside the application for exact approved Production and isolated Preview origins. Allow PUT, GET, HEAD and OPTIONS; allow Content-Type and x-ms-blob-type, and expose ETag/x-ms-request-id if required. Test a real preflight and PUT. Never make the private container public to solve CORS. SAS URLs are bearer credentials: do not log them or retain them in analytics.

The existing folder-first Media Library lists actual objects with continuation tokens, distinguishes missing objects/provider mismatch from metadata, and registers existing valid images without replacing IDs. Existing preview renewal behavior was retained. Live listing, expiry and upload tests remain blocked until Azure credentials and CORS are verified.

## Legacy migration

The accepted journal means this installation should not automatically repeat cutover. Retain the B2 and historical object access code until references and source bytes have been independently verified. The existing `scripts/migrate-b2-to-azure.mjs` supports dry-run inventory, optional copying, checksum/size verification, collision handling and manifests. It does not delete source objects. Run only outside Vercel:

```powershell
node scripts/migrate-b2-to-azure.mjs --manifest <private-manifest-path>
node scripts/migrate-b2-to-azure.mjs --copy --manifest <private-manifest-path>
node scripts/migrate-b2-to-azure.mjs --audit-references --manifest <private-manifest-path>
```

Review counts, unresolved entries and checksums before an authorized cutover. Secure manifests because object names can identify private documents. The admin migration POST is disabled in Vercel so long copy/cutover promises cannot be abandoned when a function returns. See the established [migration procedure](AZURE_MEDIA_MIGRATION.md) for reference backups and rollback.

Reference: [Azure JavaScript service SAS](https://learn.microsoft.com/en-us/azure/storage/blobs/sas-service-create-javascript).

