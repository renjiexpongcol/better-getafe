import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const port = 8099;
const baseUrl = `http://127.0.0.1:${port}`;
const email = `auth-test-${Date.now()}@example.com`;
const password = 'Correct-Horse-9!';
const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'getafe-auth-test-'));
const server = spawn(process.execPath, ['server.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
    CMS_DATABASE_PROVIDER: 'local',
    PORTAL_DATABASE_PROVIDER: 'local',
    CMS_MEDIA_PROVIDER: 'local',
    AUTH_SESSION_SECRET: 'local-auth-lifecycle-test-secret',
    CONFIG_DATABASE_URL: '',
    CONFIG_LOCAL_FILE: path.join(testDirectory, 'settings.json'),
    AUTH_LOCAL_FILE: path.join(testDirectory, 'auth.json'),
    CMS_LOCAL_FILE: path.join(testDirectory, 'cms.json'),
    LOCAL_SQLITE_FILE: path.join(testDirectory, 'portal.sqlite'),
    STORAGE_PROVIDER: 'local',
    LOCAL_STORAGE_PATH: path.join(testDirectory, 'uploads'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
let settled = false;

const stopServer = () => new Promise((resolve) => {
  if (server.exitCode !== null) return resolve();
  server.once('exit', resolve);
  server.kill();
});

const finish = async (code) => {
  if (settled) return;
  settled = true;
  await stopServer();
  process.exitCode = code;
};

const fetch = (url, options = {}) => globalThis.fetch(url, { ...options, headers: { 'X-Requested-With': 'GetafeCitizenPortal', ...options.headers } });

const run = async () => {
  const register = await fetch(`${baseUrl}/api/portal-auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Auth Test', email, password }),
  });
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, remember: true }),
  });
  const cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
  const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
  const privateBeforeLogout = await fetch(`${baseUrl}/api/citizen/dashboard`, { headers: { Cookie: cookie } });
  const account = (await me.clone().json()).user;
  const db = new DatabaseSync(path.join(testDirectory, 'portal.sqlite'));
  db.prepare('INSERT INTO google_profiles (user_id, picture) VALUES (?, ?)').run(account.id, 'https://example.com/avatar.png');
  const googleSession = await fetch(baseUrl + '/api/auth/me', { headers: { Cookie: cookie } });
  assert.equal((await googleSession.json()).user.setupRequired, true);
  assert.equal((await fetch(baseUrl + '/api/citizen/dashboard', { headers: { Cookie: cookie } })).status, 403);
  assert.equal((await fetch(baseUrl + '/api/citizen/onboarding/complete', { method: 'POST', headers: { Cookie: cookie } })).status, 422);
  const profileHeaders = { Cookie: cookie, 'Content-Type': 'application/json' };
  assert.equal((await fetch(baseUrl + '/api/citizen/profile', { method: 'PUT', headers: profileHeaders, body: JSON.stringify({ full_name: 'Auth Test', mobile: 'invalid' }) })).status, 422);
  assert.equal((await fetch(baseUrl + '/api/citizen/profile', { method: 'PUT', headers: profileHeaders, body: JSON.stringify({ full_name: 'Auth Test', mobile: '09123456789' }) })).status, 200);
  db.prepare('UPDATE google_profiles SET picture = NULL WHERE user_id = ?').run(account.id);
  assert.equal((await fetch(baseUrl + '/api/citizen/onboarding/complete', { method: 'POST', headers: { Cookie: cookie } })).status, 422);
  db.prepare('UPDATE google_profiles SET picture = ? WHERE user_id = ?').run('https://example.com/avatar.png', account.id);
  assert.equal((await fetch(baseUrl + '/api/citizen/onboarding/complete', { method: 'POST', headers: { Cookie: cookie } })).status, 422);
  db.prepare('UPDATE google_profiles SET password_set = 1, identity_verified = 1, verification_method = ? WHERE user_id = ?').run('email', account.id);
  assert.equal((await fetch(baseUrl + '/api/citizen/onboarding/complete', { method: 'POST', headers: { Cookie: cookie } })).status, 200);
  assert.equal((await fetch(baseUrl + '/api/auth/me', { headers: { Cookie: cookie } }).then(response => response.json())).user.setupRequired, false);
  assert.equal((await fetch(baseUrl + '/api/citizen/dashboard', { headers: { Cookie: cookie } })).status, 200);
  db.close();
  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
  const afterLogout = await fetch(`${baseUrl}/api/auth/me`);
  const staleSession = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
  const privateAfterLogout = await fetch(`${baseUrl}/api/citizen/dashboard`, { headers: { Cookie: cookie } });
  const protectedDocument = await fetch(`${baseUrl}/app/dashboard`, { headers: { Cookie: cookie } });

  console.log(JSON.stringify({
    register: register.status,
    login: login.status,
    me: me.status,
    logout: logout.status,
    afterLogout: afterLogout.status,
    staleSession: staleSession.status,
    privateBeforeLogout: privateBeforeLogout.status,
    privateAfterLogout: privateAfterLogout.status,
    privateCache: privateBeforeLogout.headers.get('cache-control'),
    protectedDocumentCache: protectedDocument.headers.get('cache-control'),
  }));

  await finish(register.status === 201 && login.status === 200 && me.status === 200 && logout.status === 200 && afterLogout.status === 401 && staleSession.status === 401 && privateBeforeLogout.status === 200 && privateAfterLogout.status === 401 && privateBeforeLogout.headers.get('cache-control')?.includes('no-store') && protectedDocument.headers.get('cache-control')?.includes('no-store') ? 0 : 1);
};

server.stdout.on('data', (chunk) => {
  output += chunk.toString();
  if (output.includes('Server listening') && !settled) run().catch(async (error) => {
    console.error(error.message);
    await finish(1);
  });
});

server.stderr.on('data', (chunk) => {
  if (chunk.toString().includes('[STARTUP FAILED]') && !settled) finish(1);
});

server.on('error', async (error) => {
  console.error(error.message);
  await finish(1);
});
