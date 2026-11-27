# Rollback

Retain the last verified deployment ID, source commit, environment-variable version inventory, stable encryption keys, managed database backup and storage migration manifests before release. No production deployment or domain assignment was performed during this work.

For an approved rollback, use the existing Vercel project's previous verified production deployment. Inspect the exact team/project and deployment first, then execute `vercel rollback <deployment-url-or-id>` only with explicit release authorization. Verify frontend routes, API readiness, existing sessions and private-media access afterward. Vercel rollback can change auto-promotion behavior; review it before the next release.

Keep schema changes compatible with the prior application. Migrations 056/057 do not delete application records. 057's empty/private operational tables can remain through an application rollback. Do not automatically disable RLS or restore broad anonymous access from 056. Permission backups are diagnostic recovery evidence, not a safe default rollback script. Add a narrowly reviewed public view if a legitimate public read requires it.

Do not rotate the settings encryption key during an ordinary rollback: old ciphertext requires the original key. Preserve the production Redis namespace and signing secret to keep sessions usable; intentional security revocation is a separate action. Preview uses separate state and must not replace Production configuration.

For media, keep the accepted Azure cutover journal and stable database references. Never delete Azure or B2 source objects as part of an application rollback. Do not switch provider variables alone after cutover: the journal deliberately continues to require Azure. Review the existing migration reference backups and authorize a documented storage rollback only after verifying both destinations.

For worker failure, stop the external worker gracefully, check that its PostgreSQL singleton connection/lock has been released and restart a known-good version with bounded supervisor backoff. Processing email is recovered only by the elected worker. Expect at-least-once SMTP delivery after ambiguous provider acknowledgements.

Before a destructive schema rollback or data restore, obtain approval, capture current state and validate a restore into an isolated database. A Vercel application rollback does not restore database records or storage objects.

