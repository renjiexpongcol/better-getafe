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
  'contact.email': text('Public contact email', 'CONTACT_EMAIL', '', { format: 'email' }),
  'contact.phone': text('Public contact phone', 'CONTACT_PHONE'),
  'contact.address': text('Municipal office address', 'CONTACT_ADDRESS'),
  'contact.hours': text('Public office hours', 'CONTACT_HOURS'),
  'contact.categories': text('Contact inquiry categories (one per line)', '', '', { multiline: true }),
  'contact.settlementTypes': text('Settlement types (one per line)', '', '', { multiline: true }),
  'contact.paymentChannels': text('Settlement payment channels (one per line)', '', '', { multiline: true }),
  'contact.concernCategories': text('Concern categories (one per line)', '', '', { multiline: true }),
  'contact.concernServiceId': text('Concern service identifier', ''),
  'contact.populationSource': text('Barangay population source label', ''),
  'general.locationLabel': text('Organization location label', 'LOCATION_LABEL'),
  'general.supportEmail': text('Support email', '', '', { format: 'email' }),
  'general.facebookUrl': text('Facebook page URL', 'VITE_GETAFE_FACEBOOK_URL', '', { format: 'url' }),
  'general.facebookEmbedMode': choice('Facebook display mode', '', 'embed', ['embed', 'fallback']),
  'general.logo': text('Logo URL', '', '', { format: 'url' }),
  'general.favicon': text('Favicon URL', '', '', { format: 'url' }),
  'general.communityBannerEnabled': bool('Community banner', '', true),
  'general.communityBannerTitle': text('Community banner title', '', ''),
  'general.communityBannerMessage': text('Community banner message', '', ''),
  'general.communityBannerUrl': text('Community banner link', '', '', { format: 'url' }),
  'google.clientId': text('OAuth client ID', 'GOOGLE_CLIENT_ID'),
  'google.clientSecret': secret('OAuth client secret', 'GOOGLE_CLIENT_SECRET'),
  'google.redirectUri': text('OAuth redirect URI', 'GOOGLE_REDIRECT_URI', ''),
  'storage.provider': choice('Storage provider', 'CMS_MEDIA_PROVIDER|STORAGE_PROVIDER', 'backblaze', ['backblaze', 'local', 'azure']),
  'storage.configuredProvider': choice('Storage provider', '', 'backblaze', ['backblaze', 'local', 'azure']),
  'storage.localPath': text('Local storage directory', 'LOCAL_STORAGE_PATH', 'data/uploads'),
  'storage.bucket': text('Bucket name', 'B2_BUCKET_NAME'),
  'storage.endpoint': text('Backblaze endpoint', 'B2_ENDPOINT'),
  'storage.keyId': secret('Backblaze key ID', 'B2_KEY_ID'),
  'storage.applicationKey': secret('Backblaze application key', 'B2_APPLICATION_KEY'),
  'storage.azureAccount': text('Storage account', '', 'lgumedia'),
  'storage.azureContainer': text('Container', '', 'portal-media'),
  'storage.azureAuthentication': choice('Authentication method', '', 'connection-string', ['connection-string', 'managed-identity']),
  'storage.azureConnectionString': secret('Connection string', 'AZURE_STORAGE_CONNECTION_STRING'),
  'storage.region': text('Bucket region', 'B2_REGION', ''),
  'storage.signedUrlMinutes': number('Signed URL lifetime (minutes)', '', 15, 1, 10080),
  'storage.maxUploadMb': number('Maximum upload (MB)', '', 5, 1, 500),
  'storage.allowedTypes': text('Allowed image MIME types (comma separated)', '', 'image/jpeg,image/png,image/webp'),
  'storage.visibility': choice('Storage visibility', '', 'private', ['private', 'public']),
  'storage.prefix': text('Storage folder', '', 'media'),
  'storage.publicBaseUrl': text('Public storage URL', 'STORAGE_PUBLIC_BASE_URL|B2_PUBLIC_BASE_URL', '', { format: 'url' }),
  'email.enabled': bool('Enable SMTP', 'SMTP_ENABLED'),
  'email.smtpHost': text('SMTP host', 'SMTP_HOST'),
  'email.smtpPort': number('SMTP port', 'SMTP_PORT', 587, 1, 65535),
  'email.username': text('SMTP username', 'SMTP_USER'),
  'email.password': secret('SMTP password', 'SMTP_PASSWORD|SMTP_PASS'),
  'email.security': choice('SMTP security', 'SMTP_SECURITY', 'starttls', ['starttls', 'tls', 'none']),
  'email.senderName': text('Sender name', 'SMTP_FROM_NAME', 'Getafe Citizen Portal'),
  'email.senderEmail': text('Sender email', 'SMTP_FROM', '', { format: 'email' }),
  'email.replyTo': text('Reply-to email', 'SMTP_REPLY_TO', '', { format: 'email' }),
  'authentication.sessionMinutes': number('Maximum sign-in lifetime (minutes)', '', 720, 5, 43200),
  'authentication.sessionIdleEnabled': bool('Automatic log out', 'AUTH_SESSION_IDLE_ENABLED', true),
  'authentication.sessionIdleMinutes': number('Session idle timeout (minutes)', 'AUTH_SESSION_IDLE_MINUTES', 30, 5, 43200),
  'authentication.sessionWarningMinutes': number('Warn before automatic sign-out (minutes)', '', 5, 1, 30),
  'authentication.concurrentSessionPolicy': choice('Concurrent sessions', '', 'allow_multiple', ['allow_multiple', 'single_active']),
  'authentication.rememberDays': number('Remembered session (days)', '', 30, 1, 90),
  'authentication.passwordMinLength': number('Minimum password length', '', 12, 8, 128),
  'authentication.passwordExpiryDays': number('Password expiration (days; 0 disables)', '', 0, 0, 365),
  'authentication.failedLoginLimit': number('Failed login limit', '', 5, 1, 100),
  'authentication.lockoutMinutes': number('Lockout duration (minutes)', '', 15, 1, 1440),
  'authentication.registrationEnabled': bool('Allow registration', '', true),
  'authentication.requireEmailVerification': bool('Require email verification', ''),
  'authentication.mobileVerificationEnabled': bool('Enable mobile number verification', 'MOBILE_VERIFICATION_ENABLED', true),
  'authentication.requireMobileVerification': bool('Require mobile verification during Google account setup', 'REQUIRE_MOBILE_VERIFICATION', false),
  'authentication.smsApiKey': secret('Semaphore SMS API key', 'SEMAPHORE_API_KEY'),
  'authentication.smsSenderName': text('SMS sender name', 'SEMAPHORE_SENDER_NAME', '', { description: 'Use a sender name approved by Semaphore, or leave blank for the provider default.' }),
  'authentication.mfaEnabled': bool('Require email sign-in code', ''),
  'security.registrationCaptcha': bool('Enable reCAPTCHA protection', '', false),
  'security.contactCaptcha': bool('Enable contact-form reCAPTCHA protection', '', false),
  'security.recaptchaProvider': choice('reCAPTCHA provider', '', 'google-standard', ['google', 'google-standard', 'google-enterprise']),
  'security.recaptchaVersion': choice('reCAPTCHA version', '', 'v2', ['v2', 'v3']),
  'security.recaptchaProjectId': text('reCAPTCHA Enterprise project ID', 'GCP_PROJECT_ID|GOOGLE_CLOUD_PROJECT', '', { description: 'Google Cloud project ID that owns the Enterprise key.' }),
  'security.recaptchaSiteKey': text('reCAPTCHA site key', '', '', { description: 'Public site key from the reCAPTCHA admin console.' }),
  'security.recaptchaSecretKey': secret('reCAPTCHA secret key', ''),
  'security.registrationRateLimit': number('Registration attempts per hour', '', 10, 1, 100),
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
  'integrations.psgcApiVersion': text('PSA PSGC release', 'PSGC_API_VERSION', 'Q3_2026', { description: 'Release identifier published by PSA, such as Q3_2026.' }),
  'integrations.psgcApiToken': secret('PSA PSGC API token', 'PSGC_API_TOKEN'),
  'ai.openaiApiKey': secret('OpenAI API key', 'OPENAI_API_KEY'),
  'ai.defaultModel': text('Default OpenAI model', '', 'gpt-4.1-mini'),
  'ai.monthlyBudgetUsd': number('Monthly AI budget (USD)', '', 0, 0, 1000000),
  'weather.openWeatherApiKey': secret('OpenWeather API key', 'OPENWEATHER_API_KEY'),
  'weather.accuWeatherApiKey': secret('AccuWeather API key', 'ACCUWEATHER_API_KEY'),
  'features.uploads': bool('File uploads', '', true),
  'features.reports': bool('Reports', '', true),
  'features.ai': bool('AI features', ''),
  'features.publicRegistration': bool('Public registration', '', true),
  'publicData.enabled': bool('Enable public data portal', '', true),
  'publicData.disclaimer': text('Public data disclaimer', '', 'Statistical information displayed on this portal is retrieved from public datasets and saved releases provided by external statistical sources. Dataset availability and release dates may differ from the latest publication of the originating agency. Refer to the cited source for official definitions and methodology.', { multiline: true }),
  'publicData.featuredDatasets': text('Featured dataset IDs (comma separated)', '', ''),
  'publicData.featuredTopics': text('Featured topics (comma separated)', '', ''),
  'publicData.catalogCacheHours': number('Dataset catalog cache hours', '', 2, 1, 6),
  'maintenance.enabled': bool('Maintenance mode', ''),
  'maintenance.message': text('Maintenance message', '', 'The portal is undergoing maintenance. Please try again later.'),
  'maintenance.expectedCompletion': text('Expected completion (ISO date/time)', ''),
  'maintenance.allowedAdminIps': text('Allowed administrator IPs (comma separated; empty allows all)', ''),
  'legal.privacy': text('Privacy Policy content', '', '', { multiline: true, description: 'Editable content for the public Privacy Policy page. Separate paragraphs with a blank line.' }),
  'legal.terms': text('Terms of Use content', '', '', { multiline: true, description: 'Editable content for the public Terms of Use page. Separate paragraphs with a blank line.' }),
  'legal.cookies': text('Cookies and cache notice', '', '', { multiline: true, description: 'Editable content for the public Cookies and Cache page. Separate paragraphs with a blank line.' }),
  'advanced.authDebug': bool('Authentication diagnostics (no credentials)', 'AUTH_DEBUG'),
};
for (const [category, prefix] of [['database', 'CMS'], ['portalDatabase', 'PORTAL']]) {
  Object.assign(definitions, {
    [`${category}.provider`]: choice('Database provider', '', 'supabase', ['supabase'], { description: 'Supabase PostgreSQL is managed by the server connection URL.' }),
    [`${category}.connectionLimit`]: number('Connection limit', `${prefix}_DB_CONNECTION_LIMIT`, 5, 1, 100),
    [`${category}.queueLimit`]: number('Waiting request limit (0 unlimited)', `${prefix}_DB_QUEUE_LIMIT`, 100, 0, 10000),
    [`${category}.connectTimeout`]: number('Connection timeout (ms)', `${prefix}_DB_CONNECT_TIMEOUT_MS`, 10000, 100, 60000),
    [`${category}.idleTimeout`]: number('Idle timeout (ms)', `${prefix}_DB_IDLE_TIMEOUT_MS`, 60000, 1000, 3600000),
  });
}

