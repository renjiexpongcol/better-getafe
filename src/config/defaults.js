const text = (label, env, value = '', extra = {}) => ({ label, env: env ? env.split('|') : [], default: value, type: 'string', ...extra });
const number = (label, env, value, min, max) => ({ ...text(label, env, value), type: 'number', min, max });
const bool = (label, env, value = false) => ({ ...text(label, env, value), type: 'boolean' });
const choice = (label, env, value, options) => ({ ...text(label, env, value), options });
const secret = (label, env) => text(label, env, '', { secret: true });
export const definitions = {
  'general.name': text('Application name', 'APP_NAME', 'Municipality of Getafe', { required: true }),
  'general.company': text('Organization name', 'COMPANY_NAME', 'Municipality of Getafe'),
  'general.url': text('Application URL', 'PUBLIC_SITE_URL', '', { format: 'url' }),
  'general.timezone': text('Timezone', 'APP_TIMEZONE', 'Asia/Manila'),
  'general.locale': text('Locale', 'APP_LOCALE', 'en-PH'),
  'general.currency': text('Currency', 'APP_CURRENCY', 'PHP'),
  'general.dateFormat': choice('Date format', '', 'medium', ['short', 'medium', 'long']),
  'general.language': text('Default language', '', 'en'),
  'general.supportEmail': text('Support email', '', '', { format: 'email' }),
  'general.logo': text('Logo URL', '', '', { format: 'url' }),
  'general.favicon': text('Favicon URL', '', '', { format: 'url' }),
  'google.projectId': text('Google Cloud project ID', 'GCP_PROJECT_ID'),
  'google.clientId': text('Google OAuth client ID', 'GOOGLE_CLIENT_ID'),
  'google.clientSecret': secret('Google OAuth client secret', 'GOOGLE_CLIENT_SECRET'),
  'google.redirectUri': text('Google OAuth redirect URI', 'GOOGLE_REDIRECT_URI', ''),
  'storage.provider': choice('Storage provider', 'CMS_MEDIA_PROVIDER|STORAGE_PROVIDER', 'backblaze', ['backblaze', 'local']),
  'storage.localPath': text('Local storage directory', 'LOCAL_STORAGE_PATH', 'data/uploads'),
  'storage.bucket': text('Bucket name', 'B2_BUCKET_NAME'),
  'storage.endpoint': text('Backblaze endpoint', 'B2_ENDPOINT'),
  'storage.keyId': secret('Backblaze key ID', 'B2_KEY_ID'),
  'storage.applicationKey': secret('Backblaze application key', 'B2_APPLICATION_KEY'),
  'storage.region': text('Bucket region (validated against existing bucket)', '', ''),
  'storage.signedUrlMinutes': number('Signed URL lifetime (minutes)', '', 15, 1, 10080),
  'storage.maxUploadMb': number('Maximum upload (MB)', '', 5, 1, 500),
  'storage.allowedTypes': text('Allowed image MIME types (comma separated)', '', 'image/jpeg,image/png,image/webp'),
  'storage.visibility': choice('Storage visibility', '', 'private', ['private', 'public']),
  'storage.prefix': text('Storage folder', '', 'media'),
  'storage.publicBaseUrl': text('Public storage URL', 'B2_PUBLIC_BASE_URL|GCS_PUBLIC_BASE_URL', '', { format: 'url' }),
  'email.enabled': bool('Enable SMTP', 'SMTP_ENABLED'),
  'email.smtpHost': text('SMTP host', 'SMTP_HOST'),
  'email.smtpPort': number('SMTP port', 'SMTP_PORT', 587, 1, 65535),
  'email.username': text('SMTP username', 'SMTP_USER'),
  'email.password': secret('SMTP password', 'SMTP_PASSWORD|SMTP_PASS'),
  'email.security': choice('SMTP security', 'SMTP_SECURITY', 'starttls', ['starttls', 'tls', 'none']),
  'email.senderName': text('Sender name', 'SMTP_FROM_NAME', 'Getafe Portal'),
  'email.senderEmail': text('Sender email', 'SMTP_FROM', '', { format: 'email' }),
  'email.replyTo': text('Reply-to email', 'SMTP_REPLY_TO', '', { format: 'email' }),
  'authentication.sessionMinutes': number('Session timeout (minutes)', '', 720, 5, 43200),
  'authentication.rememberDays': number('Remembered session (days)', '', 30, 1, 90),
  'authentication.passwordMinLength': number('Minimum password length', '', 8, 8, 128),
  'authentication.passwordExpiryDays': number('Password expiration (days; 0 disables)', '', 0, 0, 365),
  'authentication.failedLoginLimit': number('Failed login limit', '', 5, 1, 100),
  'authentication.lockoutMinutes': number('Lockout duration (minutes)', '', 15, 1, 1440),
  'authentication.registrationEnabled': bool('Allow registration', '', true),
  'authentication.requireEmailVerification': bool('Require email verification', ''),
  'authentication.mfaEnabled': bool('Require email sign-in code', ''),
  'security.frameProtection': bool('Prevent framing', '', true),
  'security.permissionGrants': text('Administrator permissions', '', '{}'),
  'security.contentTypeProtection': bool('Prevent content type sniffing', '', true),
  'notifications.enabled': bool('Enable notifications', '', true),
  'notifications.emailEnabled': bool('Enable email notifications', '', false),
  'notifications.toastDuration': number('Toast duration (seconds)', '', 5, 0, 60),
  'notifications.toastPosition': choice('Toast position', '', 'top-right', ['top-right', 'top-center', 'bottom-right', 'bottom-center']),
  'integrations.enabled': bool('Enable external integration', ''),
  'integrations.baseUrl': text('Integration API URL', '', '', { format: 'url' }),
  'integrations.clientId': text('API client ID', 'API_CLIENT_ID'),
  'integrations.clientSecret': secret('API client secret', 'API_CLIENT_SECRET'),
  'integrations.apiKey': secret('API key', 'API_KEY'),
  'integrations.oauthClientSecret': secret('OAuth client secret', 'OAUTH_CLIENT_SECRET'),
  'weather.openWeatherApiKey': secret('OpenWeather API key', 'OPENWEATHER_API_KEY'),
  'weather.accuWeatherApiKey': secret('AccuWeather API key', 'ACCUWEATHER_API_KEY'),
  'features.uploads': bool('File uploads', '', true),
  'features.reports': bool('Reports', '', true),
  'features.ai': bool('AI features', ''),
  'features.publicRegistration': bool('Public registration', '', true),
  'maintenance.enabled': bool('Maintenance mode', ''),
  'maintenance.message': text('Maintenance message', '', 'The portal is undergoing maintenance. Please try again later.'),
  'maintenance.expectedCompletion': text('Expected completion (ISO date/time)', ''),
  'maintenance.allowedAdminIps': text('Allowed administrator IPs (comma separated; empty allows all)', ''),
  'advanced.authDebug': bool('Authentication diagnostics (no credentials)', 'AUTH_DEBUG'),
};
for (const [category, prefix, legacy] of [['database', 'CMS', 'DB'], ['portalDatabase', 'PORTAL', 'USER_DB']]) {
  Object.assign(definitions, {
    [`${category}.provider`]: choice('Database provider', `${prefix}_DATABASE_PROVIDER${prefix === 'PORTAL' ? '|USER_DATABASE_PROVIDER' : ''}`, 'local', ['local']),
    [`${category}.engine`]: choice('Database engine', '', 'mysql', ['mysql']),
    [`${category}.connectionMode`]: choice('Connection method', '', 'local', ['local']),
    [`${category}.instance`]: text('Legacy database instance', ''),
    [`${category}.host`]: text('Host', `${prefix}_DB_HOST|${legacy}_HOST`, '127.0.0.1'),
    [`${category}.port`]: number('Port', `${prefix}_DB_PORT|${legacy}_PORT`, 3306, 1, 65535),
    [`${category}.name`]: text('Database name', `${prefix}_DB_NAME|${legacy}_NAME`),
    [`${category}.username`]: text('Username', `${prefix}_DB_USER|${legacy}_USER`),
    [`${category}.password`]: secret('Database password', `${prefix}_DB_PASSWORD|${legacy}_PASS`),
    [`${category}.ssl`]: bool('Verify TLS certificate (direct MySQL)', `${prefix}_DB_SSL`, true),
    [`${category}.iam`]: bool('Cloud SQL IAM authentication', `${prefix}_IAM_AUTH`),
    [`${category}.privateIp`]: bool('Cloud SQL private IP', 'PRIVATE_IP'),
    [`${category}.connectionLimit`]: number('Connection limit', `${prefix}_DB_CONNECTION_LIMIT`, 5, 1, 100),
    [`${category}.queueLimit`]: number('Waiting request limit (0 unlimited)', `${prefix}_DB_QUEUE_LIMIT`, 100, 0, 10000),
    [`${category}.connectTimeout`]: number('Connection timeout (ms)', `${prefix}_DB_CONNECT_TIMEOUT_MS`, 10000, 100, 60000),
    [`${category}.idleTimeout`]: number('Idle timeout (ms)', `${prefix}_DB_IDLE_TIMEOUT_MS`, 60000, 1000, 3600000),
  });
}
export const categories = ['general', 'database', 'portalDatabase', 'google', 'storage', 'authentication', 'email', 'security', 'notifications', 'integrations', 'weather', 'features', 'maintenance', 'advanced'];
export function validate(values) {
  if (!values || Array.isArray(values) || typeof values !== 'object' || !Object.keys(values).length) throw new Error('Supply settings to update.');
  for (const [key, value] of Object.entries(values)) {
    const d = definitions[key];
    if (!d) throw new Error(`Unknown setting: ${key}`);
    if (value === null) continue;
    if (typeof value !== d.type || (d.type === 'string' && (value.length > (d.secret ? 16384 : 2000) || /[\x00\r\n]/.test(value))) || (d.type === 'number' && (!Number.isInteger(value) || value < d.min || value > d.max))) throw new Error(`Invalid value for ${d.label}`);
    if (d.required && !value.trim()) throw new Error(`${d.label} is required`);
    if (d.options && !d.options.includes(value)) throw new Error(`Invalid ${d.label}`);
    if (d.format === 'url' && value) { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`${d.label} must be an HTTP(S) URL without credentials`); }
    if (d.format === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`Invalid ${d.label}`);
    if (key === 'general.timezone') new Intl.DateTimeFormat('en', { timeZone: value });
    if (key === 'general.locale' || key === 'general.language') Intl.getCanonicalLocales(value);
    if (key === 'general.currency' && !/^[A-Z]{3}$/.test(value)) throw new Error('Currency must be a three-letter uppercase code.');
    if (key === 'storage.prefix' && !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(value)) throw new Error('Use folder names separated by slashes.');
    if (key === 'storage.allowedTypes' && (!value || value.split(',').some(type => !['image/jpeg', 'image/png', 'image/webp'].includes(type.trim())))) throw new Error('Allowed types must be JPG, PNG or WEBP MIME types.');
    if (key === 'maintenance.expectedCompletion' && value && Number.isNaN(Date.parse(value))) throw new Error('Invalid expected completion time.');
    if (key === 'security.permissionGrants') {
      const grants = JSON.parse(value);
      const allowed = ['settings.view', 'settings.edit', 'settings.secrets.edit', 'settings.database.edit', 'settings.storage.edit', 'settings.security.edit', 'settings.audit.view'];
      if (!grants || Array.isArray(grants) || typeof grants !== 'object' || Object.values(grants).some(list => !Array.isArray(list) || list.some(permission => !allowed.includes(permission)))) throw new Error('Invalid permission grants.');
    }
  }
}

