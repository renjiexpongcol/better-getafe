import { timingSafeEqual } from 'node:crypto';
import { maintenanceActions,maintenanceSignature } from './managementRoutes.js';
import { inspectDatabase,migrateDatabase,withMigrationLock } from './maintenance.js';
import { repairDatabase } from './repair.js';
import { seedSystemRecords } from './seeds.js';
import { rebuildDerivedData,reconcileStorage } from './reconciliation.js';

export async function executeMaintenanceJob(client,{id,projectRef,expected,migrations,allowReviewedChanges=false}) {
  return withMigrationLock(client,async()=>{
    const job=(await client.query('SELECT * FROM getafe_database_operations WHERE id=$1',[id])).rows[0];
    if(!job||job.state!=='requested'||!maintenanceActions.includes(job.operation))throw new Error('The maintenance request is missing, already claimed or unsupported.');
    const report=job.report.authorization,signature=job.report.signature;
    const inspection=await inspectDatabase(client,{expected,migrations});
    if(!report||report.instance!==inspection.identity.instance||job.project_ref!==projectRef||report.action!==job.operation||Date.now()-report.authorizedAt>86400000||report.authorizedAt>Date.now()+30000)throw new Error('Maintenance authorization is expired or belongs to another database.');
    const expectedSignature=maintenanceSignature(report);
    if(!signature||signature.length!==expectedSignature.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expectedSignature)))throw new Error('Maintenance authorization signature is invalid.');
    const actor=(await client.query("SELECT id FROM users WHERE id=$1 AND role IN ('admin','super_admin') AND mfa_enabled=TRUE",[report.actorId])).rows[0];
    if(!actor)throw new Error('The authorizing administrator is no longer eligible.');
    await client.query("UPDATE getafe_database_operations SET state='running' WHERE id=$1",[id]);
    try {
      let result;
      if(job.operation==='repair')result=await repairDatabase(client,{expected,migrations,projectRef});
      if(job.operation==='migrate')result=await migrateDatabase(client,{expected,migrations,projectRef,allowReviewedChanges});
      if(job.operation==='seed'){await seedSystemRecords(client);result={state:(await inspectDatabase(client,{expected,migrations})).state};}
      if(job.operation==='rebuild-derived')result=await rebuildDerivedData(client);
      if(job.operation==='reconcile')result=await reconcileStorage(client);
      if(result?.state==='manual_review_required')throw new Error('This repair requires reviewed changes before execution.');
      const summary={...result};delete summary.inspection;
      await client.query("UPDATE getafe_database_operations SET state='complete',completed_at=CURRENT_TIMESTAMP,report=report||$2::jsonb WHERE id=$1",[id,JSON.stringify({result:summary})]);
      return{id,state:'complete',result:summary};
    }catch(error){await client.query("UPDATE getafe_database_operations SET state='failed',completed_at=CURRENT_TIMESTAMP,report=report||'{\"failure\":\"Operator action did not complete; inspect the sanitized operator diagnostic.\"}'::jsonb WHERE id=$1",[id]);throw error;}
  });
}