const whenTrue = key => ({ all: [{ key, equals: true }] });
const whenValue = (key, equals) => ({ all: [{ key, equals }] });
const whenAnyTrue = (...keys) => ({ any: keys.map(key => ({ key, equals: true })) });
const conditionalSettings = {
  ...Object.fromEntries(['smtpHost', 'smtpPort', 'security', 'username', 'password', 'senderName', 'senderEmail', 'replyTo']
    .map(key => [`email.${key}`, whenTrue('email.enabled')])),
  'general.communityBannerTitle': whenTrue('general.communityBannerEnabled'),
  'general.communityBannerMessage': whenTrue('general.communityBannerEnabled'),
  'general.communityBannerUrl': whenTrue('general.communityBannerEnabled'),
  'storage.localPath': whenValue('storage.provider', 'local'),
  'storage.bucket': whenValue('storage.provider', 'backblaze'),
  'storage.endpoint': whenValue('storage.provider', 'backblaze'),
  'storage.region': whenValue('storage.provider', 'backblaze'),
  'storage.keyId': whenValue('storage.provider', 'backblaze'),
  'storage.applicationKey': whenValue('storage.provider', 'backblaze'),
  'storage.azureConnectionString': whenValue('storage.azureAuthentication', 'connection-string'),
  'storage.publicBaseUrl': whenValue('storage.visibility', 'public'),
  'storage.maxUploadMb': whenTrue('features.uploads'),
  'storage.allowedTypes': whenTrue('features.uploads'),
  'authentication.requireEmailVerification': whenTrue('email.enabled'),
  'authentication.mfaEnabled': whenTrue('email.enabled'),
  'authentication.requireMobileVerification': whenTrue('authentication.mobileVerificationEnabled'),
  'authentication.smsApiKey': whenTrue('authentication.mobileVerificationEnabled'),
  'authentication.smsSenderName': whenTrue('authentication.mobileVerificationEnabled'),
  'security.registrationRateLimit': { all: [
    { key: 'authentication.registrationEnabled', equals: true },
    { key: 'features.publicRegistration', equals: true },
  ] },
  'security.recaptchaProvider': whenAnyTrue('security.registrationCaptcha', 'security.contactCaptcha'),
  'security.recaptchaVersion': whenAnyTrue('security.registrationCaptcha', 'security.contactCaptcha'),
  'security.recaptchaProjectId': { all: [
    { key: 'security.recaptchaProvider', equals: 'google-enterprise' },
    { any: [{ key: 'security.registrationCaptcha', equals: true }, { key: 'security.contactCaptcha', equals: true }] },
  ] },
  'security.recaptchaSiteKey': whenAnyTrue('security.registrationCaptcha', 'security.contactCaptcha'),
  'security.recaptchaSecretKey': { all: [
    { any: [{ key: 'security.registrationCaptcha', equals: true }, { key: 'security.contactCaptcha', equals: true }] },
    { any: [{ key: 'security.recaptchaProvider', equals: 'google' }, { key: 'security.recaptchaProvider', equals: 'google-standard' }] },
  ] },
  'notifications.emailEnabled': whenTrue('notifications.enabled'),
  'notifications.toastDuration': whenTrue('notifications.enabled'),
  'notifications.toastPosition': whenTrue('notifications.enabled'),
  'integrations.baseUrl': whenTrue('integrations.enabled'),
  'integrations.clientId': whenTrue('integrations.enabled'),
  'integrations.clientSecret': whenTrue('integrations.enabled'),
  'integrations.apiKey': whenTrue('integrations.enabled'),
  'integrations.oauthClientSecret': whenTrue('integrations.enabled'),
  'publicData.disclaimer': whenTrue('publicData.enabled'),
  'publicData.featuredDatasets': whenTrue('publicData.enabled'),
  'publicData.featuredTopics': whenTrue('publicData.enabled'),
  'publicData.catalogCacheHours': whenTrue('publicData.enabled'),
  'maintenance.message': whenTrue('maintenance.enabled'),
  'maintenance.expectedCompletion': whenTrue('maintenance.enabled'),
  'maintenance.allowedAdminIps': whenTrue('maintenance.enabled'),
};
const storageEditProvider = key => whenValue('storage.configuredProvider', key);
const storageEditConditions = {
  ...Object.fromEntries(['bucket', 'endpoint', 'region', 'keyId', 'applicationKey', 'visibility']
    .map(key => [`storage.${key}`, storageEditProvider('backblaze')])),
  'storage.publicBaseUrl': { all: [storageEditProvider('backblaze'), whenValue('storage.visibility', 'public')] },
  'storage.localPath': storageEditProvider('local'),
  ...Object.fromEntries(['azureAccount', 'azureContainer', 'azureAuthentication']
    .map(key => [`storage.${key}`, storageEditProvider('azure')])),
  'storage.azureConnectionString': { all: [storageEditProvider('azure'), conditionalSettings['storage.azureConnectionString']] },
};
for (const [key, condition] of Object.entries(storageEditConditions)) definitions[key].editVisibleWhen = condition;
for (const key of ['authentication.sessionIdleMinutes', 'authentication.sessionWarningMinutes']) {
  definitions[key].editVisibleWhen = whenTrue('authentication.sessionIdleEnabled');
}
for (const [key, visibleWhen] of Object.entries(conditionalSettings)) {
  if (definitions[key]) definitions[key].visibleWhen = visibleWhen;
}

