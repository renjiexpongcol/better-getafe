import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendPort = process.env.VITE_BACKEND_PORT || process.env.BACKEND_PORT || process.env.PORT || '8080'
// The API listens on IPv4 during local development. Using 127.0.0.1 avoids
// Windows/Node resolving localhost to ::1 and making the Vite proxy fail.
const backendTarget = process.env.VITE_BACKEND_URL || `http://127.0.0.1:${backendPort}`

// https://vitejs.dev/config/

export default defineConfig({
  plugins: [react()],

  server: {
    allowedHosts: ['getafe.supra-intra.org'],

    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/rss.xml': {
        target: backendTarget,
        changeOrigin: true,
      },
      // Local media URLs are returned as /uploads/... so they stay relative
      // to the portal. Proxy them in development just like the API; without
      // this Vite serves the app shell for the image request and every card
      // reports a broken preview.
      '/uploads': {
        target: backendTarget,
        changeOrigin: true,
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
