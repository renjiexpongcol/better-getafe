import { Settings2, Building2, Globe2, Database, Cloud, Folder, LockKeyhole, ShieldCheck, Mail, Bell, Plug, CloudSun, Flag, Wrench, FileText, SlidersHorizontal, Activity, History, Users, Image, KeyRound } from 'lucide-react'

export const categoryLabels = { general: 'General', database: 'Database', portalDatabase: 'Portal Database', google: 'Google Cloud', storage: 'Storage', authentication: 'Authentication', email: 'Email', security: 'Security', notifications: 'Notifications', integrations: 'Integrations', weather: 'Weather', features: 'Feature Flags', maintenance: 'Maintenance', legal: 'Legal Policies', advanced: 'Advanced', status: 'System Status', history: 'Audit History' }
const icons = { general: Settings2, database: Database, portalDatabase: Database, google: Cloud, storage: Folder, authentication: LockKeyhole, security: ShieldCheck, email: Mail, notifications: Bell, integrations: Plug, weather: CloudSun, features: Flag, maintenance: Wrench, legal: FileText, advanced: SlidersHorizontal, status: Activity, history: History }
export const sectionIcon = category => icons[category] || Settings2

// Presentation groups only: setting keys, values, validation and permissions stay server-owned.
const layouts = {
  general: [
    ['Application details', 'The identity and contact details of your Getafe portal.', Building2, ['name', 'company', 'url', 'supportEmail']],
    ['Regional preferences', 'Language, timezone and formatting for your application.', Globe2, ['timezone', 'locale', 'currency', 'dateFormat', 'language']],
    ['Brand assets', 'Logo and browser icon used by the application.', Image, ['logo', 'favicon']],
    ['Community banner', 'Configure the special announcement shown on the public home page.', Users, ['communityBannerEnabled', 'communityBannerTitle', 'communityBannerMessage', 'communityBannerUrl']],
  ],
  security: [
    ['reCAPTCHA protection', 'Protect public forms against automated abuse.', ShieldCheck, ['registrationCaptcha', 'recaptchaProvider', 'recaptchaSiteKey', 'recaptchaSecretKey']],
    ['Browser & request protection', 'Control registration limits and browser security protections.', LockKeyhole, ['registrationRateLimit', 'frameProtection', 'contentTypeProtection']],
    ['Administrator access', 'Manage who can view and update system configuration.', Users, ['permissionGrants']],
  ],
  authentication: [
    ['Sessions', 'Configure session duration and remembered sign-ins.', LockKeyhole, ['sessionMinutes', 'rememberDays']],
    ['Password & sign-in security', 'Manage password requirements and failed login limits.', KeyRound, ['passwordMinLength', 'passwordExpiryDays', 'failedLoginLimit', 'lockoutMinutes']],
    ['Account registration', 'Control registration and account verification.', Users, ['registrationEnabled', 'requireEmailVerification', 'mfaEnabled']],
  ],
  storage: [
    ['Default storage', 'Choose where uploaded media is stored.', Folder, ['provider', 'localPath', 'prefix', 'visibility', 'publicBaseUrl']],
    ['Cloud storage connection', 'Configure the existing Backblaze B2 integration.', Cloud, ['bucket', 'endpoint', 'region', 'keyId', 'applicationKey']],
    ['Uploads & access', 'Set upload limits, allowed image types and link expiration.', Image, ['maxUploadMb', 'allowedTypes', 'signedUrlMinutes']],
  ],
  google: [
    ['Google Cloud project', 'Connect your application to a Google Cloud project.', Cloud, ['projectId']],
    ['Google OAuth', 'Configure the credentials and callback for Google sign-in.', KeyRound, ['clientId', 'clientSecret', 'redirectUri']],
  ],
  email: [
    ['SMTP configuration', 'Connect your mail server for application email.', Mail, ['enabled', 'smtpHost', 'smtpPort', 'security', 'username', 'password']],
    ['Sender identity', 'Choose the sender and reply-to details for outgoing email.', Users, ['senderName', 'senderEmail', 'replyTo']],
  ],
  integrations: [['External integration', 'Connect an external service using its existing API credentials.', Plug, ['enabled', 'baseUrl', 'clientId', 'clientSecret', 'apiKey', 'oauthClientSecret']]],
  notifications: [['Notification preferences', 'Control application notifications and how updates appear.', Bell, ['enabled', 'emailEnabled', 'toastDuration', 'toastPosition']]],
  weather: [['Weather providers', 'Manage credentials for the portal’s weather services.', CloudSun, ['openWeatherApiKey', 'accuWeatherApiKey']]],
  features: [['Application features', 'Manage the features available in the Getafe portal.', Flag, ['uploads', 'reports', 'ai', 'publicRegistration']]],
  maintenance: [
    ['Maintenance mode', 'Temporarily restrict portal access during maintenance.', Wrench, ['enabled']],
    ['Maintenance details', 'Set the public message, expected completion and administrator access.', FileText, ['message', 'expectedCompletion', 'allowedAdminIps']],
  ],
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

const descriptions = {
  'security.registrationCaptcha': 'Protect registration forms from automated submissions.',
  'security.recaptchaSiteKey': 'Public site key from the Google reCAPTCHA admin console.',
  'security.frameProtection': 'Prevent other websites from embedding the portal in a frame.',
  'security.contentTypeProtection': 'Prevent browsers from guessing a different content type.',
  'security.registrationRateLimit': 'Maximum registration attempts allowed in one hour.',
  'authentication.registrationEnabled': 'Allow new users to create an account.',
  'authentication.requireEmailVerification': 'Verify email addresses before allowing account access.',
  'authentication.mfaEnabled': 'Require an email verification code during sign-in.',
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
