import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const name = `__infrastructure-fixture-${process.pid}.jsx`;
const fixture = path.resolve('artifacts', name);
await fs.writeFile(fixture, `
  import React from 'react'; import {createRoot} from 'react-dom/client';
  import {MemoryRouter} from 'react-router-dom'; import AdminSettings from '/src/components/AdminSettings.jsx';
  import '/src/index.css';
  const settings={values:{},metadata:{},permissions:['settings.view','system.infrastructure.view']};
  createRoot(document.getElementById('root')).render(<MemoryRouter><AdminSettings category="status" settings={settings} setSettings={()=>{}} onSaved={()=>{}} /></MemoryRouter>);
`);
const server = await createServer({ configFile: false, plugins: [react(), { name: 'infrastructure-fixture', configureServer(vite) {
  vite.middlewares.use(async (req,res,next) => {
    if (req.url !== '/__infrastructure') return next();
    res.setHeader('Content-Type','text/html');
    res.end(await vite.transformIndexHtml(req.url, `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/artifacts/${name}"></script></body></html>`));
  });
} }], server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let failure = false, checks = 0;
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/auth/csrf') return route.fulfill({ json: { token: 'fixture' } });
    if (pathname.endsWith('/status')) return route.fulfill({ json: { redis: { provider: 'Vercel Marketplace Redis', status: 'unconfigured' }, backgroundJobs: { status: 'unavailable', reason: 'Worker heartbeat has not been verified.' } } });
    if (pathname.endsWith('/test/redis')) {
      checks++;
      assert.equal(route.request().headers()['x-csrf-token'], 'fixture');
      return route.fulfill({ status: failure ? 503 : 200, json: failure ? { error: 'Redis unavailable.' } : { ok: true, status: 'healthy', checkedAt: new Date().toISOString(), latencyMs: 8 } });
    }
    return route.fulfill({ json: {} });
  });
  const address = server.httpServer.address();
  await page.goto(`http://127.0.0.1:${address.port}/__infrastructure`);
  await page.getByText('Vercel Marketplace Redis').waitFor();
  const redis = page.locator('article').filter({ hasText: 'Vercel Marketplace Redis' });
  await redis.getByRole('button', { name: 'Test connection' }).click();
  await redis.getByText('healthy', { exact: true }).waitFor();
  failure = true;
  await redis.getByRole('button', { name: 'Test connection' }).click();
  await redis.getByText('unavailable', { exact: true }).waitFor();
  await page.getByRole('alert').waitFor();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.window.innerWidth), true);
    await page.screenshot({ path: `artifacts/production-readiness/infrastructure-${width}.png`, fullPage: true });
  }
  assert.equal(checks, 2);
  assert.deepEqual(errors, []);
  console.log('PASS: infrastructure provider, protected test action, success, failure, desktop and mobile.');
} finally { await browser?.close(); await server.close(); await fs.unlink(fixture); }
