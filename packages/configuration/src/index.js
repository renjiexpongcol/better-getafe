export const applicationSurfaces = Object.freeze({
  public: 'public',
  resident: 'resident',
  admin: 'admin',
})

export const requiredEnvironmentKeys = Object.freeze({
  development: ['NODE_ENV'],
  test: ['NODE_ENV'],
  staging: ['NODE_ENV', 'AUTH_SESSION_SECRET'],
  production: ['NODE_ENV', 'AUTH_SESSION_SECRET'],
})

export function missingEnvironmentKeys(environment = process.env.NODE_ENV || 'development', values = process.env) {
  return (requiredEnvironmentKeys[environment] || requiredEnvironmentKeys.development)
    .filter(key => !String(values[key] || '').trim())
}
