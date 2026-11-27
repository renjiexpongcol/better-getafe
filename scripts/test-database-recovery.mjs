import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCatalog,digest,canonicalConstraint } from '../server/src/database/catalog.js';
process.env.NODE_ENV='production';
delete process.env.GETAFE_RUNTIME_ROLE;
const {repairPlan}=await import('../server/src/database/repair.js');
const {databaseFailure,withMigrationLock,expectedSchema,migrationFiles}=await import('../server/src/database/maintenance.js');
const {provisionInitialAdministrator}=await import('../server/src/database/operator.js');
const {maintenanceSignature}=await import('../server/src/database/managementRoutes.js');
const {dependencyGroups,prepareProtectedHistoricalRow}=await import('../server/src/database/history.js');
const {recoveryJobsAllowed}=await import('../server/src/database/workerRecovery.js');
const {systemSeedDefinitions}=await import('../server/src/database/seeds.js');

test('catalog comparison detects missing objects, changed columns and weaker RLS',()=>{
  const expected={tables:[{schema:'public',name:'news',rls:true,force_rls:false}],columns:[{schema:'public',table:'news',name:'title',type:'text',not_null:true,default:null,identity:'',generated:''}]};
  assert.equal(compareCatalog(expected,{tables:[],columns:[]}).missing.length,2);
  const actual={tables:[{...expected.tables[0],rls:false}],columns:[{...expected.columns[0],type:'integer'}]};
  const comparison=compareCatalog(expected,actual);
  assert.deepEqual(comparison.drift.map(row=>row.kind),['tables','columns']);
});
test('native PostgreSQL CHECK round-trips preserve equivalent array casts without hiding changed literals',()=>{
  const before="CHECK (status::text = ANY (ARRAY['new'::character varying, 'closed'::character varying]::text[]))";
  const after="CHECK (status::text = ANY (ARRAY['new'::character varying::text, 'closed'::character varying::text]))";
  assert.equal(canonicalConstraint(before),canonicalConstraint(after));
  assert.notEqual(canonicalConstraint(before),canonicalConstraint(after.replace("'closed'","'unsafe'")));
});
test('schema reference binds every migration checksum and normalizes Windows line endings',async()=>{
  const manifest=await expectedSchema(),files=await migrationFiles();
  assert.equal(manifest.migrationDigest,digest(files.map(({version,checksum})=>({version,checksum}))));
  assert.equal(digest('SELECT 1;\r\n'),digest('SELECT 1;\n'));
  assert.notEqual(digest('SELECT 1;'),digest('SELECT 2;'));
  assert.ok(manifest.catalog.tables.length>140);
});
test('repair plans restore missing objects additively and place foreign keys last',()=>{
  const tables=[{schema:'public',name:'parents',rls:true},{schema:'public',name:'children',rls:true}];
  const columns=tables.map(table=>({schema:'public',table:table.name,name:'id',type:'text',not_null:true,default:null}));
  const constraints=[{kind:'constraints',schema:'public',table:'parents',name:'parents_pkey',definition:'PRIMARY KEY (id)'},{kind:'constraints',schema:'public',table:'children',name:'children_parent_fk',definition:'FOREIGN KEY (id) REFERENCES parents(id)'}];
  const plan=repairPlan({missingObjects:[...tables.map(table=>({kind:'tables',...table})),...constraints],schemaDrift:[],missingSystemRecords:[]},{catalog:{tables,columns}});
  assert.equal(plan.blocked.length,0);
  assert.match(plan.steps.at(-1).sql,/FOREIGN KEY/);
  assert.equal(plan.steps.some(step=>/\b(?:DROP|TRUNCATE|DELETE)\b/.test(step.sql||'')),false);
});
test('repair refuses changed definitions and unknown historical sequence states',()=>{
  const plan=repairPlan({schemaDrift:[{kind:'columns',name:'title',changed:['type']}],missingObjects:[{kind:'sequences',schema:'public',name:'historic_sequence'}],missingSystemRecords:[]},{catalog:{tables:[],columns:[]}});
  assert.equal(plan.blocked.length,2);
  assert.equal(plan.steps.length,0);
});
test('connection failure classification never labels an outage or invalid credentials empty',()=>{
  for(const [code,state]of [['ECONNREFUSED','unreachable'],['28P01','invalid_credentials'],['42501','insufficient_permissions'],['42P01','missing_objects'],['SELF_SIGNED_CERT_IN_CHAIN','tls_failure']])assert.equal(databaseFailure({code}),state);
});
test('migration lock has a bounded failure and does not execute work concurrently',async()=>{
  let ran=false;
  await assert.rejects(withMigrationLock({query:async()=>({rows:[{locked:false}]})},async()=>{ran=true;},{timeoutMs:1}),error=>error.code==='MIGRATION_LOCK_BUSY');
  assert.equal(ran,false);
});
test('initial administrator provisioning requires explicit authorization and cannot duplicate an administrator',async()=>{
  let queried=false;
  await assert.rejects(provisionInitialAdministrator({query:async()=>{queried=true;}},{name:'Fixture',email:'fixture@example.invalid',confirmed:false}),/confirm-first-admin/);
  assert.equal(queried,false);
  const client={query:async sql=>sql.includes('pg_try')?{rows:[{locked:true}]}:sql.includes('FROM users')?{rowCount:1,rows:[{id:'existing'}]}:{rows:[]}};
  await assert.rejects(provisionInitialAdministrator(client,{name:'Fixture',email:'fixture@example.invalid',confirmed:true}),/already disabled/);
});
test('maintenance request signatures survive JSONB key ordering and reject tampering',()=>{
  const original=process.env.SETTINGS_ENCRYPTION_KEY;process.env.SETTINGS_ENCRYPTION_KEY='fixture-maintenance-signing-key';
  try {
    const report={actorId:'fixture',instance:'instance',action:'repair',authorizedAt:1,nonce:'nonce'};
    const reordered=Object.fromEntries(Object.entries(report).reverse());
    assert.equal(maintenanceSignature(report),maintenanceSignature(reordered));
    assert.notEqual(maintenanceSignature(report),maintenanceSignature({...report,instance:'another'}));
    assert.notEqual(maintenanceSignature(report),maintenanceSignature({...report,action:'seed'}));
  }finally{if(original===undefined)delete process.env.SETTINGS_ENCRYPTION_KEY;else process.env.SETTINGS_ENCRYPTION_KEY=original;}
});

