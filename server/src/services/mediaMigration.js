import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { migrateMediaToAzure } from '../../../scripts/migrate-b2-to-azure.mjs'
import { config } from '../config/index.js'
import { getCmsPool, getPortalPool } from './database.js'
import { activateStorage, buildStorage, getVerifiedAzureStatus, setVerifiedAzureStatus, storageHealth, storageLocation } from './storage.js'
import { systemStatus } from './runtimeConfiguration.js'
import { maxDirectUploadSeconds, mediaWriteLockId } from './mediaWriteGate.js'

const lockId = 63820491
const problem = (message, status = 409) => Object.assign(new Error(message), { status })
const quote = name => '"' + name.replaceAll('"', '""') + '"'

export async function auditAzureMigrationReferences(verifiedKeys, sourceBucket, settings, cms) {
  const findings = []
  const stores = new Set()
  const root = settings['storage.prefix'] || 'media'
  const prefixes = [root + '/', 'citizen-private/', 'profiles/', 'eservices/']
  const directHost = settings['storage.publicBaseUrl']
  for (const db of [cms, await getPortalPool()]) {
    const [[identity]] = await db.execute('SELECT current_database() AS database, inet_server_addr()::text AS host, inet_server_port() AS port')
    const id = JSON.stringify(identity)
    if (stores.has(id)) continue
    stores.add(id)
    const [columns] = await db.execute(`
      SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name NOT IN ('system_settings', 'audit_logs', 'media_uploads')
        AND table_name NOT LIKE 'media_migration_%'
        AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
        AND data_type IN ('text', 'character varying', 'json', 'jsonb', 'ARRAY')`)
    for (const { table_name: table, column_name: column, data_type: type } of columns) {
      const field = quote(column)
      const location = 'public.' + quote(table)
      const [[direct]] = await db.execute(`
        SELECT COUNT(*)::int AS count FROM ${location}
        WHERE strpos(lower(${field}::text), 'backblazeb2.com') > 0
          ${directHost ? `OR strpos(${field}::text, ?) > 0` : ''}`, directHost ? [directHost] : [])
      if (direct.count) findings.push({ table, column, reason: 'Direct Backblaze URL requires a stable application media URL', count: direct.count })
      const pathField = /(?:storage_(?:path|key)|featured_image|cover_image|photo(?:_url)?|(?:avatar|attachment|document|image|file)_(?:path|key|url))$/i.test(column)
      if (!pathField && !['json', 'jsonb', 'ARRAY'].includes(type)) continue
      const json = ['json', 'jsonb', 'ARRAY'].includes(type)
      const [candidates] = await db.execute(json ? `
        SELECT DISTINCT extracted.object_key AS key FROM ${location} AS source
        CROSS JOIN LATERAL jsonb_path_query(to_jsonb(source.${field}), '$.**') AS strings(item)
        CROSS JOIN LATERAL (SELECT strings.item #>> '{}' AS object_key) AS extracted
        WHERE jsonb_typeof(strings.item) = 'string'
          AND (starts_with(extracted.object_key, ?) OR starts_with(extracted.object_key, ?)
            OR starts_with(extracted.object_key, ?) OR starts_with(extracted.object_key, ?))`
        : `SELECT DISTINCT ${field} AS key FROM ${location}
           WHERE starts_with(${field}, ?) OR starts_with(${field}, ?) OR starts_with(${field}, ?) OR starts_with(${field}, ?)`, prefixes)
      const count = candidates.filter(({ key }) => !verifiedKeys.has(key)).length
      if (count) findings.push({ table, column, reason: 'Object key has no verified Azure copy', count })
    }
  }
  const [[legacySettings]] = await cms.execute(`
    SELECT COUNT(*)::int AS count FROM system_settings
    WHERE setting_key NOT LIKE 'storage.%'
      AND (strpos(lower(value::text), 'backblazeb2.com') > 0 ${directHost ? 'OR strpos(value::text, ?) > 0' : ''})`,
  directHost ? [directHost] : [])
  if (legacySettings.count) findings.push({ table: 'system_settings', column: 'value', reason: 'Direct Backblaze URL requires a stable application media URL', count: legacySettings.count })
  const [media] = await cms.execute("SELECT id, storage_path FROM media WHERE storage_bucket = ? AND (storage_provider = 'backblaze' OR storage_provider IS NULL)", [sourceBucket])
  const [other] = await cms.execute("SELECT COUNT(*)::int AS count FROM media WHERE status = 'active' AND storage_provider IS DISTINCT FROM 'azure' AND NOT (storage_bucket = ? AND (storage_provider = 'backblaze' OR storage_provider IS NULL))", [sourceBucket])
  if (other[0].count) findings.push({ table: 'media', column: 'storage_provider', reason: 'Media belongs to another bucket or provider', count: other[0].count })
  return { findings, media }
}

