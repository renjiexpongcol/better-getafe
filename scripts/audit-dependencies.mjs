import fs from 'node:fs/promises';
import path from 'node:path';
import { builtinModules, createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parse } from 'espree';
import ignore from 'ignore';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const slash = value => value.replaceAll('\\', '/');
const relative = value => slash(path.relative(root, value));
const builtins = new Set(builtinModules.map(value => value.replace(/^node:/, '')));
const packageName = value => value.startsWith('@') ? value.split('/').slice(0, 2).join('/') : value.split('/')[0];
const files = [], manifests = [];
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'build', '.cache'].includes(entry.name)) continue;
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(name);
    else if (entry.name === 'package.json') manifests.push({ directory, file: relative(name), value: JSON.parse(await fs.readFile(name, 'utf8')) });
    else if (/\.(?:js|mjs|cjs|jsx|css)$/.test(entry.name)) files.push(name);
  }
}
manifests.push({ directory: root, file: 'package.json', value: JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) });
for (const directory of ['src', 'server', 'scripts', 'apps', 'packages', 'services', 'api']) await walk(path.join(root, directory));
for (const entry of await fs.readdir(root)) if (/\.(?:js|mjs|cjs)$/.test(entry)) files.push(path.join(root, entry));
manifests.sort((a, b) => b.directory.length - a.directory.length);
const owner = file => manifests.find(item => file.startsWith(item.directory + path.sep));
const problems = [], imports = [], unresolvedDynamicImports = [];
const graph = new Map();
const exportsByFile = new Map(), namedImports = [];
function bindingNames(node) {
  if (!node) return [];
  if (node.type === 'Identifier') return [node.name];
  if (node.type === 'ObjectPattern') return node.properties.flatMap(item => bindingNames(item.value || item.argument));
  if (node.type === 'ArrayPattern') return node.elements.flatMap(bindingNames);
  return bindingNames(node.left || node.argument);
}
const directoryNames = new Map();
async function exactCase(file) {
  let directory = root;
  for (const part of relative(file).split('/')) {
    if (!directoryNames.has(directory)) directoryNames.set(directory, new Set(await fs.readdir(directory)));
    if (!directoryNames.get(directory).has(part)) return false;
    directory = path.join(directory, part);
  }
  return true;
}
async function resolveRelative(file, specifier) {
  const clean = specifier.split('?')[0];
  const target = clean.startsWith('/') ? path.join(root, clean) : path.resolve(path.dirname(file), clean);
  const candidates = [target, ...['.js', '.jsx', '.mjs', '.json', '.css'].map(extension => target + extension), path.join(target, 'index.js'), path.join(target, 'index.jsx')];
  for (const candidate of candidates) { try { if ((await fs.stat(candidate)).isFile()) return candidate; } catch { /* Try Vite's extension resolution. */ } }
  return null;
}
for (const file of files) {
  const source = await fs.readFile(file, 'utf8');
  const refs = [];
  const exported = { local: new Set(), stars: [] };
  exportsByFile.set(file, exported);
  if (file.endsWith('.css')) {
    for (const match of source.matchAll(/@import\s+['"]([^'"]+)['"]/g)) refs.push({ specifier: match[1], dynamic: false });
  } else {
    const tree = parse(source, { ecmaVersion: 'latest', sourceType: file.endsWith('.cjs') ? 'script' : 'module', ecmaFeatures: { jsx: true }, loc: true });
    const visit = node => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'ExportDefaultDeclaration') exported.local.add('default');
      if (node.type === 'ExportNamedDeclaration') {
        if (node.declaration?.type === 'VariableDeclaration') {
          for (const declaration of node.declaration.declarations) for (const name of bindingNames(declaration.id)) exported.local.add(name);
        } else if (node.declaration?.id) exported.local.add(node.declaration.id.name);
        for (const item of node.specifiers || []) exported.local.add(item.exported.name || item.exported.value);
      }
      if (node.type === 'ExportAllDeclaration' && node.exported) exported.local.add(node.exported.name || node.exported.value);
      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type) && node.source) {
        const specifier = node.source.value ?? (node.source.type === 'TemplateLiteral' && node.source.expressions.length === 0 ? node.source.quasis[0].value.cooked : null);
        const requested = (node.specifiers || []).flatMap(item => item.type === 'ImportDefaultSpecifier' ? ['default'] : item.type === 'ImportSpecifier' ? [item.imported.name || item.imported.value] : item.type === 'ExportSpecifier' ? [item.local.name || item.local.value] : []);
        if (typeof specifier === 'string') refs.push({ specifier, dynamic: node.type === 'ImportExpression', line: node.loc.start.line, requested, star: node.type === 'ExportAllDeclaration' && !node.exported });
        else unresolvedDynamicImports.push({ file: relative(file), line: node.loc.start.line });
      }
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require' && typeof node.arguments[0]?.value === 'string') refs.push({ specifier: node.arguments[0].value, dynamic: false, line: node.loc.start.line });
      for (const [key, value] of Object.entries(node)) {
        if (key === 'loc') continue;
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
      }
    };
    visit(tree);
  }
  graph.set(file, []);
  for (const ref of refs) {
    const { specifier } = ref;
    if (builtins.has(specifier.replace(/^node:/, '')) || /^(?:https?:|data:)/.test(specifier)) continue;
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const resolved = await resolveRelative(file, specifier);
      if (!resolved) problems.push({ code: 'BROKEN_IMPORT', file: relative(file), ...ref });
      else {
        if ((relative(file).startsWith('src/') || relative(file).startsWith('apps/')) && relative(resolved).startsWith('server/')) {
          problems.push({ code: 'SERVER_IMPORT_IN_CLIENT', file: relative(file), ...ref });
        }
        if (!await exactCase(resolved)) problems.push({ code: 'IMPORT_CASE_MISMATCH', file: relative(file), ...ref });
        if (/^(?:server\/|api\/|scripts\/)/.test(relative(file)) && !file.endsWith('.css') && !path.extname(specifier)) {
          problems.push({ code: 'NODE_IMPORT_EXTENSION_MISSING', file: relative(file), ...ref });
        }
        graph.get(file).push(resolved);
        if (ref.star) exported.stars.push(resolved);
        if (ref.requested?.length) namedImports.push({ file, target: resolved, ...ref });
      }
      continue;
    }
    const name = packageName(specifier), manifest = owner(file);
    const declaration = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].find(section => Object.hasOwn(manifest.value[section] || {}, name));
    const item = { file: relative(file), owner: manifest.file, package: name, declaration: declaration || null, ...ref };
    imports.push(item);
    if (!declaration) problems.push({ code: 'UNDECLARED_DEPENDENCY', ...item });
    try {
      const resolved = createRequire(file).resolve(specifier);
      if (resolved.startsWith(path.join(root, 'packages') + path.sep)) {
        graph.get(file).push(resolved);
        if (ref.requested?.length) namedImports.push({ file, target: resolved, ...ref });
      }
      if (ref.star) exported.stars.push(resolved);
    }
    catch { problems.push({ code: 'UNRESOLVED_PACKAGE', ...item }); }
  }
}

