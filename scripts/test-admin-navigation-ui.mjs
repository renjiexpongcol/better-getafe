import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { MODULE_REGISTRY } from '../src/applicationModuleRegistry.js';

// Browser-only fixtures; requires the Vite development server.
const browser = await chromium.launch({ headless: true });
try {
  for (const missingIcon of [false, true]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      let body = [];
      if (pathname === '/api/auth/me') body = { user: {
        id: 'navigation-test-admin', name: 'Test Admin', role: 'super_admin',
        permissions: [...new Set(Object.values(MODULE_REGISTRY.admin).map(module => module.permission))],
        setupRequired: false,
      } };
      else if (pathname === '/api/news') body = { items: [] };
      else if (pathname === '/api/public/config') body = { 'general.name': 'Getafe' };
      else if (pathname.includes('settings')) body = {};
      else if (pathname.includes('preferences')) body = { preferences: {} };
      return route.fulfill({ json: body });
    });
    if (missingIcon) {
      await page.route('**/src/pages/admin/Admin.jsx*', async route => {
        const response = await route.fetch();
        const source = await response.text();
        const body = source.replace(/['"]service-catalog['"]:\s*FileText,/, '');
        assert.notEqual(body, source, 'Fault injection must remove the service catalog icon');
        await route.fulfill({ response, body });
      });
    }
    await page.goto('http://localhost:5173/admin');
    const catalog = page.locator('.portal-nav a').filter({ hasText: 'Service Catalog' });
    try {
      await catalog.waitFor({ timeout: 10000 });
      assert.equal(await catalog.locator('svg').count(), 1);
      assert.equal(await page.locator('.portal-nav a').count(), 12);
      assert.deepEqual(errors, [], 'Admin should render without React errors');
    } catch (error) {
      throw new Error(`${missingIcon ? 'Missing icon' : 'Normal navigation'}: ${errors.join('; ') || error.message}`);
    }
    console.log(`Admin navigation passed (${missingIcon ? 'missing icon fallback' : 'normal icons'})`);
    await context.close();
  }
} finally {
  await browser.close();
}
