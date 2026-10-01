import fs from 'node:fs/promises'
import { access, constants } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import dotenv from 'dotenv'
import pg from 'pg'
import { createClient } from 'redis'

const { Pool } = pg
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const COMPOSE_CANDIDATES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml', 'docker-compose.redis.yml']
const DEFAULT_DB_PASSWORD = 'getafe_local_dev_password'
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379'
const DEFAULT_DB_HOST = '127.0.0.1'
const DEFAULT_DB_PORT = 5432
const DEFAULT_DB_NAME = 'getafe_portal'
const DEFAULT_DB_USER = 'getafe_app'

class SetupFailure extends Error {}

const exists = async file => {
  try { await fs.access(file, constants.F_OK); return true } catch { return false }
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const configured = value => value !== undefined && value !== null && String(value).trim() !== ''

const parseBoolean = (value, fallback = false) => {
  if (!configured(value)) return fallback
  return !['false', '0', 'no', 'off'].includes(String(value).trim().toLowerCase())
}

const safeText = value => String(value || '')
  .replace(/(postgres(?:ql)?|redis):\/\/[^\s@]+@/gi, '$1://<redacted>@')
  .replace(/(password|secret|applicationkey|accesskey|token)=([^\s]+)/gi, '$1=<redacted>')

const compactFailure = result => {
  const lines = `${result.stderr}\n${result.stdout}`
    .split(/\r?\n/)
    .map(line => safeText(line.trim()))
    .filter(Boolean)
  return lines.at(-1) || 'The command did not provide diagnostic output.'
}

function runCommand(command, args, { env = process.env, timeoutMs = 30_000 } = {}) {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd: ROOT, env, windowsHide: true })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    child.stdout?.on('data', chunk => { stdout += chunk })
    child.stderr?.on('data', chunk => { stderr += chunk })
    child.on('error', error => {
      clearTimeout(timer)
      resolve({ code: null, stdout, stderr, error, timedOut })
    })
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}

async function ensureEnvironment() {
  const envPath = path.join(ROOT, '.env')
  const examplePath = path.join(ROOT, '.env.example')
  if (await exists(envPath)) {
    console.log('[OK] .env already exists')
  } else if (await exists(examplePath)) {
    await fs.copyFile(examplePath, envPath)
    console.log('[OK] Created .env from .env.example')
  } else {
    throw new SetupFailure('Neither .env nor .env.example exists. Create an environment file before continuing.')
  }

  const fileValues = dotenv.parse(await fs.readFile(envPath, 'utf8'))
  // Match dotenv behavior: an explicitly supplied process variable wins over
  // the value in .env, while setup itself never writes to an existing .env.
  return { envPath, fileValues, values: { ...fileValues, ...process.env } }
}

async function checkDependencies() {
  if (!(await exists(path.join(ROOT, 'node_modules')))) {
    throw new SetupFailure('Node dependencies are not installed. Run "npm install" first; setup never runs npm install recursively.')
  }
  console.log('[OK] package dependencies')
}

async function checkTools() {
  const nodeMajor = Number(process.versions.node.split('.')[0])
  if (nodeMajor < 22) throw new SetupFailure(`Node.js 22 or newer is required; found ${process.version}.`)
  console.log(`[OK] Node.js ${process.version}`)

  const npmCommand = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm'
  const npmArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm --version'] : ['--version']
  const npm = await runCommand(npmCommand, npmArgs, { timeoutMs: 10_000 })
  if (npm.code !== 0) throw new SetupFailure('npm is required but was not detected.')
  console.log(`[OK] npm ${npm.stdout.trim().split(/\r?\n/)[0] || 'available'}`)

  const docker = await runCommand('docker', ['version', '--format', '{{.Server.Version}}'], { timeoutMs: 15_000 })
  if (docker.code !== 0) {
    console.error('[ERROR] Docker is required for PostgreSQL/Redis but was not detected.')
    throw new SetupFailure('Start Docker Desktop and run npm run setup again.')
  }
  console.log(`[OK] Docker ${docker.stdout.trim().split(/\r?\n/)[0] || 'available'}`)

  const compose = await runCommand('docker', ['compose', 'version'], { timeoutMs: 15_000 })
  if (compose.code !== 0) throw new SetupFailure('Docker Compose is required but was not detected. Update Docker Desktop and try again.')
  console.log(`[OK] Docker Compose ${compose.stdout.trim().split(/\r?\n/)[0] || 'available'}`)
}

