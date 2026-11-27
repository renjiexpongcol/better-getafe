import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync, watch } from 'node:fs';
import { createServer } from 'node:net';
import { probeBackendReadiness } from './readiness-probe.mjs';
import { checkInstalledDependencies, reportStartupDependencyError } from './dependency-preflight.mjs';

let loadLocalEnvironment, ensureSupabaseConfigured, checkBetterGetafeSchema, selectedCmsUrl;
try {
  checkInstalledDependencies({ development: !process.argv.includes('--database-only') });
  ({ loadLocalEnvironment, ensureSupabaseConfigured, checkBetterGetafeSchema, selectedCmsUrl } = await import('../server/src/config/supabaseSetup.js'));
} catch (error) {
  reportStartupDependencyError(error);
  process.exit(1);
}


const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseOnly = process.argv.includes('--database-only');
const setupOnly = databaseOnly || process.argv.includes('--setup-only');
const preview = process.argv.includes('--preview');
if (preview && !existsSync(path.join(root, 'dist/index.html'))) throw new Error('Run npm run build before previewing the portal.');
const inheritedEnvironmentKeys=new Set(Object.keys(process.env));
await loadLocalEnvironment();
let fileEnvironmentKeys=Object.keys(process.env).filter(key=>!inheritedEnvironmentKeys.has(key));
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

if (!setupOnly) {
  try {
    const { resolveRedisConfiguration } = await import('../server/src/infrastructure/redis/redisConfiguration.js');
    const redis = resolveRedisConfiguration();
    if (!redis.enabled) console.warn(JSON.stringify({ event: 'redis_configuration_missing', pid: process.pid, status: 'degraded', reason: 'Authentication sessions require the configured Redis registry; session operations will fail closed until configured.' }));
  } catch (error) {
    console.warn(`[Portal] Redis configuration is invalid; authentication will remain unavailable until corrected.`);
  }
}

