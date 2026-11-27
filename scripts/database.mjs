import fs from 'node:fs/promises';
import pg from 'pg';
import { loadLocalEnvironment } from '../server/src/config/supabaseSetup.js';
import { supabaseConnectionOptions, getSupabaseDatabaseUrl } from '../server/src/services/postgres.js';
import { migrationFiles, expectedSchema, inspectDatabase, migrateDatabase, manifestFile, databaseFailure } from '../server/src/database/maintenance.js';
import { digest } from '../server/src/database/catalog.js';
import { repairPlan, repairDatabase } from '../server/src/database/repair.js';
import { seedSystemRecords } from '../server/src/database/seeds.js';
import { configureFreshInstallation,provisionInitialAdministrator,provisionRuntimeRole } from '../server/src/database/operator.js';
import { executeMaintenanceJob } from '../server/src/database/jobs.js';
import { rebuildDerivedData,reconcileStorage } from '../server/src/database/reconciliation.js';
import { withMigrationLock } from '../server/src/database/maintenance.js';
import {historicalInventory,exportHistoricalBackup,restoreHistoricalBackup} from '../server/src/database/history.js';

await loadLocalEnvironment();
const operation = process.argv[2] || 'status';
const args = process.argv.slice(3);
const option = name => { const index=args.indexOf(name); return index<0?null:args[index+1]; };
const apply = args.includes('--apply');
const ref = process.env.SUPABASE_PROJECT_REF;
let client;
try {
  if (operation === 'help') {
    console.info('database.mjs status|inspect|validate|bootstrap|migrate|repair|seed|configure|admin|runtime-role|execute-job|reconcile|rebuild-derived|backup|restore-plan|restore|adopt-history|snapshot [--apply --confirm-ref PROJECT] [--allow-reviewed-migrations]. Historical read-only source: --source --source-ref REF with SOURCE_DATABASE_URL. Restore: --file BACKUP --source-ref REF [--conflicts preserve-destination].');
  } else {
    if (!getSupabaseDatabaseUrl(process.env).url && !process.env.DIRECT_DATABASE_URL) throw new Error('Database is not configured. Connect Supabase first.');
    const writes = ['recover','bootstrap','migrate','snapshot','repair','seed','configure','admin','runtime-role','execute-job','rebuild-derived','adopt-history','restore','approve-restored-jobs'].includes(operation);
    if (writes && apply && (!ref || option('--confirm-ref') !== ref)) throw new Error('Pass --apply --confirm-ref with the intended Supabase project reference.');
    if (ref === 'wrgbfwexraarwxpoqzpv' && writes && apply && !args.includes('--authorize-existing-production')) throw new Error('The previous production database is protected from this recovery operation.');
    const sourceMode=args.includes('--source');
    if(sourceMode&&!['backup','restore-plan'].includes(operation))throw new Error('Source credentials can only be used for read-only inventory and backup export.');
    if(sourceMode&&(!process.env.SOURCE_DATABASE_URL||!option('--source-ref')))throw new Error('Supply SOURCE_DATABASE_URL securely and --source-ref before accessing historical source records.');
    const intendedRef=sourceMode?option('--source-ref'):ref;
    const env = { ...process.env, ...(sourceMode?{DATABASE_URL:process.env.SOURCE_DATABASE_URL,SUPABASE_PROJECT_REF:intendedRef}:writes && process.env.DIRECT_DATABASE_URL ? { DATABASE_URL: process.env.DIRECT_DATABASE_URL } : {}) };
    const configuredUrl=new URL(getSupabaseDatabaseUrl(env).url);
    const actualRef=configuredUrl.hostname.endsWith('.pooler.supabase.com')?decodeURIComponent(configuredUrl.username).split('.').at(-1):configuredUrl.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1];
    if(!intendedRef||actualRef!==intendedRef)throw new Error('The actual connection identity does not match the intended Supabase project; no operation was run.');
    client = new pg.Client({ ...supabaseConnectionOptions('database',env),connectionTimeoutMillis:10000,query_timeout:90000,application_name:'getafe-database-operator' });
    await client.connect();
    const migrations = await migrationFiles(), expected = await expectedSchema();
    const version = digest(migrations.map(({version,checksum})=>({version,checksum})));
    if(operation==='recover'){
      if(!apply)console.info(JSON.stringify({operation,dryRun:true,...await inspectDatabase(client,{expected,migrations})},null,2));
      else{
        if(!expected||expected.migrationDigest!==version)throw new Error('Recovery requires a release-matched trusted schema reference.');
        let inspection=await inspectDatabase(client,{expected,migrations});
        if(inspection.pendingMigrations.length)await migrateDatabase(client,{projectRef:ref,expected,migrations,allowReviewedChanges:args.includes('--allow-reviewed-migrations')});
        inspection=await inspectDatabase(client,{expected,migrations});
        if(inspection.changedMigrations.length||inspection.unknownMigrations.length||inspection.missingChecksums.length)throw new Error('Resolve unverified or inconsistent migration history before automatic recovery.');
        const repair=await repairDatabase(client,{expected,migrations,projectRef:ref});
        if(repair.state==='manual_review_required')throw new Error('Recovery stopped at schema drift requiring a reviewed migration; no destructive correction was applied.');
        await configureFreshInstallation(client);await provisionRuntimeRole(client,{projectRef:ref});
        if(args.includes('--confirm-first-admin'))await provisionInitialAdministrator(client,{name:option('--name'),email:option('--email'),projectRef:ref,confirmed:true});
        const derived=await withMigrationLock(client,()=>rebuildDerivedData(client));
        inspection=await inspectDatabase(client,{expected,migrations});
        console.info(JSON.stringify({operation,state:inspection.state,instance:inspection.identity.instance,tables:inspection.tables,derived,history:'Historical records require a separate verified source/backup; none were fabricated.'},null,2));
        if(inspection.state!=='healthy')process.exitCode=1;
      }
    }else if (['bootstrap','migrate'].includes(operation)) {
      if (!apply) console.info(JSON.stringify({ operation, dryRun:true, ...await inspectDatabase(client,{expected,migrations}) },null,2));
      else {
        const result = await migrateDatabase(client,{projectRef:ref,expected,migrations,allowReviewedChanges:args.includes('--allow-reviewed-migrations')});
        console.info(JSON.stringify({operation,applied:result.applied.length,state:result.state,tables:result.inspection.tables,instance:result.inspection.identity.instance}));
      }
    } else if(operation==='approve-restored-jobs') {
      if(!apply||!args.includes('--confirm-reviewed-deliveries'))throw new Error('Review restored delivery records, provider configuration and identities, then pass --confirm-reviewed-deliveries --apply --confirm-ref.');
      const inspection=await inspectDatabase(client,{expected,migrations});if(inspection.state!=='healthy')throw new Error('Restore and validate the installation before activating background work.');
      await withMigrationLock(client,async()=>{
        const last=(await client.query("SELECT state FROM getafe_database_operations WHERE operation='historical-restore' ORDER BY started_at DESC LIMIT 1")).rows[0];
        if(!last||!['complete','partial_conflicts_preserved'].includes(last.state))throw new Error('The latest restore must finish before background work can be approved.');
        await client.query("UPDATE getafe_database_operations SET report=report||jsonb_build_object('backgroundJobsApproved',true,'jobsApprovedAt',CURRENT_TIMESTAMP) WHERE operation='historical-restore'");
      });console.info(JSON.stringify({state:'background_jobs_approved',operatorConfirmation:true}));
    } else if(operation==='backup') {
      console.info(JSON.stringify(await exportHistoricalBackup(client,{projectRef:intendedRef}),null,2));
    } else if(operation==='restore-plan') {
      const inventory=await historicalInventory(client);console.info(JSON.stringify({tables:inventory.tables,groups:inventory.groups,instance:inventory.identity,policy:'All source tables are inventoried. Destination identities, journals and transient auth states are explicitly retained. Conflicting records are never overwritten automatically.'},null,2));
    } else if(operation==='restore') {
      if(!apply)throw new Error('Restore requires --apply --confirm-ref, --source-ref and an authenticated encrypted backup file.');
      console.info(JSON.stringify(await restoreHistoricalBackup(client,{file:option('--file'),projectRef:ref,sourceRef:option('--source-ref'),conflicts:option('--conflicts')||'abort'}),null,2));
    } else if(operation==='execute-job') {
      if(!apply)throw new Error('Job execution requires explicit operator approval with --apply --confirm-ref.');
      console.info(JSON.stringify(await executeMaintenanceJob(client,{id:option('--id'),projectRef:ref,expected,migrations,allowReviewedChanges:args.includes('--allow-reviewed-migrations')}),null,2));
    } else if(operation==='reconcile') {
      console.info(JSON.stringify(await reconcileStorage(client),null,2));
    } else if(operation==='rebuild-derived') {
      if(!apply)throw new Error('Derived reconstruction requires --apply --confirm-ref.');
      console.info(JSON.stringify(await withMigrationLock(client,()=>rebuildDerivedData(client)),null,2));
    } else if(operation==='adopt-history') {
      if(!apply)throw new Error('History adoption requires --apply --confirm-ref after reviewing the schema comparison.');
      const inspection=await inspectDatabase(client,{expected,migrations});
      if(!expected||inspection.pendingMigrations.length||inspection.missingObjects.length||inspection.schemaDrift.length||inspection.changedMigrations.length||inspection.unknownMigrations.length)throw new Error('Only a fully compatible, known migration history can be adopted.');
      await withMigrationLock(client,async()=>{await client.query('BEGIN');try{for(const migration of migrations)await client.query('UPDATE schema_migrations SET checksum=$1 WHERE version=$2 AND checksum IS NULL',[migration.checksum,migration.version]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}});
      console.info(JSON.stringify({operation,adopted:inspection.missingChecksums.length}));
    } else if (operation === 'repair') {
      const inspection=await inspectDatabase(client,{expected,migrations});
      const result=apply?await repairDatabase(client,{expected,migrations,projectRef:ref}):{dryRun:true,...repairPlan(inspection,expected)};
      console.info(JSON.stringify(result,null,2));
      if(result.state==='manual_review_required')process.exitCode=1;
    } else if (['seed','configure','admin','runtime-role'].includes(operation)) {
      if(!apply)throw new Error('This operator action requires --apply --confirm-ref.');
      const inspection=await inspectDatabase(client,{expected,migrations});
      if(inspection.pendingMigrations.length||inspection.missingObjects.length||inspection.schemaDrift.length)throw new Error('Repair/initialize the schema before this operator action.');
      let result;
      if(operation==='seed'){await seedSystemRecords(client);result={state:'complete',remaining:await inspectDatabase(client,{expected,migrations})};}
      if(operation==='configure')result=await configureFreshInstallation(client);
      if(operation==='admin')result=await provisionInitialAdministrator(client,{name:option('--name'),email:option('--email'),projectRef:ref,confirmed:args.includes('--confirm-first-admin')});
      if(operation==='runtime-role')result=await provisionRuntimeRole(client,{projectRef:ref});
      console.info(JSON.stringify({operation,...result},null,2));
    } else if (operation === 'snapshot') {
      if (!apply) throw new Error('Snapshot requires --apply --confirm-ref after a verified fresh migration run.');
      const inspection = await inspectDatabase(client,{migrations});
      if (inspection.pendingMigrations.length || inspection.changedMigrations.length || inspection.missingSystemRecords.length) throw new Error('Cannot capture an incomplete reference schema.');
      if (expected) throw new Error('The reference manifest already exists. Generate a new reference only in a separate verified fresh test database when migrations change.');
      const verifiedFresh = await client.query("SELECT 1 FROM getafe_database_operations WHERE operation='bootstrap' AND report->>'previousState'='empty' AND project_ref=$1 LIMIT 1", [ref]);
      if (!verifiedFresh.rowCount) throw new Error('Reference capture requires a recorded migration run that started with zero public tables.');
      const manifest = { format:1,migrationDigest:version,migrations:migrations.map(({version,checksum})=>({version,checksum})),catalog:inspection.catalog };
      await fs.writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');
      console.info(JSON.stringify({operation,tables:inspection.tables,objects:inspection.actualObjects,output:'database/schema-manifest.json'}));
    } else if (['status','inspect','validate','verify'].includes(operation)) {
      const inspection = await inspectDatabase(client,{expected,migrations});
      const {catalog,...summary}=inspection;
      console.info(JSON.stringify(operation==='inspect'?inspection:summary,null,2));
      if (['validate','verify'].includes(operation) && inspection.state!=='healthy') process.exitCode=1;
      if (expected && expected.migrationDigest!==version) {console.error('[Database] The reference manifest does not match the release migrations.');process.exitCode=1;}
    } else throw new Error('Unknown database operation. Use help.');
  }
} catch(error) {
  const safe=error.code && !error.operatorSafe ? `Database operation failed: ${databaseFailure(error)} (${/^[A-Z0-9_]+$/.test(error.code)?error.code:'ERROR'}).` : error.message;
  console.error(`[Database] ${safe}`);process.exitCode=1;
} finally {await client?.end().catch(()=>{});}
