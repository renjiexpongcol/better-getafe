import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { parse } from 'dotenv'

// Vite's config reads process.env, while the API server loads .env itself.
// Load the same values here so both processes always agree on the backend
// port (previously Vite defaulted to 8091 while the server used .env's 8080).
if (fs.existsSync('.env')) {
  const parsed = parse(fs.readFileSync('.env', 'utf8'))
  for (const [key, value] of Object.entries(parsed)) if (process.env[key] === undefined) process.env[key] = value
}

const processes = []
const backendPort = process.env.BACKEND_PORT || process.env.PORT || '8080'
const frontendOnly = process.argv.includes('--frontend-only')
const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: backendPort,
  VITE_BACKEND_PORT: backendPort,
  CMS_DATABASE_PROVIDER: 'postgresql',
  PORTAL_DATABASE_PROVIDER: 'postgresql',
}

const start = (command, args) => {
  const child = spawn(command, args, { stdio: 'inherit', env })
  processes.push(child)
  return child
}

const stop = () => {
  for (const child of processes) {
    if (!child.killed) child.kill()
  }
}

const waitForBackend = async () => {
  const healthUrl = `http://127.0.0.1:${backendPort}/health`
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      const response = await fetch(healthUrl)
      if (response.ok) return
    } catch { /* The server is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`The backend did not become ready at ${healthUrl}. Start the API with "npm start" and try again.`)
}

try {
  if (frontendOnly) {
    await waitForBackend()
  } else {
    const backend = start(process.execPath, ['--watch', 'server.js'])
    backend.once('exit', code => {
      if (code && !process.exitCode) {
        console.error(`Backend stopped before the development server was ready (exit ${code}).`)
        stop()
        process.exit(code)
      }
    })
    await waitForBackend()
  }
  start(process.execPath, ['node_modules/vite/bin/vite.js'])
} catch (error) {
  console.error(error.message)
  stop()
  process.exit(1)
}

process.on('SIGINT', () => { stop(); process.exit(0) })
process.on('SIGTERM', () => { stop(); process.exit(0) })
