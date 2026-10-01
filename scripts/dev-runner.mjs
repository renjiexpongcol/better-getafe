import { spawn } from 'node:child_process'
import { backendConnection, loadLocalEnvironment } from './backend-connection.mjs'
loadLocalEnvironment()
const { port, target } = backendConnection()
const preview = process.argv.includes('--preview')
const frontendOnly = process.argv.includes('--frontend-only')
const forwarded = process.argv.slice(2).filter(arg => !['--preview', '--frontend-only'].includes(arg))
const children = new Set()
let stopping = false, monitor
const env = { ...process.env, NODE_ENV: 'development', PORT: String(port), VITE_BACKEND_URL: target, CMS_DATABASE_PROVIDER: 'postgresql', PORTAL_DATABASE_PROVIDER: 'postgresql' }
const stop = (code = 0) => {
  if (stopping) return
  stopping = true
  clearInterval(monitor)
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else child.kill()
  }
  process.exitCode = code
}
const start = args => {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env })
  children.add(child)
  child.once('error', () => { console.error('[Portal] Unable to start a required process.'); stop(1) })
  child.once('exit', (code, signal) => {
    children.delete(child)
    if (!stopping) { console.error('[Portal] Required process stopped (' + (signal || code) + ').'); stop(code || 1) }
  })
  return child
}
const reachable = async () => {
  try {
    const response = await fetch(target + '/health', { signal: AbortSignal.timeout(1500) })
    const body = await response.json()
    return response.ok && body.service === 'better-getafe'
  } catch { return false }
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
try {
  if (!await reachable()) {
    if (!frontendOnly) {
      if (new URL(target).hostname !== '127.0.0.1' || Number(new URL(target).port || 80) !== port) throw new Error('Start the configured remote API before launching the frontend.')
      start(['--watch', 'server.js'])
    }
    const deadline = Date.now() + 90000
    while (!stopping && !await reachable()) {
      if (Date.now() > deadline) throw new Error('API startup failed. Review backend startup messages; the frontend was not started.')
      await new Promise(resolve => setTimeout(resolve, 400))
    }
  } else console.info('[Portal] Using the already running, healthy API.')
  if (!stopping) {
    console.info('[Portal] API ready at ' + target + '; starting ' + (preview ? 'built preview' : 'frontend') + '.')
    start(['node_modules/vite/bin/vite.js', ...(preview ? ['preview'] : []), '--strictPort', ...forwarded])
    // The watcher survives a failed API worker; monitor actual health instead.
    let failures = 0, checking = false
    monitor = setInterval(async () => {
      if (checking || stopping) return
      checking = true
      try {
        failures = await reachable() ? 0 : failures + 1
        if (failures >= 6) { console.error('[Portal] API unavailable for 30 seconds. Review backend diagnostics and restart the portal.'); stop(1) }
      } finally { checking = false }
    }, 5000)
  }
} catch (error) { console.error('[Portal] ' + error.message); stop(1) }
