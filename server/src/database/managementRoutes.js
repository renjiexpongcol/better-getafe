import { createHmac,randomUUID } from 'node:crypto';
import { runtimeDatabaseInspection } from './runtime.js';
import { getConfigPool } from '../config/DatabaseSettingsProvider.js';
import { requirePermission } from '../config/permissions.js';
import { getCmsUserById } from '../repositories/cmsUserRepository.js';
import { decryptMfaSecret,verifyTotp } from '../services/mfa.js';
import fs from 'node:fs/promises';

export const maintenanceActions=['repair','seed','rebuild-derived','reconcile','migrate'];
export const maintenanceSignature=report=>createHmac('sha256',process.env.SETTINGS_ENCRYPTION_KEY||'').update(JSON.stringify(['actorId','instance','action','authorizedAt','nonce'].map(key=>report[key]))).digest('hex');
export function installDatabaseManagementRoutes(app) {
  const allowed=(req,res,next)=>{try{requirePermission(req.admin,'settings.database.edit');next();}catch{res.status(403).json({error:'Database management permission is required.'});}};
  app.get('/api/admin/settings/database-management',allowed,async(_req,res)=>{
    try {
      const {catalog,...inspection}=await runtimeDatabaseInspection({force:true});
      const inventory=JSON.parse(await fs.readFile(new URL('../../../database/system-inventory.json',import.meta.url),'utf8'));
      res.json({...inspection,expectedSchemaVersion:inventory.migrations.at(-1)?.file,discovery:inventory.summary,maintenanceActions,execution:'authorized-operator-cli',objects:catalog.tables.map(({name,rls})=>({name,rls}))});
    }catch{res.status(503).json({error:'Database inspection is unavailable. Use the authorized recovery CLI.'});}
  });
  app.post('/api/admin/settings/database-management',allowed,async(req,res)=>{
    const {action,confirmed,code}=req.body||{};
    if(!['inspect','validate','connection',...maintenanceActions].includes(action))return res.status(422).json({error:'Choose a supported database action.'});
    try {
      const inspection=await runtimeDatabaseInspection({force:true});
      if(!maintenanceActions.includes(action)) {
        return res.status(action==='validate'&&inspection.state!=='healthy'?409:200).json({state:inspection.state,connected:true,instance:inspection.identity.instance,missingObjects:inspection.missingObjects,missingSystemRecords:inspection.missingSystemRecords});
      }
      if(confirmed!==true)return res.status(422).json({error:'Confirm the maintenance request.'});
      const account=await getCmsUserById(req.admin.id);
      if(!account?.mfa_enabled||!account.mfa_secret_encrypted||!verifyTotp(decryptMfaSecret(account.mfa_secret_encrypted),code))return res.status(403).json({error:'A current authenticator code is required for maintenance.'});
      if(!process.env.SETTINGS_ENCRYPTION_KEY)return res.status(503).json({error:'Maintenance authorization is not configured.'});
      const report={actorId:req.admin.id,instance:inspection.identity.instance,action,authorizedAt:Date.now(),nonce:randomUUID()};
      const id=randomUUID(),pool=await getConfigPool();
      await pool.query('INSERT INTO getafe_database_operations(id,operation,state,project_ref,report) VALUES($1,$2,$3,$4,$5::jsonb)',[id,action,'requested',process.env.SUPABASE_PROJECT_REF||'configured-pooler',JSON.stringify({authorization:report,signature:maintenanceSignature(report)})]);
      await pool.query(`INSERT INTO auth_audit_logs(id,actor_id,action,target_type,target_id,new_value,correlation_id,created_at) VALUES($1,$2,'DATABASE_MAINTENANCE_REQUESTED','database_operation',$3,$4::jsonb,$5,CURRENT_TIMESTAMP)`,[randomUUID(),req.admin.id,id,JSON.stringify({action,instance:inspection.identity.instance}),randomUUID()]);
      res.status(202).json({id,state:'requested',message:'Request recorded. An authorized operator must approve and execute it with separate migration credentials.',command:`npm run db:execute-job -- --id ${id} --apply --confirm-ref ${process.env.SUPABASE_PROJECT_REF||'PROJECT_REF'}`});
    }catch{res.status(503).json({error:'Database maintenance could not be authorized. No schema changes were run by this request.'});}
  });
}
