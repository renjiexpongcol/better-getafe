import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium } from 'playwright'

// Isolated browser fixture: real components and AuthProvider; no production API.
const entry = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from '/src/context/AuthContext.jsx';
import SessionTimeoutSettings from '/src/components/SessionTimeoutSettings.jsx';
import '/src/components/AdminSettings.css';
const keys = ['sessionIdleEnabled', 'sessionIdleMinutes', 'sessionWarningMinutes'];
const fields = keys.map(key => ['authentication.' + key, {}]);
function Demo() {
 const auth = useAuth();
 const [patch, setPatch] = useState({});
 const values = { 'authentication.sessionIdleEnabled': true, 'authentication.sessionIdleMinutes': 30, 'authentication.sessionWarningMinutes': 5, ...patch };
 return <><header className="fixture-header"><strong>Better Getafe</strong><span>Administration / Authentication</span></header>
 <main className="fixture-main"><h1>Authentication</h1><p className="fixture-description">Manage how people sign in and keep their accounts secure.</p>
 <section className="settings-panel fixture-card"><h2>Session timeout</h2><p className="fixture-description">Choose when inactive accounts are logged out.</p>
 <SessionTimeoutSettings fields={fields} values={values} patch={patch} busy={false} canEdit={() => true} onChange={(key, value) => setPatch(current => ({ ...current, [key]: value }))} onUndo={key => setPatch(current => { const next={...current}; delete next[key]; return next; })} />
 </section><p data-testid="session-state">{auth.loading ? 'Loading' : auth.user ? 'Signed in' : 'Signed out'}</p><button type="button" onClick={() => auth.validateSession(true)}>Check session</button></main></>;
}
createRoot(document.getElementById('root')).render(<AuthProvider><Demo /></AuthProvider>);
`
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#f3f6f9;color:#23384d}button,input,select{font:inherit}.fixture-header{min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 32px;background:white;border-bottom:1px solid #dfe6ed}.fixture-header strong{font-size:20px;color:#1264a3}.fixture-header span{font-size:13px;color:#64748b}.fixture-main{max-width:1040px;margin:40px auto;padding:0 24px}.fixture-main h1{font-size:28px;margin:0 0 10px}.fixture-description{font-size:14px;color:#64748b;line-height:1.6}.fixture-card{margin-top:28px;padding:30px;background:white;border:1px solid #dfe6ed;border-radius:10px}.fixture-card h2{font-size:18px;margin:0 0 8px}.fixture-card>.fixture-description{padding-bottom:22px;margin-bottom:24px;border-bottom:1px solid #e2e8f0}@media(max-width:500px){.fixture-main{padding:0 16px}.fixture-header{padding:16px}.fixture-header span{max-width:140px;line-height:1.5}.fixture-card{padding:22px}}
</style></head><body><div id="root"></div><script type="module" src="/__session-fixture.jsx"></script></body></html>`

