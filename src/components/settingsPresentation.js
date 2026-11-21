import { Settings, Building2, Globe2, Database, Folder, LockKeyhole, ShieldCheck, Mail, Bell, Plug, Cloud, CloudSun, Flag, Wrench, FileText, SlidersHorizontal, Activity, History, Users, Image, KeyRound } from 'lucide-react'

export const categoryLabels = { general: 'General', contact: 'Public contact & operations', database: 'Supabase Database', portalDatabase: 'Supabase Database Pool', google: 'Google Sign-in', storage: 'Storage', authentication: 'Authentication', email: 'Email', security: 'Security', notifications: 'Notifications', integrations: 'Integrations', weather: 'Weather', publicData: 'Public Data', features: 'Feature Flags', ai: 'AI Management', maintenance: 'Maintenance', legal: 'Legal Policies', advanced: 'Advanced', status: 'System Status', history: 'Audit History' }
const icons = { general: Settings, database: Database, portalDatabase: Database, storage: Folder, authentication: LockKeyhole, security: ShieldCheck, email: Mail, notifications: Bell, integrations: Plug, weather: CloudSun, features: Flag, ai: KeyRound, maintenance: Wrench, legal: FileText, advanced: SlidersHorizontal, status: Activity, history: History }
export const sectionIcon = category => icons[category] || Settings
const storageProviderFields = {
  azure: new Set(['azureAccount', 'azureContainer', 'azureAuthentication', 'azureConnectionString']),
  backblaze: new Set(['bucket', 'endpoint', 'region', 'keyId', 'applicationKey', 'visibility', 'publicBaseUrl']),
  local: new Set(['localPath']),
}

export function storageFieldIsVisible(key, values) {
  const name = key.slice('storage.'.length)
  if (!Object.values(storageProviderFields).some(fields => fields.has(name))) return undefined
  if (!storageProviderFields[values['storage.configuredProvider']]?.has(name)) return false
  if (name === 'azureConnectionString') return values['storage.azureAuthentication'] === 'connection-string'
  if (name === 'publicBaseUrl') return values['storage.visibility'] === 'public'
  return true
}
export const categoryDescriptions = {
  general: 'Manage the portal identity, branding, and regional preferences.',
  contact: 'Set public office details and the options residents see when they contact the municipality.',
  database: 'View and test the shared Supabase PostgreSQL connection used across the portal. The URL is managed by the backend environment.',
  portalDatabase: 'Adjust the resident services connection pool. It uses the same Supabase database as CMS services.',
  google: 'Configure Google sign-in for the portal.',
  storage: 'Configure media providers and upload rules.',
  authentication: 'Manage sessions, account registration, and verification.',
  email: 'Configure SMTP delivery and outgoing email.',
  security: 'Manage browser protections, spam controls, and administrator access.',
  notifications: 'Choose how the portal displays and delivers notifications.',
  integrations: 'Manage external services and data integrations.',
  weather: 'Configure weather service credentials.',
  publicData: 'Manage the public data catalog and its connections.',
  features: 'Turn portal features on or off.',
  ai: 'Configure the secure OpenAI provider and conservative AI usage defaults.',
  maintenance: 'Control public access during maintenance.',
  legal: 'Edit the policies published on the website.',
  advanced: 'Configure application diagnostics.',
  status: 'Review service health and connection status.',
  history: 'Review changes made to the portal configuration.',
}

