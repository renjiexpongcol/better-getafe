import assert from 'node:assert/strict'
import http from 'node:http'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import fs from 'node:fs/promises'

const upstream = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json')
  if (starting) { res.writeHead(503, { 'Retry-After': '2' }); res.end(JSON.stringify({ error: 'The service is temporarily unavailable.' })); return }
  const path = new URL(req.url, 'http://localhost').pathname
  let body = []
  if (path === '/api/public/config') body = { 'general.name': 'Municipality of Getafe', 'maintenance.enabled': false }
  if (path === '/api/news' || path === '/api/discover') body = { items: [], total: 0 }
  if (path === '/api/officials/directory') body = { officials: [], groups: [], offices: [] }
  if (path === '/api/weather/getafe') body = { temperature: 28, condition: 'Sunny' }
  res.end(JSON.stringify(body))
})
let starting = false
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
const port = upstream.address().port
await new Promise(resolve => upstream.close(resolve))
process.env.VITE_BACKEND_URL = `http://127.0.0.1:${port}`
const vite = await createServer({ server: { host: '127.0.0.1', port: 0 }, clearScreen: false })
await vite.listen()
const base = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ headless: true })
let timer
try {
  const context = await browser.newContext(), page = await context.newPage()
  const calls = [], failures = []
  page.on('request', request => { if (request.url().includes('/api/')) calls.push({ url: new URL(request.url()).pathname, at: Date.now() }) })
  page.on('pageerror', error => failures.push(error.message))
  await page.goto(base)
  await page.getByRole('status', { name: 'Loading the website' }).waitFor()
  assert.equal((await fetch(base + '/api/public/config')).status, 503, 'Vite remains alive before backend')
  timer = setTimeout(() => upstream.listen(port, '127.0.0.1'), 2500)
  await page.locator('header .login-button').waitFor({ timeout: 18000 })
  await page.waitForTimeout(600)
  const configCalls = calls.filter(call => call.url === '/api/public/config')
  assert.ok(configCalls.length >= 2 && configCalls.length <= 4)
  for (let i = 1; i < configCalls.length; i++) assert.ok(configCalls[i].at - configCalls[i - 1].at >= 1900, 'No startup request storm')
  assert.equal(calls.filter(call => call.url === '/api/discover').length, 1, 'StrictMode Discover request coalesces')
  console.log(`PASS Vite before backend: automatic recovery; config attempts=${configCalls.length}; Discover=1`)
  starting = true; calls.length = 0
  await page.evaluate(() => sessionStorage.clear())
  await page.reload()
  await page.getByRole('status', { name: 'Loading the website' }).waitFor()
  await page.waitForTimeout(500)
  assert.doesNotMatch(await page.locator('body').innerText(), /Something went wrong|ECONN|127\.0\.0\.1|PostgreSQL|Redis/)
  starting = false
  await page.locator('header .login-button').waitFor({ timeout: 6000 })
  assert.equal(calls.filter(call => call.url === '/api/discover').length, 1)
  console.log('PASS reload during STARTING: loading state then recovery; Discover=1')
  starting = true; calls.length = 0
  await context.clearCookies()
  await page.evaluate(() => sessionStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Try again', exact: true }).waitFor({ timeout: 20000 })
  assert.equal(calls.filter(call => call.url === '/api/public/config').length, 4)
  await page.evaluate(() => { for (let i = 0; i < 5; i++) window.dispatchEvent(new Event('focus')) })
  await page.waitForTimeout(1200)
  assert.equal(calls.filter(call => call.url === '/api/public/config').length, 4, 'Retry limit stays bounded on render/focus')
  assert.doesNotMatch(await page.locator('body').innerText(), /ECONN|127\.0\.0\.1|PostgreSQL|Redis|Backblaze/)
  await fs.mkdir('artifacts/startup', { recursive: true })
  await page.screenshot({ path: 'artifacts/startup/unavailable.png' })
  starting = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await page.locator('header .login-button').waitFor()
  assert.deepEqual(failures, [])
  console.log('PASS outage: exactly four bounded reads, no focus loop, safe unavailable state, manual recovery')
  await context.close()
} finally { clearTimeout(timer); await browser.close(); await vite.close(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)) }
