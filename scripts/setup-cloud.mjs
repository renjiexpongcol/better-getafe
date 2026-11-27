import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const args = process.argv.slice(2);
const resources = { supabase: 'lgu-getafe-db', redis: 'redis-bistre-prism' };
const help = () => console.info(`Cloud connections for lgu-getafe / better-getafe
  npm run setup:database                 Verify only the database connection
  npm run setup:cloud                    Inspect linked resources and verify the local database
  npm run setup:cloud -- --open supabase Open the existing Supabase resource through Vercel SSO
  npm run setup:cloud -- --open redis    Open the existing Redis resource through Vercel SSO

The existing Vercel integrations supply deployment credentials automatically.
Manage resource/project/environment connections in Vercel's Storage tab:
https://vercel.com/lgu-getafe/better-getafe/stores
No credentials are written to Git, no resources are created, and no migrations run.
The fully initialized portal still needs its schema, session registry, stable encryption key and configured storage.`);

async function main() {
  if (args.includes('--help')) { help(); return; }
  if (args.length && !(args.length === 2 && args[0] === '--open' && Object.hasOwn(resources, args[1]))) throw new Error('Use --help or --open supabase|redis.');
  const project = JSON.parse(await fs.readFile(path.join(root, '.vercel/project.json'), 'utf8'));
  if (project.projectId !== 'prj_0gnvJzzefBfHs8lA5ZHW5TfiaR55' || project.orgId !== 'team_ExgHnpLZqFySC6I8bvkQEwOA') throw new Error('Link this checkout to the existing lgu-getafe/better-getafe Vercel project first.');
  help();
  const provider = args[1];
  // Fixed arguments only. Native CLI handles its own authenticated SSO/browser
  // flow. Its output may contain a temporary SSO URL, so never print it here.
  const command = provider ? ['open', provider, resources[provider]] : ['list', 'better-getafe'];
  const npmCli = process.env.npm_execpath;
  if (!npmCli || path.basename(npmCli) !== 'npm-cli.js') throw new Error('Run this command through npm run setup:cloud.');
  const result = spawnSync(process.execPath, [npmCli, 'exec', '--yes', '--package=vercel@50.44.0', '--', 'vercel', 'integration', ...command, '--scope', 'lgu-getafe'], {
    cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error('Vercel inspection/SSO could not finish. Sign in with the Vercel CLI and use the existing project Storage tab. Credential output was withheld.');
  if (provider) {
    console.info(`[Cloud] Opened the existing ${provider} resource through Vercel's authorized SSO flow. Complete any browser authorization there.`);
    return;
  }
  for (const [name, resource] of Object.entries(resources)) {
    console.info(`[Cloud] ${name}: ${(result.stdout + result.stderr).includes(resource) ? 'resource connected to this Vercel project' : 'connection not confirmed; review Storage in Vercel'}.`);
  }
  const database = spawnSync(process.execPath, ['scripts/dev-runner.mjs', '--database-only'], {
    cwd: root, stdio: 'inherit', timeout: 20000, windowsHide: true,
    env: { ...process.env, CI: 'true' },
  });
  if (database.error || database.status !== 0) throw new Error('Local database verification is incomplete. Vercel-sensitive variables are not exportable as local credentials; existing local values were preserved.');
}

main().catch(error => { console.error(`[Cloud] ${error.message}`); process.exitCode = 1; });
