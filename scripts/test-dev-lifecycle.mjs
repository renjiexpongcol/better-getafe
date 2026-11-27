import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

test('the dev runner gates workers, restarts the process pair and drains children on disconnect', { timeout: 25000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'getafe-bootstrap-'));
  const file = name => path.join(root, name);
  for (const dir of ['scripts', 'server/src/config', 'server/src/infrastructure/redis', 'server/src/.cache']) await fs.mkdir(file(dir), { recursive: true });
  await fs.writeFile(file('package.json'), '{"type":"module"}');
  await fs.copyFile(new URL('./dev-runner.mjs', import.meta.url), file('scripts/dev-runner.mjs'));
  await fs.copyFile(new URL('./dependency-preflight.mjs', import.meta.url), file('scripts/dependency-preflight.mjs'));
  await fs.copyFile(new URL('./readiness-probe.mjs', import.meta.url), file('scripts/readiness-probe.mjs'));
  await fs.copyFile(new URL('../server/src/infrastructure/redis/redisConfiguration.js', import.meta.url), file('server/src/infrastructure/redis/redisConfiguration.js'));
  await fs.writeFile(file('server/src/config/supabaseSetup.js'), `
    export function selectedCmsUrl() { return 'fixture'; }
    export function loadLocalEnvironment() {}
    export function ensureSupabaseConfigured() { throw Error('duplicate preflight'); }
    export function checkBetterGetafeSchema() { throw Error('duplicate schema check'); }
  `);
  const logging = `
    import { appendFileSync, existsSync } from 'node:fs';
    const log = value => appendFileSync('events', value + '\\n');
  `;
  await fs.writeFile(file('server.js'), logging + `
    log('backend started');
    let previous;
    const timer = setInterval(() => {
      const ready = existsSync('ready');
      if (ready !== previous && process.connected) {
        previous = ready;
        process.send({ type: 'portal-readiness', ready });
      }
    }, 30);
    process.once('disconnect', () => { clearInterval(timer); log('backend closed'); });
  `);
  await fs.writeFile(file('server/integration-worker.js'), logging + `
    log('worker started');
    process.once('disconnect', () => log('worker closed'));
  `);
  await fs.mkdir(file('server/data'), { recursive: true });
  const listener = createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const runner = fork(file('scripts/dev-runner.mjs'), {
    cwd: root, execArgv: [], windowsHide: true, silent: true,
    env: { ...process.env, REDIS_URL: '', MY_REDIS_REDIS_URL: 'rediss://user:fixture@example-managed-redis.invalid:6380', VITE_PORT: String(port) },
  });
  let diagnostic = '';
  runner.stderr.on('data', data => { diagnostic += data; });
  const closed = once(runner, 'exit');
  t.after(async () => {
    if (runner.connected) runner.disconnect();
    await closed;
    await fs.rm(root, { force: true, recursive: true });
  });
  async function waitFor(event, count) {
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      const events = (await fs.readFile(file('events'), 'utf8').catch(() => '')).trim().split('\n');
      if (events.filter(line => line === event).length >= count) return events;
      if (runner.exitCode !== null) break;
      await delay(40);
    }
    assert.fail('Missing ' + event + ': ' + diagnostic + ' events=' + await fs.readFile(file('events'), 'utf8').catch(() => 'none'));
  }
  assert.deepEqual(await waitFor('backend started', 1), ['backend started']);
  await fs.writeFile(file('server/data/runtime-cache.json'), '{"updated":true}');
  await fs.writeFile(file('server/src/.cache/generated.js'), 'export default true;');
  await delay(500);
  assert.deepEqual((await fs.readFile(file('events'), 'utf8')).trim().split('\n'), ['backend started'], 'generated data changes must not restart the backend');
  await fs.writeFile(file('ready'), '');
  await waitFor('worker started', 1);
  await fs.unlink(file('ready'));
  await waitFor('worker closed', 1);
  await fs.writeFile(file('ready'), '');
  await waitFor('worker started', 2);
  await fs.appendFile(file('server/src/config/supabaseSetup.js'), '\n// edit');
  const events = await waitFor('worker started', 3);
  assert.ok(events.indexOf('backend closed') < events.lastIndexOf('backend started'));
  assert.ok(events.lastIndexOf('worker closed') < events.lastIndexOf('backend started'));
  runner.disconnect();
  assert.equal((await closed)[0], 0);
  const final = await fs.readFile(file('events'), 'utf8');
  assert.equal(final.match(/backend closed/g).length, 2);
  assert.equal(final.match(/worker closed/g).length, 3);
});

