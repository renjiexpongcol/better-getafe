// Reproduce the deployment's excluded-source failure without changing source.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const temporaryRoot = path.resolve(os.tmpdir());
const snapshot = await fs.mkdtemp(path.join(temporaryRoot, 'getafe-failed-build-'));
const commit = 'd0213e4';
try {
  const archive = path.join(snapshot, 'source.tar');
  execFileSync('git', ['archive', commit, '--output', archive], { cwd: root, windowsHide: true });
  execFileSync('tar', ['-xf', archive, '-C', snapshot], { windowsHide: true });
  await fs.symlink(path.join(root, 'node_modules'), path.join(snapshot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const excluded = path.join(snapshot, 'src', 'data');
  if (!excluded.startsWith(snapshot + path.sep)) throw new Error('Invalid reproduction target.');
  await fs.rm(excluded, { recursive: true, force: true });
  process.env.NODE_ENV = 'production';
  const { build } = await import('vite');
  try {
    await build({ root: snapshot, configFile: path.join(snapshot, 'vite.config.js'), logLevel: 'silent' });
    throw new Error('Expected the excluded-source build to fail.');
  } catch (error) {
    const errors = (error.errors || []).map(item => {
      const message = item.message.replace(/\u001b\[[0-9;]*m/g, '');
      const importer = item.importer || item.loc?.file || item.id;
      return { code: item.code, file: importer ? path.relative(snapshot, importer).replaceAll('\\', '/') : null, line: item.loc?.line, import: message.match(/Could not resolve '([^']+)'/)?.[1] };
    });
    if (errors.length !== 13) throw new Error(`Expected all 13 deployment errors, found ${errors.length}.`);
    const result = { commit, exclusion: 'src/data removed by the original unanchored data rule', errors };
    await fs.mkdir(path.join(root, 'artifacts/deployment-fix'), { recursive: true });
    await fs.writeFile(path.join(root, 'artifacts/deployment-fix/original-13-errors.json'), JSON.stringify(result, null, 2).replaceAll(snapshot.replaceAll('\\', '/'), '<snapshot>').replaceAll(snapshot.replaceAll('\\', '\\\\'), '<snapshot>'));
    console.log(JSON.stringify(result, null, 2).replaceAll(snapshot, '<snapshot>'));
  }
} finally {
  if (path.dirname(snapshot) !== temporaryRoot || !path.basename(snapshot).startsWith('getafe-failed-build-')) throw new Error('Invalid reproduction directory.');
  await fs.rm(snapshot, { recursive: true, force: true });
}
