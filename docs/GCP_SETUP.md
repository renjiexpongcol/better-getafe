# Google Cloud production setup

The application remains local by default. The existing Cloud SQL target is `getafemodernizationportal:asia-southeast1:getafe-portal` in `asia-southeast1`, with public IP connectivity enabled. Its CMS database is `getafe_cms` and its application user is `getafe-portal`. Before setting either CMS provider to `gcp`, apply the schema and supply the database password through a secret. Production startup performs a fail-fast configuration check; `npm run cms:check` validates the environment without connecting.

## 1. Cloud SQL (MySQL)

1. In the intended Google Cloud project, enable **Cloud SQL Admin API**, create a **Cloud SQL for MySQL 8.0+** instance, and create database `getafe_cms` plus a least-privilege application user.
2. Record the instance connection name in the format `PROJECT:REGION:INSTANCE` and set it as `CMS_CLOUD_SQL_INSTANCE` (or the legacy alias `INSTANCE_CONNECTION_NAME`).
3. Apply [cloudsql-schema.sql](../database/cloudsql-schema.sql) to the new database.
4. Set `PRIVATE_IP=false` for the current public-IP configuration. Deploy on Cloud Run with the Cloud SQL connection attached, or use the Cloud SQL Node.js Connector/Auth Proxy during development. The runtime service account needs **Cloud SQL Client**. Switch to private IP only after VPC/private-service networking is configured.

## 2. Cloud Storage

1. The production CMS media bucket is `gs://getafe-supra-storage`. Use uniform bucket-level access; do not make the bucket broadly public for administrative uploads.
2. Give the runtime service account the minimum object permissions it needs (typically Storage Object Admin for upload/delete, or a narrower custom role).
3. Set `GCS_BUCKET_NAME` and the intended served URL as `GCS_PUBLIC_BASE_URL`. `GCS_BUCKET` remains supported as a legacy alias. If media must remain private, use the server's signed URLs rather than making the bucket public.

For browser uploads, apply this restricted bucket CORS policy (replace or remove origins that are not used):

```json
[
	{
		"origin": ["https://getafe.supra-intra.org", "http://localhost:5173"],
		"method": ["PUT"],
		"responseHeader": ["Content-Type"],
		"maxAgeSeconds": 900
	}
]
```

The Cloud Run service account needs `storage.objects.create`, `storage.objects.get`, and `storage.objects.delete` on this bucket. Grant `roles/storage.objectAdmin` only when a custom role is not practical; signed URL generation itself uses the service account's signing capability and does not require public bucket access.

## 3. Environment and verification

Copy `.env.example` to `.env`, set both database providers and the media provider to `gcp`, replace every placeholder, then run:

```powershell
npm run cms:check
```

## Portal user accounts

The portal accounts database is `getafe-users` on the same Cloud SQL instance. Run [cloudsql-users-schema.sql](../database/cloudsql-users-schema.sql) in that database, then set `PORTAL_DATABASE_PROVIDER=gcp`, `PORTAL_DB_NAME=getafe-users`, `PORTAL_DB_USER=getafe-portal`, and either `PORTAL_DB_PASSWORD` or `PORTAL_IAM_AUTH=true` in `.env`. Portal registration and login then use this database instead of browser-only demo storage.

For GCP authentication, use Application Default Credentials locally or attach a service account to the deployed workload. Never commit service-account JSON keys, database passwords, or `.env` files.

## 4. Required runtime packages for the cloud adapter

When implementing/deploying the Cloud SQL/Storage adapter, install:

```powershell
npm install mysql2 @google-cloud/cloud-sql-connector @google-cloud/storage
```

Google recommends the Cloud SQL language connector, which provides encrypted, IAM-authorized connections; Cloud Storage’s Node.js client uses Application Default Credentials. See the [Cloud SQL connector guide](https://cloud.google.com/sql/docs/mysql/connect-connectors) and [Cloud Storage Node.js upload guide](https://cloud.google.com/storage/docs/uploading-objects).

## 5. Deploy to Cloud Run

Build and push the image with Artifact Registry, then deploy it with the Cloud SQL instance attached:

```powershell
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/REPOSITORY/getafe-portal:latest
gcloud run deploy getafe-portal `
	--image REGION-docker.pkg.dev/PROJECT_ID/REPOSITORY/getafe-portal:latest `
	--region REGION `
	--platform managed `
	--allow-unauthenticated `
	--add-cloudsql-instances PROJECT_ID:REGION:INSTANCE_NAME `
	--service-account getafe-portal@PROJECT_ID.iam.gserviceaccount.com `
	--set-env-vars NODE_ENV=production,CMS_DATABASE_PROVIDER=gcp,CMS_MEDIA_PROVIDER=gcp,PORTAL_DATABASE_PROVIDER=gcp,CMS_IAM_AUTH=true,PORTAL_IAM_AUTH=true,GCP_PROJECT_ID=PROJECT_ID,CMS_CLOUD_SQL_INSTANCE=PROJECT_ID:REGION:INSTANCE_NAME,PORTAL_CLOUD_SQL_INSTANCE=PROJECT_ID:REGION:INSTANCE_NAME,CMS_DB_NAME=getafe_cms,PORTAL_DB_NAME=getafe-users,CMS_DB_USER=getafe-portal,PORTAL_DB_USER=getafe-portal,GCS_BUCKET_NAME=BUCKET_NAME,GCS_PUBLIC_BASE_URL=https://storage.googleapis.com/BUCKET_NAME `
	--set-secrets CMS_SESSION_SECRET=cms-session-secret:latest
```

Grant the service account **Cloud SQL Client**, **Storage Object Admin** (or a narrower custom object role), and **Secret Manager Secret Accessor** on the session-secret secret. Keep database passwords in Secret Manager when password authentication is used; do not put them in `--set-env-vars` or commit them to `.env`.

After deployment, verify the Cloud Run revision reports healthy:

```powershell
gcloud run services describe getafe-portal --region REGION
gcloud run services logs read getafe-portal --region REGION --limit 100
```
