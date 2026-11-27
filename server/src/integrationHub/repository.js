import crypto from 'node:crypto';
import { getPostgresRuntime } from '../repositories/postgresRuntime.js';
import { HubError } from './security.js';
import {recoveryJobsAllowed} from '../database/workerRecovery.js';

export class HubRepository {
  constructor(database = () => getPostgresRuntime('database')) { this.database = database; }
  async transaction(work, options) {
    const db = await this.database(); await db.exec('BEGIN', options);
    try { const result = await work(db); await db.exec('COMMIT'); return result; }
    catch (error) { await db.exec('ROLLBACK').catch(() => {}); throw error; }
  }
  async list() { return (await this.database()).prepare('SELECT id,connector_id,configuration,enabled,status,revision,last_success_at,last_health_at,credential IS NOT NULL AS credentials_configured FROM integration_installations ORDER BY created_at').all(); }
  async get(id, db) { const row = await (db || await this.database()).prepare('SELECT * FROM integration_installations WHERE id=?').get(id); if (!row) throw new HubError('installation_not_found', 404); return row; }
  async audit(db, installationId, actor, action) { await db.prepare('INSERT INTO integration_audit(id,installation_id,actor_id,action) VALUES (?,?,?,?)').run(crypto.randomUUID(), installationId, actor, action); }
  async history(id) {
    const db = await this.database();
    await this.get(id, db);
    return { jobs: await db.prepare('SELECT id,operation,status,attempts,error_code,created_at,finished_at FROM integration_jobs WHERE installation_id=? ORDER BY created_at DESC LIMIT 50').all(id), audit: await db.prepare('SELECT action,actor_id,created_at FROM integration_audit WHERE installation_id=? ORDER BY created_at DESC LIMIT 50').all(id) };
  }
  async usage() {
    const db = await this.database();
    return db.prepare(`SELECT installation_id, count(*)::integer AS requests,
      count(*) FILTER(WHERE outcome='succeeded')::integer AS successful,
      count(*) FILTER(WHERE outcome='failed')::integer AS failed,
      count(*) FILTER(WHERE error_code='provider_timeout')::integer AS timeouts,
      count(*) FILTER(WHERE error_code='provider_rate_limit')::integer AS rate_limits,
      count(*) FILTER(WHERE attempt>1)::integer AS retries,
      round(avg(latency_ms))::integer AS average_latency_ms, sum(bytes)::text AS bytes,
      max(created_at) FILTER(WHERE outcome='succeeded') AS last_success
      FROM integration_executions WHERE created_at>now()-interval '24 hours' GROUP BY installation_id`).all();
  }
  async workerHealth() { return (await this.database()).prepare("SELECT EXISTS(SELECT 1 FROM integration_workers WHERE heartbeat_at>now()-interval '30 seconds') AS ready").get(); }
  async maintenance(env = process.env) {
    const days = Math.min(3650, Math.max(1, Number(env.INTEGRATION_HISTORY_RETENTION_DAYS) || 90));
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    return this.transaction(async db => {
      await db.prepare('DELETE FROM integration_oauth_states WHERE expires_at<now()').run();
      await db.prepare("DELETE FROM integration_workers WHERE heartbeat_at<now()-interval '1 day'").run();
      await db.prepare('DELETE FROM integration_executions WHERE created_at<?').run(cutoff);
      await db.prepare("UPDATE integration_webhook_events SET event='{\"processingStatus\":\"expired\"}'::jsonb WHERE received_at<? AND event->>'processingStatus'='processed'").run(cutoff);
      await db.prepare("DELETE FROM integration_jobs WHERE status IN ('succeeded','cancelled') AND finished_at<?").run(cutoff);
      // Keep event IDs/digests to prevent replay after payload retention expires.
      // Audit and dead-letter records require an approved records-retention policy.
    }, { waitForMigration: false });
  }
  async rotateVault(vault) {
    return this.transaction(async db => {
      const rows = await db.prepare('SELECT id,credential FROM integration_installations WHERE credential IS NOT NULL ORDER BY id FOR UPDATE').all();
      for (const row of rows) {
        await db.prepare('UPDATE integration_installations SET credential=? WHERE id=?').run(JSON.stringify(vault.seal(row.id, vault.open(row.id, row.credential))), row.id);
        await this.audit(db, row.id, null, 'vault.key_rotated');
      }
      // Authorization verifier envelopes also need the previous key during rotation.
      const states = await db.prepare('SELECT state_hash,installation_id,verifier FROM integration_oauth_states FOR UPDATE').all();
      for (const state of states) await db.prepare('UPDATE integration_oauth_states SET verifier=? WHERE state_hash=?').run(JSON.stringify(vault.seal(state.installation_id, vault.open(state.installation_id, state.verifier))), state.state_hash);
      return rows.length;
    });
  }
  async enqueue(db, installation, operation, key, actor) {
    if (typeof key !== 'string' || !/^[\w.:-]{8,160}$/.test(key)) throw new HubError('idempotency_key_required', 400);
    const row = await db.prepare(`INSERT INTO integration_jobs(id,installation_id,operation,idempotency_key,revision,created_by)
      VALUES (?,?,?,?,?,?) ON CONFLICT(installation_id,idempotency_key) DO NOTHING RETURNING id,status`).get(crypto.randomUUID(), installation.id, operation, key, installation.revision, actor);
    return row || db.prepare('SELECT id,status FROM integration_jobs WHERE installation_id=? AND idempotency_key=?').get(installation.id, key);
  }
  async claim(workerId) {
    if(!await recoveryJobsAllowed())return null;
    return this.transaction(async db => {
      await db.prepare('INSERT INTO integration_workers(id) VALUES (?) ON CONFLICT(id) DO UPDATE SET heartbeat_at=now()').run(workerId);
      // Serialize claim selection globally; execution still runs independently per installation.
      const claimLock = await db.prepare('SELECT pg_try_advisory_xact_lock(782841) AS acquired').get();
      if (!claimLock.acquired) return null;
      const job = await db.prepare(`SELECT j.* FROM integration_jobs j JOIN integration_installations i ON i.id=j.installation_id
        WHERE i.enabled=TRUE AND j.available_at<=now() AND
        ((j.status='queued' AND NOT EXISTS(SELECT 1 FROM integration_jobs r WHERE r.installation_id=j.installation_id AND r.status='running' AND r.lease_until>now())) OR (j.status='running' AND j.lease_until<now()))
        AND (i.circuit_until IS NULL OR i.circuit_until<=now()) AND (i.next_request_at IS NULL OR i.next_request_at<=now())
        ORDER BY j.created_at FOR UPDATE OF i SKIP LOCKED LIMIT 1`).get();
      if (!job) return null;
      await db.prepare('SELECT id FROM integration_jobs WHERE id=? FOR UPDATE').get(job.id);
      if (job.attempts >= 4) { await db.prepare("UPDATE integration_jobs SET status='dead',error_code='worker_recovery_exhausted',finished_at=now() WHERE id=?").run(job.id); await db.prepare("UPDATE integration_installations SET status='failed' WHERE id=?").run(job.installation_id); return null; }
      const token = crypto.randomUUID();
      await db.prepare("UPDATE integration_jobs SET status='running',attempts=attempts+1,lease_token=?,lease_until=now()+interval '60 seconds' WHERE id=?").run(token, job.id);
      return { ...job, attempts: job.attempts + 1, lease_token: token };
    }, { waitForMigration: false });
  }
}
