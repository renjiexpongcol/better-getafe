import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync, watch } from 'node:fs';
import { createServer } from 'node:net';
import { probeBackendReadiness } from './readiness-probe.mjs';
import { loadLocalEnvironment, ensureSupabaseConfigured, checkBetterGetafeSchema, selectedCmsUrl } from '../server/src/config/supabaseSetup.js';


const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const setupOnly = process.argv.includes('--setup-only');
const preview = process.argv.includes('--preview');
if (preview && !existsSync(path.join(root, 'dist/index.html'))) throw new Error('Run npm run build before previewing the portal.');
await loadLocalEnvironment();
const port = Number(process.env.VITE_PORT || process.env.PORT || 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('VITE_PORT must be a valid TCP port.');

if (!setupOnly) {
  const check = createServer();
  try {
    await new Promise((resolve, reject) => {
      check.once('error', reject);
      check.listen(port, '127.0.0.1', resolve);
    });
    await new Promise(resolve => check.close(resolve));
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    if ((await probeBackendReadiness(port, 2000)).ready) {
      console.info(`[Portal] Better Getafe is already ready at http://localhost:${port}. Reusing the running instance.`);
      process.exit(0);
    }
    console.error(`[Portal] Port ${port} is already in use. Stop the existing listener before starting another portal instance.`);
    process.exit(1);
  }
}

let databaseUrl = selectedCmsUrl(process.env);
if (setupOnly || !databaseUrl) {
  try {
    const setup = await ensureSupabaseConfigured();
    if (setup.cancelled) process.exit(0);
    databaseUrl = setup.url;
    if (setupOnly) {
      await checkBetterGetafeSchema(databaseUrl);
      console.info('[Supabase] Connection and schema verified.');
      process.exit(0);
    }
  } catch (error) {
    console.error('[Supabase] ' + error.message);
    process.exit(1);
  }
}

const env = {
  ...process.env,
  NODE_ENV: 'development',
  HOST: '127.0.0.1',
  PORT: String(port),
  VITE_PORT: String(port),
  BACKEND_PORT: String(port),
  PORTAL_UNIFIED_DEV_SERVER: String(!preview),
  CMS_SUPABASE_DATABASE_URL: databaseUrl,
};
delete env.VITE_BACKEND_URL;

let backend, worker, restartTimer, workerTimer;
let stopping = false, restarting = false, ready = false, workerFailures = 0;
const watchers = [];
const closing = new Map();

function launch(file, args = []) {
  return spawn(process.execPath, [file, ...args], {
    cwd: root, env, stdio: ['inherit', 'inherit', 'inherit', 'ipc'], windowsHide: true,
  });
}

function closeChild(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  if (closing.has(child)) return closing.get(child);
  const closed = new Promise(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 30000);
    child.once('exit', () => { clearTimeout(timer); closing.delete(child); resolve(); });
    if (child.connected) child.disconnect();
  });
  closing.set(child, closed);
  return closed;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  clearTimeout(restartTimer);
  clearTimeout(workerTimer);
  for (const watcher of watchers) watcher.close();
  void Promise.all([closeChild(worker), closeChild(backend)]);
}

function startWorker() {
  if (!ready || stopping || restarting || worker || workerFailures >= 3) return;
  worker = launch('server/integration-worker.js', ['--after-api-ready']);
  const child = worker;
  child.once('error', error => {
    console.error('[Portal] Worker process error:', error.code);
    if (!child.pid) { worker = undefined; workerFailures = 3; }
  });
  child.once('exit', (code, signal) => {
    worker = undefined;
    if (stopping || restarting) return;
    if (closing.has(child)) {
      if (ready) startWorker();
      return;
    }
    workerFailures = code === 78 ? 3 : workerFailures + 1;
    if (workerFailures >= 3) {
      console.warn('[Portal] Integration worker paused. Check the worker diagnostic and restart after correcting the configuration.');
      return;
    }
    workerTimer = setTimeout(() => { workerTimer = undefined; startWorker(); }, 5000 * workerFailures);
  });
}

function startBackend() {
  ready = false;
  workerFailures = 0;
  backend = launch('server.js');
  const child = backend;
  const deadline = setTimeout(() => {
    console.error('[Portal] Backend initialization exceeded 180 seconds. Check the last startup stage and the database, Redis and storage diagnostics.');
    stop(1);
  }, 180000);
  const clearDeadline = () => clearTimeout(deadline);
  child.once('exit', clearDeadline);
  child.once('disconnect', clearDeadline);
  child.on('message', message => {
    if (stopping || restarting || child !== backend || message?.type !== 'portal-readiness') return;
    clearDeadline();
    ready = message.ready === true;
    if (ready) {
      if (!workerTimer) startWorker();
    } else {
      void closeChild(worker);
    }
  });
  child.once('error', error => { console.error('[Portal] Backend process error:', error.code); stop(1); });
  child.once('exit', (code, signal) => {
    if (child !== backend || stopping || restarting) return;
    console.error('[Portal] Backend exited (' + (signal || code) + '). Review the startup diagnostic above.');
    stop(code || 1);
  });
}

async function restart() {
  if (stopping || restarting) return;
  restarting = true;
  ready = false;
  clearTimeout(workerTimer);
  workerTimer = undefined;
  await Promise.all([closeChild(worker), closeChild(backend)]);
  restarting = false;
  if (!stopping) startBackend();
}

function changed() {
  if (stopping || restarting) return;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => void restart(), 250);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop());
if (process.send) {
  process.once('disconnect', () => stop());
  if (!process.connected) stop();
}
if (!preview) {
  try {
    watchers.push(watch(path.join(root, 'server'), { recursive: true }, changed));
    watchers.push(watch(root, (_event, file) => { if (file === 'server.js') changed(); }));
    for (const watcher of watchers) watcher.on('error', error => {
      console.error('[Portal] Backend source watcher failed:', error.code);
      stop(1);
    });
  } catch (error) {
    console.error('[Portal] Unable to watch backend source:', error.code);
    stop(1);
  }
}
if (!stopping) {
  console.info('[Portal] Starting Better Getafe on http://localhost:' + port + '.');
  startBackend();
}
