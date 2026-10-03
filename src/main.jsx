import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { setupFavicon } from './setupFavicon'
import { errorContextForPath, normalizePublicError } from './services/publicError'
import { isPublicApiRequest } from './services/securitySurfaces'

setupFavicon();

// Add the app boundary header to every same-origin API request in the SPA.
const portalFetch = window.fetch.bind(window)
window.fetch = (input, init = {}) => {
  const requestUrl = typeof input === 'string' ? input : input?.url || ''
  const isApiRequest = requestUrl.startsWith('/api/') || requestUrl.startsWith(`${window.location.origin}/api/`)
  if (!isApiRequest) return portalFetch(input, init)
  const apiPath = new URL(requestUrl, window.location.origin).pathname
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value))
  headers.set('X-Requested-With', 'GetafeCitizenPortal')
  const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const publicRequest = isPublicApiRequest(apiPath, method)
  if (publicRequest) headers.delete('Authorization')
  // Keep the session cookie on API calls. This is especially important for
  // auth/me, which is often called through the wrapper before a page mounts.
  // Preserve an explicitly supplied policy (and Request input semantics), but
  // default same-origin API requests to include credentials.
  const request = {
    ...init,
    headers,
    credentials: publicRequest ? 'omit' : init.credentials ?? (input instanceof Request ? input.credentials : 'include'),
  }
  const attempt = async () => {
    // Retry ownership belongs to apiTransport, never to this global wrapper.
    let response = await portalFetch(input, request)
    // Normalize failed API payloads before any feature code can read a raw
    // backend message. This is a presentation safeguard; the server also
    // sanitizes its response contract and records the diagnostic reference.
    if (!response.ok && response.status !== 204) {
      const body = await response.clone().json().catch(() => ({}))
      const publicError = normalizePublicError({ status: response.status, body }, errorContextForPath(apiPath))
      const safeBody = body && typeof body === 'object' ? { ...body, error: publicError.message } : { error: publicError.message }
      delete safeBody.stack
      delete safeBody.debug
      delete safeBody.internalError
      if (publicError.referenceId) safeBody.referenceId = publicError.referenceId
      response = new Response(JSON.stringify(safeBody), { status: response.status, statusText: response.statusText, headers: response.headers })
    }
    const protectedApi = (/^\/api\/(?:admin|staff|citizen|media)(?:\/|$)/.test(apiPath)
      && apiPath !== '/api/citizen/privacy-requests/verify-password')
      || /^\/api\/auth\/sessions(?:\/|$)/.test(apiPath)
      || apiPath === '/api/auth/mfa/status'
      || apiPath === '/api/account/avatar'
    if (response.status === 401 && protectedApi) window.dispatchEvent(new CustomEvent('auth-session-expired'))
    if (response.status === 401 && ['/api/account/password', '/api/auth/change-password'].includes(apiPath)) {
      response.clone().json().then(body => {
        if (body.error !== 'Current password is incorrect.') window.dispatchEvent(new CustomEvent('auth-session-expired'))
      }).catch(() => window.dispatchEvent(new CustomEvent('auth-session-expired')))
    }
    return response
  }
  return attempt()
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