// Presentation groups only: setting keys, values, validation and permissions stay server-owned.
const layouts = {
  contact: [
    ['Office contact details', 'Published on the public contact page.', Building2, ['email', 'phone', 'address', 'hours']],
    ['Inquiries and concerns', 'Set categories and the service used for resident concerns.', Users, ['categories', 'concernCategories', 'concernServiceId']],
    ['Settlements', 'Set the available types and payment channels.', Settings, ['settlementTypes', 'paymentChannels']],
    ['Barangay information', 'Set the population source label.', FileText, ['populationSource']],
  ],
  google: [['Sign-in provider', 'Configure external sign-in credentials.', KeyRound, ['clientId', 'clientSecret', 'redirectUri']]],
  general: [
    ['Application details', 'The identity and contact details of your Getafe portal.', Building2, ['name', 'company', 'url', 'supportEmail']],
    ['Facebook updates', 'Choose the official Facebook Page Plugin or a native Getafe fallback card.', Globe2, ['facebookUrl', 'facebookEmbedMode']],
    ['Regional preferences', 'Language, timezone and formatting for your application.', Globe2, ['timezone', 'locale', 'currency', 'dateFormat', 'language']],
    ['Brand assets', 'Logo and browser icon used by the application.', Image, ['logo', 'favicon']],
    ['Community banner', 'Configure the special announcement shown on the public home page.', Users, ['communityBannerEnabled', 'communityBannerTitle', 'communityBannerMessage', 'communityBannerUrl']],
  ],
  security: [
    ['reCAPTCHA protection', 'Protect public forms against automated abuse.', ShieldCheck, ['registrationCaptcha', 'contactCaptcha', 'recaptchaProvider', 'recaptchaVersion', 'recaptchaProjectId', 'recaptchaSiteKey', 'recaptchaSecretKey']],
    ['Browser & request protection', 'Control registration limits and browser security protections.', LockKeyhole, ['registrationRateLimit', 'frameProtection', 'contentTypeProtection']],
    ['Administrator access', 'Manage who can view and update system configuration.', Users, ['permissionGrants']],
  ],
  authentication: [
    ['Session timeout', 'Choose when inactive accounts are logged out and give people time to keep working.', LockKeyhole, ['sessionIdleEnabled', 'sessionIdleMinutes', 'sessionWarningMinutes']],
    ['Concurrent sessions', 'Allow multiple devices or restrict each account to one active session. New sign-ins revoke earlier sessions when restricted.', KeyRound, ['concurrentSessionPolicy']],
    ['Sign-in limits', 'Set the maximum sign-in lifetime, including remembered sign-ins. These limits apply even while someone is active.', KeyRound, ['sessionMinutes', 'rememberDays']],
    ['Password & sign-in security', 'Manage password requirements and failed login limits.', KeyRound, ['passwordMinLength', 'passwordExpiryDays', 'failedLoginLimit', 'lockoutMinutes']],
    ['Account registration', 'Control registration and account verification.', Users, ['registrationEnabled', 'requireEmailVerification', 'mfaEnabled']],
    ['Mobile number verification', 'Configure SMS delivery and verification requirements for new Google sign-ins.', ShieldCheck, ['mobileVerificationEnabled', 'smsApiKey', 'smsSenderName', 'requireMobileVerification']],
  ],
  storage: [
    ['Storage provider', 'Choose and test a provider. Activation is a separate deployment step.', Folder, ['configuredProvider', 'azureAccount', 'azureContainer', 'azureAuthentication', 'azureConnectionString', 'bucket', 'endpoint', 'region', 'keyId', 'applicationKey', 'visibility', 'publicBaseUrl', 'localPath']],
    ['Shared storage settings', 'Set the media folder, upload rules, and link lifetime.', Image, ['prefix', 'maxUploadMb', 'allowedTypes', 'signedUrlMinutes']],
  ],
  email: [
    ['SMTP configuration', 'Connect your mail server for application email.', Mail, ['enabled', 'smtpHost', 'smtpPort', 'security', 'username', 'password']],
    ['Sender identity', 'Choose the sender and reply-to details for outgoing email.', Users, ['senderName', 'senderEmail', 'replyTo']],
  ],
  ai: [['OpenAI provider', 'Store the provider credential securely on the server and configure conservative defaults.', KeyRound, ['openaiApiKey', 'defaultModel', 'monthlyBudgetUsd']]],
  integrations: [
    ['External integration', 'Connect an external service using its existing API credentials.', Plug, ['enabled', 'baseUrl', 'clientId', 'clientSecret', 'apiKey', 'oauthClientSecret']],
    ['PSA PSGC data', 'Refresh Getafe barangay references through PSA’s official token-authenticated PSGC API. The token is stored as a protected server secret.', KeyRound, ['psgcApiVersion', 'psgcApiToken']],
  ],
  notifications: [['Notification preferences', 'Control application notifications and how updates appear.', Bell, ['enabled', 'emailEnabled', 'toastDuration', 'toastPosition']]],
  weather: [['Weather providers', 'Manage credentials for the portal’s weather services.', CloudSun, ['openWeatherApiKey', 'accuWeatherApiKey']]],
  features: [['Application features', 'Manage the features available in the Getafe portal.', Flag, ['uploads', 'reports', 'ai', 'publicRegistration']]],
  maintenance: [['Maintenance mode', 'Restrict portal access and set the public maintenance message.', Wrench, ['enabled', 'message', 'expectedCompletion', 'allowedAdminIps']]],
  legal: [['Public policies', 'Manage the policy content published on your portal.', FileText, ['privacy', 'terms', 'cookies']]],
  advanced: [['Application diagnostics', 'Use additional authentication diagnostics when troubleshooting.', SlidersHorizontal, ['authDebug']]],
}

