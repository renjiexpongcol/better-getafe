export function isAuthenticatedSurface(pathname) {
  return /^\/(?:auth|app|admin)(?:\/|$)/.test(pathname)
}

// Cache and credentials are opt-in outside this published API allowlist.
export function isPublicApiRequest(path, method = 'GET') {
  const pathname = String(path).split('?')[0]
  if (!['GET', 'HEAD'].includes(String(method).toUpperCase())) return ['/api/contact', '/api/contact/data-correction', '/api/feedback/article', '/api/client-errors', '/api/newsletter/subscriptions', '/api/search/complete', '/api/analytics/events'].includes(pathname) || /^\/api\/public-data(?:\/|$)/.test(pathname)
  if (pathname === '/api/public/exchange-rates') return true
  return /^\/api\/(?:public\/(?:config|content\/[^/]+)|news(?:\/[^/]+)?|categories|notifications|popular-services|weather(?:\/[^/]+)?|officials(?:\/directory)?|barangays|departments(?:\/[^/]+)?|discover(?:\/.*)?|public-data(?:\/.*)?|services(?:\/.*)?|newsletter\/(?:confirm|unsubscribe)\/[^/]+|health\/live|ready)\/?$/.test(pathname)
}