export const categories = ['general', 'contact', 'database', 'portalDatabase', 'google', 'storage', 'authentication', 'email', 'security', 'notifications', 'integrations', 'weather', 'publicData', 'features', 'ai', 'maintenance', 'legal', 'advanced'];
definitions['authentication.sessionWarningMinutes'].description = 'Show the sign-out warning before the idle timeout. Must be shorter than the timeout and cannot exceed 30 minutes.';

function conditionMatches(condition, values) {
  if (condition?.all) return condition.all.every(item => conditionMatches(item, values));
  if (condition?.any) return condition.any.some(item => conditionMatches(item, values));
  return Boolean(condition && Object.hasOwn(values || {}, condition.key) && values[condition.key] === condition.equals);
}

export function isSettingVisible(key, values = {}) {
  const condition = definitions[key]?.visibleWhen;
  return !condition || conditionMatches(condition, values);
}

export function visibleSettingDependencies(visibleWhen) {
  if (!visibleWhen) return [];
  if (visibleWhen.all || visibleWhen.any) return [...new Set([...(visibleWhen.all || []), ...(visibleWhen.any || [])].flatMap(visibleSettingDependencies))];
  return visibleWhen.key ? [visibleWhen.key] : [];
}

export function omitInactiveSettings(patch, baseline = {}, resetValue = key => definitions[key].default) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const current = { ...baseline, ...patch };
  for (const [key, value] of Object.entries(patch)) if (value === null && definitions[key]) current[key] = resetValue(key);
  if (patch['storage.configuredProvider'] === null) current['storage.configuredProvider'] = current['storage.provider'];
  return Object.fromEntries(Object.entries(patch).filter(([key]) => {
    const condition = definitions[key]?.editVisibleWhen;
    return condition ? conditionMatches(condition, current) : isSettingVisible(key, current);
  }));
}

