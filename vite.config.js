import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendPort = process.env.VITE_BACKEND_PORT || process.env.BACKEND_PORT || process.env.PORT || '8080'
const backendTarget = process.env.VITE_BACKEND_URL || `http://localhost:${backendPort}`

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
