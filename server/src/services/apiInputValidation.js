const mutations = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const bodyFields = {
  '/api/admin/settings/media-migration': ['action', 'confirmed'],
  '/api/admin/settings/database-migration': ['action', 'confirmed', 'password', 'pooler', 'certificate'],
  '/api/search/complete': ['submissionId', 'topicId', 'source', 'zeroResults'],
  '/api/admin/search/topics': ['label', 'canonicalQuery', 'aliases', 'publicVisible', 'pinOrder'],
  '/api/admin/search/topics/:id': ['label', 'canonicalQuery', 'aliases', 'publicVisible', 'pinOrder'],
  '/api/account/mfa/disable': ['password', 'code'],
  '/api/account/mfa/activate': ['enrollmentId', 'code'],
  '/api/account/mfa/setup': ['password'],
  '/api/account/mfa': [],
  '/api/staff/me': ['phone'],
  '/api/staff/notifications/:id/read': [],
  '/api/staff/applications/:id/assign': ['assigned_user_id','version'],
  '/api/staff/applications/:id': ['status','previous_status','version','fulfillment','note','note_visibility','noteVisibility'],
  '/api/auth/login': ['email', 'password', 'remember', 'rememberMe', 'accountType'],
  '/api/newsletter/subscriptions': ['email'],
  '/api/portal-auth/login': ['email', 'password', 'remember', 'rememberMe', 'accountType'],
  '/api/portal-auth/register': ['name', 'email', 'password', 'captcha', 'captchaToken'],
  '/api/auth/mfa/verify': ['challengeId', 'code', 'recoveryCode'],
  '/api/auth/verify-code': ['challengeId', 'code'],
  '/api/auth/resend-code': ['challengeId'],
  '/api/auth/forgot-password': ['email'],
  '/api/auth/forgot-password/verify': ['challengeId', 'code'],
  '/api/auth/renew-password': ['password'],
  '/api/auth/change-password': ['currentPassword', 'password'],
  '/api/auth/mfa/setup': ['password'],
  '/api/auth/mfa/activate': ['enrollmentId', 'code'],
  '/api/auth/mfa/disable/request': ['password'],
  '/api/auth/mfa/disable/confirm': ['challengeId', 'code'],
  '/api/auth/logout': [],
  '/api/account/password': ['currentPassword', 'newPassword'],
  '/api/citizen/profile': ['full_name', 'mobile', 'gender', 'barangay', 'house_lot', 'street', 'purok_sitio', 'municipality', 'province', 'zip_code'],
  '/api/citizen/mobile-verification/request': [],
  '/api/citizen/mobile-verification/confirm': ['challengeId', 'code'],
  '/api/citizen/email-verification/request': [],
  '/api/citizen/email-verification/confirm': ['challengeId', 'code'],
  '/api/citizen/onboarding/complete': [],
  '/api/citizen/onboarding/password': ['password'],
  '/api/citizen/onboarding/verification/request': ['method'],
  '/api/citizen/onboarding/verification/confirm': ['challengeId', 'code'],
  '/api/citizen/applications': ['service_id', 'service_name', 'details'],
  '/api/citizen/settlements': ['category', 'reference_number', 'amount', 'payment_method', 'notes'],
  '/api/citizen/privacy-requests/verify-password': ['password'],
  '/api/citizen/privacy-requests': ['scope', 'password'],
  '/api/citizen/appointments': ['service_id', 'appointment_at', 'contact_number', 'barangay_id', 'reason'],
  '/api/citizen/notifications/:id/read': [],
  '/api/citizen/notifications/read-all': [],
  '/api/requests': ['service_id', 'business_id'],
  '/api/requests/:id/draft': ['version', 'values', 'appointment', 'draft_step'],
  '/api/requests/:id/submit': ['version', 'declaration', 'appointment_at', 'contact_number', 'appointment_reason'],
  '/api/requests/:id/respond': ['version', 'declaration', 'appointment_at', 'contact_number', 'appointment_reason'],
  '/api/requests/:id/select-assessment': ['version', 'order_id'],
  '/api/requests/:id/review-assessment': ['version', 'order_id', 'confirmed'],
  '/api/admin/api-keys': ['name', 'description', 'scopes', 'expiresAt', 'ipAllowlist'],
  '/api/admin/api-keys/:id': ['description', 'scopes', 'ipAllowlist', 'enabled'],
  '/api/admin/api-keys/:id/rotate': [],
  '/api/admin/api-keys/:id/revoke': [],
  '/api/businesses': ['business_name', 'trade_name', 'ownership_type', 'address'],
  '/api/businesses/:id': ['business_name', 'trade_name', 'ownership_type', 'address'],
  '/api/payment-orders/:id/payment-submissions': ['method', 'reference', 'amount'],
  '/api/payment-orders/:id/checkout': [],
};

