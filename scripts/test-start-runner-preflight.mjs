import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import test from 'node:test'

function run(entry, overrides) {
  // An isolated environment keeps these startup checks off the configured database.
  const env = { SystemRoot: process.env.SystemRoot, NODE_ENV: 'production', CI: 'true', ...overrides }
  return spawnSync(process.execPath, [entry], { env, encoding: 'utf8', timeout: 20000, windowsHide: true })
}

test('production preflight stops before listening when database configuration is missing', () => {
  const result = run('server.js')
  assert.ifError(result.error)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Supabase configuration is missing/)
  assert.doesNotMatch(result.stdout, /Listening on/)
})

test('an occupied port stops the dev runner before database setup or worker startup', async t => {
  const listener = createServer()
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => listener.close(resolve)))
  const result = run('scripts/dev-runner.mjs', { VITE_PORT: String(listener.address().port) })
  assert.ifError(result.error)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /already in use/)
  assert.doesNotMatch(result.stdout, /Connection verified|Starting Better Getafe/)
})

test('all API routes register before the listener rejects an invalid port', () => {
  const result = run('server/index.js', { AUTH_SESSION_SECRET: 'local-startup-fixture-without-network-activity', PORT: 'invalid' })
  assert.ifError(result.error)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Backend port must be an integer/)
  assert.doesNotMatch(result.stdout, /Listening on/)
})
