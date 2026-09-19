import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  const requests = [], errors = []
  let signedIn = true, dashboardDelay = 0
  const user = { id: 'stability-test', name: 'Test Citizen', email: 'test@example.test', role: 'resident' }
  const profile = { full_name: user.name, gender: 'male', barangay: 'Poblacion', avatar_url: '/api/citizen/profile/avatar?v=test' }
  const dashboard = () => ({ profile, applications: [], documents: [], payments: [], appointments: [], notifications: [], settlements: [], privacy_requests: [] })
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => requests.push(new URL(request.url()).pathname))
  await page.addInitScript(() => {
    const now = Date.now.bind(Date)
    window.testElapsed = 0
    Date.now = () => now() + window.testElapsed
  })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body
    if (path === '/api/auth/me') body = { user: signedIn ? user : null }
    else if (path === '/api/public/config') body = { 'maintenance.enabled': false }
    else if (path === '/api/citizen/dashboard') {
      if (dashboardDelay) await new Promise(resolve => setTimeout(resolve, dashboardDelay))
      body = dashboard()
    } else if (path === '/api/citizen/profile/avatar') {
      return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>', headers: { 'Cache-Control': 'no-store' } })
    } else if (path === '/api/citizen/profile') { Object.assign(profile, route.request().postDataJSON()); body = { ok: true } }
    else if (path === '/api/auth/logout') { signedIn = false; body = { ok: true } }
    else throw new Error(`Unexpected API request: ${path}`)
    await route.fulfill({ json: body })
  })
  const count = path => requests.filter(item => item === path).length
  await page.goto(`${process.env.PORTAL_TEST_URL || 'http://localhost:5173'}/app/dashboard`)
  await page.locator('.citizen-avatar img').waitFor()
  await page.evaluate(() => { window.originalAvatar = document.querySelector('.citizen-avatar img'); window.originalSeal = document.querySelector('.citizen-sidebar-brand img') })
  for (let index = 0; index < 5; index++) {
    await page.getByRole('button', { name: 'Open account menu' }).click()
    await page.getByRole('menuitem', { name: 'My Account' }).waitFor()
    await page.getByRole('button', { name: 'Open account menu' }).click()
  }
  assert.equal(count('/api/citizen/dashboard'), 1)
  assert.equal(count('/api/auth/me'), 1)
  assert.equal(count('/api/citizen/profile/avatar'), 1)
  assert.equal(count('/api/citizen/weather'), 0)
  for (const label of ['Browse Services', 'My Applications', 'My Documents', 'Dashboard']) {
    await page.locator('.portal-nav').getByRole('link', { name: label, exact: true }).click()
    await page.locator('.citizen-content .page-loader').waitFor({ state: 'hidden' })
  }
  assert.equal(await page.evaluate(() => window.originalAvatar === document.querySelector('.citizen-avatar img') && window.originalSeal === document.querySelector('.citizen-sidebar-brand img')), true, 'Navigation must retain the image elements')
  assert.equal(count('/api/citizen/dashboard'), 1)
  assert.equal(count('/api/auth/me'), 1)
  assert.equal(count('/api/citizen/profile/avatar'), 1)
  await page.getByRole('button', { name: 'Open account menu' }).click()
  await page.getByRole('menuitem', { name: 'My Account' }).click()
  await page.getByLabel('Full name', { exact: true }).fill('Updated Citizen')
  dashboardDelay = 250
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  assert.equal(await page.getByLabel('Full name', { exact: true }).count(), 1, 'Refresh must keep the editor mounted')
  await page.getByText('Profile saved.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Close profile editor' }).click()
  await page.getByRole('button', { name: 'Open account menu' }).filter({ hasText: 'Updated Citizen' }).waitFor()
  assert.equal(count('/api/citizen/dashboard'), 2, 'Saving must immediately refresh cached records')
  await page.evaluate(() => { window.testElapsed += 61000; window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('focus')) })
  await page.waitForResponse(response => response.url().includes('/api/citizen/dashboard'))
  assert.equal(count('/api/citizen/dashboard'), 3, 'Stale records refresh once on focus')
  assert.equal(count('/api/auth/me'), 2, 'Concurrent focus events share session validation')
  assert.equal(await page.evaluate(() => window.originalAvatar === document.querySelector('.citizen-avatar img')), true)
  await page.reload()
  await page.locator('.citizen-avatar img').waitFor()
  assert.equal(count('/api/public/config'), 1, 'Public settings should survive full page reload')
  await page.getByRole('button', { name: 'Open account menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.waitForURL('**/auth/login')
  assert.equal(await page.locator('.citizen-avatar').count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS: dropdown toggles and navigation retain images; requests are cached and coalesced; profile saves stay mounted; expiry refreshes; public cache survives reload; logout removes private UI.')
} finally { await browser.close() }
