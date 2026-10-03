import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import net from 'node:net'
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'getafe-watch-'))
const reserve = net.createServer()
await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve))
const port = reserve.address().port
await new Promise(resolve => reserve.close(resolve))
for (const folder of ['scripts', 'server/src', 'server/logs', 'src/data']) await fs.mkdir(path.join(root, folder), { recursive: true })
await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}')
await fs.copyFile(new URL('./backend-watch.mjs', import.meta.url), path.join(root, 'scripts/backend-watch.mjs'))
await fs.writeFile(path.join(root, 'server.js'), `import http from 'node:http'; http.createServer((req,res)=>res.end(String(process.pid))).listen(${port},'127.0.0.1');`)
let output = '', workerPid
const child = spawn(process.execPath, ['scripts/backend-watch.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { output += chunk })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function pid() { try { return Number(await (await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) })).text()) } catch { return null } }
async function until(work) { for (let i = 0; i < 50; i++) { if (await work()) return; await sleep(100) } throw new Error('Watcher deadline: ' + output) }
try {
  await until(async () => Boolean(workerPid = await pid()))
  const originalPid = workerPid
  await fs.writeFile(path.join(root, 'server/logs/runtime.js'), '// generated runtime file')
  await fs.writeFile(path.join(root, 'server/settings.json'), '{}')
  await fs.writeFile(path.join(root, 'server/request.log'), 'request')
  await sleep(800)
  assert.equal(await pid(), originalPid)
  assert.doesNotMatch(output, /restarting/)
  await fs.writeFile(path.join(root, 'server/src/service.js'), '// source change')
  await until(async () => { const next = await pid(); if (next && next !== originalPid) { workerPid = next; return true } return false })
  assert.match(output, /Source changed; restarting/)
  console.info('PASS watcher: runtime files preserve PID; source edit restarts worker')
} finally {
  child.kill()
  if (workerPid) { try { process.kill(workerPid) } catch {} }
  await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve))
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep))
  await fs.rm(root, { recursive: true, force: true })
}
