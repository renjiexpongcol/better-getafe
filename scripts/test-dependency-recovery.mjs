import assert from 'node:assert/strict'
import net from 'node:net'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import { loadLocalEnvironment } from './backend-connection.mjs'
loadLocalEnvironment()

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function relay(host, port) {
  let blocked = false
  const sockets = new Set()
  const server = net.createServer(socket => {
    socket.on('error', () => {})
    if (blocked) { socket.destroy(); return }
    const upstream = net.connect({ host, port })
    for (const current of [socket, upstream]) {
      sockets.add(current)
      current.on('error', () => { socket.destroy(); upstream.destroy() })
      current.on('close', () => { sockets.delete(current); socket.destroy(); upstream.destroy() })
    }
    socket.pipe(upstream); upstream.pipe(socket)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { port: server.address().port, block(value) { blocked = value; if (value) for (const socket of sockets) socket.destroy() }, close() { for (const socket of sockets) socket.destroy(); server.close() } }
}
async function freePort() {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
async function eventually(work, timeout = 45000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { if (await work()) return; await sleep(300) }
  throw new Error('Recovery deadline exceeded')
}

const databaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null
const database = await relay(databaseUrl?.hostname || process.env.DB_HOST || '127.0.0.1', Number(databaseUrl?.port || process.env.DB_PORT || 5432))
const redisUrl = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379')
const redis = await relay(redisUrl.hostname, Number(redisUrl.port || 6379))
const port = await freePort(), base = `http://127.0.0.1:${port}`
const env = { ...process.env, NODE_ENV: 'development', PORT: String(port), BACKEND_PORT: String(port),
  DB_HOST: '127.0.0.1', DB_PORT: String(database.port),
  DB_CONNECT_TIMEOUT_MS: '1000', CMS_DB_CONNECT_TIMEOUT_MS: '1000', PORTAL_DB_CONNECT_TIMEOUT_MS: '1000',
  CMS_DB_HOST: '127.0.0.1', CMS_DB_PORT: String(database.port), PORTAL_DB_HOST: '127.0.0.1', PORTAL_DB_PORT: String(database.port),
  REDIS_URL: `redis://127.0.0.1:${redis.port}`, REDIS_PREFIX: `resilience-${crypto.randomUUID()}`, REDIS_CONNECT_TIMEOUT_MS: '1000',
  FIXTURE_STARTUP_DELAY_MS: '2000', FIXTURE_STORAGE_DELAY_MS: '15000',
}
if (databaseUrl) {
  databaseUrl.hostname = '127.0.0.1'; databaseUrl.port = String(database.port)
  env.DATABASE_URL = databaseUrl.href; env.PORTAL_DATABASE_URL = databaseUrl.href
}
let child, output = '', sequence = 0
function launch() {
  output = ''
  child = spawn(process.execPath, ['scripts/resilience-fixture.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
}
async function status(path) {
  if (child.exitCode !== null) throw new Error('Test backend exited: ' + output.slice(-3000))
  try { return await fetch(base + path, { signal: AbortSignal.timeout(4000) }) } catch { return null }
}
function command(action, down) {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { child.off('message', listener); reject(new Error('Fixture command timed out')) }, 10000)
    const listener = message => { if (message.id === id) { clearTimeout(timer); child.off('message', listener); resolve(message) } }
    child.on('message', listener); child.send({ id, action, down })
  })
}
async function stop() {
  if (child.exitCode !== null) return
  const exited = new Promise(resolve => child.once('exit', resolve))
  child.kill(); await exited
}
try {
  launch()
  await eventually(async () => (await status('/health'))?.status === 200, 10000)
  assert.equal((await status('/ready')).status, 503)
  const starting = await status('/api/public/config')
  assert.equal(starting.status, 503); assert.equal(starting.headers.get('Retry-After'), '2')
  await eventually(async () => (await status('/ready'))?.status === 200)
  assert.ok(output.includes('[FIXTURE] Storage check pending'))
  assert.ok(!output.includes('[FIXTURE] Storage check completed'), 'B2 check must not block readiness')
  console.info(`PASS early bind: STARTING health=200, ready/config=503; core ready before B2; PID=${child.pid}`)
  const pid = child.pid
  await eventually(async () => (await command('redis')).ok)
  database.block(true)
  await sleep(300)
  assert.equal((await status('/health')).status, 200)
  assert.equal((await status('/ready')).status, 503)
  assert.equal((await status('/api/news')).status, 503)
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'GetafeCitizenPortal' },
    body: JSON.stringify({ email: 'outage-probe@example.test', password: 'Outage-probe-password-123!' }),
    signal: AbortSignal.timeout(5000),
  })
  assert.equal(login.status, 503)
  assert.doesNotMatch(await login.text(), /ECONNRESET|ECONNREFUSED|127\.0\.0\.1|node_modules/)
  assert.equal(child.exitCode, null); assert.equal(child.pid, pid)
  database.block(false)
  await eventually(async () => (await status('/ready'))?.status === 200)
  await eventually(async () => (await status('/api/news'))?.status === 200)
  console.info(`PASS PostgreSQL: dropped active/idle sockets, controlled 503, PID before=${pid} after=${child.pid}, automatic recovery`)
  redis.block(true)
  await sleep(300)
  assert.equal((await command('redis')).ok, false)
  assert.equal((await status('/health')).status, 200)
  assert.equal(child.pid, pid); assert.equal(child.exitCode, null)
  redis.block(false)
  await eventually(async () => (await command('redis')).ok)
  console.info(`PASS Redis: dropped sockets, degraded functionality, PID before=${pid} after=${child.pid}, automatic recovery`)
  assert.equal((await command('storage', true)).ok, false)
  assert.equal((await status('/health')).status, 200)
  assert.equal((await status('/api/public/config')).status, 200)
  assert.equal(child.pid, pid); assert.equal(child.exitCode, null)
  assert.equal((await command('storage', false)).ok, true)
  console.info(`PASS B2: injected unreachable client, unrelated config available, PID before=${pid} after=${child.pid}, automatic recovery`)
  await command('email')
  await eventually(async () => output.includes('email_worker_failed'))
  assert.equal((await status('/health')).status, 200)
  assert.equal(child.pid, pid); assert.equal(child.exitCode, null)
  console.info('PASS email worker: SMTP and failure-callback rejections contained, unchanged PID')
  await stop()
  database.block(true); redis.block(true)
  launch()
  await eventually(async () => (await status('/health'))?.status === 200)
  const coldPid = child.pid
  assert.equal((await status('/ready')).status, 503)
  database.block(false); redis.block(false)
  await eventually(async () => (await status('/ready'))?.status === 200)
  assert.equal((await status('/api/news')).status, 200)
  assert.equal(child.pid, coldPid)
  console.info('PASS cold startup: dependencies unavailable, live process, recovery without restart')
} catch (error) { console.error(output.slice(-5000)); throw error }
finally { await stop(); database.close(); redis.close() }