test('view repair preserves object category and materialized view type',()=>{
  const view={schema:'public',name:'summary',kind:'m',definition:'SELECT 1 AS total',options:null};
  const missing=compareCatalog({views:[view]},{views:[]}).missing;
  assert.equal(missing[0].kind,'views');
  const plan=repairPlan({missingObjects:missing,schemaDrift:[],missingSystemRecords:[]},{catalog:{tables:[],columns:[]}});
  assert.match(plan.steps[0].sql,/CREATE MATERIALIZED VIEW/);
});

test('trusted generated expressions are preserved during additive table reconstruction',()=>{
  const table={kind:'tables',schema:'public',name:'search_documents',rls:true};
  const plan=repairPlan({missingObjects:[table],schemaDrift:[],missingSystemRecords:[]},{catalog:{tables:[table],columns:[{name:'body',type:'text',table:table.name},{name:'search',type:'tsvector',table:table.name,generated:'s',default:"to_tsvector('english'::regconfig, body)"}]}});
  assert.equal(plan.blocked.length,0);assert.match(plan.steps[0].sql,/GENERATED ALWAYS AS .* STORED/);
});

test('historical dependency ordering handles a cycle depending on another cycle',()=>{
  const relations=[{child:'a',parent:'b'},{child:'b',parent:'a'},{child:'a',parent:'c'},{child:'c',parent:'d'},{child:'d',parent:'c'},{child:'z',parent:'a'}];
  assert.deepEqual(dependencyGroups(['a','b','c','d','z'],relations),[['c','d'],['a','b'],['z']]);
});

test('historical recovery refuses unavailable secret-store references and MFA key material',async()=>{
  await assert.rejects(prepareProtectedHistoricalRow('system_settings',JSON.stringify({value:JSON.stringify({secret_ref:'missing-original-secret'})})),/original secret-store/);
  await assert.rejects(prepareProtectedHistoricalRow('users',JSON.stringify({mfa_secret_encrypted:'v1.invalid.invalid.invalid'})),/Original MFA/);
});

test('restored queues stay paused until operator approval and database failure cannot enable work',async()=>{
  assert.equal(await recoveryJobsAllowed({query:async()=>({rows:[{allowed:false}]})}),false);
  assert.equal(await recoveryJobsAllowed({query:async()=>({rows:[{allowed:true}]})}),true);
  await assert.rejects(recoveryJobsAllowed({query:async()=>{throw Error('database unavailable');}}));
});

test('approved essential configuration and reference seeds retain original migration definitions',async()=>{
  const seeds=await systemSeedDefinitions();
  assert.equal(seeds.find(seed=>seed.table==='psgc_barangay_reference').keys.length,24);
  assert.equal(seeds.find(seed=>seed.table==='ai_modules').keys.length,12);
  for(const seed of seeds){assert.match(seed.sql,/ON CONFLICT[\s\S]*DO NOTHING/i);assert.doesNotMatch(seed.sql,/DO UPDATE|DELETE|DROP|TRUNCATE/i);}
});
