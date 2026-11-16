export const authSurfaceKinds = Object.freeze(['resident', 'cms'])
export { sessionDeadline, sessionWarningMinutes, sessionWarningStartsAt, formatSessionCountdown } from './sessionDeadline.js'

export const AUTH_ENDPOINTS = Object.freeze({
  session: '/api/auth/me',
  renew: '/api/auth/renew',
  login: '/api/auth/login',
  register: '/api/portal-auth/register',
  logout: '/api/auth/logout',
  mfaVerify: '/api/auth/mfa/verify',
})

export const privilegedRoles = Object.freeze(['admin', 'super_admin', 'staff', 'it_support', 'content_manager'])

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function isPrivilegedRole(role) {
  return privilegedRoles.includes(role)
}

export const roleSets = Object.freeze({
  admin: Object.freeze(['admin', 'super_admin']),
  staff: Object.freeze(['staff', 'it_support', 'content_manager', 'admin', 'super_admin']),
  citizen: Object.freeze(['resident']),
})

export function hasRole(user, requiredRole) {
  if (!user) return false
  return requiredRole ? (roleSets[requiredRole] || []).includes(user.role) : true
}

export function hasPermission(userOrPermissions, permission) {
  if (!permission) return true
  const permissions = Array.isArray(userOrPermissions) ? userOrPermissions : userOrPermissions?.permissions
  return Array.isArray(permissions) && permissions.includes(permission)
}

export function accessState(user, requiredRole) {
  if (!user) return 'unauthenticated'
  return hasRole(user, requiredRole) ? 'allowed' : 'forbidden'
}

function parseRetryAfter(response, body) {
  const retryAfter = Number(body?.retryAfter || response.headers?.get?.('Retry-After') || 0)
  return Number.isFinite(retryAfter) ? Math.max(0, retryAfter) : 0
}

export function createAuthClient({ request, normalizeError, refreshSession, onBeforeRefresh, onSignedOut, recoverSession }) {
  if (typeof request !== 'function') throw new TypeError('createAuthClient requires a request function')
  const publicAuthError = (response, body, fallback) => {
    if (response.status === 401) return { ok: false, error: 'Unable to sign in. Check your email and password and try again.' }
    if (response.status === 403) return { ok: false, error: 'Unable to complete sign-in. Refresh the page and try again.' }
    if (response.status === 409 && body?.error === 'An account with that email already exists.') {
      return { ok: false, error: body.error }
    }
    const publicError = normalizeError?.({ status: response.status, body }, 'auth') || {}
    if (response.status !== 429) return { ok: false, error: publicError.message || fallback, referenceId: publicError.referenceId }
    return { ok: false, error: publicError.message || fallback, referenceId: publicError.referenceId, retryAfter: parseRetryAfter(response, body) }
  }
  const requestJson = async (endpoint, options = {}) => {
    const response = await request(endpoint, options)
    const body = await response.json().catch(() => ({}))
    return { response, body }
  }
  const refreshAfterMutation = async () => {
    await onBeforeRefresh?.()
    const current = await refreshSession?.()
    return current || null
  }
  return {
    async login(email, password, remember = false) {
      try {
        const { response, body } = await requestJson(AUTH_ENDPOINTS.login, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GetafeCitizenPortal' },
          body: JSON.stringify({ email: normalizeEmail(email), password, remember }),
        })
        if (!response.ok) return publicAuthError(response, body, 'Invalid email or password.')
        if (body.verificationRequired || body.passwordExpired || body.mfaRequired) return { ok: false, ...body }
        const current = await refreshAfterMutation()
        if (!current) return { ok: false, error: 'The sign-in session could not be established. Please try again.' }
        return { ok: true, admin: isPrivilegedRole(current.role) }
      } catch (error) {
        return { ok: false, error: error?.code === 'REQUEST_TIMEOUT'
          ? 'Sign-in took too long to respond. Please try again.'
          : 'The sign-in service is temporarily unavailable.' }
      }
    },
    async register(name, email, password, captchaToken) {
      try {
        const { response, body } = await requestJson(AUTH_ENDPOINTS.register, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, captchaToken }),
        })
        if (!response.ok) return publicAuthError(response, body, 'The account could not be created.')
        if (body.verificationRequired) return { ok: false, ...body }
        const current = await refreshAfterMutation()
        if (!current) return { ok: false, error: 'The sign-in session could not be established. Please try again.' }
        return { ok: true, setup: true }
      } catch {
        return { ok: false, error: 'The account service is temporarily unavailable.' }
      }
    },
    async completeMfa(challengeId, code) {
      try {
        const { response, body } = await requestJson(AUTH_ENDPOINTS.mfaVerify, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GetafeCitizenPortal' },
          body: JSON.stringify({ challengeId, code }),
        })
        if (!response.ok) return publicAuthError(response, body, 'MFA verification failed.')
        const current = await refreshAfterMutation()
        if (!current) return { ok: false, error: 'The sign-in session could not be established. Please try again.' }
        return { ok: true, recoveryCodeUsed: body.recoveryCodeUsed === true }
      } catch {
        return { ok: false, error: 'MFA verification is temporarily unavailable.' }
      }
    },
    async logout() {
      try {
        const { response } = await requestJson(AUTH_ENDPOINTS.logout, {
          method: 'POST', credentials: 'include', cache: 'no-store',
          headers: { 'X-Requested-With': 'GetafeCitizenPortal' },
        })
        if (!response.ok) {
          await recoverSession?.()
          return { ok: false, error: 'Could not complete sign out. Please try again.' }
        }
      } catch {
        await recoverSession?.()
        return { ok: false, error: 'Could not complete sign out. Please check your connection and try again.' }
      }
      await onSignedOut?.()
      return { ok: true }
    },
  }
}
