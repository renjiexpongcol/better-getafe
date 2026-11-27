import { definitions } from './defaults.js';
export function environmentValue(key, env = process.env) {
  if(key==='general.url'&&!env.APP_URL&&!env.PUBLIC_SITE_URL&&env.VERCEL_URL)return `https://${env.VERCEL_URL}`;
  const d = definitions[key];
  for (const name of d.env) {
    if (env[name] !== undefined && env[name] !== '') {
      const raw = env[name];
      return d.type === 'boolean' ? raw === 'true' : d.type === 'number' ? Number(raw) : raw;
    }
  }
  return undefined;
}
