import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const base = process.env.UI_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  context.setDefaultTimeout(15000)
  const page = await context.newPage(), requests = [], errors = []
  let down = true, slotsDown = true, uploadDown = true
  page.on('pageerror', error => errors.push(error.message))
  await context.route('**/api/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname
    requests.push(path)
    if (path === '/api/auth/logout' || path === '/api/auth/me' && down || path === '/api/citizen/appointments/availability' && slotsDown || path === '/api/citizen/documents' && uploadDown) return route.fulfill({ status: 503, json: { error: 'ECONNRESET private-database' } })
    let json = { items: [] }
    if (path === '/api/auth/me') json = { user: { id: 'recovery-resident', role: 'resident', name: 'Test Resident', email: 'test@example.invalid', setupRequired: false } }
    else if (path === '/api/public/config') json = { 'general.name': 'Getafe' }
    else if (path.endsWith('/preferences')) json = { preferences: {} }
    else if (path === '/api/citizen/dashboard') json = { profile: { full_name: 'Test Resident' }, applications: [{ id: 'record', service_name: 'Barangay Clearance', reference_number: 'GETAFE-TEST', status: 'submitted' }], documents: [], appointments: [], payments: [], notifications: [] }
    else if (path === '/api/citizen/appointments/availability') json = { config: { start: '2026-10-05', end: '2026-10-30', location: 'Municipal Hall' }, dates: [{ date: '2026-10-05', slots: [{ time: '09:00', available: 4 }] }] }
    else if (path === '/api/services/published-test') json = { id: 'service', slug: 'published-test', name: 'Published municipal service', kind: 'APPLICATION', online_available: true, requirements: [], fees: [], fields: [], settings: {} }
    return route.fulfill({ json })
  })
  await page.goto(base + '/app')
  await page.getByText(/Restoring your secure session/).waitFor()
  assert(page.url().endsWith('/app'))
  down = false
  await page.getByRole('heading', { name: /Welcome back/ }).waitFor()
  assert(requests.filter(path => path === '/api/auth/me').length <= 4, 'Recovery is bounded, not a request loop')
  await page.getByRole('button', { name: 'Open account menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.getByRole('alert').filter({ hasText: /Could not complete sign out/ }).waitFor()
  assert(page.url().endsWith('/app'), 'Failed logout keeps the account and reports retryable error')
  await page.getByRole('button', { name: 'Open account menu' }).click()
  await page.keyboard.press('ArrowDown')
  assert(await page.getByRole('menuitem', { name: 'My Account' }).evaluate(node => node === document.activeElement))
  await page.keyboard.press('End')
  assert(await page.getByRole('menuitem', { name: 'Sign out' }).evaluate(node => node === document.activeElement))
  await page.keyboard.press('Home')
  await page.keyboard.press('Enter')
  const profile = page.getByRole('dialog', { name: 'My Account' })
  await profile.waitFor()
  for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); assert(await profile.evaluate(node => node.contains(document.activeElement))) }
  await page.keyboard.press('Escape'); await profile.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Open account menu')
  await page.goto(base + '/app/appointments?book=1')
  const appointment = page.getByRole('dialog', { name: 'Schedule an appointment' })
  await appointment.getByRole('button', { name: 'Try loading appointment slots again' }).waitFor()
  slotsDown = false
  await appointment.getByRole('button', { name: 'Try loading appointment slots again' }).click()
  await appointment.getByRole('button', { name: /9:00/ }).waitFor()
  assert.equal(await appointment.getByRole('alert').count(), 0)
  await page.keyboard.press('Escape')
  await page.goto(base + '/app/documents?application=record')
  const file = { name: 'supporting.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') }
  await page.getByLabel('Select file').setInputFiles(file)
  await page.getByRole('button', { name: 'Upload document', exact: true }).click()
  await page.getByRole('alert').waitFor()
  assert.equal(await page.getByLabel('Select file').evaluate(node => node.files[0]?.name), file.name)
  uploadDown = false
  await page.getByRole('button', { name: 'Upload document', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Document uploaded successfully' }).waitFor()
  assert.equal(await page.getByLabel('Select file').evaluate(node => node.files.length), 0)
  await page.getByLabel('Select file').setInputFiles(file)
  assert(await page.getByRole('button', { name: 'Upload document', exact: true }).isEnabled(), 'Same file may be selected after successful upload')
  requests.length = 0
  await page.goto(base + '/services/e-services/published-test')
  await page.getByRole('heading', { name: 'Published municipal service' }).waitFor()
  assert.equal(requests.filter(path => path === '/api/auth/me').length, 0, 'Published service detail never bootstraps the private session')
  await page.getByRole('button', { name: /Sign in|Start application/ }).click()
  await page.waitForURL('**/auth/login?returnUrl=*')
  assert.deepEqual(errors, [])
  console.log('PASS automatic session recovery, failed logout, account focus/restoration, appointment retry, upload retry/same file, anonymous published service')
  await context.close()
} finally { await browser.close() }