export function validate(values, { visiblePatch = false } = {}) {
  if (!values || Array.isArray(values) || typeof values !== 'object' || !Object.keys(values).length) throw new Error('Supply settings to update.');
  for (const [key, value] of Object.entries(values)) {
    const d = definitions[key];
    if (!d) throw new Error(`Unknown setting: ${key}`);
    if (!visiblePatch && !isSettingVisible(key, values)) continue;
    if (value === null) continue;
    if (d.secret && value === '********') throw new Error(`${d.label} cannot use a masked placeholder`);
    if (typeof value !== d.type || (d.type === 'string' && (value.length > (d.secret ? 16384 : d.multiline ? 50000 : 2000) || /[\x00\r\n]/.test(value) && !d.multiline)) || (d.type === 'number' && (!Number.isInteger(value) || value < d.min || value > d.max))) throw new Error(`Invalid value for ${d.label}`);
    if (d.required && !value.trim()) throw new Error(`${d.label} is required`);
    if (d.options && !d.options.includes(value)) throw new Error(`Invalid ${d.label}`);
    if (d.format === 'url' && value) { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`${d.label} must be an HTTP(S) URL without credentials`); }
    if (d.format === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`Invalid ${d.label}`);
    if (key === 'general.timezone') new Intl.DateTimeFormat('en', { timeZone: value });
    if (key === 'general.locale' || key === 'general.language') Intl.getCanonicalLocales(value);
    if (key === 'general.currency' && !/^[A-Z]{3}$/.test(value)) throw new Error('Currency must be a three-letter uppercase code.');
    if (key === 'storage.prefix' && !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(value)) throw new Error('Use folder names separated by slashes.');
    if (key === 'storage.azureAccount' && !/^[a-z0-9]{3,24}$/.test(value)) throw new Error('Invalid Azure storage account.');
    if (key === 'storage.azureContainer' && !/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,61}[a-z0-9]$/.test(value)) throw new Error('Invalid Azure container.');
    if (key === 'storage.allowedTypes' && (!value || value.split(',').some(type => !['image/jpeg', 'image/png', 'image/webp'].includes(type.trim())))) throw new Error('Allowed types must be JPG, PNG or WEBP MIME types.');
    if (key === 'maintenance.expectedCompletion' && value && Number.isNaN(Date.parse(value))) throw new Error('Invalid expected completion time.');
    if (key === 'security.permissionGrants') {
      const grants = JSON.parse(value);
      const allowed = ['settings.view', 'settings.edit', 'settings.secrets.edit', 'settings.database.edit', 'settings.storage.edit', 'settings.security.edit', 'settings.audit.view'];
      if (!grants || Array.isArray(grants) || typeof grants !== 'object' || Object.values(grants).some(list => !Array.isArray(list) || list.some(permission => !allowed.includes(permission)))) throw new Error('Invalid permission grants.');
    }
  }
  if (values['authentication.mobileVerificationEnabled'] === true && values['authentication.requireMobileVerification'] === true && Object.hasOwn(values, 'authentication.smsApiKey') && !String(values['authentication.smsApiKey'] || '').trim()) throw new Error('Enable mobile verification and configure a Semaphore SMS API key before requiring mobile verification.');
  if (values['security.recaptchaProvider'] === 'google-enterprise' && values['security.recaptchaVersion'] !== 'v3') throw new Error('Google reCAPTCHA Enterprise currently requires the v3 score-based version.');
  if (Number.isInteger(values['authentication.sessionIdleMinutes']) && Number.isInteger(values['authentication.sessionWarningMinutes'])
    && values['authentication.sessionWarningMinutes'] >= values['authentication.sessionIdleMinutes']) {
    throw new Error('The warning period must be shorter than the session idle timeout.');
  }
}

