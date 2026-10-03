import { chromium } from 'playwright'
import { createServer } from 'vite'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const output = path.resolve('artifacts/auth-isolation')
await fs.mkdir(output, { recursive: true })
const vite = await createServer({ server: { host: '127.0.0.1', port: 0 }, clearScreen: false })
await vite.listen()
const base = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ headless: true })
const permissionIds = ['staff.requests.view', 'staff.dashboard.view', 'content.news.manage', 'system.dashboard.view']
try {
  for (const role of [null, 'resident', 'staff', 'admin']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    if (role) await context.addCookies([{ name: 'getafe_session', value: 'browser-test-opaque-session', domain: '127.0.0.1', path: '/api', httpOnly: true, sameSite: 'Lax' }])
    const page = await context.newPage(), requests = [], failures = []
    await context.addInitScript(() => {
      sessionStorage.setItem('getafe-public-cache:http:GET:/api/auth/me', JSON.stringify({ value: { name: 'Legacy Private Sentinel' }, expires: Date.now() + 600000 }))
    })
    page.on('pageerror', error => failures.push(error.message))
    await context.route('**/api/**', async route => {
      const request = route.request(), pathname = new URL(request.url()).pathname
      requests.push({ pathname, headers: await request.allHeaders() })
      let body = {}
      if (pathname === '/api/public/config') body = { 'general.name': 'Municipality of Getafe', 'maintenance.enabled': false }
      else if (pathname === '/api/auth/me') body = { user: role ? { id: `test-${role}`, name: 'Private Account Sentinel', email: 'private-sentinel@example.test', role, permissions: permissionIds, groups: [], setupRequired: false } : null }
      else if (pathname === '/api/news' || pathname === '/api/admin/news') body = { items: [], total: 0, pages: 1, page: 1 }
      else if (/\/preferences$/.test(pathname)) body = { preferences: {} }
      else if (pathname === '/api/citizen/dashboard') body = { profile: { full_name: 'Private Account Sentinel' }, applications: [], documents: [], payments: [], appointments: [], notifications: [] }
      else if (pathname === '/api/staff/dashboard') body = { applications: [], appointments: [], documents: [], payments: [], notifications: [], stats: {} }
      else if (pathname === '/api/admin/dashboard') body = { stats: {}, recent: [], activity: [] }
      else if (pathname.includes('directory')) body = { officials: [], offices: [], groups: [] }
      else if (/categories|notifications|popular-services|barangays|officials|media|services|departments/.test(pathname)) body = []
      else if (pathname === '/api/weather/getafe') body = { temperature: 28, condition: 'Sunny', location: 'Getafe, Bohol' }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'Cache-Control': 'no-store' } })
    })
    for (const pathname of ['/', '/news', '/services', '/officials', '/barangays', '/contact']) {
      requests.length = 0
      await page.goto(base + pathname)
      await page.locator('header .login-button').waitFor()
      await page.waitForTimeout(120)
      const header = page.locator('header')
      assert.doesNotMatch(await header.innerText(), /Private Account Sentinel|private-sentinel|\bCMS\b|Sign out|\badministrator\b|\bresident\b|\bstaff\b/i)
      assert.equal(await header.locator('.user-chip,.user-avatar,.user-meta,.logout-button').count(), 0)
      assert.equal(await header.locator('.login-button').getAttribute('href'), '/app')
      assert.equal(await header.locator('.login-button').innerText(), 'E-Getafe')
      assert.equal(requests.some(request => /\/api\/(?:auth|account|citizen|users\/me|admin|staff)(?:\/|$)/.test(request.pathname)), false, `${role || 'anonymous'} ${pathname} requested private data`)
      assert.equal(requests.some(request => request.headers.cookie?.includes('getafe_session') || request.headers.authorization), false, 'public API forwarded credentials')
      const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
      assert.doesNotMatch(storage, /Private Account Sentinel|private-sentinel|Legacy Private Sentinel|browser-test-opaque-session/)
      if (pathname === '/' && [null, 'admin'].includes(role)) {
        await page.screenshot({ path: path.join(output, `${role || 'anonymous'}-1440.png`) })
        await page.setViewportSize({ width: 390, height: 844 })
        await page.screenshot({ path: path.join(output, `${role || 'anonymous'}-390.png`) })
        await page.setViewportSize({ width: 1440, height: 1000 })
      }
    }
    if (role) assert.equal((await context.cookies()).some(cookie => cookie.name === 'getafe_session'), true, 'public navigation destroyed session')
    await page.goto(base + '/app')
    await page.waitForURL(role === 'admin' ? '**/admin' : role === 'staff' ? '**/app/staff' : role ? '**/app' : '**/auth/login?**')
    assert.ok(requests.some(request => request.pathname === '/api/auth/me'))
    if (role) assert.ok(requests.find(request => request.pathname === '/api/auth/me').headers.cookie?.includes('getafe_session'))
    if (role === 'resident' || role === 'staff') {
      await page.goto(base + '/admin')
      await page.getByRole('heading', { name: /access denied/i }).waitFor()
    }
    requests.length = 0
    await page.evaluate(() => { history.pushState(null, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')) })
    await page.locator('header .login-button').waitFor()
    await page.waitForTimeout(150)
    assert.doesNotMatch(await page.locator('header').innerText(), /Private Account Sentinel|\bCMS\b|Sign out/i)
    assert.equal(requests.some(request => /\/api\/(?:auth|account|citizen|admin|staff)(?:\/|$)/.test(request.pathname)), false, 'SPA return to public requested private data')
    assert.deepEqual(failures, [], `${role || 'anonymous'} browser errors`)
    console.info(`PASS ${role || 'anonymous'}: anonymous public routes, no profile requests, preserved cookie, correct app/admin routing`)
    await context.close()
  }
} finally { await browser.close(); await vite.close() }