let databaseUrl = selectedCmsUrl(process.env);
if (setupOnly || !databaseUrl) {
  try {
    const setup = await ensureSupabaseConfigured();
    if (setup.cancelled) process.exit(0);
    databaseUrl = setup.url;
    if (setupOnly) {
      if (databaseOnly) {
        console.info('[Supabase] Database connection verified with a read-only query. Schema, Redis, storage and portal initialization were not run.');
        console.info('[Supabase] You can connect the remaining services later using npm run setup:cloud.');
        process.exit(0);
      }
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

let backend, worker, restartTimer, workerTimer, backendRetryTimer, stableTimer;
let stopping = false, restarting = false, ready = false, workerFailures = 0, backendFailures = 0, startupAttempt = 0;
let pendingSourceChange = '';
const watchers = [];
const closing = new Map();

function launch(file, args = [], childEnv = env) {
  return spawn(process.execPath, [file, ...args], {
    cwd: root, env: childEnv, stdio: ['inherit', 'inherit', 'inherit', 'ipc'], windowsHide: true,
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
  clearTimeout(backendRetryTimer);
  clearTimeout(stableTimer);
  for (const watcher of watchers) watcher.close();
  void Promise.all([closeChild(worker), closeChild(backend)]).catch(error => {
    console.error(JSON.stringify({ event: 'dev_children_shutdown_failed', pid: process.pid, code: error?.code || 'shutdown_error' }));
  });
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
  if (stopping || backend) return;
  ready = false;
  workerFailures = 0;
  const attemptId = randomUUID();
  const attemptNumber = ++startupAttempt;
  let becameReady = false;
  console.info(JSON.stringify({ event: 'backend_starting', pid: process.pid, startup_attempt_id: attemptId, attempt: attemptNumber }));
  backend = launch('server.js', [], { ...env, PORTAL_STARTUP_ATTEMPT_ID: attemptId });
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
      becameReady = true;
      clearTimeout(stableTimer);
      stableTimer = setTimeout(() => { backendFailures = 0; stableTimer = undefined; }, 60000);
      stableTimer.unref?.();
      console.info(JSON.stringify({ event: 'backend_ready', pid: child.pid || null, startup_attempt_id: attemptId, ready: true }));
    } else {
      console.warn(JSON.stringify({ event: 'backend_degraded', pid: child.pid || null, startup_attempt_id: attemptId, ready: false }));
    }
    if (ready) {
      if (!workerTimer) startWorker();
    } else {
      void closeChild(worker);
    }
  });
  child.once('error', error => { console.error('[Portal] Backend process error:', error.code); stop(1); });
  child.once('exit', (code, signal) => {
    if (child !== backend) return;
    backend = undefined;
    clearTimeout(deadline);
    if (stopping || restarting) return;
    clearTimeout(stableTimer);
    const failure = { event: 'backend_exit', pid: child.pid || null, startup_attempt_id: attemptId, exit_code: code, signal: signal || null };
    console.error(JSON.stringify(failure));
    if (!becameReady) {
      console.error(JSON.stringify({ event: 'backend_startup_failed', pid: process.pid, startup_attempt_id: attemptId, reason: 'required_dependencies_unavailable' }));
      stop(code || 1);
      return;
    }
    backendFailures++;
    if (backendFailures > 3) {
      console.error(JSON.stringify({ event: 'backend_restart_limit_reached', pid: process.pid, failures: backendFailures - 1 }));
      stop(code || 1);
      return;
    }
    const retryMs = Math.min(30000, 1000 * 2 ** (backendFailures - 1));
    console.warn(JSON.stringify({ event: 'backend_restart_scheduled', pid: process.pid, retry: backendFailures, retry_limit: 3, retry_ms: retryMs }));
    backendRetryTimer = setTimeout(() => { backendRetryTimer = undefined; startBackend(); }, retryMs);
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
  if (!stopping) {
    backendFailures = 0;
    console.info(JSON.stringify({ event: 'backend_restart_for_source_change', pid: process.pid, source: pendingSourceChange || 'backend source' }));
    pendingSourceChange = '';
    for(const key of fileEnvironmentKeys)delete process.env[key];
    await loadLocalEnvironment();
    fileEnvironmentKeys=Object.keys(process.env).filter(key=>!inheritedEnvironmentKeys.has(key));
    databaseUrl=selectedCmsUrl(process.env);
    for(const key of Object.keys(env))delete env[key];
    Object.assign(env,{...process.env,NODE_ENV:'development',HOST:'127.0.0.1',PORT:String(port),VITE_PORT:String(port),BACKEND_PORT:String(port),PORTAL_UNIFIED_DEV_SERVER:String(!preview),CMS_SUPABASE_DATABASE_URL:databaseUrl});
    delete env.VITE_BACKEND_URL;
    startBackend();
  }
}

function changed(source) {
  if (stopping || restarting) return;
  pendingSourceChange = source;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => void restart(), 250);
}

function isBackendSourceFile(filename) {
  if (filename == null) return false;
  const relative = String(filename).replaceAll('\\', '/').replace(/^\.\//, '');
  if (!/\.(?:js|mjs|cjs)$/i.test(relative)) return false;
  if (/(?:^|\/)(?:data|logs|tmp|temp|uploads|cache|\.cache|\.output|\.next|\.turbo|\.vite|coverage|node_modules|dist|build|generated|artifacts|sessions)(?:\/|$)/i.test(relative)) return false;
  return /^(?:index|integration-worker)\.(?:js|mjs|cjs)$/i.test(relative)
    || /^(?:src|integrationHub)\/.+\.(?:js|mjs|cjs)$/i.test(relative);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop());
if (process.send) {
  process.once('disconnect', () => stop());
  if (!process.connected) stop();
}
if (!preview) {
  try {
    watchers.push(watch(path.join(root, 'server'), { recursive: true }, (event, file) => {
      if (isBackendSourceFile(file)) changed(`${event}: server/${String(file).replaceAll('\\', '/')}`);
    }));
    watchers.push(watch(root, (event, file) => { if (['server.js','.env','.env.development.local'].includes(String(file))) changed(`${event}: ${file}`); }));
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