function hasExport(file, name, seen = new Set()) {
  if (seen.has(file)) return false;
  const next = new Set([...seen, file]), exported = exportsByFile.get(file);
  if (!exported) return true; // Non-JavaScript assets are validated by Vite.
  return exported.local.has(name) || (name !== 'default' && exported.stars.some(target => hasExport(target, name, next)));
}
for (const ref of namedImports) {
  for (const name of ref.requested) if (!hasExport(ref.target, name)) problems.push({ code: 'MISSING_NAMED_EXPORT', file: relative(ref.file), specifier: ref.specifier, name, line: ref.line });
}

// Validate the production import closure, including literal lazy imports.
const runtime = new Set(), queue = ['server.js', 'api/index.js', 'server/managed-worker.js', 'server/integration-worker.js'].map(file => path.join(root, file));
while (queue.length) {
  const file = queue.pop();
  if (runtime.has(file)) continue;
  runtime.add(file);
  queue.push(...(graph.get(file) || []));
}
for (const item of imports) {
  if (!runtime.has(path.join(root, item.file)) || item.declaration !== 'devDependencies') continue;
  // This import runs exclusively in the persistent local development branch.
  if (item.file === 'server/index.js' && item.package === 'vite' && item.dynamic) continue;
  problems.push({ code: 'DEVELOPMENT_DEPENDENCY_IN_RUNTIME', ...item });
}

