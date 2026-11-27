import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse } from 'espree';
import { discoverRoutes } from './route-inventory.mjs';
import { definitions } from '../server/src/config/defaults.js';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const slash = value => value.replaceAll('\\', '/');
const files = [];
async function walk(directory) {
  for (const entry of await fs.readdir(path.join(root, directory), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.cache'].includes(entry.name) || (directory==='server'&&entry.name==='data')) continue;
    const name = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await walk(name);
    else if (/\.(?:js|jsx|mjs|sql|json)$/.test(name)) files.push(name);
  }
}
for (const directory of ['server', 'api', 'src', 'apps', 'packages', 'services', 'database','scripts']) await walk(directory);
const modules = new Map(), sql = [], frontend = [], migrations = [], declaredObjects = new Map();
const sqlTables = text => [...new Set([...text.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE|REFERENCES|TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+(?:public\.)?"?([a-z_][a-z0-9_]*)/gi)].map(match => match[1].toLowerCase()))];
for (const file of files) {
  const text = await fs.readFile(path.join(root, file), 'utf8');
  if (file.endsWith('.sql')) {
    const checksum = createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');
    migrations.push({ file, checksum, references: sqlTables(text), statements: [...text.matchAll(/\b(CREATE|ALTER|INSERT|UPDATE|DELETE|GRANT|REVOKE)\b/gi)].length });
    for (const match of text.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(TABLE|(?:MATERIALIZED\s+)?VIEW|FUNCTION|PROCEDURE|(?:UNIQUE\s+)?INDEX|SEQUENCE|EXTENSION|TYPE|TRIGGER|POLICY)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)/gi)) {
      const key = `${match[1].toUpperCase()}:${match[2]}`;
      if (!declaredObjects.has(key)) declaredObjects.set(key, { kind: match[1].toUpperCase(), name: match[2], migrations: [] });
      declaredObjects.get(key).migrations.push(file);
    }
    continue;
  }
  if (!/\.(?:js|jsx|mjs)$/.test(file)) continue;
  const tree = parse(text, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, loc: true, range: true });
  const info = { file, imports: [], functions: new Map(), routes: new Map(), configuration: [...new Set([...text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map(match => match[1]))] };
  modules.set(file, info);
  for (const statement of tree.body) if (statement.type === 'ImportDeclaration') {
    const source = statement.source.value;
    let target = null;
    if (source.startsWith('.')) {
      const base = path.resolve(root, path.dirname(file), source);
      for (const suffix of ['', '.js', '.jsx', '.mjs', '/index.js']) {
        try { if ((await fs.stat(base + suffix)).isFile()) { target = slash(path.relative(root, base + suffix)); break; } } catch { /* Report unresolved imports with the dependency audit. */ }
      }
    }
    for (const item of statement.specifiers) info.imports.push({ local: item.local.name, imported: item.imported?.name || 'default', target, package: target ? undefined : source });
  }
  function visit(node, owner, binding) {
    if (!node || typeof node !== 'object') return;
    let current = owner;
    if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) {
      const name = node.id?.name || binding || `anonymous:${node.loc.start.line}`;
      current = { name, line: node.loc.start.line, calls: new Set(), tables: new Set(), sql: [], computedSQL: false };
      info.functions.set(name, current);
    }
    if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' && ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all', 'use'].includes(node.callee.property?.name)) info.routes.set(node.loc.start.line, node);
    if (node.type === 'CallExpression' && current) {
      if (node.callee.type === 'Identifier') current.calls.add(node.callee.name);
      const method = node.callee.property?.name;
      if (['query', 'execute', 'prepare', 'exec', 'read', 'write'].includes(method) && node.arguments[0] && !['Literal', 'TemplateLiteral'].includes(node.arguments[0].type)) current.computedSQL = true;
    }
    const value = node.type === 'Literal' && typeof node.value === 'string' ? node.value : node.type === 'TemplateLiteral' ? node.quasis.map(part => part.value.cooked).join('${dynamic}') : null;
    if (value && /\b(?:SELECT\s|INSERT INTO|UPDATE\s+\w+\s+SET|CREATE TABLE|DELETE FROM|ALTER TABLE)/i.test(value)) {
      const row = { file,scope:/test-|harness|reproduce-/.test(file)?'test':'application', line: node.loc.start.line, function: current?.name || null, tables: sqlTables(value), dynamic: value.includes('${dynamic}'), text: value };
      sql.push(row);
      if (current) { current.sql.push(sql.length - 1); row.tables.forEach(table => current.tables.add(table)); }
    }
    if (value && file.startsWith('src/') && /^\/api\//.test(value)) frontend.push({ file, line: node.loc.start.line, endpoint: value });
    for (const [key, child] of Object.entries(node)) {
      if (['loc', 'range'].includes(key)) continue;
      const nextBinding = node.type === 'VariableDeclarator' ? node.id?.name : null;
      if (Array.isArray(child)) child.forEach(value => visit(value, current, nextBinding));
      else if (child && typeof child === 'object') visit(child, current, nextBinding);
    }
  }
  visit(tree, null, null);
}
const tables = new Set([...declaredObjects.values()].filter(item => item.kind === 'TABLE').map(item => item.name));
function functionDependencies(file, name, seen = new Set()) {
  const key = `${file}#${name}`, result = { tables: new Set(), services: new Set(), sql: new Set(), configuration: new Set(), external: new Set(), computedSQL: false };
  if (seen.has(key)) return result;
  seen.add(key);
  const module = modules.get(file), fn = module?.functions.get(name);
  if (!fn) return result;
  result.services.add(key); fn.tables.forEach(table => result.tables.add(table)); fn.sql.forEach(index => result.sql.add(index));
  module.configuration.forEach(key => result.configuration.add(key)); result.computedSQL = fn.computedSQL;
  for (const call of fn.calls) {
    const imported = module.imports.find(item => item.local === call);
    if (imported?.package) { result.external.add(imported.package); continue; }
    const next = imported?.target ? functionDependencies(imported.target, imported.imported, seen) : functionDependencies(file, call, seen);
    for (const collection of ['tables', 'services', 'sql', 'configuration', 'external']) next[collection].forEach(value => result[collection].add(value));
    result.computedSQL ||= next.computedSQL;
  }
  return result;
}
const routes = await discoverRoutes();
const reverseImports=new Map();
for(const module of modules.values())for(const imported of module.imports)if(imported.target){if(!reverseImports.has(imported.target))reverseImports.set(imported.target,new Set());reverseImports.get(imported.target).add(module.file);}
function frontendImporters(file,seen=new Set()) {if(seen.has(file))return [];seen.add(file);return[file,...[...(reverseImports.get(file)||[])].filter(name=>name.startsWith('src/')||name.startsWith('apps/')).flatMap(name=>frontendImporters(name,seen))];}
const endpoints = routes.map(route => {
  const module = modules.get(route.file), node = module?.routes.get(route.line);
  const names = new Set();
  function collect(value) {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'Identifier') names.add(value.name);
    if (['FunctionExpression', 'ArrowFunctionExpression'].includes(value.type)) names.add(`anonymous:${value.loc.start.line}`);
    for (const [key, child] of Object.entries(value)) if (!['loc', 'range'].includes(key)) { if (Array.isArray(child)) child.forEach(collect); else if (child && typeof child === 'object') collect(child); }
  }
  if (node) node.arguments.slice(1).forEach(collect);
  const dependencies = { tables: new Set(), services: new Set(), sql: new Set(), configuration: new Set(), external: new Set(), computedSQL: false };
  for (const name of names) {
    const imported = module?.imports.find(item => item.local === name);
    const found = imported?.target ? functionDependencies(imported.target, imported.imported) : functionDependencies(route.file, name);
    for (const collection of ['tables', 'services', 'sql', 'configuration', 'external']) found[collection].forEach(value => dependencies[collection].add(value));
    dependencies.computedSQL ||= found.computedSQL;
  }
  const pathPrefix = route.path.split(/[:*?]/)[0].replace(/\/$/, '');
  const directFrontend=frontend.filter(item=>item.endpoint.split('/').filter(Boolean).length>1&&(item.endpoint.split('${')[0].startsWith(pathPrefix)||route.path.startsWith(item.endpoint.split('${')[0]))).map(item=>item.file);
  return { ...route, dependencies: Object.fromEntries(Object.entries(dependencies).map(([key, value]) => [key, value instanceof Set ? [...value].sort() : value])), frontend:[...new Set(directFrontend.flatMap(file=>frontendImporters(file)))],verification: 'not_executed', missingDeclaredTables: [...dependencies.tables].filter(table => !tables.has(table) && !/^(?:pg_|information_schema|json|unnest|generate_|excluded|set|select|lateral)/.test(table)) };
});
const report = { generatedBy: 'scripts/discover-system.mjs', limitations: ['Static function/import dependency tracing; computed SQL and object-method dispatch require runtime evidence.', 'Catalog expectations are derived separately by executing all migrations in a verified empty database.', 'No endpoint is marked operational merely because it was discovered.'], summary: { scannedFiles: files.length, handlers: endpoints.length, sqlQueries: sql.length,applicationSQL:sql.filter(row=>row.scope==='application').length, declaredTables: tables.size, migrations: migrations.length },settings:Object.entries(definitions).map(([key,definition])=>({key,environment:definition.env,secret:Boolean(definition.secret),category:key.split('.')[0]})),endpoints, sql, migrations, objects: [...declaredObjects.values()], frontend, workers: files.filter(file => /worker|scheduledJobs|redisInfrastructure/i.test(file)), modules: [...modules.values()].map(({ file, imports, configuration }) => ({ file, imports, configuration })) };
await fs.writeFile(path.join(root, 'database/system-inventory.json'), JSON.stringify(report, null, 2) + '\n');
console.info(JSON.stringify(report.summary));