function safeFailure(stage, error) {
  const code = String(error?.code || error?.name || 'Error')
  const safeCode = /^[A-Za-z0-9_-]{1,45}$/.test(code) ? code : 'Error'
  if (stage === 'PostgreSQL reference audit') return stage + ' failed (' + safeCode + '). Check the backend database schema and audit query before retrying.'
  if (safeCode === 'EACCES' || safeCode === 'ENETUNREACH') return stage + ' failed (' + safeCode + '). Run the backend on a host that can reach both storage services.'
  return stage + ' failed (' + safeCode + '). Check source list/read access, private Azure container access, and PostgreSQL availability.'
}

async function finishCutover(connection, id, result, audit, settings) {
  await connection.beginTransaction()
  try {
    for (const item of audit.media) {
      if (!result.verifiedKeys.has(item.storage_path)) throw problem('A media record is missing its verified Azure copy.')
      const [rows] = await connection.execute(`INSERT INTO media_migration_reference_backup
        (run_id, media_id, original_provider, original_bucket, original_key)
        SELECT ?, id, storage_provider, storage_bucket, storage_path FROM media
        WHERE id = ? AND storage_path = ? AND storage_bucket = ? AND (storage_provider IS NULL OR storage_provider = 'backblaze') RETURNING media_id`,
      [id, item.id, item.storage_path, settings['storage.bucket']])
      if (!rows.length) throw problem('A media reference changed during verification.')
    }
    await connection.execute("UPDATE media_migration_runs SET status = 'restart_required', stage = 'Ready to activate Azure', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id])
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  }
}

async function run(connection, id, mode, settings) {
  let stage = 'Storage configuration'
  let writesLocked = false
  try {
    if (mode === 'cutover') {
      stage = 'Pausing uploads and draining issued upload links'
      await connection.execute('UPDATE media_migration_runs SET stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [stage, id])
      while (!writesLocked) {
        const [[{ locked }]] = await connection.execute('SELECT pg_try_advisory_lock(?) AS locked', [mediaWriteLockId])
        writesLocked = locked
        if (!writesLocked) await delay(1000)
      }
      if (process.env.NODE_ENV === 'production') {
        // Previously issued signed URLs can still write after their upload row is completed or removed.
        const drainUntil = Date.now() + maxDirectUploadSeconds * 1000
        while (Date.now() < drainUntil) {
          await delay(Math.min(5000, drainUntil - Date.now()))
          await connection.execute('SELECT 1')
        }
      }
    }
    const result = await migrateMediaToAzure({ copy: mode === 'copy' }, {
      settings,
      onStage: async value => {
        stage = value
        await connection.execute('UPDATE media_migration_runs SET stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [stage, id])
      },
      onRecord: async entry => {
        const key = entry.sourceKey || entry.destinationKey
        if (!key) return
        await connection.execute(`INSERT INTO media_migration_entries (run_id, object_key, size_bytes, status, copied, details)
          VALUES (?, ?, ?, ?, ?, ?::jsonb)
          ON CONFLICT (run_id, object_key) DO UPDATE SET status = EXCLUDED.status,
            copied = media_migration_entries.copied OR EXCLUDED.copied, details = EXCLUDED.details`,
        [id, key, entry.size || 0, entry.status, entry.status === 'copied', JSON.stringify(entry)])
      },
    })
    stage = 'PostgreSQL reference audit'
    const audit = await auditAzureMigrationReferences(result.verifiedKeys, settings['storage.bucket'], settings, connection)
    const unresolvedReferences = audit.findings.reduce((sum, finding) => sum + finding.count, 0)
    const totals = { ...result.totals, unresolvedReferences, referenceFindings: audit.findings }
    const ready = !totals.missing && !totals.unresolved && !unresolvedReferences
    const status = mode === 'inventory' ? 'preview' : ready && mode === 'copy' ? 'ready' : ready ? 'running' : 'blocked'
    await connection.execute('UPDATE media_migration_runs SET status = ?, stage = ?, totals = ?::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, ready ? 'Verified' : 'Review migration findings', JSON.stringify(totals), id])
    if (mode === 'cutover' && ready) {
      stage = 'Preparing cutover'
      await finishCutover(connection, id, result, audit, settings)
    }
  } catch (error) {
    await connection.execute("UPDATE media_migration_runs SET status = 'blocked', stage = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [stage, error.status === 409 ? error.message : safeFailure(stage, error), id]).catch(() => {})
  } finally {
    try {
      if (writesLocked) await connection.execute('SELECT pg_advisory_unlock(?)', [mediaWriteLockId])
    } finally {
      await connection.execute('SELECT pg_advisory_unlock(?)', [lockId]).finally(() => connection.release())
    }
  }
}

export async function startMediaMigration(mode, actor) {
  if (!['inventory', 'copy', 'cutover'].includes(mode)) throw problem('Invalid migration action.', 422)
  const settings = { ...config.values }
  if (storageLocation().provider !== 'backblaze') throw problem('Backblaze must be the active provider for this migration.')
  if (settings['storage.azureAccount'] !== 'lgumedia' || settings['storage.azureContainer'] !== 'portal-media'
      || settings['storage.azureAuthentication'] !== 'connection-string' || !settings['storage.azureConnectionString']) {
    throw problem('Save the lgumedia/portal-media Azure connection string before starting.')
  }
  const db = await getCmsPool()
  const connection = await db.getConnection()
  let locked = false
  try {
    const [[entry]] = await connection.execute('SELECT pg_try_advisory_lock(?) AS locked', [lockId])
    locked = entry.locked
    if (!locked) throw problem('A media migration is already running.')
    await connection.execute("UPDATE media_migration_runs SET status = 'interrupted' WHERE status = 'running'")
    const [[last]] = await connection.execute('SELECT status, source_bucket FROM media_migration_runs ORDER BY started_at DESC LIMIT 1')
    if (last?.status === 'restart_required') throw problem('Final verification is complete. Use Activate Azure to finish the cutover.')
    if (mode === 'cutover' && (last?.status !== 'ready' || last.source_bucket !== settings['storage.bucket'])) throw problem('A verified copy run is required before cutover.')
    const id = randomUUID()
    await connection.execute('INSERT INTO media_migration_runs (id, mode, status, source_bucket, started_by, confirmed_by) VALUES (?, ?, ?, ?, ?, ?)',
      [id, mode, 'running', settings['storage.bucket'], actor, mode === 'cutover' ? actor : null])
    void run(connection, id, mode, settings).catch(() => {})
    return { id, status: 'running' }
  } catch (error) {
    if (locked) await connection.execute('SELECT pg_advisory_unlock(?)', [lockId]).catch(() => {})
    connection.release()
    throw error
  }
}

export async function mediaMigrationStatus() {
  const db = await getCmsPool()
  const activeProvider = storageLocation().provider
  const [[job]] = await db.execute('SELECT id, mode, status, stage, error, totals, started_at, updated_at FROM media_migration_runs ORDER BY started_at DESC LIMIT 1')
  if (job?.status === 'running') {
    const connection = await db.getConnection()
    try {
      const [[entry]] = await connection.execute('SELECT pg_try_advisory_lock(?) AS locked', [lockId])
      if (entry.locked) {
        try {
          const [changed] = await connection.execute("UPDATE media_migration_runs SET status = 'interrupted' WHERE id = ? AND status = 'running' RETURNING id", [job.id])
          if (changed.length) job.status = 'interrupted'
        } finally { await connection.execute('SELECT pg_advisory_unlock(?)', [lockId]) }
      }
    } finally { connection.release() }
  }
  if (job) {
    const [[progress]] = await db.execute(`SELECT
      COUNT(*) FILTER (WHERE status <> 'azure_only')::float AS "sourceFiles",
      COALESCE(SUM(size_bytes) FILTER (WHERE status <> 'azure_only'), 0)::float AS "sourceBytes",
      COUNT(*) FILTER (WHERE copied)::float AS copied, COALESCE(SUM(size_bytes) FILTER (WHERE copied), 0)::float AS "copiedBytes",
      COUNT(*) FILTER (WHERE status = 'verified')::float AS verified, COALESCE(SUM(size_bytes) FILTER (WHERE status = 'verified'), 0)::float AS "verifiedBytes",
      COUNT(*) FILTER (WHERE status IN ('error','collision_or_mismatch','azure_only','missing_in_azure'))::float AS "unresolvedFiles",
      COALESCE(SUM(size_bytes) FILTER (WHERE status IN ('error','collision_or_mismatch','azure_only','missing_in_azure')), 0)::float AS "unresolvedBytes"
      FROM media_migration_entries WHERE run_id = ?`, [job.id])
    job.totals = { ...job.totals, ...progress }
  }
  return { activeProvider, sourceBucket: config.values['storage.bucket'], target: 'lgumedia/portal-media', job: job || null }
}

function azureResource() {
  return buildStorage({ ...config.values, 'storage.provider': 'azure' }, { verifiedCutover: true })
}

function activateVerifiedAzure(resource, status) {
  if (resource) activateStorage(resource)
  setVerifiedAzureStatus(status)
  systemStatus.storage = { status: 'connected', provider: 'azure', checkedAt: new Date().toISOString() }
}

let nextSync = 0
let syncInProgress
export function syncVerifiedAzureCutover({ force = false } = {}) {
  if (getVerifiedAzureStatus() === 'accepted' && !force) return
  if (syncInProgress) return syncInProgress
  if (!force && Date.now() < nextSync) return
  nextSync = Date.now() + 5000
  syncInProgress = config.serial(async () => {
    const db = await getCmsPool()
    const [[job]] = await db.execute("SELECT status FROM media_migration_runs WHERE status IN ('active', 'accepted') ORDER BY started_at DESC LIMIT 1")
    if (!job || job.status === getVerifiedAzureStatus()) return
    const resource = getVerifiedAzureStatus() && storageHealth().status === 'healthy' ? null : await azureResource()
    activateVerifiedAzure(resource, job.status)
  }).finally(() => { syncInProgress = undefined })
  return syncInProgress
}

export function activatePreparedAzureCutover(actor) {
  return config.serial(() => commitAzureCutover(actor))
}

async function commitAzureCutover(actor) {
  const db = await getCmsPool()
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [[job]] = await connection.execute("SELECT id FROM media_migration_runs WHERE status = 'restart_required' ORDER BY started_at DESC LIMIT 1 FOR UPDATE")
    if (!job) throw problem('Final verification must pass before Azure can be activated.')
    let resource
    try { resource = await azureResource() }
    catch { throw problem('Azure could not pass its connection checks. Check the saved credentials and private container, then retry Activate Azure.') }
    const [[expected]] = await connection.execute('SELECT COUNT(*)::int AS count FROM media_migration_reference_backup WHERE run_id = ?', [job.id])
    const [changed] = await connection.execute(`UPDATE media m SET storage_provider = 'azure', storage_bucket = ?
        FROM media_migration_reference_backup b WHERE b.run_id = ? AND b.media_id = m.id
        AND b.original_key = m.storage_path AND b.original_bucket = m.storage_bucket
        AND b.original_provider IS NOT DISTINCT FROM m.storage_provider RETURNING m.id`, ['portal-media', job.id])
    if (expected.count !== changed.length) throw problem('Stored media references changed after final verification.')
    await connection.execute("UPDATE media_migration_runs SET status = 'active', stage = 'Azure active; uploads paused pending acceptance', confirmed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [actor, job.id])
    await connection.commit()
    activateVerifiedAzure(resource, 'active')
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}

export async function acceptMediaMigration(actor) {
  if (storageLocation().provider !== 'azure' || storageHealth().status !== 'healthy') throw problem('Azure must be active and healthy.')
  const db = await getCmsPool()
  const [rows] = await db.execute("UPDATE media_migration_runs SET status = 'accepted', accepted_by = ?, updated_at = CURRENT_TIMESTAMP WHERE status = 'active' RETURNING id", [actor])
  if (!rows.length) throw problem('No active cutover is pending acceptance.')
  activateVerifiedAzure(null, 'accepted')
}
