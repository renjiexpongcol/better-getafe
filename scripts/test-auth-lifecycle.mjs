import { spawn } from 'node:child_process';

const port = 8099;
const baseUrl = `http://127.0.0.1:${port}`;
const email = `auth-test-${Date.now()}@example.com`;
const password = 'correct-horse-battery';
const server = spawn(process.execPath, ['server.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
    CMS_DATABASE_PROVIDER: 'local',
    PORTAL_DATABASE_PROVIDER: 'local',
    CMS_MEDIA_PROVIDER: 'local',
    AUTH_SESSION_SECRET: 'local-auth-lifecycle-test-secret',
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
  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
  const afterLogout = await fetch(`${baseUrl}/api/auth/me`);

  console.log(JSON.stringify({
    register: register.status,
    login: login.status,
    me: me.status,
    logout: logout.status,
    afterLogout: afterLogout.status,
  }));

  await finish(register.status === 201 && login.status === 200 && me.status === 200 && logout.status === 200 && afterLogout.status === 401 ? 0 : 1);
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