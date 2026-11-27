import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
const origin = 'https://better-getafe-n6s31m4ne-lgu-getafe.vercel.app';
const env = dotenv.parse(await fs.readFile('.vercel/.env.preview.local'));
if (!env.VERCEL_OIDC_TOKEN || env.VERCEL_OIDC_TOKEN.includes('SENSITIVE')) throw Error('Local short-lived OIDC credential unavailable.');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext();
await context.route('**/*', route => {
  const headers = { ...route.request().headers() };
  if (new URL(route.request().url()).origin === origin) headers['x-vercel-trusted-oidc-idp-token'] = env.VERCEL_OIDC_TOKEN;
  return route.continue({ headers });
});
const results = [];
try {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.name));
  for (const path of ['/app/setup', '/app/profile', '/app/e-billing/business', '/app/e-payment/preview-check', '/app/e-requests', '/app/e-requests/preview-check']) {
    const response = await page.goto(origin + path, { waitUntil: 'networkidle', timeout: 30000 });
    results.push({ path, status: response.status(), finalPath: new URL(page.url()).pathname, title: await page.title(), rootRendered: await page.locator('#root').evaluate(root => root.children.length > 0), pageErrors: [...errors] });
    errors.length = 0;
  }
  await page.screenshot({ path: 'artifacts/deployment-fix/preview-browser.png', fullPage: true });
} finally { await browser.close(); }
await fs.writeFile('artifacts/deployment-fix/browser-results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
