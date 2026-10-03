import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.UI_TEST_URL || 'http://127.0.0.1:5173';
const output = path.resolve('artifacts/focus');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const expectedBlue = 'rgb(47, 128, 201)';
const styles = locator => locator.evaluate(node => {
  const css = getComputedStyle(node), rect = node.getBoundingClientRect();
  return {
    visible: node.matches(':focus-visible'), outline: css.outlineStyle,
    color: css.outlineColor, width: css.outlineWidth, offset: css.outlineOffset,
    border: `${css.borderWidth} ${css.borderStyle}`, borderColor: css.borderColor,
    shadow: css.boxShadow, dimensions: [rect.width, rect.height],
  };
});
const ring = async (locator, color = expectedBlue) => {
  const state = await styles(locator);
  assert.equal(state.visible, true);
  assert.equal(state.outline, 'solid');
  assert.equal(state.width, '2px');
  assert.equal(state.offset, '2px');
  assert.equal(state.color, color);
};
try {
  // Exercise an actual native dialog and its keyboard/mouse dismissal paths.
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => console.error(error.message));
    let noticeId = 0;
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url());
      let body = { items: [] };
      if (url.pathname === '/api/auth/me') body = { user: null };
      else if (url.pathname === '/api/public/config') body = { 'general.name': 'Municipality of Getafe' };
      else if (url.pathname === '/api/news' && url.searchParams.has('important')) body = { items: [{
        id: `focus-notice-${++noticeId}`, slug: 'focus-notice', title: 'Municipal service announcement',
        excerpt: 'Municipal services are available during regular office hours.', version: 1,
      }] };
      return route.fulfill({ json: body });
    });
    const close = page.getByRole('button', { name: 'Close announcement', exact: true });
    const reopen = async () => {
      if (page.url().startsWith(base)) await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      await page.goto(base);
      try { await close.waitFor(); } catch (error) {
        await page.screenshot({ path: path.join(output, 'failure.png') });
        console.error(await page.locator('body').innerText());
        throw error;
      }
    };
    await reopen();
    await page.keyboard.press('Tab');
    await ring(page.getByRole('link', { name: /Read full announcement/ }));
    await page.keyboard.press('Shift+Tab');
    await ring(close);
    const focused = await styles(close);
    await page.screenshot({ path: path.join(output, `announcement-keyboard-${viewport.width}.png`) });
    await page.keyboard.press('Enter');
    await close.waitFor({ state: 'detached' });
    await reopen();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Space');
    await close.waitFor({ state: 'detached' });
    await reopen();
    await page.keyboard.press('Escape');
    await close.waitFor({ state: 'detached' });
    await reopen();
    // Pointer focus remains on a real modal control without leaving a ring.
    await page.getByRole('heading', { name: 'Municipal service announcement', exact: true }).click();
    await close.hover(); await page.mouse.down();
    const clicked = await styles(close);
    assert.equal(clicked.visible, false);
    assert.equal(clicked.outline, 'none');
    await page.mouse.up();
    await close.waitFor({ state: 'detached' });
    await reopen();
    assert.deepEqual((await styles(close)).dimensions, focused.dimensions);
    await close.click();
    await close.waitFor({ state: 'detached' });
    // Check real public navigation after dismissal, including reverse tabbing.
    for (let step = 0; step < 24; step++) {
      await page.keyboard.press('Tab');
      const active = page.locator(':focus');
      if (await active.count() && await active.evaluate(node => node !== document.body)) await ring(active);
    }
    await page.keyboard.press('Shift+Tab');
    await ring(page.locator(':focus'));
    console.log(`Public navigation and announcement: Tab, Shift+Tab, Enter, Space, Escape, mouse (${viewport.width}px)`);
    await context.close();
  }

  // Load every frontend stylesheet to catch specificity conflicts across routes.
  const page = await browser.newPage();
  await page.route('**/focus-test', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><head></head><body></body></html>',
  }));
  await page.goto(`${base}/focus-test`);
  const files = async directory => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(entry => entry.isDirectory()
      ? files(path.join(directory, entry.name))
      : entry.name.endsWith('.css') ? [path.join(directory, entry.name)] : []));
    return nested.flat();
  };
  const cssFiles = await files('src');
  const css = await Promise.all(cssFiles.map(file => fs.readFile(file, 'utf8')));
  await page.setContent(`<main class="portal-v2 admin-portal cms page-shell"><div id="focus-fixtures"></div></main>`);
  await page.addStyleTag({ content: css.join('\n').replace(/@import '\.\/focus\.css';/g, '') });
  await page.locator('#focus-fixtures').evaluate(node => {
    node.innerHTML = `<button id="start">Start</button>
      <button class="profile-modal-close">X</button><button class="access-dialog-close">X</button>
      <button class="settings-modal-close">X</button><button class="profile-form-close">X</button>
      <a href="#focus-fixtures" class="portal-nav-item">Navigation</a>
      <input aria-label="Name"><textarea aria-label="Message"></textarea>
      <select aria-label="Options"><option>One</option><option>Two</option></select>
      <button role="tab" aria-selected="true">Selected tab</button>
      <div role="button" tabindex="0">Custom action</div>
      <details><summary>Details</summary>Content</details>
      <input type="checkbox" aria-label="Checkbox"><input type="radio" aria-label="Radio">
      <label class="settings-switch"><input type="checkbox"><span></span></label>
      <label class="settings-toggle"><input type="checkbox"><span></span></label>
      <label class="settings-notification-toggle"><input type="checkbox"><span></span></label>
      <label class="button-like">Upload<input type="file"></label>
      <input aria-invalid="true" aria-label="Invalid value"><button disabled>Disabled</button>
      <button id="end">End</button>`;
  });
  const start = page.locator('#start');
  await start.click();
  assert.equal((await styles(start)).outline, 'none');
  const controls = page.locator('#focus-fixtures :is(button:not(:disabled), a, input, textarea, select, summary, [tabindex])');
  for (let index = 1; index < await controls.count(); index++) {
    const target = controls.nth(index);
    const before = await styles(target);
    await page.keyboard.press('Tab');
    assert.equal(await target.evaluate(node => node === document.activeElement), true,
      `Tab order at ${index}: ${await page.evaluate(() => document.activeElement.outerHTML)}`);
    const after = await styles(target);
    assert.deepEqual(after.dimensions, before.dimensions, `No resize at ${index}`);
    assert.equal(after.border, before.border, `Border state retained at ${index}`);
    if (await target.getAttribute('aria-invalid')) {
      await page.waitForFunction(() => getComputedStyle(document.activeElement).borderColor === 'rgb(220, 38, 38)');
    }
    assert.equal(after.shadow, before.shadow, `Elevation retained at ${index}`);
    const hiddenProxy = await target.evaluate(node => node.closest('.settings-switch, .settings-toggle, .settings-notification-toggle, .button-like')?.className);
    if (hiddenProxy) {
      const proxy = hiddenProxy === 'button-like' ? target.locator('..') : target.locator('..').locator('span');
      assert.equal(await proxy.evaluate(node => getComputedStyle(node).outlineColor), expectedBlue);
      assert.equal(await proxy.evaluate(node => getComputedStyle(node).outlineWidth), '2px');
    } else await ring(target);
  }
  await page.keyboard.press('Shift+Tab');
  await ring(page.locator(':focus'));
  await page.screenshot({ path: path.join(output, 'all-controls-keyboard.png') });
  await page.evaluate(() => document.documentElement.dataset.highContrast = 'true');
  await ring(page.locator(':focus'), 'rgb(255, 255, 0)');
  await page.emulateMedia({ forcedColors: 'active' });
  assert.equal((await styles(page.locator(':focus'))).outline, 'solid');
  console.log(`All ${cssFiles.length} stylesheets: shared focus, custom controls, switches, no layout shifts, validation, disabled, high contrast and forced colors passed`);
} finally {
  await browser.close();
}

