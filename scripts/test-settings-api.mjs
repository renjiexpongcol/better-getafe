import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
test('Settings HTTP API: auth, persistence, redaction, runtime policy, permissions, reset', { timeout: 40000 }, async t => {
 const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getafe-api-'));
 const port = 18193, base = `http://127.0.0.1:${port}`;
 const env = { ...process.env, NODE_ENV: 'development', PORT: String(port), CMS_DATABASE_PROVIDER: 'local', PORTAL_DATABASE_PROVIDER: 'local', CMS_MEDIA_PROVIDER: 'local', CONFIG_DATABASE_URL: '', CONFIG_DB_HOST: '', SETTINGS_SECRET_PROJECT: '', SETTINGS_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'), CMS_LOCAL_FILE: path.join(directory, 'cms.json'), CONFIG_LOCAL_FILE: path.join(directory, 'settings.json'), AUTH_LOCAL_FILE: path.join(directory, 'auth.json'), CMS_ADMIN_PASSWORD: 'Test-Admin-Password-123', AUTH_SESSION_SECRET: 'test-only-signing-secret', APP_NAME: 'Environment app' };
 await fs.writeFile(env.CONFIG_LOCAL_FILE, JSON.stringify({ settings: {}, history: [] }));
 let child;
 async function stop() { if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done; } }
 t.after(async () => { await stop(); await fs.rm(directory, { recursive: true, force: true }); });
 async function start() {
  child = spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
   const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000);
   child.stdout.on('data', chunk => { if (chunk.toString().includes('Server listening')) { clearTimeout(timer); resolve(); } });
   child.on('exit', () => { clearTimeout(timer); reject(new Error('Server exited during startup')); });
  });
 }
 await start();
 let cookie = '';
 async function api(url, method = 'GET', body, headers = {}) {
  const response = await fetch(`${base}${url}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { response, body: await response.json() };
 }
 assert.equal((await api('/api/admin/settings')).response.status, 401);
 const login = await api('/api/auth/login', 'POST', { email: 'admin@getafe.gov.ph', password: env.CMS_ADMIN_PASSWORD });
 assert.equal(login.response.status, 200); cookie = login.response.headers.get('set-cookie').split(';')[0];
 const id = login.body.user.id;
 let result = await api('/api/admin/settings');
 assert.equal(result.body.values['general.name'], 'Environment app');
 assert.equal(result.body.metadata['general.name'].source, 'environment');
 assert.equal((await api('/api/admin/settings', 'PUT', { values: { 'general.name': 'Hostile' } }, { Origin: 'https://hostile.example' })).response.status, 403);
 assert.equal((await api('/api/admin/settings/email', 'PATCH', { values: { 'general.name': 'Wrong category' } })).response.status, 422);
 result = await api('/api/admin/settings', 'PUT', { values: { 'general.name': 'Dashboard app', 'email.password': 'never-return-this-secret', 'features.uploads': false } });
 assert.equal(result.response.status, 200, JSON.stringify(result.body));
 assert.equal(result.body.values['email.password'], null);
 assert.equal(result.body.metadata['email.password'].configured, true);
 assert.ok(!JSON.stringify(result.body).includes('never-return-this-secret'));
 assert.equal((await api('/api/storage/upload-url', 'POST', {})).response.status, 403);
 assert.equal((await api('/api/public/config')).body['general.name'], 'Dashboard app');
 assert.ok(!(await fs.readFile(env.CONFIG_LOCAL_FILE, 'utf8')).includes('never-return-this-secret'));
 assert.ok(!JSON.stringify((await api('/api/admin/settings/history')).body).includes('never-return-this-secret'));
 const failed = await api('/api/admin/settings', 'PUT', { values: { 'database.provider': 'mysql', 'database.host': '127.0.0.1', 'database.port': 1, 'database.connectTimeout': 100 } });
 assert.equal(failed.response.status, 422);
 assert.equal((await api('/api/admin/settings')).body.values['database.provider'], 'local');
 await stop(); await start();
 assert.equal((await api('/api/admin/settings')).body.values['general.name'], 'Dashboard app');
 result = await api('/api/admin/settings', 'PUT', { values: { 'general.name': null, 'email.password': '' } });
 assert.equal(result.body.values['general.name'], 'Environment app');
 assert.equal(result.body.metadata['email.password'].configured, true);
 await api('/api/admin/settings', 'PUT', { values: { 'maintenance.enabled': true, 'authentication.registrationEnabled': false } });
 assert.equal((await api('/api/news', 'GET', undefined, { Cookie: '' })).response.status, 503);
 assert.equal((await api('/api/news')).response.status, 200);
 assert.equal((await api('/api/admin/settings')).response.status, 200);
 await api('/api/admin/settings', 'PUT', { values: { 'maintenance.enabled': false } });
 assert.equal((await api('/api/portal-auth/register', 'POST', {}, { Cookie: '' })).response.status, 403);
 const grants = JSON.stringify({ [id]: ['settings.view', 'settings.edit', 'settings.security.edit'] });
 assert.equal((await api('/api/admin/settings', 'PUT', { values: { 'security.permissionGrants': grants } })).response.status, 200);
 assert.equal((await api('/api/admin/settings', 'PUT', { values: { 'email.password': 'denied' } })).response.status, 403);
 assert.equal((await api('/api/admin/settings/test/database', 'POST', { values: {} })).response.status, 422);
 assert.equal((await api('/api/admin/settings/history')).response.status, 403);
});
