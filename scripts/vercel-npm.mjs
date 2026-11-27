import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Vercel's failed build reports an unknown *environment* configuration key.
// Preserve the intended cache location using npm's supported key; do not hide
// warnings or alter registry/authentication configuration.
export function normalizedNpmEnvironment(source = process.env) {
  const env = { ...source };
  const legacy = Object.keys(env).filter(key => /^npm_config_cache[-_]dir$/i.test(key));
  const supported = Object.keys(env).some(key => /^npm_config_cache$/i.test(key) && env[key]);
  if (!supported && legacy.length) env.npm_config_cache = env[legacy[0]];
  for (const key of legacy) delete env[key];
  return env;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const operation = process.argv[2];
  const args = operation === 'install' ? ['ci'] : operation === 'build' ? ['run', 'verify:deployment'] : null;
  if (!args) throw new Error('Use vercel-npm.mjs install or build.');
  const env = normalizedNpmEnvironment();
  if (Object.keys(process.env).some(key => /^npm_config_cache[-_]dir$/i.test(key))) console.info('[Build] Translated legacy npm cache-dir environment configuration to the supported cache setting.');
  const cli = env.npm_execpath;
  const useNode = cli && existsSync(cli) && path.basename(cli) === 'npm-cli.js';
  const child = spawn(useNode ? process.execPath : 'npm', useNode ? [cli, ...args] : args, {
    env, stdio: 'inherit', windowsHide: true,
    // Only the two fixed command argument lists above can reach this fallback.
    shell: !useNode && process.platform === 'win32',
  });
  child.once('error', () => { console.error('[Build] Could not start npm. Install Node 24 with npm 11.'); process.exitCode = 1; });
  child.once('exit', (code, signal) => { process.exitCode = signal ? 1 : code || 0; });
}
