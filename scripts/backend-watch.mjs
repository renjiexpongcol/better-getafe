import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export function isBackendSource(filename) {
  const name = String(filename).replaceAll('\\', '/')
  return !/(^|\/)(logs?|uploads?|tmp|temp|cache|storage|data|runtime|generated|node_modules)(\/|$)/i.test(name)
    && /\.(?:js|mjs|cjs)$/.test(name)
}

export function watchBackend() {
  const watchers = [], root = fileURLToPath(new URL('../', import.meta.url))
  const changedFiles = new Set()
  let child, timer, stopping = false, restarting = false
  const launch = () => {
    child = spawn(process.execPath, ['server.js'], { cwd: root, stdio: 'inherit', env: process.env })
    child.on('error', error => { console.error('[Backend watcher]', error.message); stop(1) })
    child.on('exit', (code, signal) => {
      if (stopping) return
      if (restarting) { restarting = false; launch(); return }
      console.error(`[Backend watcher] Worker exited (${signal || code}); review its fatal diagnostic.`)
      stop(code || 1)
    })
  }
  const changed = filename => {
    changedFiles.add(String(filename).replaceAll('\\', '/'))
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (stopping || restarting) return
      restarting = true
      console.info("[Backend watcher] Source changed; restarting 'server.js': " + [...changedFiles].join(', '))
      changedFiles.clear()
      child.kill('SIGTERM')
    }, 250)
  }
  function stop(code = 0) {
    if (stopping) return
    stopping = true
    clearTimeout(timer)
    watchers.forEach(watcher => watcher.close())
    child?.kill('SIGTERM')
    process.exitCode = code
  }
  // Only executable source is watched. Runtime JSON, logs, uploads, settings,
  // cache and database files cannot trigger a request-driven restart.
  for (const directory of ['server', 'src/data']) {
    watchers.push(fs.watch(path.join(root, directory), { recursive: true }, (_event, filename) => {
      if (filename && isBackendSource(filename)) changed(path.join(directory, filename))
    }))
  }
  watchers.push(fs.watch(root, (_event, filename) => {
    if (['server.js', '.env', 'package.json'].includes(String(filename))) changed(filename)
  }))
  process.once('SIGINT', () => stop())
  process.once('SIGTERM', () => stop())
  launch()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) watchBackend()
