import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as espree from 'espree';
import { chromium } from 'playwright';
import { MODULE_REGISTRY } from '../src/applicationModuleRegistry.js';

const base = process.env.UI_TEST_URL || 'http://127.0.0.1:5173';
const requestedPaths = (process.env.UI_TEST_PATHS || '').split(',').filter(Boolean);
const output = path.resolve('artifacts/icon-buttons');
await fs.mkdir(output, { recursive: true });
const files = async dir => (await Promise.all((await fs.readdir(dir, { withFileTypes: true })).map(entry =>
  entry.isDirectory() ? files(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat();
const sourceFiles = await files('src');
const walk = (node, visit) => {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'range'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
};
// Check icon-only utility controls explicitly; image previews, thumbnails,
// text actions, badges and navigation/selection cards are different variants.
const iconOnly = node => {
  if (!node) return false;
  if (node.type === 'JSXText') return !node.value.trim() || /^[×✕]$/.test(node.value.trim());
  if (node.type === 'JSXExpressionContainer') return iconOnly(node.expression);
  if (node.type === 'ConditionalExpression') return iconOnly(node.consequent) && iconOnly(node.alternate);
  if (node.type === 'Literal') return ['', '…'].includes(node.value);
  if (node.type === 'JSXElement') {
    const name = node.openingElement.name.name;
    return name === 'svg' || (/^[A-Z]/.test(name) && node.openingElement.selfClosing);
  }
  return false;
};
let migrated = 0;
const classNames = new Set();
for (const file of sourceFiles.filter(file => file.endsWith('.jsx'))) {
  const source = await fs.readFile(file, 'utf8');
  const ast = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, loc: true });
  walk(ast, node => {
    if (node.type !== 'JSXElement' || !['button', 'a', 'Link', 'NavLink'].includes(node.openingElement.name.name)) return;
    const attrs = node.openingElement.attributes;
    const ghost = attrs.find(attr => attr.name?.name === 'data-icon-button')?.value?.value === 'ghost';
    if (node.children.some(child => child.type !== 'JSXText' || child.value.trim()) && node.children.every(iconOnly)) {
      assert(ghost, `${file}:${node.loc.start.line}: icon-only control must opt into the ghost variant`);
    }
    if (ghost) {
      migrated++;
      assert(attrs.some(attr => ['aria-label', 'aria-labelledby', 'title'].includes(attr.name?.name)), `${file}: icon needs a name`);
      const className = attrs.find(attr => attr.name?.name === 'className')?.value;
      if (className?.type === 'Literal') classNames.add(className.value);
    }
  });
}
assert(migrated > 0, 'The shared ghost variant must be in use');
console.log(`Source audit: ${migrated} named ghost controls; no unconverted icon-only utility buttons`);

const styles = locator => locator.evaluate(node => {
  const css = getComputedStyle(node), rect = node.getBoundingClientRect();
  return { background: css.backgroundColor, image: css.backgroundImage, border: css.borderTopWidth,
    shadow: css.boxShadow, color: css.color, outline: css.outlineStyle, ring: css.outlineColor,
    focusVisible: node.matches(':focus-visible'), width: rect.width, height: rect.height };
});
const transparent = state => {
  assert.equal(state.background, 'rgba(0, 0, 0, 0)');
  assert.equal(state.image, 'none');
  assert.equal(state.border, '0px');
  assert.equal(state.shadow, 'none');
  assert(state.width >= 44 && state.height >= 44, 'Keep at least a 44px hit target');
};
const browser = await chromium.launch({ headless: true });
try {
  // Load all lazy styles after the shared rule to catch specificity regressions.
  const fixture = await browser.newPage();
  await fixture.setContent('<main id="fixtures"></main>');
  const cssFiles = sourceFiles.filter(file => file.endsWith('.css')).sort((a, b) =>
    a.endsWith('index.css') ? -1 : b.endsWith('index.css') ? 1 : a.localeCompare(b));
  const css = (await Promise.all(cssFiles.map(file => fs.readFile(file, 'utf8')))).join('\n').replace(/@import[^;]+;/g, '');
  await fixture.addStyleTag({ content: css });
  await fixture.addStyleTag({ content: '#fixtures section { position:relative; display:block; padding:16px; } #fixtures [data-icon-button] { position:relative; inset:auto; display:inline-flex; transform:none; margin:2px; }' });
  await fixture.locator('#fixtures').evaluate((node, names) => {
    node.innerHTML = `<section class="cms cms-settings admin-portal portal-v2 profile-workspace"><button id="start">Start</button>${names.map((name, i) => `<button id="icon-${i}" data-icon-button="ghost" class="${name}" aria-label="Fixture ${i}"><svg width="18" height="18"><path d="M3 3L15 15M3 15L15 3" stroke="currentColor"/></svg></button>`).join('')}<button class="citizen-primary" id="save">Save changes</button></section><section class="article-gallery-lightbox"><button data-icon-button="ghost" class="article-gallery-close" aria-label="Dark close" id="dark">×</button></section>`;
  }, [...classNames]);
  await fixture.locator('#start').click();
  const controls = fixture.locator('[data-icon-button="ghost"]');
  for (let i = 0; i < await controls.count(); i++) {
    const control = controls.nth(i);
    transparent(await styles(control));
    await control.hover();
    transparent(await styles(control));
    await fixture.mouse.down();
    transparent(await styles(control));
    assert.equal((await styles(control)).outline, 'none', 'Mouse does not leave a focus ring');
    await fixture.mouse.up();
    await fixture.keyboard.press('Tab');
    await fixture.keyboard.press('Shift+Tab');
    const focused = await styles(control);
    transparent(focused);
    assert(focused.focusVisible);
    assert.equal(focused.outline, 'solid');
    assert.equal(focused.ring, 'rgb(47, 128, 201)');
    await control.evaluate(node => { node.disabled = true; });
    await control.hover({ force: true });
    transparent(await styles(control));
    await control.evaluate(node => { node.disabled = false; });
  }
  await fixture.locator('#dark').hover();
  await fixture.waitForFunction(() => getComputedStyle(document.querySelector('#dark')).color === 'rgb(234, 244, 252)');
  assert.notEqual((await styles(fixture.locator('#save'))).background, 'rgba(0, 0, 0, 0)', 'Save keeps its button surface');
  await fixture.screenshot({ path: path.join(output, 'shared-controls.png'), fullPage: true });
  await fixture.close();
  console.log('Shared styles: default, hover, active, mouse focus, keyboard focus, disabled and dark surfaces passed');

  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(() => localStorage.setItem('getafe-cookie-cache-preferences-v2', JSON.stringify({ functional: true, publicCache: true })));
    const page = await context.newPage();
    let role = null, showAnnouncement = false;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url()), p = url.pathname;
      let json = { items: [], total: 0 };
      if (p === '/api/auth/me') json = { user: role ? { id: 'icon-test', name: 'Test Resident', email: 'test@example.invalid', role, setupRequired: false,
        permissions: [...new Set(Object.values(MODULE_REGISTRY).flatMap(modules => Object.values(modules).map(module => module.permission)))] } : null };
      else if (p === '/api/public/config') json = { 'general.name': 'Municipality of Getafe' };
      else if (p === '/api/users/me/preferences') json = { preferences: {} };
      else if (p === '/api/citizen/dashboard') json = { profile: { full_name: 'Test Resident' }, applications: [], appointments: [], documents: [], payments: [], notifications: [], counts: {} };
      else if (p === '/api/staff/dashboard') json = { applications: [], notifications: [], counts: {} };
      else if (p === '/api/admin/services/options') json = { departments: [], categories: [] };
      else if (p === '/api/news' && url.searchParams.has('important') && showAnnouncement) json = { items: [{ id: 'icon-notice', version: 1, slug: 'icon-test', title: 'Municipal service advisory', excerpt: 'Please read this short announcement for public service information.' }] };
      else if (p === '/api/news/icon-test') json = { id: 'icon-test', title: 'Municipal advisory', slug: 'icon-test', published_at: '2026-09-30T00:00:00Z', content: '<p>Municipal service information.</p>', excerpt: 'Please read this advisory.' };
      else if (['/api/categories', '/api/officials', '/api/barangays'].includes(p)) json = [];
      else if (p === '/api/media') json = { items: [{ id: 'media-icon-test', name: 'Advisory image', original_filename: 'advisory.png', mime_type: 'image/png', storage_path: 'icon-test/advisory.png', preview_url: '/assets/getafe-seal.png', url: '/assets/getafe-seal.png', size: 1000 }], total: 1 };
      else if (p.includes('/settings')) json = { categories: ['general', 'database', 'portalDatabase', 'google', 'storage', 'authentication', 'email', 'security', 'notifications', 'integrations', 'weather', 'features', 'maintenance', 'legal', 'advanced'],
        permissions: ['settings.edit', 'settings.audit.view'], metadata: { 'general.name': { label: 'Application name', type: 'string' } }, values: { 'general.name': 'Municipality of Getafe' }, history: [] };
      else if (p === '/api/auth/mfa/status') json = { enabled: false };
      return route.fulfill({ json });
    });
    for (const [url, nextRole] of [['/', null], ['/?announcement', null], ['/auth/login', null], ['/news/icon-test', null],
      ['/app', 'resident'], ['/app/services', 'resident'], ['/app/settings', 'resident'], ['/app/notifications', 'resident'],
      ['/app/staff', 'staff'], ['/app/staff/requests', 'staff'], ['/admin', 'super_admin'], ['/admin/media', 'super_admin'],
      ['/admin/settings/general', 'super_admin'], ['/admin/access', 'super_admin'], ['/admin/service-catalog', 'super_admin']].filter(([url]) => !requestedPaths.length || requestedPaths.includes(url))) {
      role = nextRole;
      showAnnouncement = url === '/?announcement';
      if (page.url().startsWith(base)) await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      await page.goto(`${base}${url}`);
      try { await page.locator('[data-icon-button="ghost"]:visible').first().waitFor({ timeout: 10000 }); }
      catch (error) {
        await page.screenshot({ path: path.join(output, 'failure.png') });
        console.error(url, errors, (await page.locator('body').innerText()).slice(0, 1400));
        throw error;
      }
      if (showAnnouncement) await page.getByRole('button', { name: 'Close announcement' }).waitFor();
      if (url === '/admin/settings/general') await page.getByRole('tablist', { name: 'Settings categories' }).waitFor();
      await page.evaluate(() => Promise.all(document.getAnimations()
        .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
        .map(animation => animation.finished.catch(() => {}))));
      const icons = await page.locator('[data-icon-button="ghost"]:visible').elementHandles();
      for (const icon of icons) {
        if (!await icon.isVisible()) continue;
        const box = await icon.boundingBox();
        if (!box || box.x + box.width <= 0 || box.x >= width) continue;
        await icon.hover({ force: true });
        transparent(await styles(icon));
      }
      if (width === 390 && nextRole) {
        const toggle = page.getByRole('button', { name: /Open navigation|Open menu/ }).first();
        if (await toggle.isVisible()) {
          await toggle.click();
          const close = page.getByRole('button', { name: 'Close menu', exact: true });
          await close.hover(); transparent(await styles(close)); await close.click();
          await page.waitForFunction(() => !document.querySelector('.citizen-sidebar.open, .staff-sidebar.open'));
          await page.evaluate(() => Promise.all(document.getAnimations()
            .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
            .map(animation => animation.finished.catch(() => {}))));
        }
      }
      if (url === '/admin/media') {
        const menu = page.locator('.media-menu-trigger').first();
        await menu.hover(); transparent(await styles(menu)); await menu.click();
      }
      await page.screenshot({ path: path.join(output, `${url === '/' ? 'public' : url.slice(1).replace(/[^a-z0-9-]/gi, '-')}-${width}.png`), fullPage: false });
      if (showAnnouncement) {
        assert.equal(await page.getByRole('link', { name: /Read full announcement/ }).getAttribute('href'), '/news/icon-test');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        const close = page.getByRole('button', { name: 'Close announcement' });
        assert((await styles(close)).focusVisible);
        transparent(await styles(close));
        await page.keyboard.press('Escape');
        await close.waitFor({ state: 'detached' });
      }
      assert.deepEqual(errors, [], `${url} should render without JavaScript errors`);
      console.log(`${width}px: ${url} ghost controls passed`);
    }
    await context.close();
  }
} finally { await browser.close(); }
