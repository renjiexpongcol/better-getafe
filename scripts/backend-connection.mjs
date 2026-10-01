import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

export function loadLocalEnvironment() {
  dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })
}
export function backendConnection(env = process.env) {
  const port = Number(env.BACKEND_PORT || env.PORT || 8080)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Backend port must be an integer between 1 and 65535.')
  const target = env.VITE_BACKEND_URL || `http://127.0.0.1:${port}`
  const url = new URL(target)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Backend target must be an HTTP origin without credentials or a path.')
  return { port, target: url.origin }
}
export function proxyRequestOrigin(request, target) {
  // The browser must already be same-origin with Vite. A foreign Origin is
  // preserved for Express to reject, even when a caller spoofs proxy headers.
  const origin = request.headers?.origin
  const host = request.headers?.host
  const frontendOrigin = `${request.socket?.encrypted ? 'https' : 'http'}://${host}`
  return origin && origin === frontendOrigin ? target : origin
}
