import fs from 'node:fs/promises';
import { createReadStream,createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import { createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID } from 'node:crypto';
import { readCatalog,qualified,identifier } from './catalog.js';
import { withMigrationLock } from './maintenance.js';
import { SecretProvider } from '../config/SecretProvider.js';
import { CredentialVault } from '../integrationHub/security.js';
import { encryptMfaSecret,decryptMfaSecret } from '../services/mfa.js';
import { isDeepStrictEqual } from 'node:util';

const retained=new Set(['schema_migrations','getafe_database_identity','getafe_database_operations','getafe_administrator_setup','auth_state','integration_oauth_states']);
export async function prepareProtectedHistoricalRow(table,payload,existing) {
  const row=JSON.parse(payload);let changed=false;
  if(table==='system_settings') {
    let envelope;try{envelope=JSON.parse(row.value);}catch{/* Ordinary non-JSON legacy values remain subject to normal compatibility checks. */}
    if(envelope?.secret_ref)throw new Error('A historical external secret reference needs its original secret-store recovery workflow.');
    if(envelope?.encrypted===1) {
      const source=new SecretProvider({NODE_ENV:'production',SETTINGS_ENCRYPTION_KEY:process.env.SOURCE_SETTINGS_ENCRYPTION_KEY||process.env.SETTINGS_ENCRYPTION_KEY});
      const target=new SecretProvider({NODE_ENV:'production',SETTINGS_ENCRYPTION_KEY:process.env.SETTINGS_ENCRYPTION_KEY});
      let value;try{value=await source.open(row.setting_key,envelope);}catch{throw new Error('The original settings encryption key is required; no encrypted setting was replaced with blank data.');}
      let unchanged=false;try{unchanged=existing&&await target.open(row.setting_key,JSON.parse(existing.value))===value;}catch{/* A different saved value remains a reported conflict. */}
      row.value=unchanged?existing.value:JSON.stringify(await target.seal(row.setting_key,value));changed=true;
    }
  }
  if(['users','portal_users'].includes(table)&&row.mfa_secret_encrypted) {
    const material=process.env.SOURCE_MFA_ENCRYPTION_KEY||process.env.SOURCE_AUTH_SESSION_SECRET||process.env.MFA_ENCRYPTION_KEY||process.env.AUTH_SESSION_SECRET||process.env.CMS_SESSION_SECRET;
    try {
      const [version,iv,tag,ciphertext]=row.mfa_secret_encrypted.split('.');if(version!=='v1')throw Error();
      const decipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(material||'').digest(),Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));
      const secret=Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64url')),decipher.final()]).toString();
      let unchanged=false;try{unchanged=existing?.mfa_secret_encrypted&&decryptMfaSecret(existing.mfa_secret_encrypted)===secret;}catch{/* A different MFA enrollment is a conflict. */}
      row.mfa_secret_encrypted=unchanged?existing.mfa_secret_encrypted:encryptMfaSecret(secret);changed=true;
    }catch{throw new Error('Original MFA encryption material is required before restoring enrolled accounts.');}
  }
  if(table==='integration_installations'&&row.credential) {
    try {
      const envelope=typeof row.credential==='string'?JSON.parse(row.credential):row.credential;
      const source=new CredentialVault({INTEGRATION_VAULT_KEYS:process.env.SOURCE_INTEGRATION_VAULT_KEYS||process.env.INTEGRATION_VAULT_KEYS,INTEGRATION_VAULT_VERSION:process.env.SOURCE_INTEGRATION_VAULT_VERSION||envelope.version});
      const target=new CredentialVault(),plain=source.open(row.id,envelope);let unchanged=false;
      try{unchanged=existing?.credential&&isDeepStrictEqual(target.open(row.id,typeof existing.credential==='string'?JSON.parse(existing.credential):existing.credential),plain);}catch{/* An edited credential is preserved as a conflict. */}
      if(unchanged)row.credential=existing.credential;else{const sealed=target.seal(row.id,plain);row.credential=typeof row.credential==='string'?JSON.stringify(sealed):sealed;}changed=true;
    }catch{throw new Error('Original integration-vault keys are required before restoring provider credentials.');}
  }
  return changed?JSON.stringify(row):payload;
}
export function dependencyGroups(tables,relations) {
  const names=new Set(tables),edges=new Map(tables.map(table=>[table,[]]));
  for(const {child,parent}of relations)if(names.has(child)&&names.has(parent))edges.get(child).push(parent);
  // Tarjan emits strongly connected components in dependency order. Cycles
  // remain a single atomic group, including when they depend on other cycles.
  const indices=new Map(),low=new Map(),stack=[],active=new Set(),groups=[];let next=0;
  function visit(table){
    indices.set(table,next);low.set(table,next++);stack.push(table);active.add(table);
    for(const parent of edges.get(table)){
      if(!indices.has(parent)){visit(parent);low.set(table,Math.min(low.get(table),low.get(parent)));}
      else if(active.has(parent))low.set(table,Math.min(low.get(table),indices.get(parent)));
    }
    if(low.get(table)===indices.get(table)){
      const group=[];let member;do{member=stack.pop();active.delete(member);group.push(member);}while(member!==table);
      groups.push(group.sort());
    }
  }
  for(const table of [...tables].sort())if(!indices.has(table))visit(table);
  return groups;
}
async function backupKey() {
  let encoded=process.env.GETAFE_BACKUP_KEY;
  if(!encoded) {
    const file='data/.database-backup-key';await fs.mkdir('data',{recursive:true});
    try{encoded=await fs.readFile(file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;encoded=randomBytes(32).toString('base64');await fs.writeFile(file,encoded,{mode:0o600,flag:'wx'});}
  }
  const key=Buffer.from(encoded.trim(),'base64');if(key.length!==32)throw new Error('The database backup key must contain 32 base64-encoded bytes.');return key;
}
export async function historicalInventory(client) {
  const catalog=await readCatalog(client);
  const relations=(await client.query(`SELECT child.relname AS child,parent.relname AS parent FROM pg_constraint k JOIN pg_class child ON child.oid=k.conrelid JOIN pg_class parent ON parent.oid=k.confrelid JOIN pg_namespace n ON n.oid=child.relnamespace WHERE k.contype='f' AND n.nspname='public'`)).rows;
  const identity=catalog.tables.some(table=>table.name==='getafe_database_identity')?(await client.query('SELECT id FROM getafe_database_identity WHERE singleton=TRUE')).rows[0]?.id:'legacy-database-without-instance-record';
  const tables=catalog.tables.map(table=>table.name),counts=[];
  for(const table of tables)counts.push({table,rows:(await client.query(`SELECT count(*)::text AS count FROM ${qualified('public',table)}`)).rows[0].count,restore:retained.has(table)?'retain_destination_control_or_transient_state':'copy_exact_records'});
  return{catalog,relations,identity,tables:counts,groups:dependencyGroups(tables,relations)};
}
export async function exportHistoricalBackup(client,{projectRef}) {
  const key=await backupKey(),iv=randomBytes(12),file=`data/backups/${Date.now()}-${randomUUID()}.gbak`;
  await fs.mkdir('data/backups',{recursive:true});await fs.writeFile(file,Buffer.concat([Buffer.from('GETAFEB1'),iv]),{mode:0o600,flag:'wx'});
  const report={file,tables:0,rows:0,encrypted:true,sourceRef:projectRef};
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const inventory=await historicalInventory(client);
    const sequences=[];for(const sequence of inventory.catalog.sequences){const state=(await client.query(`SELECT last_value::text AS value,is_called FROM ${qualified(sequence.schema,sequence.name)}`)).rows[0];sequences.push({...sequence,...state});}
    async function* records(){
      yield JSON.stringify({kind:'header',format:1,projectRef,identity:inventory.identity,catalog:inventory.catalog,groups:inventory.groups,sequences})+'\n';
      for(const group of inventory.groups){
        yield JSON.stringify({kind:'group-start',tables:group})+'\n';
        for(const table of group){
          const hash=createHash('sha256');let count=0;
          await client.query(`DECLARE getafe_backup_cursor NO SCROLL CURSOR FOR SELECT row_to_json(record)::text AS payload FROM ${qualified('public',table)} record`);
          try {while(true){const batch=await client.query('FETCH FORWARD 128 FROM getafe_backup_cursor');if(!batch.rowCount)break;for(const {payload}of batch.rows){hash.update(payload+'\n');yield JSON.stringify({kind:'row',table,payload})+'\n';count++;}}}
          finally{await client.query('CLOSE getafe_backup_cursor');}
          report.tables++;report.rows+=count;yield JSON.stringify({kind:'table-end',table,count,checksum:hash.digest('hex')})+'\n';
        }
        yield JSON.stringify({kind:'group-end'})+'\n';
      }
    }
    const cipher=createCipheriv('aes-256-gcm',key,iv);await pipeline(Readable.from(records()),cipher,createWriteStream(file,{flags:'a',mode:0o600}));await fs.appendFile(file,cipher.getAuthTag());
    await client.query('COMMIT');return report;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});await fs.unlink(file).catch(()=>{});throw error;}
}