export function categorySections(category, fields) {
  const database = ['database', 'portalDatabase'].includes(category)
  const layout = database ? [
    [category === 'database' ? 'Primary database' : 'Portal database connection', category === 'database' ? 'Configure the database used by Getafe CMS.' : 'Configure the database used by the public-facing portal.', Database, ['provider', 'engine', 'connectionMode', 'host', 'port', 'name', 'username', 'password']],
    ['Connection settings', 'Manage connection capacity, timeouts and TLS verification.', SlidersHorizontal, ['ssl', 'connectionLimit', 'queueLimit', 'connectTimeout', 'idleTimeout']],
    ['Legacy connection options', 'Existing compatibility settings for database deployments.', Cloud, ['instance', 'iam', 'privateIp']],
  ] : layouts[category] || []
  const assigned = new Set()
  const sections = layout.map(([title, description, icon, names]) => {
    const selected = names.flatMap(name => fields.filter(([key]) => key === `${category}.${name}`))
    selected.forEach(([key]) => assigned.add(key))
    return { title, description, icon, fields: selected }
  }).filter(section => section.fields.length)
  const remaining = fields.filter(([key]) => !assigned.has(key))
  if (remaining.length) sections.push({ title: `${categoryLabels[category] || category} settings`, description: 'Additional application configuration.', icon: sectionIcon(category), fields: remaining })
  return sections
}

export function settingIsVisible(visibleWhen, values = {}) {
  if (!visibleWhen) return true
  if (visibleWhen.all) return visibleWhen.all.every(condition => settingIsVisible(condition, values))
  if (visibleWhen.any) return visibleWhen.any.some(condition => settingIsVisible(condition, values))
  return Object.hasOwn(values, visibleWhen.key) && values[visibleWhen.key] === visibleWhen.equals
}

const descriptions = {
  'storage.azureConnectionString': 'In Azure Portal, open the storage account and go to Access keys. Copy the full Connection string for Key 1 or Key 2. It already contains the account key. Leave this field blank to keep the saved credential.',
  'security.registrationCaptcha': 'Protect registration forms from automated submissions.',
  'integrations.psgcApiVersion': 'PSA PSGC release requested during scheduled and manual refreshes. The active local snapshot remains available if PSA cannot provide it.',
  'integrations.psgcApiToken': 'PSA-issued token for the official Classification API. It is sent only by the server and is never included in logs or public responses.',
  'security.contactCaptcha': 'Protect the public contact form from automated submissions.',
  'security.recaptchaSiteKey': 'Public site key from the Google reCAPTCHA admin console.',
  'security.recaptchaVersion': 'Select the version used when you created the Google key: v2 checkbox or v3 score based. This must match the key type.',
  'security.recaptchaProjectId': 'Required for Enterprise assessments. Use the Google Cloud project ID that owns this Enterprise key.',
  'security.frameProtection': 'Prevent other websites from embedding the portal in a frame.',
  'security.contentTypeProtection': 'Prevent browsers from guessing a different content type.',
  'security.registrationRateLimit': 'Maximum registration attempts allowed in one hour.',
  'authentication.registrationEnabled': 'Allow new users to create an account.',
  'authentication.requireEmailVerification': 'Verify email addresses before allowing account access.',
  'authentication.mfaEnabled': 'Require an email verification code during sign-in.',
  'authentication.mobileVerificationEnabled': 'Allow residents to verify their saved mobile number by SMS.',
  'authentication.requireMobileVerification': 'Require a verified mobile number to finish Google account setup. Enable mobile verification and configure the Semaphore SMS API key first.',
  'features.ai': 'Control the existing AI feature flag.',
  'maintenance.enabled': 'Display the maintenance page to public visitors.',
  'advanced.authDebug': 'Enable authentication diagnostics without including credentials.',
  'legal.privacy': 'Public Privacy Policy content. Separate paragraphs with a blank line.',
  'legal.terms': 'Public Terms of Use content. Separate paragraphs with a blank line.',
  'legal.cookies': 'Public cookies and cache notice. Separate paragraphs with a blank line.',
}
export function fieldDescription(key, definition) {
  if (descriptions[key]) return descriptions[key]
  if (definition.secret) return 'Leave blank to keep the current secret.'
  if (definition.description?.includes('Saved settings override environment fallback values.')) return ''
  return definition.description || ''
}
