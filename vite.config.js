import { createLogger, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { handleProxyError, proxyLogger } from './scripts/proxy-errors.mjs'
import { backendConnection, loadLocalEnvironment, proxyRequestOrigin } from './scripts/backend-connection.mjs'

loadLocalEnvironment()
// The API listens on IPv4 during local development. Using 127.0.0.1 avoids
// Windows/Node resolving localhost to ::1 and making the Vite proxy fail.
const unifiedDevServer = process.env.PORTAL_UNIFIED_DEV_SERVER === 'true'
const backendTarget = unifiedDevServer ? null : backendConnection().target
const logger = proxyLogger(createLogger())

const backendProxy = () => ({
  target: backendTarget,
  changeOrigin: true,
  proxyTimeout: 15000,
  configure: (proxy) => {
    proxy.on('proxyReq', (outgoing, request) => {
      const origin = proxyRequestOrigin(request, backendTarget)
      if (origin) outgoing.setHeader('Origin', origin)
    })
    proxy.on('error', handleProxyError)
  },
})

// https://vitejs.dev/config/

export default defineConfig({
  customLogger: logger,
  plugins: [react()],

  // The footer is lazy-loaded, so Vite's dependency scanner can otherwise
  // start serving it before this icon entry has finished prebundling. Include
  // it up front to avoid stale optimized-dependency 504s for remote clients.
  optimizeDeps: {
    include: ['react-icons/fa6'],
  },

  // Keep original source structure out of public production assets. Vite's
  // development server remains unaffected and continues to expose source
  // modules for local debugging.
  build: {
    sourcemap: false,
  },

  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    allowedHosts: ['getafe.supra-intra.org'],

    proxy: {
      ...(unifiedDevServer ? {} : {
        '/api': { ...backendProxy() },
        '/rss.xml': { ...backendProxy() },
        // Local media URLs are returned as /uploads/... so they stay relative
        // to the portal. Proxy them in standalone Vite mode only.
        '/uploads': { ...backendProxy(), xfwd: true },
      }),
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
