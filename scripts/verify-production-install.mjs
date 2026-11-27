import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { repositoryRoot } from './dependency-preflight.mjs';

if (!process.env.npm_execpath) throw new Error('Run npm run verify:production-install from the repository root.');
const temporaryRoot = path.resolve(os.tmpdir());
const directory = await fs.mkdtemp(path.join(temporaryRoot, 'getafe-production-install-'));
const logs = [];
async function command(args) {
  const child = spawn(process.execPath, args, { cwd: directory, env: { ...process.env, NODE_ENV: 'production' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => logs.push(data.toString()));
  child.stderr.on('data', data => logs.push(data.toString()));
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Isolated production installation/check failed; see artifacts/dependency-audit/production-install.log.')));
  });
}
try {
  for (const file of ['package.json', 'package-lock.json', '.npmrc', 'server.js']) await fs.copyFile(path.join(repositoryRoot, file), path.join(directory, file));
  for (const name of ['api', 'server', 'src', 'packages', 'apps', 'services', 'scripts', 'database']) {
    await fs.cp(path.join(repositoryRoot, name), path.join(directory, name), { recursive: true, filter(source) {
      const relative = path.relative(repositoryRoot, source).replaceAll('\\', '/');
      return !relative.split('/').some(part => ['node_modules', 'dist', 'build', '.cache'].includes(part) || part.startsWith('.env'))
        && !/^server\/data(?:\/|$)/.test(relative);
    } });
  }
  console.info('[Dependencies] Installing production dependencies in an isolated source snapshot; the working node_modules is untouched.');
  await command([process.env.npm_execpath, 'ci', '--omit=dev', '--no-audit', '--no-fund']);
  await command([process.env.npm_execpath, 'ls', '--omit=dev']);
  await command(['scripts/check-runtime-dependencies.mjs']);
  await command(['scripts/smoke-runtime.mjs']);
  console.info('[Dependencies] Isolated npm ci --omit=dev and the complete production import smoke passed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await fs.mkdir(path.join(repositoryRoot, 'artifacts/dependency-audit'), { recursive: true });
  await fs.writeFile(path.join(repositoryRoot, 'artifacts/dependency-audit/production-install.log'), logs.join(''));
  // Only remove the exact disposable directory created above, under OS temp.
  if (path.dirname(directory) !== temporaryRoot || !path.basename(directory).startsWith('getafe-production-install-')) throw new Error('Refusing to remove an unexpected temporary directory.');
  await fs.rm(directory, { recursive: true, force: true });
}
