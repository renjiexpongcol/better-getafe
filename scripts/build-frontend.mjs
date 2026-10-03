import { build } from 'vite'

// Set this before Vite resolves configuration. A local backend .env may use
// development mode; production frontend assets must use React's release runtime.
process.env.NODE_ENV = 'production'
await build()
