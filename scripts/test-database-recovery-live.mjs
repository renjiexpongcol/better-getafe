import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
import {loadLocalEnvironment} from '../server/src/config/supabaseSetup.js';
import {supabaseConnectionOptions} from '../server/src/services/postgres.js';
import {expectedSchema,migrationFiles,inspectDatabase,withMigrationLock,migrateDatabase} from '../server/src/database/maintenance.js';
import {repairPlan,applyRepairPlan} from '../server/src/database/repair.js';
import {seedSettingsRecords,seedApprovedSystemRecords} from '../server/src/database/seeds.js';

await loadLocalEnvironment();
const ref=process.env.SUPABASE_PROJECT_REF;
if(ref!=='dddezkhdlboujgivqvgg'||process.argv[process.argv.indexOf('--confirm-ref')+1]!==ref)throw Error('Live recovery tests require the explicitly confirmed isolated recovery database.');
const options={...supabaseConnectionOptions('database',{...process.env,DATABASE_URL:process.env.DIRECT_DATABASE_URL}),connectionTimeoutMillis:10000,query_timeout:15000};
const client=new pg.Client(options),results=[];
await client.connect();const expected=await expectedSchema(),migrations=await migrationFiles();
async function scenario(name,work){try{await work();results.push({name,passed:true});console.info('[Recovery test] '+name+' passed.');}catch(error){results.push({name,passed:false,code:error.code||'ASSERTION_FAILED'});throw error;}}
async function reversible(work){await withMigrationLock(client,async()=>{await client.query('BEGIN');try{await work();}finally{await client.query('ROLLBACK');}});}
try {
  await scenario('complete schema and essential records after empty-database reconstruction',async()=>{assert.equal((await inspectDatabase(client,{expected,migrations})).state,'healthy');});
  await scenario('missing empty table is reconstructed with columns, constraints, indexes and backend access',()=>reversible(async()=>{
    await client.query('LOCK TABLE contact_messages IN ACCESS EXCLUSIVE MODE');
    assert.equal((await client.query('SELECT count(*)::int AS count FROM contact_messages')).rows[0].count,0,'Never drop a populated table in this test.');
    await client.query('DROP TABLE contact_messages');
    const before=await inspectDatabase(client,{expected,migrations});assert.ok(before.missingObjects.some(object=>object.kind==='tables'&&object.name==='contact_messages'));
    const plan=repairPlan(before,expected);assert.equal(plan.blocked.length,0);await applyRepairPlan(client,plan);
    const after=await inspectDatabase(client,{expected,migrations});
    if(after.state!=='healthy')await fs.writeFile('artifacts/recovery/repair-test-drift.json',JSON.stringify({state:after.state,drift:after.schemaDrift,missing:after.missingObjects,actual:after.catalog,expected:expected.catalog},null,2));
    assert.equal(after.state,'healthy',JSON.stringify(after.schemaDrift));
  }));
  await scenario('missing nullable column and standalone index are repaired transactionally',()=>reversible(async()=>{
    await client.query('ALTER TABLE contact_messages DROP COLUMN acknowledgement_sent_at');
    await client.query('DROP INDEX news_public_listing_idx');
    const inspection=await inspectDatabase(client,{expected,migrations});const plan=repairPlan(inspection,expected);assert.equal(plan.blocked.length,0);await applyRepairPlan(client,plan);assert.equal((await inspectDatabase(client,{expected,migrations})).state,'healthy');
  }));
  await scenario('missing settings are restored without overwriting an edited value',()=>reversible(async()=>{
    await client.query("DELETE FROM system_settings WHERE setting_key='general.language'");
    await client.query("UPDATE system_settings SET value='\"operator-edited-name\"' WHERE setting_key='general.name'");
    assert.ok((await inspectDatabase(client,{expected,migrations})).missingSystemRecords.some(row=>row.key==='general.language'));
    await seedSettingsRecords(client);
    assert.equal((await client.query("SELECT value FROM system_settings WHERE setting_key='general.name'")).rows[0].value,'"operator-edited-name"');
    assert.equal((await inspectDatabase(client,{expected,migrations})).missingSystemRecords.length,0);
  }));
  await scenario('missing approved system defaults are restored while edited AI preferences are preserved',()=>reversible(async()=>{
    await client.query("DELETE FROM ai_modules WHERE module_key='smart_search'");
    await client.query("UPDATE ai_modules SET enabled=TRUE WHERE module_key='translation'");
    await client.query('DELETE FROM appointment_schedule_config WHERE id=1');
    await seedApprovedSystemRecords(client);
    assert.equal((await client.query("SELECT enabled FROM ai_modules WHERE module_key='smart_search'")).rows[0].enabled,false);
    assert.equal((await client.query("SELECT enabled FROM ai_modules WHERE module_key='translation'")).rows[0].enabled,true);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM appointment_schedule_config')).rows[0].count,1);
  }));
  await scenario('concurrent reconstruction is refused by a bounded distributed lock',async()=>{
    const other=new pg.Client(options);await other.connect();try{await withMigrationLock(client,async()=>{await assert.rejects(withMigrationLock(other,async()=>assert.fail('concurrent work ran'),{timeoutMs:300}),error=>error.code==='MIGRATION_LOCK_BUSY');});}finally{await other.end();}
  });
  await scenario('changed migration checksums are detected without modifying the database',async()=>{const changed=migrations.map((file,index)=>index===0?{...file,checksum:'changed-fixture'}:file);assert.equal((await inspectDatabase(client,{expected,migrations:changed})).state,'inconsistent_migrations');});
  await scenario('failed migration rolls back its DDL and is not marked applied',async()=>{
    const fixture={version:'999_recovery_transaction_fixture.sql',checksum:'fixture-checksum',sql:'CREATE TABLE getafe_rollback_fixture(id integer); SELECT missing_recovery_fixture_function()'};
    await assert.rejects(migrateDatabase(client,{expected,migrations:[...migrations,fixture],projectRef:ref,allowReviewedChanges:true}));
    assert.equal((await client.query("SELECT to_regclass('public.getafe_rollback_fixture') AS table_name")).rows[0].table_name,null);
    assert.equal((await client.query('SELECT 1 FROM schema_migrations WHERE version=$1',[fixture.version])).rowCount,0);
    assert.equal((await inspectDatabase(client,{expected,migrations})).state,'healthy');
  });
  await scenario('ordinary runtime credentials cannot create schema objects or rewrite migration history',async()=>{
    const runtime=new pg.Client({...supabaseConnectionOptions('database'),connectionTimeoutMillis:10000});await runtime.connect();
    try{await assert.rejects(runtime.query('CREATE TABLE public.getafe_forbidden_runtime_ddl(id integer)'),error=>error.code==='42501');await assert.rejects(runtime.query("UPDATE schema_migrations SET checksum='forbidden'"),error=>error.code==='42501');}finally{await runtime.end();}
  });
  await scenario('repeat bootstrap skips completed migrations and preserves administrator identity',async()=>{
    const before=(await client.query("SELECT id FROM users WHERE role='super_admin' ORDER BY id")).rows;
    const result=await migrateDatabase(client,{expected,migrations,projectRef:ref});assert.equal(result.applied.length,0);assert.equal(result.state,'healthy');assert.deepEqual((await client.query("SELECT id FROM users WHERE role='super_admin' ORDER BY id")).rows,before);
  });
}finally{await client.end();await fs.mkdir('artifacts/recovery',{recursive:true});await fs.writeFile('artifacts/recovery/live-database-tests.json',JSON.stringify({projectRef:ref,scope:'Explicit isolated recovery target. Destructive missing-object fixtures were confined to an uncommitted transaction; populated tables were never dropped.',results},null,2)+'\n');}
