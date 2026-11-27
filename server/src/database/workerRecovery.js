import {getConfigPool} from '../config/DatabaseSettingsProvider.js';

// Restored queued work can send mail or mutate external providers. It stays
// paused until the operator has reviewed identities, delivery state and keys.
export async function recoveryJobsAllowed(client){
  const pool=client||await getConfigPool();
  const result=await pool.query("SELECT NOT EXISTS(SELECT 1 FROM getafe_database_operations WHERE operation='historical-restore' AND NOT report @> '{\"backgroundJobsApproved\":true}'::jsonb) AS allowed");
  return result.rows[0]?.allowed===true;
}
