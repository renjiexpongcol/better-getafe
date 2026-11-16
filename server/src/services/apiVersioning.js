export const API_V1_PREFIX = '/api/v1'

// The v1 surface is a compatibility alias over the existing, audited route
// handlers. Rewriting before CORS, policy, and security middleware means the
// same validation and authorization rules apply to both URL forms.
export function installApiVersionAliases(app) {
  app.use((req, _res, next) => {
    const requestUrl = String(req.url || '')
    if (requestUrl !== API_V1_PREFIX && !requestUrl.startsWith(`${API_V1_PREFIX}/`)) return next()
    const suffix = requestUrl.slice(API_V1_PREFIX.length) || '/'
    const normalized = `/api${suffix}`
    req.apiVersion = 'v1'
    req.apiRoutePath = normalized.split('?')[0]
    req.url = normalized
    next()
  })
}
