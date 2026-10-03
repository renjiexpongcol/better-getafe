import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium } from 'playwright'
import { MODULE_REGISTRY } from '../src/applicationModuleRegistry.js'

const base = process.env.UI_TEST_URL || 'http://127.0.0.1:5173'
const widths = process.env.AUDIT_WIDTHS ? process.env.AUDIT_WIDTHS.split(',').map(Number) : [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920, 2560]
const paths = ['/app', '/app/services', '/app/requests', '/app/requests/audit-request', '/app/appointments', '/app/documents', '/app/payments', '/app/notifications', '/app/help', '/app/settings', '/app/e-requests', '/app/services/audit-service', '/app/e-requests/audit-es', '/app/e-payment/audit-order', '/app/e-billing/all', '/app/e-billing/business', '/app/e-billing/real_property', '/app/e-billing/water', '/app/e-billing/payment_order', '/app/profile', '/app/staff', '/app/staff/requests', '/app/staff/e-requests', '/app/staff/e-requests/audit-es', '/app/staff/notifications', '/app/staff/settings', '/app/staff/help']
const permissions = [...new Set(Object.values(MODULE_REGISTRY).flatMap(modules => Object.values(modules).map(module => module.permission))), 'requests.update', 'documents.process']
const application = { id: 'audit-request', service_name: 'Barangay Clearance', reference_number: 'GETAFE-AUDIT', status: 'needs_information', resident_name: 'Audit Resident', resident_email: 'resident@example.invalid', details: { purpose: 'For municipal assistance' }, history: [{ id: 'history', status: 'submitted', note: 'Application received', created_at: '2026-10-03T01:00:00Z' }], documents: [] }
await fs.mkdir('artifacts/app-audit', { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    context.setDefaultTimeout(10000)
    const page = await context.newPage(), errors = [], writes = []
    let role = 'resident', failure = '', sessionDown = false, uploadFailure = false, uploadDelay = 0, staffMany = false
    page.on('pageerror', error => errors.push(error.stack || error.message))
    await context.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname
      if (!['GET', 'HEAD'].includes(request.method())) writes.push({ path, body: request.postData() })
      if (uploadDelay && path.endsWith('/documents') && request.method() === 'POST') await new Promise(resolve => setTimeout(resolve, uploadDelay))
      if (failure === path || path === '/api/auth/me' && sessionDown || path.endsWith('/documents') && uploadFailure && request.method() === 'POST') return route.fulfill({ status: 503, json: { error: 'ECONNRESET database host internal-stacktrace', referenceId: 'TEST-AUDIT' } })
      let json = { items: [], total: 0, pages: 1, page: 1 }
      if (path === '/api/auth/me') json = { user: { id: `audit-${role}`, role, name: 'Audit Resident', email: 'resident@example.invalid', permissions, setupRequired: false } }
      else if (path === '/api/public/config') json = { 'general.name': 'Municipality of Getafe' }
      else if (path.endsWith('/preferences')) json = { preferences: {} }
      else if (path === '/api/citizen/dashboard') json = { profile: { full_name: 'Audit Resident', barangay: 'Poblacion', mobile: '09123456789' }, applications: [application], documents: [], payments: [], appointments: [], notifications: [], settlements: [] }
      else if (path === '/api/citizen/applications/audit-request') json = application
      else if (path === '/api/staff/dashboard') json = { counts: { total: 1, pending: 1 }, applications: staffMany ? Array.from({ length: 12 }, (_, index) => ({ ...application, id: `audit-${index}`, reference_number: `GETAFE-AUDIT-${index}` })) : [application] }
      else if (path === '/api/staff/applications/audit-request') json = request.method() === 'PATCH' ? { application: { ...application, status: 'processing' } } : application
      else if (path === '/api/services/audit-service') json = { id: 'audit-service', slug: 'audit-service', name: 'Audit municipal service', kind: 'APPLICATION', online_available: true, requirements: [], fees: [], fields: [], settings: {} }
      else if (['/api/requests/audit-es', '/api/staff/eservices/requests/audit-es'].includes(path)) json = { id: 'audit-es', request_number: 'GET-AUDIT-ES', status: 'SUBMITTED', version: 1, service: { name: 'Audit municipal service' }, applicant: { name: 'Audit Resident' }, fields: [], values: {}, requirements: [], documents: [], orders: [], notes: [], history: [], steps: [], payment_required: false }
      else if (path === '/api/payment-orders/audit-order') json = { id: 'audit-order', order_number: 'PO-AUDIT', status: 'PAID', amount: '0.00', items: [], payments: [], receipts: [], attempts: [] }
      else if (path === '/api/citizen/applications' && request.method() === 'POST') json = { id: 'new-concern', reference_number: 'GETAFE-CONCERN' }
      else if (path === '/api/citizen/appointments/availability') json = { config: { start: '2026-10-05', end: '2026-10-30', location: 'Municipal Hall' }, dates: [{ date: '2026-10-05', slots: [{ time: '09:00', available: 4 }] }] }
      else if (path === '/api/staff/eservices/options') json = { services: [], staff: [], members: [], departments: [] }
      else if (path === '/api/admin/settings') json = { categories: ['general'], values: { 'general.name': 'Municipality of Getafe' }, metadata: { 'general.name': { label: 'Municipality' } } }
      else if (path === '/api/staff/notifications') json = { items: [{ id: 'notice', title: 'Account update', message: 'Your account is ready.', created_at: '2026-10-03T01:00:00Z' }] }
      else if (path.includes('/profile')) json = { full_name: 'Audit Resident', email: 'resident@example.invalid' }
      else if (path === '/api/auth/mfa/status') json = { enabled: false }
      await route.fulfill({ json })
    })
    const visit = async pathname => {
      role = pathname.startsWith('/app/staff') ? 'staff' : 'resident'
      if (page.url().startsWith(base)) await page.evaluate(() => { sessionStorage.clear(); localStorage.clear() })
      await page.goto(base + pathname)
      await page.locator('.citizen-content, .staff-content').waitFor()
      await page.waitForFunction(() => !document.querySelector('.configuration-loader'))
      await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))))
      assert(!await page.getByText('Something went wrong', { exact: true }).count(), pathname)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      assert(overflow <= 1, `${width}px ${pathname}: horizontal page overflow ${overflow}`)
    }
    for (const pathname of paths) await visit(pathname)
    await visit('/app')
    const tasks = page.locator('.portal-quick a')
    assert.equal(await tasks.count(), 5)
    assert.equal(await page.getByText('Requires your attention', { exact: false }).count(), 1)
    await tasks.filter({ hasText: 'Pay Fees' }).click()
    await page.waitForURL('**/app/payments')
    assert.equal(writes.length, 0, 'Dashboard navigation never fabricates a submission')
    await visit('/app/appointments?book=1')
    const dialog = page.getByRole('dialog', { name: 'Schedule an appointment' })
    await dialog.waitFor()
    await dialog.getByRole('button', { name: '9:00', exact: false }).first().waitFor()
    for (let i = 0; i < 24; i++) { await page.keyboard.press('Tab'); assert(await dialog.evaluate(node => node.contains(document.activeElement)), 'Appointment keyboard focus stays in dialog') }
    await page.screenshot({ path: `artifacts/app-audit/appointment-${width}.png` })
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' })
    await visit('/app/help?report=1')
    const report = page.getByRole('dialog', { name: 'Report a non-emergency concern' })
    await report.getByLabel('Concern category').selectOption('Community concern')
    await report.getByLabel('Subject', { exact: true }).fill('Audit submission')
    await report.getByLabel(/^Barangay/).selectOption({ index: 1 })
    await report.getByLabel('Describe what happened').fill('Please review this municipal concern.')
    failure = '/api/citizen/applications'
    await report.getByRole('button', { name: 'Submit concern' }).click()
    await report.getByRole('alert').waitFor()
    assert.equal(await report.getByLabel('Subject', { exact: true }).inputValue(), 'Audit submission')
    assert(!/ECONNRESET|internal-stacktrace|database host/.test(await report.innerText()))
    assert.equal(await page.getByText('Concern submitted', { exact: true }).count(), 0)
    failure = ''
    await report.getByRole('button', { name: 'Submit concern' }).click()
    await page.getByRole('dialog', { name: 'Concern submitted' }).getByText('Reference: GETAFE-CONCERN').waitFor()
    await page.keyboard.press('Escape')
    await visit('/app/staff/requests')
    await page.getByRole('searchbox', { name: 'Search resident requests' }).fill('no-match')
    assert.equal(await page.locator('.staff-request-row-clickable').count(), 0)
    await page.getByRole('searchbox', { name: 'Search resident requests' }).fill('GETAFE-AUDIT')
    await page.locator('.staff-request-row-clickable').click()
    const staffDialog = page.getByRole('dialog', { name: 'Barangay Clearance' })
    await staffDialog.waitFor()
    await staffDialog.getByPlaceholder('Add an update…').fill('Keep this unsaved note')
    await staffDialog.locator('input[type=file]').setInputFiles({ name: 'official.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 audit') })
    uploadFailure = true
    await staffDialog.getByRole('button', { name: 'Upload document' }).click()
    await staffDialog.getByRole('alert').waitFor()
    uploadFailure = false
    await staffDialog.getByRole('button', { name: 'Upload document' }).click()
    await staffDialog.getByRole('status').waitFor()
    assert.equal(await staffDialog.getByPlaceholder('Add an update…').inputValue(), 'Keep this unsaved note')
    assert.equal(await staffDialog.getByLabel(/^Status/).inputValue(), 'needs_information')
    await staffDialog.getByLabel(/^Status/).selectOption('processing')
    await staffDialog.getByRole('button', { name: 'Save update' }).click()
    const fulfillment = page.getByRole('dialog', { name: 'Fulfillment Note' })
    await fulfillment.waitFor(); await page.keyboard.press('Escape')
    await fulfillment.waitFor({ state: 'hidden' }); assert(await staffDialog.isVisible())
    await staffDialog.locator('.staff-request-modal').evaluate(node => { node.scrollTop = 0 })
    await page.screenshot({ path: `artifacts/app-audit/staff-${width}.png` })
    await page.goBack(); await staffDialog.waitFor({ state: 'hidden' })
    if (width === 390) {
      await page.locator('.staff-request-row-clickable').click()
      await staffDialog.waitFor()
      await staffDialog.locator('input[type=file]').setInputFiles({ name: 'late.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 late') })
      uploadDelay = 1200
      const response = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/documents') && response.request().method() === 'POST')
      await staffDialog.getByRole('button', { name: 'Upload document' }).click()
      await page.goBack()
      await response
      await page.waitForTimeout(100)
      assert.equal(await page.getByRole('dialog').count(), 0, 'A late upload must not reopen a request after Back')
      uploadDelay = 0
    }
    if (width <= 1024) {
      await page.getByRole('button', { name: 'Open menu' }).click()
      const menu = page.getByRole('dialog', { name: 'Staff navigation' })
      for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); assert(await menu.evaluate(node => node.contains(document.activeElement))) }
      await page.keyboard.press('Escape'); assert(await page.getByRole('button', { name: 'Open menu' }).evaluate(node => node === document.activeElement))
    }
    await page.getByRole('link', { name: 'Notifications', exact: true }).last().click()
    await page.getByText('Your account is ready.', { exact: true }).waitFor()
    await visit('/app/staff/settings'); await page.getByRole('heading', { name: 'System parameters' }).waitFor()
    await visit('/app/staff/help'); await page.getByRole('heading', { name: 'Staff help & support' }).waitFor()
    if (width === 1440) {
      staffMany = true; await visit('/app/staff/requests')
      assert.equal(await page.locator('.staff-request-row-clickable').count(), 10)
      await page.getByRole('button', { name: 'Next requests page' }).click()
      assert.equal(await page.locator('.staff-request-row-clickable').count(), 2)
      await page.getByRole('searchbox', { name: 'Search resident requests' }).fill('GETAFE-AUDIT-11')
      assert.equal(await page.locator('.staff-request-row-clickable').count(), 1)
      await page.getByRole('searchbox', { name: 'Search resident requests' }).fill('')
      assert.equal(await page.locator('.staff-request-row-clickable').count(), 10)
    }
    assert.deepEqual(errors, [], `No browser exceptions at ${width}px`)
    await context.close()
    console.log(`${width}px: ${paths.length} routes, navigation, concern failure/retry, appointment focus, staff search/upload/nested dialogs/Back passed`)
  }
} finally { await browser.close() }
