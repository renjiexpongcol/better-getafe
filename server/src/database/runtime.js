import { getConfigPool } from '../config/DatabaseSettingsProvider.js';
import { expectedSchema, inspectDatabase } from './maintenance.js';
import { getSupabaseDatabaseUrl } from '../services/postgres.js';
import { digest } from './catalog.js';
import fs from 'node:fs/promises';

let cache, pending, target;
let endpointDependencies;
export async function missingEndpointTables(policy, inspection) {
  if(!policy||!inspection.missingObjects?.length)return [];
  endpointDependencies ||= fs.readFile(new URL('../../../database/system-inventory.json',import.meta.url),'utf8').then(JSON.parse);
  const inventory=await endpointDependencies;
  const endpoint=inventory.endpoints.find(item=>item.method===policy.method&&item.path===policy.path);
  const required=new Set(endpoint?.dependencies?.tables||[]);
  return inspection.missingObjects.filter(item=>item.kind==='tables'&&required.has(item.name)).map(item=>item.name);
}
export async function runtimeDatabaseInspection({ force=false }={}) {
  const url=getSupabaseDatabaseUrl().url,current=digest(url);
  if(process.env.SUPABASE_PROJECT_REF){
    const parsed=new URL(url),ref=parsed.hostname.endsWith('.pooler.supabase.com')?decodeURIComponent(parsed.username).split('.').at(-1):parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1];
    if(ref!==process.env.SUPABASE_PROJECT_REF)throw new Error('The configured database does not match the intended project.');
  }
  if(!force&&cache&&target===current&&Date.now()-cache.checkedAt<60000)return cache;
  if(pending&&target===current)return pending;
  target=current;
  pending=(async()=>{
    const expected=await expectedSchema();
    if(!expected)throw new Error('The release schema manifest is missing.');
    const pool=await getConfigPool(),client=await pool.connect();
    try {
      const report=await inspectDatabase(client,{expected,migrations:expected.migrations});
      if(process.env.DATABASE_INSTANCE_ID&&report.identity.instance&&process.env.DATABASE_INSTANCE_ID!==report.identity.instance)throw new Error('Database identity changed. Run the authorized recovery workflow before activating this installation.');
      if(report.identity.instance)process.env.DATABASE_INSTANCE_ID=report.identity.instance;
      cache={...report,checkedAt:Date.now()};
      return cache;
    }finally{client.release();}
  })().finally(()=>{pending=null;});
  return pending;
}
