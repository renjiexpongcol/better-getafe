# Google Cloud production setup

The application remains local by default. The existing Cloud SQL target is `getafemodernizationportal:asia-southeast1:getafe-portal` in `asia-southeast1`, with public IP connectivity enabled. Its CMS database is `getafe_cms` and its application user is `getafe-portal`. Before setting either CMS provider to `gcp`, apply the schema and supply the database password through a secret. `npm start` performs a fail-fast configuration check first.

## 1. Cloud SQL (MySQL)

1. In the intended Google Cloud project, enable **Cloud SQL Admin API**, create a **Cloud SQL for MySQL 8.0+** instance, and create database `getafe_cms` plus a least-privilege application user.
2. Record the instance connection name in the format `PROJECT:REGION:INSTANCE` and set it as `INSTANCE_CONNECTION_NAME`.
3. Apply [cloudsql-schema.sql](../database/cloudsql-schema.sql) to the new database.
4. Set `PRIVATE_IP=false` for the current public-IP configuration. Deploy on Cloud Run with the Cloud SQL connection attached, or use the Cloud SQL Node.js Connector/Auth Proxy during development. The runtime service account needs **Cloud SQL Client**. Switch to private IP only after VPC/private-service networking is configured.

## 2. Cloud Storage

1. The production CMS media bucket is `gs://getafe-supra-storage`. Use uniform bucket-level access; do not make the bucket broadly public for administrative uploads.
2. Give the runtime service account the minimum object permissions it needs (typically Storage Object Admin for upload/delete, or a narrower custom role).
3. Set `GCS_BUCKET` and the intended served URL as `GCS_PUBLIC_BASE_URL`. If media must remain private, replace this public URL approach with signed URLs at the edge.

## 3. Environment and verification

Copy `.env.example` to `.env`, set both providers to `gcp`, replace every placeholder, then run:

```powershell
npm run cms:check
```

For GCP authentication, use Application Default Credentials locally or attach a service account to the deployed workload. Never commit service-account JSON keys, database passwords, or `.env` files.

## 4. Required runtime packages for the cloud adapter

When implementing/deploying the Cloud SQL/Storage adapter, install:

```powershell
npm install mysql2 @google-cloud/cloud-sql-connector @google-cloud/storage
```

Google recommends the Cloud SQL language connector, which provides encrypted, IAM-authorized connections; Cloud Storage’s Node.js client uses Application Default Credentials. See the [Cloud SQL connector guide](https://cloud.google.com/sql/docs/mysql/connect-connectors) and [Cloud Storage Node.js upload guide](https://cloud.google.com/storage/docs/uploading-objects).
