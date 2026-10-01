import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { createClient } from 'redis';
import { chromium } from 'playwright';
import { hashPassword } from '../server/src/services/passwordHashing.js';
import { stateKey } from '../server/src/services/authState.js';
import { redisKeys } from '../server/src/infrastructure/redis/redisKeys.js';

const base = process.env.CONNECTIVITY_TEST_URL || 'http://127.0.0.1:4176';
const degraded = process.argv.includes('--degraded');
const pool = new pg.Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : { host:process.env.DB_HOST || '127.0.0.1', port:Number(process.env.DB_PORT || 5432), database:process.env.DB_NAME || 'getafe_portal', user:process.env.DB_USER || 'getafe_app', password:process.env.DB_PASSWORD });
const redis = createClient({ url:process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
const id = crypto.randomUUID(), email = `connectivity-${id}@example.invalid`, password = crypto.randomBytes(24).toString('base64url') + 'aA9!';
let browser, officeId;
try {
  const deadline = Date.now() + 60000;
  while (true) {
    try { if ((await fetch(base+'/api/health/live', { signal:AbortSignal.timeout(2000) })).status === 200) break; } catch { /* Watcher may be restarting. */ }
    if (Date.now() > deadline) throw new Error('API did not become reachable before the live check.');
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  await redis.connect();
  await pool.query('INSERT INTO users (id,name,email,password,role,created_at,updated_at,avatar_storage_path) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,$6)', [id,'Connectivity fixture',email,await hashPassword(password),'super_admin', `private/avatars/${id}.png`]);
  await redis.set(redisKeys.authState(stateKey('verified',id)), JSON.stringify({value:true,expires:Date.now()+900000}),{PX:900000});
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  const failures = [], exceptions = [], counts = {};
  page.on('pageerror', error => exceptions.push(error.name));
  page.on('requestfailed', request => { const reason = request.failure()?.errorText; if (request.url().includes('/api/') && reason !== 'net::ERR_ABORTED') failures.push(reason); });
  page.on('request', request => { const path = new URL(request.url()).pathname; if (path.startsWith('/api/')) counts[path] = (counts[path] || 0) + 1; });
  await page.goto(base+'/auth/login');
  await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(password);
  const loginResponse = page.waitForResponse(response=>response.url().endsWith('/api/auth/login') && response.request().method()==='POST');
  await page.locator('button[type=submit]').click(); assert.equal((await loginResponse).status(),200);
  await page.waitForURL(/\/admin(?:\/|$)/);
  const statuses = await page.evaluate(async () => {
    const output = {};
    for (const path of ['/api/health','/api/health/live','/api/ready','/api/public/config','/api/account/avatar','/api/admin/departments','/api/admin/departments/options','/api/media?limit=100']) {
      const response = await fetch(path, { credentials:'include' }); output[path] = response.status;
    }
    return output;
  });
  for (const [path,status] of Object.entries(statuses)) assert.equal(status, path === '/api/account/avatar' ? degraded ? 503 : 404 : 200, path);
  if (!degraded) {
    await page.goto(base+'/admin/departments');
    await page.getByRole('button',{name:'Create office',exact:true}).waitFor({state:'visible'});
    await page.getByRole('button',{name:'Create office',exact:true}).click();
    const officeName = `Connectivity office ${id}`;
    await page.getByLabel('Office name',{exact:true}).fill(officeName); await page.getByLabel('URL slug',{exact:true}).fill(`connectivity-${id}`);
    await page.getByRole('button',{name:'Save office',exact:true}).click();
    await page.getByRole('button',{name:`Edit ${officeName}`,exact:true}).waitFor();
    const row = await pool.query('SELECT id FROM departments WHERE slug=$1',[`connectivity-${id}`]); officeId = row.rows[0].id;
    await page.getByRole('button',{name:`Edit ${officeName}`,exact:true}).click();
    await page.getByLabel('Short description',{exact:true}).fill('Connectivity verification');
    await page.getByRole('button',{name:'Save office',exact:true}).click();
    await page.getByRole('button',{name:`Edit ${officeName}`,exact:true}).waitFor();
    await page.reload(); await page.getByRole('button',{name:`Edit ${officeName}`,exact:true}).waitFor();
    await page.goto(base+'/admin/media');
    await page.waitForResponse(response=>new URL(response.url()).pathname==='/api/media' && response.status()===200);
    assert.equal(await page.getByText('Media library unavailable.',{exact:false}).count(),0);
    assert.deepEqual(failures,[]); assert.deepEqual(exceptions,[]);
    // Failure rendering is separate from success/authorization verification.
    await page.route('**/api/admin/departments*', route=>route.abort('connectionrefused'));
    await page.goto(base+'/admin/departments'); await page.getByRole('button',{name:'Try again',exact:true}).waitFor();
    assert.equal(await page.getByText('No departments or offices have been created yet.').count(),0);
    const before = counts['/api/admin/departments']; await page.waitForTimeout(2200); assert.equal(counts['/api/admin/departments'],before);
    await page.unroute('**/api/admin/departments*'); await page.getByRole('button',{name:'Try again',exact:true}).click();
    await page.getByRole('button',{name:`Edit ${officeName}`,exact:true}).waitFor();
    await page.route('**/api/media*',route=>route.abort('connectionrefused'));
    await page.goto(base+'/admin/media'); await page.getByRole('button',{name:'Try again',exact:true}).waitFor();
    assert.equal(await page.getByText('Your media library is empty').count(),0);
    assert.deepEqual(exceptions,[]);
  }
  console.log(JSON.stringify({mode:degraded?'storage-outage':'normal',statuses,browserExceptions:exceptions,createAndEditOffice:!degraded,refresh:!degraded,errorStates:!degraded}));
} finally {
  await browser?.close();
  if (officeId) await pool.query('DELETE FROM departments WHERE id=$1',[officeId]);
  if (redis.isOpen) { await redis.del(redisKeys.authState(stateKey('verified',id))); await redis.quit(); }
  await pool.query('DELETE FROM users WHERE id=$1',[id]); await pool.end();
}
