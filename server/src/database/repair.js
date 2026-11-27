import { randomUUID } from 'node:crypto';
import { identifier, qualified } from './catalog.js';
import { inspectDatabase, withMigrationLock } from './maintenance.js';
import { seedSystemRecords } from './seeds.js';
import { ensureRuntimePrivileges } from './operator.js';

function columnSQL(column) {
  if (column.identity) throw new Error('Identity reconstruction needs verified historical sequence state before writes are enabled.');
  if(column.generated&&!column.default)throw new Error('The trusted generated-column expression is unavailable.');
  return `${identifier(column.name)} ${column.type}${column.generated?` GENERATED ALWAYS AS (${column.default}) STORED`:column.default ? ` DEFAULT ${column.default}` : ''}${column.not_null ? ' NOT NULL' : ''}`;
}
export function repairPlan(inspection, expected) {
  if (!expected) throw new Error('A migration-matched reference manifest is required for repair.');
  const steps = [], blocked = [];
  if(inspection.runtimeRole&&!inspection.runtimeRole.ready) {
    if(inspection.runtimeRole.overprivileged)blocked.push({kind:'runtime_role',reason:'Existing excessive role privileges need explicit operator review; they are not silently altered.'});
    else steps.push({kind:'runtime_privileges',name:inspection.runtimeRole.name,sql:null});
  }
  const missingTables = new Set(inspection.missingObjects.filter(item => item.kind === 'tables').map(item => item.name));
  for (const change of inspection.schemaDrift) {
    if (change.kind === 'tables' && change.changed.length === 1 && change.changed[0] === 'rls' && expected.catalog.tables.find(item => item.name === change.name)?.rls) steps.push({ kind:'rls',name:change.name,sql:`ALTER TABLE ${qualified(change.schema,change.name)} ENABLE ROW LEVEL SECURITY` });
    else blocked.push({ ...change, reason:'Existing definitions are preserved; use a reviewed migration to resolve drift.' });
  }
  for (const object of inspection.missingObjects) {
    const table = object.table && qualified(object.schema,object.table), name = qualified(object.schema || 'public',object.name);
    let sql;
    try {
      switch(object.kind) {
        case 'extensions': sql=`CREATE EXTENSION IF NOT EXISTS ${identifier(object.name)} WITH SCHEMA ${identifier(object.schema)}`; break;
        case 'enums': sql=`CREATE TYPE ${name} AS ENUM (${object.labels.map(label=>"'"+label.replaceAll("'","''")+"'").join(',')})`; break;
        case 'sequences':
          blocked.push({ ...object,reason:'A missing sequence may have issued historic references. Restore its verified state from a source/backup before enabling writes.' }); continue;
        case 'functions': sql=object.definition; break;
        case 'tables': {
          const columns=expected.catalog.columns.filter(column=>column.table===object.name).sort((a,b)=>a.ordinal-b.ordinal);
          sql=`CREATE TABLE IF NOT EXISTS ${name} (${columns.map(columnSQL).join(',')})`; break;
        }
        case 'columns': if(missingTables.has(object.table))continue; sql=`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${columnSQL(object)}`; break;
        case 'constraints': sql=`ALTER TABLE ${table} ADD CONSTRAINT ${identifier(object.name)} ${object.definition}`; break;
        case 'indexes': sql=object.definition.replace(/^(CREATE(?: UNIQUE)? INDEX)/,'$1 IF NOT EXISTS'); break;
        case 'triggers': sql=object.definition; break;
        case 'views': sql=`CREATE ${object.viewKind==='m'?'MATERIALIZED ':''}VIEW ${name} AS ${object.definition}`; break;
        case 'policies': sql=`CREATE POLICY ${identifier(object.name)} ON ${table} AS ${object.permissive} FOR ${object.cmd} TO ${object.roles.map(identifier).join(',')}${object.qual?` USING (${object.qual})`:''}${object.with_check?` WITH CHECK (${object.with_check})`:''}`; break;
        default: blocked.push({...object,reason:'A reviewed reconstruction rule is required for this object type.'});continue;
      }
      steps.push({kind:object.kind,name:object.name,table:object.table,sql});
      if(object.kind==='tables'&&object.rls)steps.push({kind:'rls',name:object.name,sql:`ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY`});
    } catch(error) {blocked.push({...object,reason:error.message});}
  }
  const rank={extensions:0,enums:1,functions:2,tables:3,columns:4,constraints:5,indexes:6,triggers:7,views:8,policies:9,rls:10};
  steps.sort((a,b)=>(rank[a.kind]??20)-(rank[b.kind]??20));
  // Foreign keys follow every primary/unique constraint in a single transaction.
  steps.sort((a,b)=>(a.kind==='constraints'&&/FOREIGN KEY/.test(a.sql)?1:0)-(b.kind==='constraints'&&/FOREIGN KEY/.test(b.sql)?1:0));
  return {steps,blocked,missingSystemRecords:inspection.missingSystemRecords,destructive:false};
}

export async function applyRepairPlan(client,plan) {
  if(plan.blocked.length)throw new Error('The repair contains changes requiring operator review.');
  for(const step of plan.steps)if(step.sql)await client.query(step.sql);
  for(const step of plan.steps.filter(item=>item.kind==='tables'))await client.query(`REVOKE ALL ON ${qualified('public',step.name)} FROM PUBLIC,anon,authenticated`);
  if(process.env.GETAFE_RUNTIME_ROLE)await ensureRuntimePrivileges(client,process.env.GETAFE_RUNTIME_ROLE);
}

export async function repairDatabase(client,{expected,migrations,projectRef}) {
  return withMigrationLock(client,async()=>{
    const inspection=await inspectDatabase(client,{expected,migrations});
    if(inspection.pendingMigrations.length||inspection.changedMigrations.length)throw new Error('Apply reviewed pending migrations before schema repair.');
    const plan=repairPlan(inspection,expected);
    if(plan.blocked.length)return{state:'manual_review_required',...plan};
    await client.query('BEGIN');
    try {
      await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'");
      await applyRepairPlan(client,plan);
      const verified=await inspectDatabase(client,{expected,migrations});
      if(verified.missingObjects.length||verified.schemaDrift.length)throw new Error('Repair did not reproduce the expected schema; all repair DDL was rolled back.');
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
    await seedSystemRecords(client);
    await client.query('INSERT INTO getafe_database_operations(id,operation,state,project_ref,completed_at,report) VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP,$5::jsonb)',[randomUUID(),'repair','complete',projectRef,JSON.stringify({objects:plan.steps.map(({kind,name})=>({kind,name}))})]);
    return {state:'complete',objects:plan.steps.length,inspection:await inspectDatabase(client,{expected,migrations})};
  });
}
