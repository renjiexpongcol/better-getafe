import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

const root = fileURLToPath(new URL('../', import.meta.url));
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all']);
const evaluate = (node, bindings, file) => {
  if (node.type === 'Literal') return node.regex ? { regex: node.regex.pattern } : node.value;
  if (node.type === 'Identifier' && Object.hasOwn(bindings, node.name)) return bindings[node.name];
  if (node.type === 'ArrayExpression') return node.elements.map(item => evaluate(item, bindings, file));
  if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.map(item => [item.key.name || item.key.value, evaluate(item.value, bindings, file)]));
  if (node.type === 'TemplateLiteral') return node.quasis.reduce((value, part, index) => value + part.value.cooked + (node.expressions[index] ? evaluate(node.expressions[index], bindings, file) : ''), '');
  if (node.type === 'BinaryExpression' && node.operator === '+') return evaluate(node.left, bindings, file) + evaluate(node.right, bindings, file);
  if (node.type === 'CallExpression' && node.callee.object?.name === 'Object' && node.callee.property?.name === 'entries') return Object.entries(evaluate(node.arguments[0], bindings, file));
  throw new Error(`Cannot enumerate route expression ${node.type} in ${file} at line ${node.loc.start.line}; add explicit enumeration support.`);
};

function staticBindings(tree, file) {
  const bindings = {};
  const collect = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init) {
      try { bindings[node.id.name] = evaluate(node.init, bindings, file); } catch { /* Non-static declarations are not route paths. */ }
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'range'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') collect(value);
    }
  };
  // Repeat to resolve simple aliases declared before their dependencies.
  for (let pass = 0; pass < 3; pass++) collect(tree);
  return bindings;
}

export async function discoverRoutes() {
  const files = [];
  async function scan(directory) {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      if (item.isDirectory()) await scan(path.join(directory, item.name));
      else if (item.name.endsWith('.js')) files.push(path.join(directory, item.name));
    }
  }
  await scan(path.join(root, 'server'));
  files.push(path.join(root, 'server.js'));
  const routes = [];
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    const tree = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'module', loc: true, range: true });
    const bindings = staticBindings(tree, path.relative(root, file).replaceAll('\\', '/'));
    function visit(node, bindings = {}) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'ForOfStatement') {
        // Only route-producing loops need expansion; handler loops are visited normally.
        const body = source.slice(...node.body.range);
        if (/\b(?:app|router)\.(?:get|post|put|patch|delete|head|options|all)\s*\(/.test(body)) {
          const pattern = node.left.declarations[0].id;
          for (const value of evaluate(node.right, bindings)) {
            const expanded = { ...bindings };
            if (pattern.type === 'Identifier') expanded[pattern.name] = value;
            else pattern.elements.forEach((item, index) => { expanded[item.name] = value[index]; });
            visit(node.body, expanded);
          }
          return;
        }
      }
      if (node.type === 'CallExpression' && ['app', 'router'].includes(node.callee.object?.name)) {
        const method = node.callee.computed ? evaluate(node.callee.property, bindings, path.relative(root, file)) : node.callee.property?.name;
        if (methods.has(method) && node.arguments.length) {
          const values = evaluate(node.arguments[0], bindings, path.relative(root, file));
          for (const value of Array.isArray(values) ? values : [values]) {
            if (typeof value !== 'string' && !value?.regex) throw new Error(`Unsupported route in ${file}`);
            routes.push({ method: method.toUpperCase(), path: value?.regex ? '/api/storage/local-upload/*' : value, regex: value?.regex, file: path.relative(root, file).replaceAll('\\', '/'), line: node.loc.start.line, guards: source.slice(node.arguments[0].range[1], node.range[1]).slice(0, 240) });
          }
        }
      }
      for (const [key, value] of Object.entries(node)) {
        if (['loc', 'range'].includes(key)) continue;
        if (Array.isArray(value)) value.forEach(item => visit(item, bindings));
        else if (value && typeof value === 'object') visit(value, bindings);
      }
    }
    visit(tree, bindings);
  }
  const aliases = routes
    .filter(route => route.path.startsWith('/api/') && !route.path.startsWith('/api/v1/'))
    .map(route => ({ ...route, path: `/api/v1${route.path.slice('/api'.length)}`, aliasOf: route.path }))
  return [...routes, ...aliases];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const routes = await discoverRoutes();
  await fs.writeFile(path.join(root, 'docs/API_ENDPOINTS.json'), JSON.stringify(routes, null, 2) + '\n');
  console.log(`Enumerated ${routes.length} method/path handlers, including aliases, loops, regex and non-/api endpoints.`);
}
