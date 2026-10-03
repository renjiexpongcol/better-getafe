export function isAuthenticatedSurface(pathname) {
  return /^\/(?:auth|app|admin)(?:\/|$)/.test(pathname)
}

// Cache and credentials are opt-in outside this published API allowlist.
export function isPublicApiRequest(path, method = 'GET') {
  const pathname = String(path).split('?')[0]
  if (!['GET', 'HEAD'].includes(String(method).toUpperCase())) return ['/api/contact', '/api/feedback/article', '/api/client-errors'].includes(pathname) || /^\/api\/public-data(?:\/|$)/.test(pathname)
  return /^\/api\/(?:public\/config|news(?:\/[^/]+)?|categories|notifications|popular-services|weather(?:\/[^/]+)?|officials(?:\/directory)?|barangays|departments(?:\/[^/]+)?|discover(?:\/.*)?|public-data(?:\/.*)?|services(?:\/.*)?|health\/live|ready)\/?$/.test(pathname)
}