function databaseOptions(values, passwordOverride) {
  if (configured(values.DATABASE_URL)) return { connectionString: values.DATABASE_URL }
  return {
    host: values.DB_HOST || DEFAULT_DB_HOST,
    port: Number(values.DB_PORT || DEFAULT_DB_PORT),
    database: values.DB_NAME || DEFAULT_DB_NAME,
    user: values.DB_USER || DEFAULT_DB_USER,
    password: passwordOverride ?? values.DB_PASSWORD,
  }
}

function databaseHost(values) {
  if (configured(values.DATABASE_URL)) {
    try { return new URL(values.DATABASE_URL).hostname } catch { return null }
  }
  return values.DB_HOST || DEFAULT_DB_HOST
}

function databasePort(values) {
  if (configured(values.DATABASE_URL)) {
    try { return Number(new URL(values.DATABASE_URL).port || DEFAULT_DB_PORT) } catch { return DEFAULT_DB_PORT }
  }
  return Number(values.DB_PORT || DEFAULT_DB_PORT)
}

function localHost(host) {
  return ['127.0.0.1', 'localhost', '::1'].includes(String(host || '').toLowerCase())
}

async function probeTcp(host, port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port })
    const finish = result => { socket.destroy(); resolve(result) }
    socket.setTimeout(2500)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function probePostgres(values, passwordOverride) {
  const host = databaseHost(values)
  const port = databasePort(values)
  const options = databaseOptions(values, passwordOverride)
  const tcpReachable = host ? await probeTcp(host, port) : false
  const pool = new Pool({ ...options, max: 1, connectionTimeoutMillis: 3500, idleTimeoutMillis: 1000 })
  try {
    await pool.query('SELECT 1')
    return { healthy: true, tcpReachable, message: '' }
  } catch (error) {
    return { healthy: false, tcpReachable, message: safeText(error?.code === '28P01' || error?.code === '28000' ? 'PostgreSQL authentication failed.' : error?.code === '3D000' ? 'PostgreSQL database was not found.' : error?.message || 'PostgreSQL is not reachable.') }
  } finally {
    await pool.end().catch(() => {})
  }
}

function redisOptions(values) {
  const url = values.REDIS_URL || values.RATE_LIMIT_REDIS_URL || DEFAULT_REDIS_URL
  let host = '127.0.0.1'
  let port = 6379
  try { const parsed = new URL(url); host = parsed.hostname; port = Number(parsed.port || 6379) } catch { /* redis-client reports the URL problem below */ }
  return { url, host, port }
}

async function probeRedis(values) {
  if (!parseBoolean(values.REDIS_ENABLED, true)) return { healthy: true, disabled: true, message: '' }
  const options = redisOptions(values)
  const client = createClient({ url: options.url, socket: { connectTimeout: 3500 } })
  client.on('error', () => {})
  try {
    await client.connect()
    const response = await client.ping()
    return { healthy: response === 'PONG', tcpReachable: true, message: response === 'PONG' ? '' : 'Redis did not answer PONG.' }
  } catch (error) {
    return { healthy: false, tcpReachable: await probeTcp(options.host, options.port), message: safeText(error?.message || 'Redis is not reachable.') }
  } finally {
    if (client.isOpen) await client.quit().catch(() => {})
  }
}

async function composeFile() {
  for (const candidate of COMPOSE_CANDIDATES) {
    const file = path.join(ROOT, candidate)
    if (await exists(file)) return candidate
  }
  return null
}

async function composeServices(file) {
  if (!file) return []
  const result = await runCommand('docker', ['compose', '-f', file, 'config', '--services'], { timeoutMs: 30_000 })
  if (result.code !== 0) return []
  return result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}

