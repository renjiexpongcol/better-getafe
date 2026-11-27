import crypto from 'node:crypto';
import { getCmsPool } from './database.js';
import { syncGetafePsgc } from './psgcSyncService.js';
import { cleanupExpiredPendingUploads } from './mediaService.js';

export function authorizedCron(header, secret = process.env.CRON_SECRET) {
  if (typeof secret !== 'string' || secret.length < 32 || typeof header !== 'string') return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(header);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export async function runScheduledJob(name, { now = new Date(), pool, work } = {}) {
  if (!['psgc', 'media-cleanup'].includes(name)) throw Object.assign(new Error('Unknown job.'), { status: 404 });
  pool ||= await getCmsPool();
  const key = `${name}:${now.toISOString().slice(0, 10)}`;
  const [claimed] = await pool.execute(`INSERT INTO scheduled_job_runs(run_key,name,status,attempts,lease_until)
    VALUES (?,?,'running',1,CURRENT_TIMESTAMP + INTERVAL '2 minutes')
    ON CONFLICT(run_key) DO UPDATE SET status='running',attempts=scheduled_job_runs.attempts+1,
      lease_until=CURRENT_TIMESTAMP+INTERVAL '2 minutes',updated_at=CURRENT_TIMESTAMP
    WHERE scheduled_job_runs.status <> 'succeeded' AND scheduled_job_runs.attempts < 3
      AND scheduled_job_runs.lease_until < CURRENT_TIMESTAMP AND scheduled_job_runs.available_at <= CURRENT_TIMESTAMP
    RETURNING attempts`, [key, name]);
  if (!claimed.length) return { accepted: false, reason: 'already_claimed_or_completed' };
  try {
    const result = await (work || (name === 'psgc' ? () => syncGetafePsgc({ budgetMs: 35000 }) : () => cleanupExpiredPendingUploads({ limit: 1 })))();
    if (result?.error || result?.failed > 0) throw new Error('Scheduled dependency failed.');
    await pool.execute("UPDATE scheduled_job_runs SET status='succeeded',last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE run_key=?", [key]);
    return { accepted: true, completed: true };
  } catch {
    await pool.execute(`UPDATE scheduled_job_runs SET status='failed',last_error='DEPENDENCY_UNAVAILABLE',
      lease_until=CURRENT_TIMESTAMP,available_at=CURRENT_TIMESTAMP + (INTERVAL '1 minute' * power(2,attempts)),updated_at=CURRENT_TIMESTAMP WHERE run_key=?`, [key]);
    throw Object.assign(new Error('Scheduled job could not complete.'), { status: 503 });
  }
}
