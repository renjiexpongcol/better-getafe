import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {loadLocalEnvironment} from '../server/src/config/supabaseSetup.js';
import {supabaseConnectionOptions} from '../server/src/services/postgres.js';
import {totp} from '../server/src/services/mfa.js';
import {exportHistoricalBackup,restoreHistoricalBackup} from '../server/src/database/history.js';

await loadLocalEnvironment();
const ref=process.env.SUPABASE_PROJECT_REF;
if(ref!=='dddezkhdlboujgivqvgg'||!process.argv.includes('--confirm-isolated-target'))throw Error('Confirm the isolated recovery target before running operator tests.');
const origin='http://127.0.0.1:5175',cookies=new Map();let csrf='';
async function request(path,body){
  const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; '),...(csrf?{'X-CSRF-Token':csrf}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],equals=pair.indexOf('=');cookies.set(pair.slice(0,equals),pair.slice(equals+1));}
  return{status:response.status,body:await response.json()};
}
const results=[];
const client=new pg.Client({...supabaseConnectionOptions('database',{...process.env,DATABASE_URL:process.env.DIRECT_DATABASE_URL}),connectionTimeoutMillis:10000});
await client.connect();
try{
  const setup=JSON.parse(await fs.readFile('data/first-administrator-setup.json','utf8'));
  csrf=(await request('/api/auth/csrf')).body.token;
  const login=await request('/api/auth/login',{email:setup.email,password:setup.password,remember:false});assert.equal(login.body.mfaRequired,true);
  const code=()=>totp(new URL(setup.authenticatorUri).searchParams.get('secret'),Math.floor(Date.now()/30000));
  assert.equal((await request('/api/auth/mfa/verify',{challengeId:login.body.mfaChallengeId,code:code()})).status,200);
  csrf=(await request('/api/auth/csrf')).body.token;
  assert.equal((await request('/api/admin/settings/database-management',{action:'seed',confirmed:true,code:'invalid'})).status,403);
  const queued=await request('/api/admin/settings/database-management',{action:'seed',confirmed:true,code:code()});assert.equal(queued.status,202);
  assert.equal((await client.query('SELECT state FROM getafe_database_operations WHERE id=$1',[queued.body.id])).rows[0].state,'requested');
  const run=()=>spawnSync(process.execPath,['scripts/database.mjs','execute-job','--id',queued.body.id,'--apply','--confirm-ref',ref],{encoding:'utf8',windowsHide:true,timeout:90000});
  assert.equal(run().status,0,'Signed request execution failed; inspect the redacted operation journal.');
  assert.equal((await client.query('SELECT state FROM getafe_database_operations WHERE id=$1',[queued.body.id])).rows[0].state,'complete');assert.notEqual(run().status,0,'A completed job must not run twice.');
  results.push({name:'Real MFA/CSRF maintenance authorization, operator execution and duplicate refusal',passed:true,operationId:queued.body.id});
  const backup=await exportHistoricalBackup(client,{projectRef:ref});assert.equal(backup.encrypted,true);assert.equal(backup.tables,147);
  let queryCount=0;const forbidden={query:async()=>{queryCount++;throw Error('No query expected for unauthenticated ciphertext.');}};
  const bytes=await fs.readFile(backup.file),corrupt=backup.file+'.tampered';bytes[Math.floor(bytes.length/2)]^=1;await fs.writeFile(corrupt,bytes,{mode:0o600,flag:'wx'});
  try{await assert.rejects(restoreHistoricalBackup(forbidden,{file:corrupt,projectRef:ref,sourceRef:'historical-fixture'}));assert.equal(queryCount,0);}finally{await fs.unlink(corrupt);}
  await assert.rejects(restoreHistoricalBackup(client,{file:backup.file,projectRef:ref,sourceRef:ref}),/identity verification/);
  results.push({name:'All-table encrypted backup, authentication-before-write, source/destination refusal',passed:true,tables:backup.tables,rows:backup.rows,backupFile:backup.file});
  console.info(JSON.stringify({passed:results.length,results},null,2));
}finally{
  await request('/api/auth/logout',{}).catch(()=>{});await client.end();
  await fs.mkdir('artifacts/recovery',{recursive:true});await fs.writeFile('artifacts/recovery/operations-live.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2)+'\n');
}
