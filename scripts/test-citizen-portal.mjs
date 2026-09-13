import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { isActive, needsAction, paymentDue, upcomingAppointments, parseDate } from '../src/services/citizenData.js'
import { searchServices } from '../src/data/citizenServices.js'

// All test accounts and records live in a disposable database, never the user's data.
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getafe-citizen-test-'))
assert.ok(path.resolve(directory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}getafe-citizen-test-`))
const base = 'http://127.0.0.1:18195', preview = process.argv.includes('--preview')
const env = { ...process.env, NODE_ENV: 'development', PORT: '18195', CMS_DATABASE_PROVIDER: 'local', PORTAL_DATABASE_PROVIDER: 'local', CMS_MEDIA_PROVIDER: 'local', LOCAL_STORAGE_PATH: path.join(directory, 'uploads'), CONFIG_DATABASE_URL: '', CONFIG_DB_HOST: '', SETTINGS_SECRET_PROJECT: '', CMS_LOCAL_FILE: path.join(directory, 'cms.json'), LOCAL_SQLITE_FILE: path.join(directory, 'getafe.sqlite'), CONFIG_LOCAL_FILE: path.join(directory, 'settings.json'), AUTH_LOCAL_FILE: path.join(directory, 'auth.json'), AUTH_SESSION_SECRET: 'isolated-citizen-test-session-secret', SMTP_ENABLED: 'false' }
await fs.writeFile(env.CONFIG_LOCAL_FILE, JSON.stringify({ settings: { 'authentication.requireEmailVerification': false, 'authentication.mfaEnabled': false, 'authentication.registrationEnabled': true, 'features.publicRegistration': true, 'features.uploads': true, 'storage.provider': 'local' }, history: [] }))
let server, db
async function stop() {
  db?.close(); db = null
  if (server && server.exitCode === null) { const done = once(server, 'exit'); server.kill(); await done }
  await fs.rm(directory, { recursive: true, force: true })
}
process.on('SIGTERM', () => stop().then(() => process.exit()))
process.on('SIGINT', () => stop().then(() => process.exit()))
try {
  server = spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 15000)
    server.stdout.on('data', chunk => { if (chunk.toString().includes('Server listening')) { clearTimeout(timer); resolve() } })
    server.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)) })
  })
  let cookie = ''
  const api = async (url, method = 'GET', body, overrideCookie = cookie) => {
    const response = await fetch(`${base}/api${url}`, { method, headers: { Cookie: overrideCookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  assert.equal((await api('/citizen/dashboard')).status, 401)
  const account = await api('/portal-auth/register', 'POST', { name: 'Portal Review', email: 'portal-review@example.test', password: 'Portal-Review-Only-123!' })
  assert.equal(account.status, 201); cookie = account.cookie
  const initial = await api('/citizen/dashboard'); assert.equal(initial.status, 200)
  for (const collection of ['applications', 'documents', 'payments', 'appointments', 'notifications']) assert.deepEqual(initial.body[collection], [])
  assert.equal((await api('/citizen/applications', 'POST', { service_name: 'Unknown service', details: { purpose: 'Test' } })).status, 422)
  assert.equal((await api('/citizen/applications', 'POST', { service_name: 'Barangay Clearance', details: {} })).status, 422)
  const application = await api('/citizen/applications', 'POST', { service_name: 'Barangay Clearance', details: { purpose: 'Isolated functional verification; not a municipal request.' } })
  assert.equal(application.status, 201)
  const applicationId = application.body.id
  const detail = await api(`/citizen/applications/${applicationId}`)
  assert.ok(detail.body.submitted_at); assert.equal(detail.body.history.length, 1)
  assert.equal(detail.body.reference_number, application.body.reference_number)
  const uploaded = await fetch(`${base}/api/citizen/documents?application_id=${applicationId}&name=test.pdf`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/pdf' }, body: Buffer.from('%PDF-1.4\nIsolated test document\n%%EOF') })
  assert.equal(uploaded.status, 201); const documentId = (await uploaded.json()).id
  assert.equal((await fetch(`${base}/api/citizen/documents/${documentId}/download`, { headers: { Cookie: cookie } })).status, 200)
  const invalid = await fetch(`${base}/api/citizen/documents?application_id=${applicationId}&name=bad.pdf`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/pdf' }, body: 'not a PDF' }); assert.equal(invalid.status, 422)
  const appointment = await api('/citizen/appointments', 'POST', { service_id: 'birth-certificate', appointment_at: new Date(Date.now() + 86400000).toISOString() })
  assert.equal(appointment.status, 201); assert.equal(appointment.body.status, 'requested')
  assert.equal((await api('/citizen/appointments', 'POST', { service_id: 'birth-certificate', appointment_at: '2020-01-01' })).status, 422)
  const dashboard = await api('/citizen/dashboard'), notification = dashboard.body.notifications[0]
  assert.equal(dashboard.body.applications.length, 1); assert.equal(dashboard.body.documents.length, 1); assert.equal(dashboard.body.appointments.length, 1)
  assert.equal(dashboard.body.documents[0].document_kind, 'uploaded'); assert.equal(notification.application_id, applicationId)
  assert.equal((await api(`/citizen/notifications/${notification.id}/read`, 'PATCH')).status, 200)
  assert.ok((await api('/citizen/dashboard')).body.notifications[0].read_at)
  const second = await api('/portal-auth/register', 'POST', { name: 'Empty Account', email: 'empty-review@example.test', password: 'Portal-Review-Only-123!' })
  assert.equal(second.status, 201)
  assert.equal((await api(`/citizen/applications/${applicationId}`, 'GET', undefined, second.cookie)).status, 404)
  assert.equal((await api(`/citizen/notifications/${notification.id}/read`, 'PATCH', undefined, second.cookie)).status, 404)
  assert.equal((await fetch(`${base}/api/citizen/documents/${documentId}/download`, { headers: { Cookie: second.cookie } })).status, 404)
  assert.deepEqual((await api('/citizen/dashboard', 'GET', undefined, second.cookie)).body.documents, [])
  const crossUpload = await fetch(`${base}/api/citizen/documents?application_id=${applicationId}&name=test.pdf`, { method: 'POST', headers: { Cookie: second.cookie, 'Content-Type': 'application/pdf' }, body: '%PDF-1.4' }); assert.equal(crossUpload.status, 404)
  db = new DatabaseSync(env.LOCAL_SQLITE_FILE)
  const stored = db.prepare('SELECT storage_path FROM application_documents WHERE id = ?').get(documentId)
  assert.equal((await fetch(`${base}/uploads/${stored.storage_path}`)).status, 404)
  assert.equal((await fetch(`${base}/uploads/citizen-private%2F${stored.storage_path.split('/').slice(1).join('/')}`)).status, 404)
  assert.ok(!('storage_path' in dashboard.body.documents[0]))
  assert.equal((await api('/citizen/profile', 'PUT', { full_name: 'Updated Citizen', mobile: '09123456789', barangay: 'Poblacion', street: 'Test address' })).status, 200)
  assert.equal((await api('/citizen/dashboard')).body.profile.full_name, 'Updated Citizen')
  const avatarBytes = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex')
  const avatarUpload = await fetch(`${base}/api/citizen/profile/avatar`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'image/png' }, body: avatarBytes })
  assert.equal(avatarUpload.status, 201)
  const populatedProfile = (await api('/citizen/dashboard')).body.profile
  assert.ok(populatedProfile.avatar_url); assert.ok(!('avatar_storage_path' in populatedProfile))
  const avatarResponse = await fetch(`${base}${populatedProfile.avatar_url}`, { headers: { Cookie: cookie } })
  assert.equal(avatarResponse.status, 200); assert.equal(avatarResponse.headers.get('content-type'), 'image/png')
  const invalidAvatar = await fetch(`${base}/api/citizen/profile/avatar`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'image/png' }, body: Buffer.from('not an image') })
  assert.equal(invalidAvatar.status, 422)
  assert.equal((await fetch(`${base}/api/citizen/profile/avatar`, { headers: { Cookie: second.cookie } })).status, 404)
  assert.equal((await fetch(`${base}/uploads/profiles%2F${populatedProfile.user_id || 'private'}`)).status, 404)
  assert.ok(isActive({ status: 'under_review' })); assert.ok(!isActive({ status: 'completed' })); assert.ok(needsAction({ status: 'Additional Information Required' }))
  assert.ok(paymentDue({ status: 'pending' })); assert.ok(!paymentDue({ status: 'paid' })); assert.equal(upcomingAppointments(dashboard.body.appointments).length, 1)
  assert.equal(parseDate('2026-09-14 02:30:00').toISOString(), '2026-09-14T02:30:00.000Z')
  for (const term of ['business permit', 'birth certificate', 'cedula', 'senior citizen', 'health']) assert.ok(searchServices(term).length, term)
  const logout = await api('/auth/logout', 'POST'); assert.equal(logout.status, 200)
  assert.equal((await api('/citizen/dashboard', 'GET', undefined, '')).status, 401)
  console.log('PASS: empty and populated records, submission persistence, appointments, profile, search, notifications, upload/download validation, private file access and cross-account isolation.')
  if (preview) {
    console.log(`Isolated preview: ${base} · accounts portal-review@example.test / empty-review@example.test · password Portal-Review-Only-123!`)
    await new Promise(() => {})
  }
} catch (error) { console.error(error); process.exitCode = 1 }
finally { if (!preview || process.exitCode) await stop() }
