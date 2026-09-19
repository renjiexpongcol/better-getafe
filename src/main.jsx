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
    const response = await portalFetch(input, request)
    // Only retry idempotent reads. Writes may have succeeded before a gateway
    // response was lost, so retrying them automatically is unsafe.
    if (response.status !== 429 || count >= 2 || !['GET', 'HEAD'].includes(method)) return response
    const seconds = Number(response.headers.get('Retry-After'))
    const wait = Math.min(5_000, Math.max(250, Number.isFinite(seconds) ? seconds * 1_000 : 500 * 2 ** count) + Math.floor(Math.random() * 150))
    window.dispatchEvent(new CustomEvent('portal-rate-limited', { detail: { retryInMs: wait } }))
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
