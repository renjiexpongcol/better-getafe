import { definitions } from './defaults.js';
export function environmentValue(key, env = process.env) {
  const d = definitions[key];
  for (const name of d.env) {
    if (env[name] !== undefined && env[name] !== '') {
      const raw = env[name];
      return d.type === 'boolean' ? raw === 'true' : d.type === 'number' ? Number(raw) : raw;
    }
  }
  return undefined;
}
