import crypto from 'node:crypto';
import { registry, connector, validateConfiguration, validateCredentials, webhookEvent, executeConnector } from './registry.js';
import { CredentialVault, HubError, safeCode, retryDelay, hash } from './security.js';
import { HubRepository } from './repository.js';
import { GoogleAuthorization } from './oauth.js';

export class IntegrationHub {
  constructor({ repository = new HubRepository(), vault = new CredentialVault(), env = process.env, execute = executeConnector, oauth } = {}) {
    this.repo = repository; this.vault = vault; this.env = env; this.execute = execute;
    this.oauth = oauth || new GoogleAuthorization(repository, vault, { env });
  }
  async overview() {
    const [installations, usage, worker] = await Promise.all([this.repo.list(), this.repo.usage(), this.repo.workerHealth()]);
    const alerts = installations.flatMap(installation => {
      const sample = usage.find(row => row.installation_id === installation.id), messages = [];
      if (['failed','degraded'].includes(installation.status)) messages.push('Connection needs attention');
      if (sample?.requests >= 5 && sample.failed / sample.requests * 100 >= (installation.configuration.failureAlertPercent || 50)) messages.push('Failure threshold reached');
      if (sample?.requests >= (installation.configuration.dailyRequestLimit || 1000) * .8) messages.push('Approaching daily execution limit');
      return messages.map(message => ({ installationId: installation.id, connectorId: installation.connector_id, message }));
    });
    return { catalog: registry, installations, usage, worker, alerts, stats: Object.fromEntries(['configured','connected','disconnected','degraded','failed','disabled','pending_authorization'].map(status => [status, installations.filter(row => row.status === status).length])), billing: 'Usage measurements only; provider billing and quotas are unavailable.' };
  }
  async configure(connectorId, configuration, actor) {
    validateConfiguration(connectorId, configuration, this.env);
    return this.repo.transaction(async db => {
      await db.prepare('SELECT pg_advisory_xact_lock(hashtext(?))').get(`getafe-integration-config:${connectorId}`);
      const existing = await db.prepare('SELECT * FROM integration_installations WHERE connector_id=? FOR UPDATE').get(connectorId);
      if (existing?.connector_id === 'google-calendar' && existing.credential) await this.oauth.revoke(this.vault.open(existing.id, existing.credential));
      const row = await db.prepare(`INSERT INTO integration_installations(id,connector_id,configuration,created_by) VALUES (?,?,?,?)
        ON CONFLICT(connector_id) DO UPDATE SET configuration=EXCLUDED.configuration,credential=NULL,enabled=FALSE,status='disconnected',revision=integration_installations.revision+1,updated_at=now()
        RETURNING id`).get(crypto.randomUUID(), connectorId, JSON.stringify(configuration), actor);
      await db.prepare("UPDATE integration_jobs SET status='cancelled',finished_at=now() WHERE installation_id=? AND status='queued'").run(row.id);
      await db.prepare('DELETE FROM integration_oauth_states WHERE installation_id=?').run(row.id);
      await this.repo.audit(db, row.id, actor, 'configuration.saved');
      return row;
    });
  }
  async credentials(id, value, actor) {
    return this.repo.transaction(async db => {
      const installation = await db.prepare('SELECT * FROM integration_installations WHERE id=? FOR UPDATE').get(id);
      if (!installation) throw new HubError('installation_not_found', 404);
      validateCredentials(installation.connector_id, value);
      if (installation.connector_id === 'google-calendar' && installation.credential) await this.oauth.revoke(this.vault.open(id, installation.credential));
      const status = installation.connector_id === 'google-calendar' ? 'disconnected' : 'configured';
      await db.prepare('UPDATE integration_installations SET credential=?,enabled=?,status=?,revision=revision+1,failures=0,circuit_until=NULL,updated_at=now() WHERE id=?').run(JSON.stringify(this.vault.seal(id, value)), status === 'configured', status, id);
      await db.prepare('DELETE FROM integration_oauth_states WHERE installation_id=?').run(id);
      await this.repo.audit(db, id, actor, 'credentials.rotated');
      return { saved: true };
    });
  }
  async action(id, action, actor, key) {
    return this.repo.transaction(async db => {
      const row = await db.prepare('SELECT * FROM integration_installations WHERE id=? FOR UPDATE').get(id);
      if (!row) throw new HubError('installation_not_found', 404);
      if (action === 'test') {
        if (!row.enabled || !row.credential) throw new HubError('connector_disabled', 409);
        if (!connector(row.connector_id).operations.includes('test_connection')) throw new HubError('health_check_not_supported', 409);
        const job = await this.repo.enqueue(db, row, 'test_connection', key, actor);
        await this.repo.audit(db, id, actor, 'connection.test_queued'); return job;
      }
      if (!['disable', 'disconnect'].includes(action)) throw new HubError('invalid_action', 400);
      // Revocation must succeed before deleting custody; on failure retain credentials for recovery.
      if (action === 'disconnect' && row.connector_id === 'google-calendar' && row.credential) await this.oauth.revoke(this.vault.open(id, row.credential));
      await db.prepare('UPDATE integration_installations SET enabled=FALSE,status=?,credential=CASE WHEN ? THEN NULL ELSE credential END,revision=revision+1,updated_at=now() WHERE id=?').run(action === 'disable' ? 'disabled' : 'disconnected', action === 'disconnect', id);
      await db.prepare("UPDATE integration_jobs SET status='cancelled',finished_at=now() WHERE installation_id=? AND status IN ('queued','running')").run(id);
      await db.prepare('DELETE FROM integration_oauth_states WHERE installation_id=?').run(id);
      await this.repo.audit(db, id, actor, `connector.${action}`);
      return { saved: true };
    });
  }
  async retry(jobId, actor) {
    return this.repo.transaction(async db => {
      const found = await db.prepare('SELECT installation_id FROM integration_jobs WHERE id=?').get(jobId);
      if (!found) throw new HubError('job_not_found', 404);
      const installation = await db.prepare('SELECT * FROM integration_installations WHERE id=? FOR UPDATE').get(found.installation_id);
      const job = await db.prepare('SELECT * FROM integration_jobs WHERE id=? FOR UPDATE').get(jobId);
      if (job.status !== 'dead' || !installation.enabled || installation.revision !== job.revision || !['provider_network','provider_timeout','provider_rate_limit','provider_unavailable','worker_recovery_exhausted'].includes(job.error_code)) throw new HubError('job_not_retryable', 409);
      await db.prepare("UPDATE integration_jobs SET status='queued',attempts=0,error_code=NULL,available_at=now(),finished_at=NULL WHERE id=?").run(jobId);
      await this.repo.audit(db, installation.id, actor, 'job.retry'); return { queued: true };
    });
  }
  async webhook(provider, raw, headers) {
    if (provider !== 'municipal-events') throw new HubError('unknown_webhook_provider', 404);
    if (!Buffer.isBuffer(raw) || raw.length > 65536) throw new HubError('invalid_webhook_payload', 400);
    return this.repo.transaction(async db => {
      const row = await db.prepare('SELECT * FROM integration_installations WHERE connector_id=? FOR UPDATE').get(provider);
      if (!row?.enabled || !row.credential) throw new HubError('connector_disabled', 409);
      const event = webhookEvent(raw, headers, this.vault.open(row.id, row.credential), row.configuration);
      const old = await db.prepare('SELECT payload_hash FROM integration_webhook_events WHERE installation_id=? AND external_id=?').get(row.id, event.eventId);
      if (old) { if (old.payload_hash !== hash(raw)) throw new HubError('event_id_conflict', 409); return { accepted: true, duplicate: true }; }
      const job = await this.repo.enqueue(db, row, 'receive_webhook', `webhook:${hash(event.eventId)}`, null);
      await db.prepare('INSERT INTO integration_webhook_events(installation_id,external_id,payload_hash,event,job_id) VALUES (?,?,?,?,?)').run(row.id, event.eventId, hash(raw), JSON.stringify(event), job.id);
      return { accepted: true, jobId: job.id };
    });
  }
  async run(job, signal) {
    return this.repo.transaction(async db => {
      // One installation lock serializes executions, refresh, rotation and disconnect.
      const installation = await db.prepare('SELECT * FROM integration_installations WHERE id=? FOR UPDATE').get(job.installation_id);
      const current = await db.prepare('SELECT * FROM integration_jobs WHERE id=? FOR UPDATE').get(job.id);
      if (!current || current.status !== 'running' || current.lease_token !== job.lease_token) return;
      if (!installation.enabled || installation.revision !== job.revision) {
        await db.prepare("UPDATE integration_jobs SET status='cancelled',finished_at=now() WHERE id=?").run(job.id); return;
      }
      const usage = await db.prepare("SELECT count(*)::integer AS requests FROM integration_executions WHERE installation_id=? AND created_at>now()-interval '24 hours'").get(installation.id);
      if (usage.requests >= (installation.configuration.dailyRequestLimit || 1000)) {
        await db.prepare("UPDATE integration_jobs SET status='queued',available_at=now()+interval '1 hour',attempts=attempts-1,lease_until=NULL,error_code='daily_limit_reached' WHERE id=?").run(job.id);
        return;
      }
      const start = Date.now(); let result, error;
      try {
        let credentials = this.vault.open(installation.id, installation.credential);
        if (installation.connector_id === 'google-calendar') {
          credentials = await this.oauth.refresh(installation, credentials);
          await db.prepare('UPDATE integration_installations SET credential=? WHERE id=?').run(JSON.stringify(this.vault.seal(installation.id, credentials)), installation.id);
        }
        result = await this.execute(installation, credentials, job.operation, { env: this.env, signal });
      } catch (failure) { error = failure; }
      const code = error ? safeCode(error) : null, retry = error?.retryable && job.attempts < connector(installation.connector_id).retryPolicy.attempts;
      await db.prepare('INSERT INTO integration_executions(id,job_id,installation_id,correlation_id,outcome,error_code,latency_ms,bytes,attempt) VALUES (?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(), job.id, installation.id, job.id, error ? 'failed' : 'succeeded', code, Date.now() - start, result?.bytes || 0, job.attempts);
      await db.prepare('UPDATE integration_jobs SET status=?,error_code=?,available_at=?,lease_until=NULL,finished_at=? WHERE id=?').run(error ? retry ? 'queued' : 'dead' : 'succeeded', code, new Date(Date.now() + (retry ? Math.max(retryDelay(job.attempts), error.retryAfterMs || 0) : 0)).toISOString(), retry ? null : new Date().toISOString(), job.id);
      const failures = error ? installation.failures + 1 : 0;
      await db.prepare('UPDATE integration_installations SET status=?,failures=?,circuit_until=?,next_request_at=?,last_health_at=CASE WHEN ? THEN now() ELSE last_health_at END,last_success_at=CASE WHEN ? THEN now() ELSE last_success_at END WHERE id=?').run(error ? retry ? 'degraded' : 'failed' : 'connected', failures, error && failures >= 3 ? new Date(Date.now() + 60000).toISOString() : null, new Date(Date.now() + 1000).toISOString(), job.operation === 'test_connection', !error, installation.id);
      if (!error && job.operation === 'receive_webhook') await db.prepare("UPDATE integration_webhook_events SET event=jsonb_set(event,'{processingStatus}','\"processed\"'::jsonb) WHERE job_id=?").run(job.id);
    });
  }
}

export const integrationHub = new IntegrationHub();
