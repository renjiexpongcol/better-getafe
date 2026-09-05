const required = (names) => {
  const candidates = Array.isArray(names) ? names : [names]
  const value = candidates.find((name) => process.env[name])
  if (!value || value.startsWith('your-') || value.includes('replace-with')) {
    throw new Error(`Missing required cloud CMS setting: ${candidates.join(' or ')}`)
  }
}

const databaseProvider = process.env.CMS_DATABASE_PROVIDER || 'local'
const mediaProvider = process.env.CMS_MEDIA_PROVIDER || 'local'
const valid = new Set(['local', 'gcp'])

if (!valid.has(databaseProvider) || !valid.has(mediaProvider)) {
  throw new Error('CMS_DATABASE_PROVIDER and CMS_MEDIA_PROVIDER must be "local" or "gcp".')
}

if (databaseProvider === 'gcp') {
  ;[
    ['GCP_PROJECT_ID'],
    ['CMS_CLOUD_SQL_INSTANCE', 'INSTANCE_CONNECTION_NAME'],
    ['CMS_DB_NAME', 'DB_NAME'],
    ['CMS_DB_USER', 'DB_USER'],
  ].forEach(required)
  if (process.env.CMS_IAM_AUTH !== 'true') required(['CMS_DB_PASSWORD', 'DB_PASS'])
  console.log('CMS database: Google Cloud SQL configuration present.')
} else {
  console.log('CMS database: local development storage.')
}

if (mediaProvider === 'gcp') {
  ;[['GCP_PROJECT_ID'], ['GCS_BUCKET_NAME', 'GCS_BUCKET'], ['GCS_PUBLIC_BASE_URL']].forEach(required)
  console.log('CMS media: Google Cloud Storage configuration present.')
} else {
  console.log('CMS media: local uploads directory.')
}

const portalProvider = process.env.PORTAL_DATABASE_PROVIDER || process.env.USER_DATABASE_PROVIDER || 'local'
if (portalProvider === 'gcp') {
  ;[
    ['GCP_PROJECT_ID'],
    ['PORTAL_CLOUD_SQL_INSTANCE', 'INSTANCE_CONNECTION_NAME'],
    ['PORTAL_DB_NAME', 'USER_DB_NAME'],
    ['PORTAL_DB_USER', 'USER_DB_USER'],
  ].forEach(required)
  if (process.env.PORTAL_IAM_AUTH !== 'true') required(['PORTAL_DB_PASSWORD', 'USER_DB_PASS'])
  console.log('Portal accounts: Google Cloud SQL configuration present.')
}
