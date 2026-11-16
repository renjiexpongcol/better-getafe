export const defaultApiPrefix = '/api/v1'
export const legacyApiPrefix = '/api'

export function apiV1Path(path) {
  const value = String(path || '/')
  if (value === defaultApiPrefix || value.startsWith(`${defaultApiPrefix}/`)) return value
  if (value === legacyApiPrefix) return defaultApiPrefix
  if (value.startsWith(`${legacyApiPrefix}/`)) return `${defaultApiPrefix}${value.slice(legacyApiPrefix.length)}`
  return `${defaultApiPrefix}${value.startsWith('/') ? value : `/${value}`}`
}

export const apiContract = Object.freeze({
  prefix: defaultApiPrefix,
  legacyPrefix: legacyApiPrefix,
  ready: `${defaultApiPrefix}/ready`,
  session: `${defaultApiPrefix}/auth/me`,
  publicConfig: `${defaultApiPrefix}/public/config`,
})
