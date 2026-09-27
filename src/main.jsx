import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { setupFavicon } from './setupFavicon'

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
  // Keep the session cookie on API calls. This is especially important for
  // auth/me, which is often called through the wrapper before a page mounts.
  // Preserve an explicitly supplied policy (and Request input semantics), but
  // default same-origin API requests to include credentials.
  const request = {
    ...init,
    headers,
    credentials: init.credentials ?? (input instanceof Request ? input.credentials : 'include'),
  }
  const attempt = async (count = 0) => {
    let response
    try {
      response = await portalFetch(input, request)
    } catch (error) {
      // A Vite proxy can briefly lose its backend while the API is starting
      // or restarting. Retry safe reads, but never replay writes whose result
      // may be unknown to the browser.
      if (count < 2 && ['GET', 'HEAD'].includes(method)) {
        await new Promise(resolve => setTimeout(resolve, 250 * 2 ** count))
        return attempt(count + 1)
      }
      throw error
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
    // Only retry idempotent reads after transient gateway or service failures.
    // A 429 already carries its own Retry-After guidance; replaying it here can
    // multiply a normal page's requests while the limiter is asking it to wait.
    const retryableStatus = [502, 503, 504].includes(response.status)
    if (!retryableStatus || count >= 2 || !['GET', 'HEAD'].includes(method)) return response
    const seconds = Number(response.headers.get('Retry-After'))
    const wait = Math.min(5_000, Math.max(250, Number.isFinite(seconds) ? seconds * 1_000 : 250 * 2 ** count) + Math.floor(Math.random() * 150))
    await new Promise(resolve => setTimeout(resolve, wait))
    return attempt(count + 1)
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
