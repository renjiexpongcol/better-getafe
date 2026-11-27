// Keep this module dependency-free: it must work before npm packages load.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

export function checkInstalledDependencies({ root = repositoryRoot, development = false, version = process.versions.node, resolve } = {}) {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const major = Number(version.split('.')[0]);
  if (manifest.engines?.node === '24.x' && major !== 24) {
    throw Object.assign(new Error('Use Node.js 24.x, then run npm ci from the repository root.'), { code: 'NODE_VERSION_UNSUPPORTED' });
  }
  const require = createRequire(path.join(root, 'package.json'));
  const find = resolve || (name => require.resolve(name));
  const dependencies = { ...manifest.dependencies, ...(development ? manifest.devDependencies : {}) };
  const missing = [];
  for (const name of Object.keys(dependencies)) {
    try {
      const entry = find(name.startsWith('@types/') ? `${name}/package.json` : name);
      if (!existsSync(entry)) missing.push(name);
    } catch { missing.push(name); }
  }
  if (missing.length) {
    throw Object.assign(new Error(`Missing or incomplete ${development ? 'development/runtime' : 'runtime'} dependencies: ${missing.join(', ')}. Stop other installs and run npm ci${development ? ' --include=dev' : ''} from the repository root, then retry.`), { code: 'DEPENDENCIES_MISSING', dependencies: missing });
  }
}

export function reportStartupDependencyError(error, write = console.error) {
  if (['DEPENDENCIES_MISSING', 'NODE_VERSION_UNSUPPORTED'].includes(error?.code)) {
    write(`[Dependencies] ${error.message}`);
    return;
  }
  const name = String(error?.message || '').match(/Cannot find package '(@?[\w.-]+(?:\/[\w.-]+)?)'/)?.[1];
  write(`[Dependencies] ${name ? `Package ${name} could not be loaded.` : 'A required startup module could not be loaded.'} Run npm ci --include=dev from the repository root after other installs finish. If this persists, run npm run audit:dependencies. No restart was attempted.`);
}
