import { spawn } from 'node:child_process'
import fs from 'node:fs'

// Vite's config reads process.env, while the API server loads .env itself.
// Load the same values here so both processes always agree on the backend
// port (previously Vite defaulted to 8091 while the server used .env's 8080).
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (process.env[key] === undefined) process.env[key] = value
  }
}

const processes = []
const backendPort = process.env.BACKEND_PORT || process.env.PORT || '8091'
const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: backendPort,
  VITE_BACKEND_PORT: backendPort,
  CMS_DATABASE_PROVIDER: 'postgresql',
  CMS_MEDIA_PROVIDER: process.env.CMS_MEDIA_PROVIDER || 'local',
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
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(healthUrl)
      if (response.ok) return
    } catch { /* The server is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`The backend did not become ready at ${healthUrl}.`)
}

const backend = start(process.execPath, ['--watch', 'server.js'])
backend.once('exit', code => {
  if (code && !process.exitCode) {
    console.error(`Backend stopped before the development server was ready (exit ${code}).`)
    stop()
    process.exit(code)
  }
})

try {
  await waitForBackend()
  start(process.execPath, ['node_modules/vite/bin/vite.js'])
} catch (error) {
  console.error(error.message)
  stop()
  process.exit(1)
}

process.on('SIGINT', () => { stop(); process.exit(0) })
process.on('SIGTERM', () => { stop(); process.exit(0) })
