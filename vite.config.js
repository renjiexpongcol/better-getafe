import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import crypto from 'node:crypto'
import { backendConnection, loadLocalEnvironment, proxyRequestOrigin } from './scripts/backend-connection.mjs'

loadLocalEnvironment()
// The API listens on IPv4 during local development. Using 127.0.0.1 avoids
// Windows/Node resolving localhost to ::1 and making the Vite proxy fail.
const backendTarget = backendConnection().target
const createProxyReference = () => `ERR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`

const backendProxy = () => ({
  target: backendTarget,
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on('proxyReq', (outgoing, request) => {
      const origin = proxyRequestOrigin(request, backendTarget)
      if (origin) outgoing.setHeader('Origin', origin)
    })
    proxy.on('error', (error, request, response) => {
      const target = new URL(backendTarget)
      const path = String(request?.url || '').split('?')[0]
      const label = path.startsWith('/api/') ? '[API Proxy]' : '[Dev Proxy]'
      console.error(`${label} Backend unavailable: ${error?.code || 'UNKNOWN'} ${target.hostname}:${target.port || (target.protocol === 'https:' ? 443 : 80)}`)
      if (response && !response.headersSent && !response.destroyed) {
        response.writeHead(502, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({
          error: {
            type: 'SERVICE_UNAVAILABLE',
            message: 'This service is temporarily unavailable. Please try again later.',
            referenceId: createProxyReference(),
          },
        }))
      }
    })
  },
})

// https://vitejs.dev/config/

export default defineConfig({
  plugins: [react()],

  // Keep original source structure out of public production assets. Vite's
  // development server remains unaffected and continues to expose source
  // modules for local debugging.
  build: {
    sourcemap: false,
  },

  server: {
    allowedHosts: ['getafe.supra-intra.org'],

    proxy: {
      '/api': {
        ...backendProxy(),
      },
      '/rss.xml': {
        ...backendProxy(),
      },
      // Local media URLs are returned as /uploads/... so they stay relative
      // to the portal. Proxy them in development just like the API; without
      // this Vite serves the app shell for the image request and every card
      // reports a broken preview.
      '/uploads': {
        ...backendProxy(),
        xfwd: true,
      },
      // Proxy PSA OpenSTAT requests through the dev server so the browser
      // calls a same-origin path (no CORS). The app also falls back to the
      // direct API URL for static/production hosting.

      '/psa': {
        target: 'https://openstat.psa.gov.ph:443',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/psa/, ''),
      },
    },
  },
})
