import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { loadLocalEnvironment } from './backend-connection.mjs'
import { config } from '../server/src/config/index.js'
import { createPostgresResource } from '../server/src/services/postgres.js'
loadLocalEnvironment()
const databases = { cms: createPostgresResource(config.values, 'database'), portal: createPostgresResource(config.values, 'portalDatabase') }
const reserve = net.createServer()
await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve))
const port = reserve.address().port
await new Promise(resolve => reserve.close(resolve))
const base = `http://127.0.0.1:${port}`, users = []
let output = '', sequence = 0
const child = spawn(process.execPath, ['scripts/auth-isolation-fixture.mjs'], {
  env: { ...process.env, NODE_ENV: 'development', PORT: String(port), BACKEND_PORT: String(port), REDIS_PREFIX: `auth-isolation-${crypto.randomUUID()}` },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
})
child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { output += chunk })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function request(path, token, options = {}) {
  const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(10000), headers: { Origin: base, 'X-Requested-With': 'GetafeCitizenPortal', ...(token ? { Cookie: `getafe_session=${token}` } : {}), ...options.headers } })
  return { response, body: await response.json() }
}
function command(action, user) {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { child.off('message', listener); reject(new Error('Fixture timeout')) }, 10000)
    const listener = message => { if (message.id === id) { clearTimeout(timer); child.off('message', listener); message.error ? reject(new Error(message.error)) : resolve(message) } }
    child.on('message', listener); child.send({ id, action, user })
  })
}
try {
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(base + '/ready')).status === 200) break } catch {}
    assert.ok(attempt < 150, 'Backend did not become ready')
    await sleep(300)
  }
  for (const role of ['resident', 'staff', 'admin']) {
    const id = crypto.randomUUID(), table = role === 'resident' ? 'portal_users' : 'users', database = role === 'resident' ? databases.portal : databases.cms
    await database.pool.query(`INSERT INTO ${table}(id,name,email,password,role,created_at,updated_at) VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [id, 'Isolation test', `${id}@example.test`, 'disabled-test-password-hash', role])
    const user = { id, role, table, database }; users.push(user)
    user.token = (await command('session', { id, role })).token
    const me = await request('/api/auth/me', user.token)
    assert.equal(me.body.user.role, role)
    assert.match(me.response.headers.get('cache-control'), /no-store/)
    assert.doesNotMatch(JSON.stringify(me.body), /password_hash|mfa_secret|resetToken|disabled-test-password/)
    for (const path of ['/api/news?limit=1', '/api/categories', '/api/public/config', '/api/notifications']) {
      const anonymous = await request(path), authenticated = await request(path, user.token)
      assert.equal(authenticated.response.status, anonymous.response.status)
      assert.deepEqual(authenticated.body, anonymous.body, `${role} public response differs`)
      assert.equal(authenticated.response.headers.get('set-cookie'), null)
    }
    const privileged = await request('/api/admin/news?limit=1', user.token)
    assert.equal(privileged.response.status, role === 'admin' ? 200 : 403)
    assert.match(privileged.response.headers.get('cache-control'), /no-store/)
    assert.equal((await request('/api/auth/me', user.token)).body.user.role, role)
    console.info(`PASS HTTP ${role}: public data independent of identity; private access enforced; session preserved`)
  }
  assert.equal((await request('/api/admin/news')).response.status, 401)
  assert.equal((await request('/api/staff/notifications')).response.status, 401)
  assert.equal((await request('/api/staff/notifications', users[0].token)).response.status, 403)
  const staffNotices = await request('/api/staff/notifications', users[1].token)
  assert.equal(staffNotices.response.status, 200)
  assert.match(staffNotices.response.headers.get('cache-control'), /no-store/)
  assert(Array.isArray(staffNotices.body.items))
  const report = { service_name: 'Report a Concern', details: { purpose: 'Isolated attachment audit', attachment: { name: 'evidence.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4 audit evidence').toString('base64') } } }
  const submitReport = () => request('/api/citizen/applications', users[0].token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) })
  await command('storage-failure', { enabled: true })
  const failedReport = await submitReport()
  assert.equal(failedReport.response.status, 503)
  assert.equal((await databases.portal.pool.query('SELECT id FROM applications WHERE user_id=$1', [users[0].id])).rowCount, 0, 'Storage failure must not leave a submitted application')
  await command('storage-failure', { enabled: false })
  const successfulReport = await submitReport()
  assert.equal(successfulReport.response.status, 201)
  const storedFiles = await databases.portal.pool.query('SELECT name,storage_path,document_kind FROM application_documents WHERE application_id=$1 AND user_id=$2', [successfulReport.body.id, users[0].id])
  assert.equal(storedFiles.rowCount, 1)
  assert.equal(storedFiles.rows[0].name, 'evidence.pdf')
  assert.equal(storedFiles.rows[0].document_kind, 'uploaded')
  assert.match(storedFiles.rows[0].storage_path, /^citizen-private\/concerns\//)
  const visibleReport = await request('/api/citizen/applications/' + successfulReport.body.id, users[0].token)
  assert.equal(visibleReport.response.status, 200)
  assert.equal((typeof visibleReport.body.details === 'string' ? JSON.parse(visibleReport.body.details) : visibleReport.body.details).purpose, 'Isolated attachment audit')
  console.info('PASS concern storage failure rollback, attachment persistence and staff notification permission/session boundaries')
  const loginChallenge = await command('login', { id: users[0].id })
  const login = await request('/api/auth/verify-code', null, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId: loginChallenge.challengeId, code: '123456' }) })
  assert.equal(login.response.status, 200)
  const sessionCookies = login.response.headers.getSetCookie()
  assert.ok(sessionCookies.some(cookie => /getafe_session=;.*Path=\/;.*Max-Age=0/.test(cookie)), 'Legacy root cookie expires during session issuance')
  const apiCookie = sessionCookies.find(cookie => /getafe_session=.+;.*Path=\/api;/.test(cookie))
  assert.match(apiCookie, /HttpOnly/); assert.match(apiCookie, /SameSite=Lax/)
  assert.equal((await request('/api/auth/me', null, { headers: { Cookie: apiCookie.split(';')[0] } })).body.user.id, users[0].id)
  console.info('PASS session issuance: HttpOnly API-scoped cookie; legacy root cookie migration')
  const resident = users[0], challenge = await command('reset', { id: resident.id, role: resident.role })
  const verified = await request('/api/auth/forgot-password/verify', null, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId: challenge.challengeId, code: '123456' }) })
  assert.deepEqual(verified.body, { verified: true })
  const grant = verified.response.headers.getSetCookie().find(cookie => cookie.startsWith('getafe_password_reset='))
  assert.match(grant, /HttpOnly/); assert.match(grant, /Path=\/api\/auth\/renew-password/); assert.match(grant, /SameSite=Strict/)
  const password = 'New-isolated-Test-password9!'
  const renewed = await request('/api/auth/renew-password', null, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: grant.split(';')[0] }, body: JSON.stringify({ password }) })
  assert.equal(renewed.response.status, 200)
  const replay = await request('/api/auth/renew-password', null, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: grant.split(';')[0] }, body: JSON.stringify({ password }) })
  assert.equal(replay.response.status, 401)
  console.info('PASS reset grant: HttpOnly cookie, no JSON credential, one-time consumption')
} catch (error) { console.error(output.slice(-2500)); throw error }
finally {
  if (child.exitCode === null && child.connected) {
    for (const user of users) await command('cleanup', { id: user.id }).catch(() => {})
  }
  child.kill()
  await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve))
  for (const user of users) {
    if (user.role === 'resident') {
      await user.database.pool.query('DELETE FROM application_documents WHERE user_id=$1', [user.id])
      await user.database.pool.query('DELETE FROM notifications WHERE user_id=$1', [user.id])
      await user.database.pool.query('DELETE FROM application_status_history WHERE application_id IN (SELECT id FROM applications WHERE user_id=$1)', [user.id])
      await user.database.pool.query('DELETE FROM applications WHERE user_id=$1', [user.id])
    }
    await user.database.pool.query(`DELETE FROM ${user.table} WHERE id=$1`, [user.id])
  }
  await Promise.all(Object.values(databases).map(database => database.pool.end()))
}