const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
const normalized = value => JSON.stringify(Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b)));
for (const manifest of manifests) {
  const key = relative(manifest.directory), locked = lock.packages[key];
  if (!locked) { problems.push({ code: 'UNLOCKED_WORKSPACE', file: manifest.file }); continue; }
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'engines']) {
    if (normalized(manifest.value[section]) !== normalized(locked[section])) problems.push({ code: 'LOCKFILE_MISMATCH', file: manifest.file, section });
  }
}

// Strongly connected components distinguish existing module cycles from errors.
let sequence = 0;
const indexes = new Map(), low = new Map(), stack = [], active = new Set(), cycles = [];
function connect(file) {
  indexes.set(file, sequence); low.set(file, sequence++); stack.push(file); active.add(file);
  for (const next of graph.get(file) || []) {
    if (!indexes.has(next)) { connect(next); low.set(file, Math.min(low.get(file), low.get(next))); }
    else if (active.has(next)) low.set(file, Math.min(low.get(file), indexes.get(next)));
  }
  if (indexes.get(file) !== low.get(file)) return;
  const group = [];
  let next;
  do { next = stack.pop(); active.delete(next); group.push(relative(next)); } while (next !== file);
  if (group.length > 1) cycles.push(group.sort());
}
for (const file of graph.keys()) if (!indexes.has(file)) connect(file);
const deprecated = Object.entries(lock.packages).filter(([, entry]) => entry.deprecated).map(([name, entry]) => ({ path: name, version: entry.version, reason: entry.deprecated }));
// A local build can pass while an ignore rule removes required uploaded source.
// Check every inspected module and resolved relative import against the rules.
const deploymentSources = [...new Set([...files, ...[...graph.values()].flat()])].map(relative);
const deploymentIgnore = ignore().add(await fs.readFile(path.join(root, '.vercelignore'), 'utf8'));
for (const file of deploymentSources.filter(file => deploymentIgnore.ignores(file))) problems.push({ code: 'DEPLOYMENT_SOURCE_EXCLUDED', file });
const versions = new Map();
for (const [location, entry] of Object.entries(lock.packages)) {
  if (!location.includes('node_modules/') || entry.link) continue;
  const name = location.split('node_modules/').at(-1);
  if (!versions.has(name)) versions.set(name, new Map());
  const list = versions.get(name);
  if (!list.has(entry.version)) list.set(entry.version, []);
  list.get(entry.version).push(location);
}
const multipleVersions = [...versions].filter(([, values]) => values.size > 1).map(([name, values]) => ({ name, versions: Object.fromEntries(values) }));
const result = { files: files.length, workspaces: manifests.length - 1, productionModules: runtime.size, imports, problems, cycles, unresolvedDynamicImports, deprecated, multipleVersions };
await fs.mkdir(path.join(root, 'artifacts/dependency-audit'), { recursive: true });
await fs.writeFile(path.join(root, 'artifacts/dependency-audit/imports.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ files: result.files, workspaces: result.workspaces, productionModules: runtime.size, problems: problems.length, cycles: cycles.length, deprecated: deprecated.length }));
for (const problem of problems) console.error(`${problem.code}: ${problem.file} ${problem.specifier || problem.section || ''} (${problem.owner || ''})`);
if (problems.length) process.exitCode = 1;
