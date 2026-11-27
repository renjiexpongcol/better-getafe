import fs from 'node:fs/promises';
/* global document, window */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {totp} from '../server/src/services/mfa.js';
import {randomUUID} from 'node:crypto';

const origin='http://localhost:5173';
const setup=JSON.parse(await fs.readFile('data/first-administrator-setup.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1100}});
const results=[];let csrf;
let articleId;
async function post(path,body){return context.request.post(origin+path,{headers:{Origin:origin,'X-CSRF-Token':csrf},data:body});}
try{
  let ready=false;for(let attempt=0;attempt<60;attempt++){try{if((await fetch(origin+'/api/ready',{signal:AbortSignal.timeout(2000)})).status===200){ready=true;break;}}catch{/* A watched source change may still be restarting the local server. */}await new Promise(resolve=>setTimeout(resolve,500));}assert.equal(ready,true,'The real portal must be ready before UI verification.');
  csrf=(await(await context.request.get(origin+'/api/auth/csrf')).json()).token;
  const login=await(await post('/api/auth/login',{email:setup.email,password:setup.password,remember:false})).json();assert.equal(login.mfaRequired,true);
  const verify=await post('/api/auth/mfa/verify',{challengeId:login.mfaChallengeId,code:totp(new URL(setup.authenticatorUri).searchParams.get('secret'),Math.floor(Date.now()/30000))});assert.equal(verify.status(),200);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.name));
  await page.goto(origin+'/admin/settings/database',{waitUntil:'networkidle',timeout:60000});
  await page.getByRole('heading',{name:'Database management',exact:true}).waitFor({timeout:30000});
  await page.getByRole('button',{name:'Inspect complete database',exact:true}).waitFor();
  assert.ok(await page.getByText('healthy',{exact:true}).count());
  await fs.mkdir('data/recovery',{recursive:true});await page.screenshot({path:'data/recovery/database-management-desktop.png',fullPage:true});
  results.push({name:'Authenticated real admin page renders complete live database inspection',passed:true});
  await page.getByRole('button',{name:'Test connection',exact:true}).click();await page.getByText('Database connection verified.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Validate complete schema',exact:true}).click();await page.getByText('Schema validation: healthy.',{exact:true}).waitFor();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export health report',exact:true}).click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'database-health.json');
  results.push({name:'Connection, complete schema validation and report download controls work',passed:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'data/recovery/database-management-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Database management must fit a mobile viewport.');assert.deepEqual(errors,[]);
  results.push({name:'Mobile layout fits viewport without browser exceptions',passed:true});
  csrf=(await(await context.request.get(origin+'/api/auth/csrf')).json()).token;
  const article={title:'Recovery verification '+randomUUID(),excerpt:'Disposable isolated recovery check.',content:'<p>Disposable integration verification.</p>',status:'draft',content_type:'news'};
  const created=await post('/api/news/drafts',article);assert.equal(created.status(),201);const draft=await created.json();articleId=draft.id;
  assert.equal((await fetch(origin+'/api/news/'+draft.slug)).status,404,'Draft content must remain private.');
  const published=await context.request.put(origin+'/api/news/'+articleId,{headers:{Origin:origin,'X-CSRF-Token':csrf},data:{...article,status:'published',slug:draft.slug}});assert.equal(published.status(),200);
  const publicRead=await fetch(origin+'/api/news/'+draft.slug);assert.equal(publicRead.status,200);assert.equal((await publicRead.json()).id,articleId);
  const removed=await context.request.delete(origin+'/api/news/'+articleId,{headers:{Origin:origin,'X-CSRF-Token':csrf}});assert.equal(removed.status(),204);articleId=null;
  results.push({name:'Real content draft creation, anonymous draft denial, publication, public read and owned-fixture deletion',passed:true});
  console.info(JSON.stringify({passed:results.length,results}));
}finally{
  if(articleId)await context.request.delete(origin+'/api/news/'+articleId,{headers:{Origin:origin,'X-CSRF-Token':csrf}}).catch(()=>{});
  if(csrf)await post('/api/auth/logout',{}).catch(()=>{});await browser.close();
  await fs.writeFile('artifacts/recovery/ui-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2)+'\n');
}
