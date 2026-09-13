import { spawn } from 'node:child_process'

const processes = []
const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: process.env.PORT || '8091',
  VITE_BACKEND_PORT: process.env.PORT || '8091',
  CMS_DATABASE_PROVIDER: process.env.CMS_DATABASE_PROVIDER || 'local',
  CMS_MEDIA_PROVIDER: process.env.CMS_MEDIA_PROVIDER || 'local',
  PORTAL_DATABASE_PROVIDER: process.env.PORTAL_DATABASE_PROVIDER || 'local',
}

const start = (command, args) => {
  const child = spawn(command, args, { stdio: 'inherit', env })
  processes.push(child)
  return child
}

start(process.execPath, ['--watch', 'server.js'])
start(process.execPath, ['node_modules/vite/bin/vite.js'])

const stop = () => {
  for (const child of processes) {
    if (!child.killed) child.kill()
  }
}

process.on('SIGINT', () => { stop(); process.exit(0) })
process.on('SIGTERM', () => { stop(); process.exit(0) })
