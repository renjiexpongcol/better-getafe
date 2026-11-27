import fs from 'node:fs/promises';
import { resolveApiRoutePolicy } from '../server/src/services/apiRoutePolicy.js';
import { totp } from '../server/src/services/mfa.js';

const argument=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];};
const origin=new URL(argument('--base-url')||'http://localhost:5173').origin;
const inventory=JSON.parse(await fs.readFile('database/system-inventory.json','utf8'));
const results=[],cookies=new Map();let csrfToken='';
const output=argument('--output')||'artifacts/recovery/api-verification.json';
let ready=false;
for(let attempt=0;attempt<30;attempt++) {
  try {const response=await fetch(origin+'/api/ready',{signal:AbortSignal.timeout(2000)});if(response.status===200){ready=true;break;}}catch{/* Wait for the isolated process to bind and initialize. */}
  await new Promise(resolve=>setTimeout(resolve,500));
}
if(!ready)throw new Error('The target is not ready; no endpoint matrix was claimed.');
const materialize=route=>route.replace(/:[A-Za-z_][A-Za-z0-9_]*\*?/g,'00000000-0000-4000-8000-000000000000').replaceAll('*','recovery-probe');
async function request(path,{method='GET',body,authenticated=false}={}) {
  const headers={Origin:origin,'X-Analytics-Synthetic':'true',...(body?{'Content-Type':'application/json'}:{})};
  if(authenticated){headers.Cookie=[...cookies].map(([key,value])=>`${key}=${value}`).join('; ');if(csrfToken)headers['X-CSRF-Token']=csrfToken;}
  const response=await fetch(origin+path,{method,headers,body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(authenticated)for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],equals=pair.indexOf('=');cookies.set(pair.slice(0,equals),pair.slice(equals+1));}
  const text=await response.text();let json;try{json=JSON.parse(text);}catch{/* Non-JSON responses are classified by method/path. */}
  return{status:response.status,bytes:text.length,type:response.headers.get('content-type'),json};
}
let administrator={tested:false};
if(process.argv.includes('--admin')) {
  if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw new Error('Local setup credentials may only be used against localhost; deployed auth tests need an explicit isolated credential fixture.');
  try {
    const setup=JSON.parse(await fs.readFile('data/first-administrator-setup.json','utf8'));
    csrfToken=(await request('/api/auth/csrf',{authenticated:true})).json?.token;
    const login=await request('/api/auth/login',{method:'POST',authenticated:true,body:{email:setup.email,password:setup.password,remember:false}});
    if(!login.json?.mfaRequired)throw Error('Expected enforced MFA challenge.');
    const secret=new URL(setup.authenticatorUri).searchParams.get('secret');
    const verify=await request('/api/auth/mfa/verify',{method:'POST',authenticated:true,body:{challengeId:login.json.mfaChallengeId,code:totp(secret,Math.floor(Date.now()/30000))}});
    if(verify.status!==200||!verify.json?.user)throw Error('MFA authentication did not complete.');
    csrfToken=(await request('/api/auth/csrf',{authenticated:true})).json?.token;
    administrator={tested:true,authenticated:true,mfaEnforced:true};
  }catch{administrator={tested:true,authenticated:false,mfaEnforced:'not_verified',reason:'See the redacted authentication diagnostic; credentials were not logged.'};}
}
const probes=inventory.endpoints.filter(route=>['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(route.method));
let position=0;
async function worker(){
  while(position<probes.length){
    const route=probes[position++],policy=resolveApiRoutePolicy(route.method,route.aliasOf||route.path),path=materialize(route.path);
    for(const authenticated of administrator.authenticated&&route.method==='GET'&&policy?.access==='CMS'?[false,true]:[false]){
      try {
        const response=await request(path,{method:route.method,body:['POST','PUT','PATCH'].includes(route.method)?{}:undefined,authenticated});
        const restricted=['CMS','PORTAL','INTERNAL','INTEGRATION'].includes(policy?.access);
        const classification=response.status===429?'rate_limited':response.status>=500?'unavailable':!authenticated&&restricted&&response.status>=200&&response.status<300?'unexpected_anonymous_access':response.status>=400?'denied_or_missing_fixture':'responded';
        results.push({method:route.method,path:route.path,access:policy?.access||'non_api',probe:authenticated?'authenticated_read':'anonymous_boundary',status:response.status,classification,type:response.type,code:typeof response.json?.code==='string'?response.json.code:undefined,requiresResourceFixture:response.status===404||response.status===422});
      }catch{results.push({method:route.method,path:route.path,probe:authenticated?'authenticated_read':'anonymous_boundary',status:0,classification:'request_timeout_or_network_error'});}
    }
    if(position%50===0)console.info(`[API] Examined ${position}/${probes.length} registered handlers.`);
  }
}
await Promise.all([worker(),worker(),worker()]);
if(administrator.authenticated)await request('/api/auth/logout',{method:'POST',body:{},authenticated:true}).catch(()=>{});
const summary={registeredHandlers:inventory.summary.handlers,probedHandlers:probes.length,requests:results.length,administrator,byClassification:Object.fromEntries([...new Set(results.map(row=>row.classification))].map(key=>[key,results.filter(row=>row.classification===key).length]))};
const report={origin,checkedAt:new Date().toISOString(),rateLimiterIsolatedInHarness:process.argv.includes('--isolated-harness'),scope:'All discovered method/path registrations: anonymous authorization/input boundaries plus authenticated CMS GETs when --admin is supplied. Invalid/nonexistent resource IDs intentionally avoid changing historical records. This is not proof of every successful mutating business workflow.',summary,results};
await fs.mkdir('artifacts/recovery',{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');console.info(JSON.stringify(summary));
if((administrator.tested&&!administrator.authenticated)||results.some(row=>row.classification==='unexpected_anonymous_access'||row.status===500||row.status===0))process.exitCode=1;
