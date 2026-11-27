import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {chromium} from 'playwright';
import {totp} from '../server/src/services/mfa.js';

const index=process.argv.indexOf('--base-url'),origin=new URL(index<0?'https://better-getafe-mgywdjnur-lgu-getafe.vercel.app':process.argv[index+1]).origin;
if(!process.argv.includes('--confirm-isolated-preview')||!/^https:\/\/better-getafe-[a-z0-9]+-lgu-getafe\.vercel\.app$/.test(origin))throw Error('Explicitly confirm the verified isolated Preview before using its initial administrator fixture.');
const env=dotenv.parse(await fs.readFile('.vercel/recovery-preview.env'));
const setup=JSON.parse(await fs.readFile('data/first-administrator-setup.json','utf8'));
if(setup.projectRef!=='dddezkhdlboujgivqvgg'||env.SUPABASE_PROJECT_REF!==setup.projectRef||env.PREVIEW_DATA_ISOLATED!=='true')throw Error('Preview and setup identities are not verified.');
const trusted=env.VERCEL_OIDC_TOKEN;if(!trusted)throw Error('Refresh the ignored Preview environment pull to obtain a short-lived deployment access token.');
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),results=[];let csrf;
const headers=()=>({Origin:origin,'x-vercel-trusted-oidc-idp-token':trusted,...(csrf?{'X-CSRF-Token':csrf}:{})});
const get=path=>context.request.get(origin+path,{headers:headers()});
const post=(path,data)=>context.request.post(origin+path,{headers:headers(),data});
try{
  const ready=await get('/api/ready');assert.equal(ready.status(),200);const health=await ready.json();assert.equal(health.ready,true);assert.equal(health.databaseSchema,'healthy');
  results.push({name:'Cloud database, Redis and Azure readiness',passed:true,health});
  csrf=(await(await get('/api/auth/csrf')).json()).token;
  const login=await(await post('/api/auth/login',{email:setup.email,password:setup.password,remember:false})).json();assert.equal(login.mfaRequired,true);
  const verify=await post('/api/auth/mfa/verify',{challengeId:login.mfaChallengeId,code:totp(new URL(setup.authenticatorUri).searchParams.get('secret'),Math.floor(Date.now()/30000))});assert.equal(verify.status(),200);
  csrf=(await(await get('/api/auth/csrf')).json()).token;
  const sessionCookies=(await context.cookies(origin+'/api')).filter(cookie=>cookie.name==='getafe_session'&&cookie.httpOnly);
  assert.ok(sessionCookies.length);assert.ok(sessionCookies.every(cookie=>cookie.secure));
  const inspection=await get('/api/admin/settings/database-management');assert.equal(inspection.status(),200);const report=await inspection.json();assert.equal(report.state,'healthy');assert.equal(report.identity.instance,'8a05e4ad-d12d-4959-b35f-5597e315f6b5');
  results.push({name:'Real cloud MFA, secure HttpOnly cookies and protected database inspection',passed:true,cookieAttributes:sessionCookies.map(({name,httpOnly,secure,sameSite})=>({name,httpOnly,secure,sameSite}))});
  await context.route('**/*',async route=>{const request=route.request();await route.continue({headers:{...request.headers(),...(new URL(request.url()).origin===origin?{'x-vercel-trusted-oidc-idp-token':trusted}:{})}});});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.name));await page.goto(origin+'/admin/settings/database',{waitUntil:'networkidle',timeout:60000});
  await page.getByRole('heading',{name:'Database management',exact:true}).waitFor({timeout:30000});assert.ok(await page.getByText('healthy',{exact:true}).count());assert.deepEqual(errors,[]);
  await fs.mkdir('data/recovery',{recursive:true});await page.screenshot({path:'data/recovery/vercel-database-management.png',fullPage:true});
  results.push({name:'Real deployed admin interface renders live database state without browser exceptions',passed:true});
  assert.equal((await post('/api/auth/logout',{})).status(),200);
  assert.equal((await get('/api/admin/settings/database-management')).status(),401);
  results.push({name:'Cloud logout revokes protected access',passed:true});
  console.info(JSON.stringify({origin,passed:results.length}));
}finally{
  await post('/api/auth/logout',{}).catch(()=>{});await browser.close();
  await fs.writeFile('artifacts/recovery/preview-verification.json',JSON.stringify({origin,checkedAt:new Date().toISOString(),results},null,2)+'\n');
}