let browser
const fixtureName = '__session-fixture-' + process.pid + '.jsx'
const fixtureId = path.resolve('artifacts', fixtureName)
await fs.mkdir('artifacts', { recursive: true })
await fs.writeFile(fixtureId, entry, { flag: 'wx' })
const server = await createServer({
  configFile: false, root: process.cwd(), appType: 'custom', plugins: [react(), {
    name: 'session-fixture',
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (req.url !== '/__session-ui') return next()
      res.setHeader('Content-Type', 'text/html')
      res.end(await vite.transformIndexHtml(req.url, html.replace('/__session-fixture.jsx', '/artifacts/' + fixtureName)))
    }) },
  }], server: { host: '127.0.0.1', port: 0, strictPort: false },
})
try {
  await server.listen()
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL || process.platform === 'win32' ? { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' } : {}) })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let now = Date.UTC(2026, 10, 21, 8), deadline = now + 30 * 60000, absolute = now + 12 * 3600000
  let enabled = true, renews = 0, renewalFails = false, expired = false, sessionStatus = 200
  await page.clock.install({ time: now })
  await context.route('**/api/**', async route => {
    const endpoint = new URL(route.request().url()).pathname
    if (endpoint === '/api/auth/csrf') return route.fulfill({ json: { token: 'fixture-token' } })
    if (endpoint === '/api/auth/logout') { expired = true; return route.fulfill({ json: { ok: true } }) }
    if (endpoint === '/api/auth/renew') {
      renews++
      if (renewalFails) return route.fulfill({ status: 503, json: { error: 'Try again when your connection is restored.' } })
      deadline = now + 30 * 60000
      return route.fulfill({ json: { expiresAt: enabled ? deadline : null, absoluteExpiresAt: absolute, idleTimeoutEnabled: enabled, idleMinutes: 30, warningMinutes: 5 } })
    }
    if (endpoint === '/api/auth/me') return route.fulfill({ status: expired ? 401 : sessionStatus, json: expired || sessionStatus !== 200 ? { user: null } : { user: { id: 'session-fixture', name: 'Staff', role: 'staff' }, session: { expiresAt: enabled ? deadline : null, absoluteExpiresAt: absolute, idleTimeoutEnabled: enabled, idleMinutes: 30, warningMinutes: 5 } } })
    throw Error('Unexpected API request: ' + endpoint)
  })
  const base = `http://127.0.0.1:${server.httpServer.address().port}`
  await page.goto(base + '/__session-ui')
  await page.getByTestId('session-state').filter({ hasText: 'Signed in' }).waitFor()
  sessionStatus = 403
  const forbiddenCheck = page.waitForResponse(response => response.url().includes('/api/auth/me') && response.status() === 403)
  await page.getByRole('button', { name: 'Check session' }).evaluate(button => button.click())
  await forbiddenCheck
  await page.getByTestId('session-state').filter({ hasText: 'Signed in' }).waitFor()
  sessionStatus = 200
  assert.equal(await page.locator('.session-timeout-dialog').count(), 0, 'no warning at sign-in')
  await page.getByLabel('Log out automatically after being inactive').uncheck()
  assert.equal(await page.getByLabel('Inactivity duration', { exact: true }).count(), 0)
  await page.getByLabel('Log out automatically after being inactive').check()
  assert.equal(await page.getByLabel('Inactivity duration', { exact: true }).inputValue(), '30')
  await fs.mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: path.resolve('artifacts/session-settings-desktop.png') })
  now += 25 * 60000
  await page.clock.fastForward(25 * 60000)
  await page.getByRole('heading', { name: 'Session will expire soon' }).waitFor()
  const remainingSeconds = Math.ceil((deadline - await page.evaluate(() => Date.now())) / 1000)
  const expectedCountdown = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`
  assert.equal(await page.getByRole('timer').textContent(), expectedCountdown)
  assert.notEqual(await page.locator('dialog.session-timeout-backdrop').evaluate(node => globalThis.getComputedStyle(node, '::backdrop').backgroundColor), 'rgba(0, 0, 0, 0)')
  await page.screenshot({ path: path.resolve('artifacts/session-timeout-desktop.png') })
  await page.evaluate(() => {
    Object.defineProperty(globalThis.document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    globalThis.document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.locator('.session-timeout-dialog').waitFor({ state: 'detached' })
  const secondPage = await context.newPage()
  secondPage.setDefaultTimeout(15000)
  await secondPage.clock.install({ time: now })
  await secondPage.goto(base + '/__session-ui')
  await secondPage.getByTestId('session-state').filter({ hasText: 'Signed in' }).waitFor()
  await secondPage.getByRole('heading', { name: 'Session will expire soon' }).waitFor()
  assert.equal(await page.locator('.session-timeout-dialog').count() + await secondPage.locator('.session-timeout-dialog').count(), 1)
  await secondPage.close()
  await page.evaluate(() => {
    Object.defineProperty(globalThis.document, 'visibilityState', { configurable: true, get: () => 'visible' })
    globalThis.document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.getByRole('heading', { name: 'Session will expire soon' }).waitFor()
  // Dismissal and background clicks must never renew the session.
  const beforeDismiss = renews
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  assert.equal(await page.locator('.session-timeout-dialog').count(), 0)
  assert.equal(renews, beforeDismiss)
  // Refresh retains server expiry, with a two-minute grace against an immediate warning.
  await page.reload()
  await page.getByTestId('session-state').filter({ hasText: 'Signed in' }).waitFor()
  now += 2 * 60000
  await page.clock.fastForward(2 * 60000)
  await page.getByRole('heading', { name: 'Session will expire soon' }).waitFor()
  renewalFails = true
  await page.getByRole('button', { name: 'Keep working', exact: true }).click()
  await page.getByRole('alert').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Keep working', exact: true }).isEnabled(), true)
  renewalFails = false
  await page.getByRole('button', { name: 'Keep working', exact: true }).click()
  await page.locator('.session-timeout-dialog').waitFor({ state: 'detached' })
  assert.equal(await page.getByTestId('session-state').textContent(), 'Signed in')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.resolve('artifacts/session-settings-mobile.png') })
  now += 25 * 60000
  await page.clock.fastForward(25 * 60000)
  await page.getByRole('heading', { name: 'Session will expire soon' }).waitFor()
  assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false)
  await page.screenshot({ path: path.resolve('artifacts/session-timeout-mobile.png') })
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await page.getByTestId('session-state').filter({ hasText: 'Signed out' }).waitFor()
  // Disabled inactivity policy clears the previous idle deadline in the provider.
  expired = false; enabled = false
  await page.reload()
  await page.getByTestId('session-state').filter({ hasText: 'Signed in' }).waitFor()
  now += 60 * 60000
  await page.clock.fastForward(60 * 60000)
  assert.equal(await page.locator('.session-timeout-dialog').count(), 0)
  assert.equal(await page.getByTestId('session-state').textContent(), 'Signed in')
  // Expiry is confirmed with the server, including the absolute limit when
  // inactivity logout is disabled.
  enabled = true; deadline = now + 3 * 60000; sessionStatus = 200
  await page.reload()
  await page.getByTestId('session-state').filter({ hasText: 'Signed in' }).waitFor()
  sessionStatus = 503
  now += 3 * 60000
  await page.clock.fastForward(3 * 60000)
  await page.getByTestId('session-state').filter({ hasText: 'Signed out' }).waitFor()
  enabled = false; expired = false; sessionStatus = 200; absolute = now + 60000
  await page.reload()
  await page.getByTestId('session-state').filter({ hasText: 'Signed in' }).waitFor()
  expired = true; now += 60000
  await page.clock.fastForward(60000)
  await page.getByTestId('session-state').filter({ hasText: 'Signed out' }).waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS: settings toggle, saved duration, initial sign-in, inactivity countdown, dimmed backdrop, dismissal without renewal, failed renewal/retry, keep working, mobile layout, log out, disabled inactivity, inactivity expiry and absolute expiry.')
} finally { await browser?.close(); await server.close(); await fs.unlink(fixtureId) }