function validStructure(value, depth = 0, key = '') {
  if (depth > 12 || ['__proto__', 'constructor', 'prototype'].includes(key)) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= (key === 'data' ? 7 * 1024 * 1024 : key === 'content' ? 50000 : 20000);
  if (Array.isArray(value)) return value.length <= 500 && value.every(item => validStructure(item, depth + 1));
  return value && typeof value === 'object' && Object.keys(value).length <= 200 && Object.entries(value).every(([name, item]) => name.length <= 160 && validStructure(item, depth + 1, name));
}

export function validateApiInput(req, policy) {
  // Query parser arrays/objects and duplicate keys must never reach string/SQL consumers.
  for (const [key, value] of Object.entries(req.query || {})) {
    if (typeof value !== 'string' || key.length > 100 || value.length > 2000 || /[\0\r\n]/.test(value)) return 'Invalid query parameter.';
    if (['limit', 'page', 'offset'].includes(key) && (!/^\d{1,7}$/.test(value) || Number(value) > (key === 'limit' ? 500 : 1000000) || (key !== 'offset' && Number(value) < 1))) return 'Invalid pagination.';
  }
  const pathname = String(req.originalUrl || req.url || '').split('?')[0];
  try {
    const decoded = decodeURIComponent(pathname);
    if (pathname.length > 2048 || /[\0\r\n\\]/.test(decoded) || /%2f|%5c/i.test(pathname) || decoded.split('/').some(part => part === '.' || part === '..')) return 'Invalid resource path.';
    const parts = decoded.split('/'), declaration = policy.path.split('/');
    for (let index = 0; index < declaration.length; index++) {
      if (declaration[index].startsWith(':') && (!parts[index] || parts[index].length > 200 || /[\s<>{}"'`]/.test(parts[index]))) return 'Invalid resource identifier.';
    }
  } catch { return 'Invalid resource path.'; }
  for (const name of ['Idempotency-Key', 'X-Requirement-Id', 'X-Replaces-Id', 'X-Request-Version', 'X-Filename']) {
    const value = req.get(name);
    if (value && (value.length > (name === 'X-Filename' ? 1000 : 200) || /[\0\r\n]/.test(value))) return 'Invalid request header.';
    if (name === 'X-Filename' && value) { try { decodeURIComponent(value); } catch { return 'Invalid filename.'; } }
  }
  if (!mutations.has(req.method) || Buffer.isBuffer(req.body)) return null;
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || !validStructure(req.body)) return 'Invalid request body.';
  const fields = bodyFields[policy.path];
  if (fields && Object.keys(req.body).some(key => !fields.includes(key))) return 'Unexpected request field.';
  if (policy.path === '/api/citizen/applications') {
    const details = req.body.details;
    if (details && (typeof details !== 'object' || Array.isArray(details) || Object.keys(details).some(key => !['purpose', 'attachment'].includes(key)))) return 'Unexpected application field.';
  }
  for (const [key, value] of Object.entries(req.body)) {
    if (['email', 'password', 'currentPassword', 'newPassword', 'name', 'title', 'excerpt', 'content', 'challengeId', 'code', 'recoveryCode'].includes(key) && typeof value !== 'string') return 'Invalid text field.';
    if (policy.path === '/api/newsletter/subscriptions' && key === 'email' && (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))) return 'Enter a valid email address.';
    if (/password/i.test(key) && typeof value === 'string' && value.length > 1024) return 'Invalid password length.';
  }
  return null;
}