export async function restoreHistoricalBackup(client,{file,projectRef,sourceRef,conflicts='abort'}) {
  if(!['abort','preserve-destination'].includes(conflicts))throw new Error('Choose abort or preserve-destination conflict handling.');
  const stat=await fs.stat(file);if(stat.size<36)throw new Error('The encrypted backup is incomplete.');
  const handle=await fs.open(file,'r');const header=Buffer.alloc(20),tag=Buffer.alloc(16);await handle.read(header,0,20,0);await handle.read(tag,0,16,stat.size-16);await handle.close();
  if(header.subarray(0,8).toString()!=='GETAFEB1')throw new Error('Unsupported backup format.');
  await fs.mkdir('data/recovery',{recursive:true});const temporary=`data/recovery/restore-${randomUUID()}.jsonl`;
  const cipher=createDecipheriv('aes-256-gcm',await backupKey(),header.subarray(8));cipher.setAuthTag(tag);
  try {
    // Authenticate the entire encrypted backup before applying any database write.
    await pipeline(createReadStream(file,{start:20,end:stat.size-17}),cipher,createWriteStream(temporary,{flags:'wx',mode:0o600}));
    return await withMigrationLock(client,async()=>{
      const target=await readCatalog(client),targetTables=new Set(target.tables.map(table=>table.name));
      const instance=(await client.query('SELECT id FROM getafe_database_identity WHERE singleton=TRUE')).rows[0]?.id;
      const operationId=randomUUID(),report={operationId,sourceRef,targetRef:projectRef,inserted:0,conflicts:0,tables:[],retainedControlTables:[],state:'running'};
      let source,transaction=false,altered=[],counts=new Map(),hashes=new Map(),buffer=[],bufferTable,committed;
      const flush=async()=>{
        if(!buffer.length)return;
        const table=bufferTable;
        if(retained.has(table)){buffer=[];return;}
        const columns=source.catalog.columns.filter(column=>column.table===table&&!column.generated).map(column=>column.name);
        for(const column of source.catalog.columns.filter(column=>column.table===table&&!column.generated))if(!target.columns.some(item=>item.table===table&&item.name===column.name&&item.type===column.type))throw new Error(`Historical schema compatibility review is required for ${table}.${column.name}.`);
        // Encrypted settings/credentials need their original keys. They are not
        // silently imported as unusable opaque values or replaced with blanks.
        const pk=target.constraints.find(item=>item.table===table&&item.type==='p')?.definition.match(/\(([^)]+)\)/)?.[1].split(',').map(value=>value.trim().replaceAll('"',''));
        if(!pk?.length)throw new Error(`A primary key is required for resumable restoration of ${table}.`);
        const existing=new Map();
        if(['system_settings','users','portal_users','integration_installations'].includes(table)) {
          const relation=qualified('public',table);
          const found=await client.query(`SELECT to_jsonb(target) AS record FROM ${relation} target JOIN json_populate_recordset(NULL::${relation},$1::json) source ON ${pk.map(key=>`target.${identifier(key)}=source.${identifier(key)}`).join(' AND ')}`,['['+buffer.join(',')+']']);
          for(const row of found.rows)existing.set(JSON.stringify(pk.map(key=>row.record[key])),row.record);
        }
        const prepared=[];for(const payload of buffer){const row=JSON.parse(payload);prepared.push(await prepareProtectedHistoricalRow(table,payload,existing.get(JSON.stringify(pk.map(key=>row[key])))));}
        const list=columns.map(identifier).join(','),relation=qualified('public',table),data='['+prepared.join(',')+']';
        const inserted=await client.query(`INSERT INTO ${relation}(${list}) OVERRIDING SYSTEM VALUE SELECT ${list} FROM json_populate_recordset(NULL::${relation},$1::json) ON CONFLICT DO NOTHING`,[data]);
        const ignored=target.columns.filter(column=>column.table===table&&(!columns.includes(column.name)||column.generated)).map(column=>column.name);
        const mismatch=(await client.query(`SELECT count(*)::int AS count FROM json_populate_recordset(NULL::${relation},$1::json) source LEFT JOIN ${relation} target ON ${pk.map(key=>`target.${identifier(key)}=source.${identifier(key)}`).join(' AND ')} WHERE (to_jsonb(target)-$2::text[]) IS DISTINCT FROM (to_jsonb(source)-$2::text[])`,[data,ignored])).rows[0].count;
        if(mismatch&&conflicts==='abort')throw new Error(`Historical records conflict with existing destination values in ${table}; the current dependency group was rolled back.`);
        report.inserted+=inserted.rowCount;report.conflicts+=mismatch;buffer=[];
      };
      try {
        for await(const line of createInterface({input:createReadStream(temporary),crlfDelay:Infinity})) {
          if(!line)continue;const record=JSON.parse(line);
          if(record.kind==='header') {
            source=record;
            if(source.projectRef!==sourceRef||sourceRef===projectRef||source.identity===instance)throw new Error('Source/destination identity verification failed; restoring into the source is forbidden.');
            for(const group of source.groups)for(const table of group)if(!targetTables.has(table))throw new Error(`Source table ${table} needs a reviewed destination migration; no table is silently excluded.`);
            for(const column of source.catalog.columns)if(!retained.has(column.table)&&!column.generated&&!target.columns.some(item=>item.table===column.table&&item.name===column.name&&item.type===column.type))throw new Error(`Historical schema compatibility review is required for ${column.table}.${column.name}; no records were copied.`);
            for(const column of target.columns)if(!retained.has(column.table)&&column.not_null&&!column.default&&!column.generated&&!column.identity&&source.catalog.tables.some(table=>table.name===column.table)&&!source.catalog.columns.some(item=>item.table===column.table&&item.name===column.name))throw new Error(`A required destination column needs a reviewed historical mapping: ${column.table}.${column.name}.`);
            await client.query('INSERT INTO getafe_database_operations(id,operation,state,project_ref,report) VALUES($1,$2,$3,$4,$5::jsonb)',[operationId,'historical-restore','running',projectRef,JSON.stringify({sourceRef,sourceInstance:source.identity,conflicts,backgroundJobsApproved:false})]);
          }else if(record.kind==='group-start') {
            if(!source)throw new Error('Backup header is missing.');
            committed={inserted:report.inserted,conflicts:report.conflicts,tables:report.tables.length,retained:report.retainedControlTables.length};
            await client.query('BEGIN');transaction=true;await client.query("SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s'");
            altered=(await client.query(`SELECT c.relname AS table,k.conname AS name,k.condeferrable,k.condeferred FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_class p ON p.oid=k.confrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE k.contype='f' AND n.nspname='public' AND c.relname=ANY($1::text[]) AND p.relname=ANY($1::text[])`,[record.tables])).rows;
            for(const constraint of altered)await client.query(`ALTER TABLE ${qualified('public',constraint.table)} ALTER CONSTRAINT ${identifier(constraint.name)} DEFERRABLE INITIALLY DEFERRED`);
          }else if(record.kind==='row') {
            if(bufferTable&&bufferTable!==record.table)await flush();bufferTable=record.table;
            counts.set(record.table,(counts.get(record.table)||0)+1);if(!hashes.has(record.table))hashes.set(record.table,createHash('sha256'));hashes.get(record.table).update(record.payload+'\n');buffer.push(record.payload);if(buffer.length>=128)await flush();
          }else if(record.kind==='table-end') {
            await flush();const checksum=(hashes.get(record.table)||createHash('sha256')).digest('hex');
            if((counts.get(record.table)||0)!==record.count||checksum!==record.checksum)throw new Error('Backup table count/checksum verification failed.');
            (retained.has(record.table)?report.retainedControlTables:report.tables).push({table:record.table,sourceRows:record.count,reason:retained.has(record.table)?'Preserve target identity, migration journal, administrator setup and transient-state isolation.':undefined});
          }else if(record.kind==='group-end') {
            await flush();await client.query('SET CONSTRAINTS ALL IMMEDIATE');
            for(const constraint of altered)await client.query(`ALTER TABLE ${qualified('public',constraint.table)} ALTER CONSTRAINT ${identifier(constraint.name)} ${constraint.condeferrable?'DEFERRABLE':'NOT DEFERRABLE'} INITIALLY ${constraint.condeferred?'DEFERRED':'IMMEDIATE'}`);
            await client.query('COMMIT');transaction=false;
            await client.query('UPDATE getafe_database_operations SET report=report||$2::jsonb WHERE id=$1',[operationId,JSON.stringify({tables:report.tables,retainedControlTables:report.retainedControlTables,inserted:report.inserted,conflicts:report.conflicts})]);
          }
        }
        if(transaction)throw new Error('Backup ended inside an incomplete dependency group.');
        for(const sequence of source.sequences){const actual=(await client.query(`SELECT last_value::text AS value,is_called FROM ${qualified(sequence.schema,sequence.name)}`)).rows[0];const value=BigInt(actual.value)>BigInt(sequence.value)?actual.value:sequence.value;await client.query('SELECT setval($1::regclass,$2::bigint,$3)',[qualified(sequence.schema,sequence.name),value,actual.is_called||sequence.is_called]);}
        report.state=report.conflicts?'partial_conflicts_preserved':'complete';
        await client.query('UPDATE getafe_database_operations SET state=$2,completed_at=CURRENT_TIMESTAMP,report=report||$3::jsonb WHERE id=$1',[operationId,report.state,JSON.stringify(report)]);return report;
      }catch(error){if(transaction){await client.query('ROLLBACK');report.inserted=committed.inserted;report.conflicts=committed.conflicts;report.tables.length=committed.tables;report.retainedControlTables.length=committed.retained;}await client.query("UPDATE getafe_database_operations SET state='failed',completed_at=CURRENT_TIMESTAMP,report=report||$2::jsonb WHERE id=$1",[operationId,JSON.stringify({completedTables:report.tables,inserted:report.inserted,conflicts:report.conflicts,reason:'See sanitized operator error; completed groups are resumable with exact-record duplicate verification.'})]).catch(()=>{});throw error;}
    });
  }finally{await fs.unlink(temporary).catch(()=>{});}
}
