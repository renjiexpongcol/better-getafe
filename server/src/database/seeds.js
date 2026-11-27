import { definitions } from '../config/defaults.js';
import { permissionCatalog, defaultGroups, seedAuthorizationData } from '../services/authorizationService.js';
import fs from 'node:fs/promises';
import {identifier} from './catalog.js';

let approvedSeeds;
export async function systemSeedDefinitions(){
  return approvedSeeds ||= (async()=>{
    const sources={
      '002_runtime_workflows.sql':['appointment_schedule_config'],
      '022_employee_profiles.sql':['employee_profile_defaults'],
      '039_psgc_local_barangay_snapshot.sql':['psgc_barangay_reference','psgc_sync_state'],
      '044_website_analytics.sql':['website_analytics_settings'],
      '045_website_analytics_engagement.sql':['website_analytics_settings'],
      '046_content_navigation_analytics.sql':['website_analytics_settings'],
      '052_ai_management.sql':['ai_settings','ai_modules','ai_provider_config'],
      '054_ai_knowledge_base.sql':['ai_knowledge_sources'],
    };
    const seeds=[];
    for(const [file,tables]of Object.entries(sources)){
      const sql=await fs.readFile(new URL('../../../database/migrations/postgresql/'+file,import.meta.url),'utf8');
      for(const match of sql.matchAll(/INSERT INTO ([a-z_]+)\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);/g)){
        if(!tables.includes(match[1]))continue;
        const key=match[2].split(',')[0].trim(),values=match[3].split(/\bON CONFLICT\b/i)[0];
        const keys=[...values.matchAll(/\(\s*(?:'([^']+)'|(TRUE|FALSE|\d+))\s*[,)]/gi)].map(row=>row[1]??row[2].toLowerCase());
        if(!keys.length||/ON CONFLICT[\s\S]*DO UPDATE/i.test(match[0]))throw new Error('Approved system defaults need explicit non-overwriting seed definitions.');
        seeds.push({file,table:match[1],key,keys,sql:/ON CONFLICT/i.test(match[0])?match[0]:match[0].slice(0,-1)+' ON CONFLICT DO NOTHING;'});
      }
    }
    return seeds;
  })();
}

export const essentialSettings = Object.entries(definitions).filter(([, definition]) => !definition.secret).map(([key]) => key);
const adapt = sql => { let n = 0; return sql.replace(/\?/g, () => `$${++n}`); };
export function operatorAdapter(client) {
  return {
    exec: sql => client.query(sql),
    prepare: sql => ({
      run: async (...values) => client.query(adapt(sql), values),
      get: async (...values) => (await client.query(adapt(sql), values)).rows[0],
      all: async (...values) => (await client.query(adapt(sql), values)).rows,
    }),
  };
}

export async function inspectSystemRecords(client, tables) {
  const missing = [];
  if (tables.has('system_settings')) {
    const { rows } = await client.query('SELECT setting_key FROM system_settings WHERE setting_key=ANY($1::text[])', [essentialSettings]);
    const keys = new Set(rows.map(row => row.setting_key));
    for (const key of essentialSettings) if (!keys.has(key)) missing.push({ table: 'system_settings', key });
  }
  if (tables.has('auth_permissions')) {
    const { rows } = await client.query('SELECT id FROM auth_permissions');
    const found = new Set(rows.map(row => row.id));
    for (const [id] of permissionCatalog) if (!found.has(id)) missing.push({ table: 'auth_permissions', key: id });
  }
  if (tables.has('auth_groups')) {
    const { rows } = await client.query('SELECT name FROM auth_groups');
    for (const [name] of defaultGroups) if (!rows.some(row => row.name === name)) missing.push({ table: 'auth_groups', key: name });
  }
  if(tables.has('auth_group_permissions')&&tables.has('auth_groups')){
    const found=new Set((await client.query("SELECT p.permission_id FROM auth_group_permissions p JOIN auth_groups g ON g.id=p.group_id WHERE g.name='System_Administrator'")).rows.map(row=>row.permission_id));
    for(const [key]of permissionCatalog)if(!found.has(key))missing.push({table:'auth_group_permissions',key,group:'System_Administrator'});
  }
  for (const table of ['settings_lock','appointment_schedule_config','employee_profile_defaults','website_analytics_settings']) {
    if (tables.has(table) && !(await client.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount) missing.push({ table, key: 'singleton' });
  }
  for(const seed of await systemSeedDefinitions())if(tables.has(seed.table)){
    const found=new Set((await client.query(`SELECT ${identifier(seed.key)}::text AS key FROM ${identifier(seed.table)} WHERE ${identifier(seed.key)}::text=ANY($1::text[])`,[seed.keys])).rows.map(row=>row.key));
    for(const key of seed.keys)if(!found.has(key))missing.push({table:seed.table,key,source:seed.file});
  }
  return missing;
}

export async function seedSystemRecords(client) {
  await seedAuthorizationData(operatorAdapter(client));
  await client.query('BEGIN');
  try {
    await seedSettingsRecords(client);
    await client.query('INSERT INTO settings_lock(id) VALUES(1) ON CONFLICT DO NOTHING');
    await seedApprovedSystemRecords(client);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
export async function seedApprovedSystemRecords(client){for(const seed of await systemSeedDefinitions())await client.query(seed.sql);}
export async function seedSettingsRecords(client) {
  const values=Object.entries(definitions).filter(([,definition])=>!definition.secret).map(([setting_key,definition])=>({setting_key,value:JSON.stringify(definition.default)}));
  await client.query(`INSERT INTO system_settings(setting_key,value,updated_by) SELECT setting_key,value,'system-bootstrap' FROM jsonb_to_recordset($1::jsonb) AS seed(setting_key text,value text) ON CONFLICT(setting_key) DO NOTHING`,[JSON.stringify(values)]);
}
