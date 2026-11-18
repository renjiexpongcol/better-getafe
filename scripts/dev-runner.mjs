import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadLocalEnvironment, ensureSupabaseConfigured, checkBetterGetafeSchema } from '../server/src/config/supabaseSetup.js';
import { probeBackendReadiness } from './readiness-probe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const setupOnly = process.argv.includes('--setup-only');
const port = Number(process.env.VITE_PORT || process.env.PORT || 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('VITE_PORT must be a valid TCP port.');
await loadLocalEnvironment();

let setup;
try {
  setup = await ensureSupabaseConfigured();
  if (setup.cancelled) {
    console.info('[Supabase] Setup cancelled; no application process was started.');
    process.exit(0);
  }
  console.info('[Supabase] Connection verified.');
  await checkBetterGetafeSchema(setup.url);
  console.info('[Supabase] Better Getafe database ready.');
} catch (error) {
  console.error(`[Supabase] ${error.message}`);
  process.exit(1);
}
if (setupOnly) process.exit(0);

const env = {
  ...process.env,
  NODE_ENV: 'development',
  HOST: '127.0.0.1',
  PORT: String(port),
  VITE_PORT: String(port),
  BACKEND_PORT: String(port),
  PORTAL_UNIFIED_DEV_SERVER: 'true',
  CMS_SUPABASE_DATABASE_URL: setup.url,
};
delete env.VITE_BACKEND_URL;

const children = new Set();
let stopping = false;
let workerStarted = false;
let monitor;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(monitor);
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
function start(args, required = true) {
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  children.add(child);
  child.once('error', () => { console.error('[Portal] Unable to start a required process.'); if (required) stop(1); });
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (required && !stopping) {
      console.error(`[Portal] Backend stopped (${signal || code}).`);
      stop(code || 1);
    }
    if (!required && code !== 0 && !stopping) console.error('[Portal] Integration worker stopped. Restart it after checking its startup logs.');
  });
  return child;
}
const ready = () => probeBackendReadiness(port);
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
console.info(`[Portal] Starting Better Getafe on http://localhost:${port}.`);
const backend = start(['--watch', 'server.js']);
const deadline = Date.now() + 60_000;
let lastReadiness = { ready: false, httpStatus: null, status: 'initializing' };
while (!stopping && children.has(backend) && Date.now() < deadline) {
  lastReadiness = await ready();
  if (lastReadiness.ready) break;
  await new Promise(resolve => setTimeout(resolve, 500));
}
if (!stopping && children.has(backend) && lastReadiness.ready) {
  console.info(`[Portal] Backend ready at http://localhost:${port}.`);
  start(['server/integration-worker.js'], false);
  workerStarted = true;
}
if (!stopping && !workerStarted) {
  console.error(`[Portal] Backend did not become ready within 60 seconds (last check: ${lastReadiness.status}${lastReadiness.httpStatus ? `, HTTP ${lastReadiness.httpStatus}` : ''}). Review the backend startup stage above; database-dependent workers were not started.`);
  stop(1);
}
let failedReadinessChecks = 0;
monitor = setInterval(async () => {
  if (stopping || children.size === 0) return stop(1);
  const state = await ready();
  if (state.ready) { failedReadinessChecks = 0; return; }
  failedReadinessChecks++;
  if (failedReadinessChecks === 1) console.error(`[Portal] Backend readiness check failed (${state.status}${state.httpStatus ? `, HTTP ${state.httpStatus}` : ''}); retrying for up to 15 seconds.`);
  if (failedReadinessChecks >= 3) {
    console.error('[Portal] Backend remained unready for 15 seconds. Stopping the app; database-dependent workers will not run.');
    stop(1);
  }
}, 5000);
