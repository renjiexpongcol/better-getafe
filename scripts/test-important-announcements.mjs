import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';

test('Important announcements: publication, access, persistence and removal', { timeout: 40000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getafe-announcements-'));
  const base = 'http://127.0.0.1:18196';
  const env = {
    ...process.env, NODE_ENV: 'development', PORT: '18196',
    CMS_DATABASE_PROVIDER: 'local', PORTAL_DATABASE_PROVIDER: 'local', CMS_MEDIA_PROVIDER: 'local',
    CONFIG_DATABASE_URL: '', CONFIG_DB_HOST: '', SETTINGS_SECRET_PROJECT: '',
    SETTINGS_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    CMS_LOCAL_FILE: path.join(directory, 'cms.json'), LOCAL_SQLITE_FILE: path.join(directory, 'getafe.sqlite'),
    CONFIG_LOCAL_FILE: path.join(directory, 'settings.json'), AUTH_LOCAL_FILE: path.join(directory, 'auth.json'),
    CMS_ADMIN_EMAIL: 'admin@getafe.gov.ph', CMS_ADMIN_PASSWORD: 'Test-Admin-Password-123',
    AUTH_SESSION_SECRET: 'test-only-signing-secret',
  };
  await fs.writeFile(env.CONFIG_LOCAL_FILE, JSON.stringify({ settings: {}, history: [] }));
  let child;
  async function stop() {
    if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done; }
  }
  t.after(async () => { await stop(); await fs.rm(directory, { recursive: true, force: true }); });
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000);
      child.stdout.on('data', (chunk) => { if (chunk.toString().includes('Server listening')) { clearTimeout(timer); resolve(); } });
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('exit', () => { clearTimeout(timer); reject(new Error('Server exited during startup')); });
    });
  }
  await start();
  let cookie = '';
  async function api(url, method = 'GET', body, authenticated = true) {
    const response = await fetch(`${base}${url}`, {
      method, headers: { 'Content-Type': 'application/json', Cookie: authenticated ? cookie : '' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { response, body: response.status === 204 ? null : await response.json() };
  }
  const feed = '/api/news?important=true&limit=1';
  assert.equal((await api(feed)).body.total, 0, 'Existing articles do not become important automatically');
  const login = await api('/api/auth/login', 'POST', { email: env.CMS_ADMIN_EMAIL, password: env.CMS_ADMIN_PASSWORD });
  assert.equal(login.response.status, 200);
  cookie = login.response.headers.get('set-cookie').split(';')[0];
  const article = { title: 'Important service advisory', excerpt: 'Please read this municipal advisory.', content: '<p>Full advisory.</p>', status: 'published', published_at: '2020-01-01T00:00:00Z', is_important: true };
  assert.equal((await api('/api/news', 'POST', article, false)).response.status, 401);
  assert.equal((await api('/api/news', 'POST', { ...article, is_important: 'true' })).response.status, 422);
  const created = await api('/api/news', 'POST', article);
  assert.equal(created.response.status, 201);
  assert.equal(created.body.is_important, true);
  const id = created.body.id;
  await api('/api/news', 'POST', { ...article, title: 'Draft advisory', status: 'draft' });
  await api('/api/news', 'POST', { ...article, title: 'Future advisory', published_at: '2099-01-01T00:00:00Z' });
  await api('/api/news', 'POST', { ...article, title: 'Ordinary news', is_important: false, published_at: '2023-01-01T00:00:00Z' });
  for (const authenticated of [false, true]) {
    const result = await api(feed, 'GET', undefined, authenticated);
    assert.equal(result.body.total, 1, 'Drafts, scheduled posts and ordinary articles stay out, including for admins');
    assert.equal(result.body.items[0].id, id);
  }
  await stop(); await start();
  assert.equal((await api(feed, 'GET', undefined, false)).body.items[0].id, id, 'Important flag survives restart');
  const newer = await api('/api/news', 'POST', { ...article, title: 'Latest important advisory', published_at: '2021-01-01T00:00:00Z' });
  assert.equal((await api(feed)).body.items[0].id, newer.body.id, 'Newest important article wins');
  await api(`/api/news/${newer.body.id}`, 'PUT', { ...newer.body, is_important: false });
  assert.equal((await api(feed)).body.items[0].id, id, 'Unchecking restores the next eligible article');
  const { is_important, ...legacyUpdate } = article;
  await api(`/api/news/${id}`, 'PUT', legacyUpdate);
  assert.equal((await api(feed)).body.items[0].id, id, 'Older clients preserve the flag when omitted');
  await api(`/api/news/${id}`, 'PUT', { ...article, status: 'draft' });
  assert.equal((await api(feed)).body.total, 0, 'Unpublishing removes the popup');
  await api(`/api/news/${id}`, 'PUT', article);
  await api(`/api/news/${id}`, 'DELETE');
  assert.equal((await api(feed)).body.total, 0, 'Deleting removes the popup');
});
