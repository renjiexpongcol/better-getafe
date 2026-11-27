import { mock } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

// A dedicated, loopback-only test process and random Redis namespace. Only the
// global rate limiter is replaced: auth, MFA, CSRF, policies and SQL stay real.
if(process.env.VERCEL==='1'||process.env.NODE_ENV==='production')throw new Error('Recovery harness cannot run in a deployed/production environment.');
process.env.NODE_ENV='test';process.env.PORTAL_SERVERLESS='true';
process.env.APP_URL='http://127.0.0.1:5175';process.env.REDIS_PREFIX='getafe-recovery-test-'+randomUUID();
const traffic=await import('../server/src/services/trafficProtection.js');
class TestTraffic extends traffic.AdaptiveTrafficProtector {middleware(){return(_req,_res,next)=>next();}}
mock.module('../server/src/services/trafficProtection.js',{namedExports:{...traffic,AdaptiveTrafficProtector:TestTraffic}});
const {default:app,ensureApplicationReady}=await import('../server/index.js');
await ensureApplicationReady();
const server=createServer(async(req,res)=>{try{await ensureApplicationReady();app(req,res);}catch{res.writeHead(503,{'Content-Type':'application/json'});res.end('{"code":"TEST_INITIALIZATION_UNAVAILABLE"}');}});await new Promise(resolve=>server.listen(5175,'127.0.0.1',resolve));
console.info('[Recovery test] Real API/database/authentication listening on loopback port 5175; rate-limit contracts are verified separately.');
async function stop(){
  await new Promise(resolve=>server.close(resolve));
  const {default:redis,redisPrefix,closeRedis}=await import('../server/src/infrastructure/redis/redisClient.js');
  if(redis.isReady)for await(const keys of redis.scanIterator({MATCH:redisPrefix+':*',COUNT:100})){const batch=Array.isArray(keys)?keys:[keys];if(batch.length)await redis.del(batch);}
  await closeRedis();
  await (await import('../server/src/services/database.js')).closeDatabaseConnection();
  await (await import('../server/src/config/DatabaseSettingsProvider.js')).closeConfigStore();
  process.exit(0);
}
process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