async function startInfrastructure(values, composeName) {
  let database = await probePostgres(values)
  let redis = await probeRedis(values)
  const redisEnabled = !redis.disabled
  if (database.healthy) console.log('[OK] PostgreSQL already reachable')
  if (redis.disabled) console.log('[OK] Redis disabled by configuration')
  else if (redis.healthy) console.log('[OK] Redis already reachable')

  const services = await composeServices(composeName)
  const toStart = []
  if (!database.healthy && localHost(databaseHost(values))) {
    const service = services.find(name => ['postgres', 'postgresql', 'db'].includes(name))
    if (service) toStart.push(service)
    else if (!database.tcpReachable) throw new SetupFailure(`No PostgreSQL service is defined in ${composeName || 'the repository Compose files'}.`)
  }
  if (redisEnabled && !redis.healthy && localHost(redisOptions(values).host)) {
    const service = services.find(name => ['redis', 'cache'].includes(name))
    if (service) toStart.push(service)
    else if (!redis.tcpReachable) throw new SetupFailure(`No Redis service is defined in ${composeName || 'the repository Compose files'}.`)
  }

  if (toStart.length) {
    console.log('\nStarting infrastructure...')
    const uniqueServices = [...new Set(toStart)]
    const result = await runCommand('docker', ['compose', '-f', composeName, 'up', '-d', ...uniqueServices], { timeoutMs: 120_000 })
    if (result.code !== 0) throw new SetupFailure(`Docker Compose could not start ${uniqueServices.join(' and ')}: ${compactFailure(result)}`)

    for (let attempt = 0; attempt < 45; attempt += 1) {
      database = await probePostgres(values)
      redis = await probeRedis(values)
      if ((database.healthy || !toStart.some(service => ['postgres', 'postgresql', 'db'].includes(service))) && (redis.healthy || redis.disabled || !toStart.some(service => ['redis', 'cache'].includes(service)))) break
      await sleep(1000)
    }
  }

  if (!database.healthy) {
    const credentialHint = !configured(values.DATABASE_URL) && !configured(values.DB_PASSWORD) ? ' Set DB_PASSWORD or DATABASE_URL in .env.' : ''
    throw new SetupFailure(`PostgreSQL could not be reached.${credentialHint} Check that Docker Desktop is running, the PostgreSQL container is healthy, and the database settings are correct.`)
  }
  if (redisEnabled && !redis.healthy) {
    throw new SetupFailure('Redis is configured but cannot be reached. Check that Docker Desktop is running and the Redis container is healthy.')
  }
  return { database, redis }
}

async function applyMigrations(values) {
  console.log('\nPreparing database...')
  const result = await runCommand(process.execPath, ['scripts/migrate-postgresql.mjs'], {
    env: values,
    timeoutMs: 120_000,
  })
  if (result.code !== 0) {
    const hint = !configured(values.DATABASE_URL) && !configured(values.DB_PASSWORD) ? ' Set DB_PASSWORD or DATABASE_URL in .env.' : ''
    throw new SetupFailure(`PostgreSQL migrations failed.${hint} ${compactFailure(result)}`)
  }
  const applied = result.stdout.split(/\r?\n/).map(line => line.trim()).filter(line => /^Applied\s+/i.test(line))
  if (applied.length) applied.forEach(line => console.log(`[OK] ${safeText(line)}`))
  else console.log('[OK] Migrations already current')
}

function reportOptionalServices(values) {
  const b2Keys = ['B2_ENDPOINT', 'B2_REGION', 'B2_BUCKET_NAME', 'B2_KEY_ID', 'B2_APPLICATION_KEY']
  const b2Ready = b2Keys.every(key => configured(values[key]))
  if (b2Ready) console.log('[OK] Backblaze B2 configuration present (connectivity check skipped)')
  else console.log('[WARN] B2 storage is not configured. Media/storage features may be unavailable; local storage is available with CMS_MEDIA_PROVIDER=local.')

  if (String(values.AUTH_SESSION_SECRET || '').startsWith('replace-with-')) {
    console.log('[WARN] AUTH_SESSION_SECRET is still using the example placeholder; replace it before production.')
  }
}

async function main() {
  console.log('========================================')
  console.log('       GETAFE PORTAL SETUP')
  console.log('========================================')

  console.log('\nChecking environment...')
  const environment = await ensureEnvironment()
  await checkDependencies()
  await checkTools()

  const composeName = await composeFile()
  if (composeName) console.log(`[OK] Compose configuration: ${composeName}`)
  else console.log('[WARN] No Compose file was found; setup can only use already-running services.')

  console.log('\nChecking infrastructure...')
  await startInfrastructure(environment.values, composeName)
  console.log('[OK] PostgreSQL')
  if (parseBoolean(environment.values.REDIS_ENABLED, true)) console.log('[OK] Redis')

  await applyMigrations(environment.values)

  console.log('\nChecking optional services...')
  reportOptionalServices(environment.values)

  const backendPort = environment.values.BACKEND_PORT || environment.values.PORT || '8080'
  console.log('\n========================================')
  console.log('Setup completed successfully.')
  console.log('========================================')
  console.log('\nStart the portal with:\n\n  npm run dev\n')
  console.log('Frontend:')
  console.log('  http://localhost:5173')
  console.log('Backend:')
  console.log(`  http://localhost:${backendPort}`)
  console.log('\nThis command is safe to run again; it does not overwrite .env, recreate volumes, drop data, or reset accounts.')
}

try {
  await main()
} catch (error) {
  console.error('\nSetup failed.')
  console.error(`[ERROR] ${safeText(error.message || error)}`)
  process.exitCode = 1
}
