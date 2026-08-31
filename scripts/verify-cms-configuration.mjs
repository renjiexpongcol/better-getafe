const required = (name) => {
  if (!process.env[name] || process.env[name].startsWith('your-') || process.env[name].includes('replace-with')) {
    throw new Error(`Missing required cloud CMS setting: ${name}`)
  }
}

const databaseProvider = process.env.CMS_DATABASE_PROVIDER || 'local'
const mediaProvider = process.env.CMS_MEDIA_PROVIDER || 'local'
const valid = new Set(['local', 'gcp'])

if (!valid.has(databaseProvider) || !valid.has(mediaProvider)) {
  throw new Error('CMS_DATABASE_PROVIDER and CMS_MEDIA_PROVIDER must be "local" or "gcp".')
}

if (databaseProvider === 'gcp') {
  ;['GCP_PROJECT_ID', 'INSTANCE_CONNECTION_NAME', 'DB_NAME', 'DB_USER', 'DB_PASS'].forEach(required)
  console.log('CMS database: Google Cloud SQL configuration present.')
} else {
  console.log('CMS database: local development storage.')
}

if (mediaProvider === 'gcp') {
  ;['GCP_PROJECT_ID', 'GCS_BUCKET', 'GCS_PUBLIC_BASE_URL'].forEach(required)
  console.log('CMS media: Google Cloud Storage configuration present.')
} else {
  console.log('CMS media: local uploads directory.')
}

if ((process.env.USER_DATABASE_PROVIDER || 'local') === 'gcp') {
  ;['GCP_PROJECT_ID', 'INSTANCE_CONNECTION_NAME', 'USER_DB_NAME', 'USER_DB_USER', 'USER_DB_PASS'].forEach(required)
  console.log('Portal accounts: Google Cloud SQL configuration present.')
}
