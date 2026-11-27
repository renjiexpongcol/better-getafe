import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { DATABASE_MIGRATION_FREEZE_LOCK_ID } from '../services/postgres.js';
import { readCatalog, compareCatalog, digest } from './catalog.js';
import { inspectSystemRecords, seedSystemRecords } from './seeds.js';

const migrationDirectory = new URL('../../../database/migrations/postgresql/', import.meta.url);
export const manifestFile = new URL('../../../database/schema-manifest.json', import.meta.url);
export async function migrationFiles() {
  const files = (await fs.readdir(migrationDirectory)).filter(file => /^\d+.*\.sql$/.test(file)).sort();
  return Promise.all(files.map(async version => { const sql = (await fs.readFile(new URL(version, migrationDirectory), 'utf8')).replaceAll('\r\n','\n'); return { version, sql, checksum: digest(sql) }; }));
}
export async function expectedSchema() {
  try { return JSON.parse(await fs.readFile(manifestFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export function databaseFailure(error) {
  if (['28P01','28000'].includes(error.code)) return 'invalid_credentials';
  if (error.code === '42501') return 'insufficient_permissions';
  if (error.code === '3D000') return 'incorrect_database_identity';
  if (/CERT|TLS|SSL|SELF_SIGNED/.test(error.code || '')) return 'tls_failure';
  if (['42P01','42703','42704','42883'].includes(error.code)) return 'missing_objects';
  if (/^(?:ECONN|ENET|ENOT|EHOST|ETIMED|EAI)/.test(error.code || '')) return 'unreachable';
  return 'database_error';
}
export async function inspectDatabase(client, { expected, migrations = [] } = {}) {
  const identity = (await client.query('SELECT current_database() AS database,current_user AS role,version() AS version')).rows[0];
  const catalog = await readCatalog(client);
  const names = new Set(catalog.tables.map(table => table.name));
  let journal = [];
  if (names.has('schema_migrations')) {
    const checksums = catalog.columns.some(column => column.table === 'schema_migrations' && column.name === 'checksum');
    journal = (await client.query(`SELECT version,${checksums ? 'checksum' : 'NULL::text AS checksum'} FROM schema_migrations ORDER BY version`)).rows;
  }
  const pending = migrations.filter(file => !journal.some(row => row.version === file.version)).map(({version}) => version);
  const changed = journal.filter(row => row.checksum && migrations.some(file => file.version === row.version && file.checksum !== row.checksum)).map(row => row.version);
  const unknown = journal.filter(row => !migrations.some(file => file.version === row.version)).map(row => row.version);
  const missingChecksums = journal.filter(row => !row.checksum).map(row => row.version);
  const comparison = expected ? compareCatalog(expected.catalog, catalog) : { missing: [], drift: [], expectedObjects: null };
  const missingSystemRecords = await inspectSystemRecords(client, names);
  const instance = names.has('getafe_database_identity') ? (await client.query('SELECT id FROM getafe_database_identity WHERE singleton=TRUE')).rows[0]?.id : null;
  if(names.has('getafe_database_identity')&&!instance)missingSystemRecords.push({table:'getafe_database_identity',key:'original_installation_identity',requiresVerifiedSource:true});
  const lastOperation=names.has('getafe_database_operations')?(await client.query('SELECT id,operation,state,started_at,completed_at FROM getafe_database_operations ORDER BY started_at DESC LIMIT 1')).rows[0]:null;
  const permission = (await client.query("SELECT has_schema_privilege(current_user,'public','CREATE') AS can_modify_schema")).rows[0];
  let runtimeRole=null;
  if(process.env.GETAFE_RUNTIME_ROLE&&names.size) {
    const role=process.env.GETAFE_RUNTIME_ROLE;
    const row=(await client.query("SELECT rolname,rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR has_schema_privilege(rolname,'public','CREATE') AS overprivileged FROM pg_roles WHERE rolname=$1",[role])).rows[0];
    const missingPolicies=catalog.tables.filter(table=>table.rls&&!catalog.policies.some(policy=>policy.table===table.name&&policy.name==='getafe_backend'&&policy.roles.includes(role))).map(table=>table.name);
    const missingSelect=row?(await client.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT has_table_privilege($1,c.oid,'SELECT')",[role])).rows.map(item=>item.relname):[...names];
    runtimeRole={name:role,exists:Boolean(row),overprivileged:Boolean(row?.overprivileged),missingPolicies,missingSelect,ready:Boolean(row)&&!row.overprivileged&&!missingPolicies.length&&!missingSelect.length};
  }
  const state = !names.size ? 'empty' : changed.length || unknown.length ? 'inconsistent_migrations' : pending.length ? (journal.length ? 'outdated' : 'partially_initialized') : comparison.drift.length ? 'schema_drift' : comparison.missing.length ? 'missing_objects' : runtimeRole&&!runtimeRole.ready?'insufficient_permissions':missingSystemRecords.length ? 'missing_system_records' : missingChecksums.length ? 'unverified_migration_history' : !expected ? 'reference_manifest_missing' : 'healthy';
  return { state, identity: { ...identity, instance },lastOperation,runtimeRole, permissions: permission, tables: names.size, expectedObjects: comparison.expectedObjects, actualObjects: Object.values(catalog).reduce((sum,rows) => sum+rows.length,0), pendingMigrations: pending, changedMigrations: changed, unknownMigrations: unknown, missingChecksums, missingObjects: comparison.missing, schemaDrift: comparison.drift, missingSystemRecords, catalog };
}

export async function withMigrationLock(client, work, { timeoutMs = 10000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let locked = false;
  while (Date.now() < deadline) {
    locked = (await client.query('SELECT pg_try_advisory_lock($1) AS locked', [DATABASE_MIGRATION_FREEZE_LOCK_ID])).rows[0]?.locked;
    if (locked) break;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  if (!locked) throw Object.assign(new Error('Another database operation holds the migration lock.'), { code: 'MIGRATION_LOCK_BUSY' });
  try { return await work(); }
  finally { await client.query('SELECT pg_advisory_unlock($1)', [DATABASE_MIGRATION_FREEZE_LOCK_ID]); }
}

export async function migrateDatabase(client, { projectRef, expected, migrations, allowReviewedChanges = false }) {
  return withMigrationLock(client, async () => {
    const before = await inspectDatabase(client, { expected, migrations });
    if (before.changedMigrations.length || before.unknownMigrations.length) throw new Error('Migration history differs from this release; no changes were applied.');
    if (!before.permissions.can_modify_schema) throw new Error('Use separate migration credentials with schema permissions.');
    const release=digest(migrations.map(({version,checksum})=>({version,checksum})));
    const resumable=before.catalog.tables.some(table=>table.name==='getafe_database_operations')&&(await client.query("SELECT 1 FROM getafe_database_operations WHERE report->>'initialState'='empty' AND report->>'release'=$1 AND state IN ('running','failed') LIMIT 1",[release])).rowCount;
    if (before.state !== 'empty' && before.pendingMigrations.length && !allowReviewedChanges&&!resumable) throw new Error('An existing database needs explicit --allow-reviewed-migrations before applying pending versioned changes.');
    const tracking=migrations.find(file=>file.version==='058_database_recovery.sql')?.sql.match(/CREATE TABLE IF NOT EXISTS getafe_database_operations\s*\([\s\S]*?\);/)?.[0];
    if(!tracking)throw new Error('Recovery tracking DDL is missing from its authoritative migration.');
    await client.query(tracking);
    await client.query('ALTER TABLE getafe_database_operations ENABLE ROW LEVEL SECURITY; REVOKE ALL ON getafe_database_operations FROM PUBLIC');
    const operationId=randomUUID();
    await client.query('INSERT INTO getafe_database_operations(id,operation,state,project_ref,report) VALUES($1,$2,$3,$4,$5::jsonb)',[operationId,'bootstrap','running',projectRef,JSON.stringify({previousState:before.state,initialState:before.state==='empty'||resumable?'empty':'existing',release})]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,checksum TEXT)');
    await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT');
    const applied = [];
    for (const migration of migrations) {
      if (!before.pendingMigrations.includes(migration.version)) continue;
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout='5s'");
        await client.query("SET LOCAL statement_timeout='60s'");
        await client.query("SET LOCAL getafe.import_source_catalog='off'");
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', [migration.version,migration.checksum]);
        await client.query('COMMIT'); applied.push(migration.version);
        console.info(`[Database] Applied ${migration.version}`);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        await client.query("UPDATE getafe_database_operations SET state='failed',completed_at=CURRENT_TIMESTAMP,report=report||$2::jsonb WHERE id=$1",[operationId,JSON.stringify({failedMigration:migration.version,code:error.code,applied})]).catch(()=>{});
        throw Object.assign(new Error(`Migration ${migration.version} failed (${/^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'SQL_ERROR'}); its transaction was rolled back. Earlier completed migrations are resumable.`), { code: error.code, operatorSafe: true });
      }
    }
    try{await seedSystemRecords(client);}catch(error){await client.query("UPDATE getafe_database_operations SET state='failed',completed_at=CURRENT_TIMESTAMP,report=report||'{\"failedStage\":\"essential_system_records\"}'::jsonb WHERE id=$1",[operationId]).catch(()=>{});throw error;}
    const after = await inspectDatabase(client, { expected, migrations });
    await client.query('UPDATE getafe_database_operations SET state=$2,completed_at=CURRENT_TIMESTAMP,report=report||$3::jsonb WHERE id=$1',[operationId,after.state,JSON.stringify({applied,instance:after.identity.instance})]);
    return { applied, state: after.state, inspection: after };
  });
}
