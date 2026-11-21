import { getCmsPool } from './database.js'
import { cacheService } from './cacheService.js'
import { config } from '../config/index.js'

const MUNICIPALITY_CODE = '0701226000'
const SOURCE_URL = 'https://psa.gov.ph/classification/psgc'
const API_BASE_URL = 'https://classification.psa.gov.ph/psgc'
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000
let syncInFlight
let syncSchedule

const configuredVersion = () => config.get('integrations.psgcApiVersion') || 'Q3_2026'
const configuredToken = () => String(config.get('integrations.psgcApiToken') || '').trim()

function extractApiRows(payload) {
  const result = payload?.results
  if (Array.isArray(result)) return result
  if (Array.isArray(result?.psgc_data)) return result.psgc_data
  if (Array.isArray(payload?.psgc_data)) return payload.psgc_data
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

function normalizeApiRecord(source, version) {
  const code = String(source?.psgc_code ?? source?.code ?? '').replace(/\D/g, '').padStart(10, '0')
  const areaName = String(source?.area_name ?? source?.name ?? '').trim()
  const geographicLevel = String(source?.geographic_level ?? source?.geographicLevel ?? '').trim()
  const correspondenceCode = String(source?.correspondence_code ?? source?.correspondenceCode ?? '').replace(/\D/g, '').padStart(9, '0')
  if (!/^0701226\d{3}$/.test(code) || !areaName || !/^\d{9}$/.test(correspondenceCode) || !/^Bgy$/i.test(geographicLevel)) return null
  const populationData = Array.isArray(source.population_data)
    ? source.population_data.map(row => ({ year: Number(row?.year), population: Number(String(row?.population ?? '').replace(/,/g, '').trim()) })).filter(row => Number.isInteger(row.year) && Number.isSafeInteger(row.population) && row.population >= 0)
    : []
  return {
    psgcCode: code,
    correspondenceCode,
    areaName: areaName.slice(0, 160),
    geographicLevel: geographicLevel.slice(0, 20),
    urbanRural: String(source?.urban_rural ?? source?.urbanRural ?? '').slice(0, 30),
    oldName: String(source?.old_name ?? source?.oldName ?? '').slice(0, 160),
    version,
    populationData,
    rawPayload: source,
  }
}

async function fetchGetafeBarangays(version, token) {
  const records = new Map()
  const pageSize = 1000
  for (let page = 1; page <= 10; page++) {
    const url = new URL(`${API_BASE_URL}/${encodeURIComponent(version)}/barangays`)
    url.searchParams.set('token', token)
    url.searchParams.set('reg', '7')
    url.searchParams.set('prv', '12')
    url.searchParams.set('mun', '26')
    url.searchParams.set('page_size', String(pageSize))
    url.searchParams.set('page', String(page))
    const response = await fetch(url, {
      redirect: 'error',
      headers: { Accept: 'application/json', 'User-Agent': 'BetterGetafePortal/1.0 (PSGC data refresh)' },
      signal: AbortSignal.timeout(30_000),
    })
    const finalHost = (() => { try { return new URL(response.url).hostname } catch { return 'unknown' } })()
    const contentType = response.headers.get('content-type') || ''
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      // Never include the request URL: the PSA token is a query parameter.
      throw Object.assign(new Error(`PSA PSGC API returned HTTP ${response.status}; finalHost=${finalHost}; contentType=${contentType.split(';')[0] || 'missing'}. Check that PSGC_API_TOKEN is valid and authorized for ${version}.`), { httpStatus: response.status })
    }
    if (!contentType.toLowerCase().includes('json')) {
      await response.body?.cancel().catch(() => {})
      throw new Error(`PSA PSGC API returned a non-JSON response; finalHost=${finalHost}; contentType=${contentType.split(';')[0] || 'missing'}.`)
    }
    const payload = await response.json()
    const rows = extractApiRows(payload)
    if (!rows.length) break
    for (const row of rows) {
      const record = normalizeApiRecord(row, version)
      if (record) records.set(record.psgcCode, record)
    }
    const hasNext = Boolean(payload?.next ?? payload?.results?.next)
    if (!hasNext && rows.length < pageSize) break
    if (records.size >= 24) break
  }
  if (records.size !== 24) throw new Error(`The PSA PSGC API returned ${records.size} valid Getafe barangays; expected 24. Confirm the release and API response.`)
  return [...records.values()].sort((a, b) => a.areaName.localeCompare(b.areaName, 'en'))
}

const normalizeName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, ' ').trim()

export async function getLocalGetafePsgc() {
  try {
    const pool = await getCmsPool()
    const [rows] = await pool.execute(
      `SELECT psgc_code, municipality_code, correspondence_code, area_name, geographic_level,
              urban_rural, old_name, source_version, population_data, synced_at
       FROM psgc_barangay_reference WHERE municipality_code = ? ORDER BY area_name`,
      [MUNICIPALITY_CODE],
    )
    return rows.map(row => ({
      psgcCode: row.psgc_code,
      municipalityCode: row.municipality_code,
      correspondenceCode: row.correspondence_code,
      name: row.area_name,
      geographicLevel: row.geographic_level,
      urbanRural: row.urban_rural,
      oldName: row.old_name,
      sourceVersion: row.source_version,
      populationData: Array.isArray(row.population_data) ? row.population_data : [],
      syncedAt: row.synced_at,
    }))
  } catch {
    // The public barangay catalogue remains available if the optional PSGC
    // snapshot migration has not yet been applied in a deployment.
    return []
  }
}

export async function getPsgcSyncState() {
  try {
    const pool = await getCmsPool()
    const [rows] = await pool.execute(
      `SELECT source_version, requested_version, record_count, snapshot_at, last_attempt_at, last_success_at, last_error
       FROM psgc_sync_state WHERE dataset_key = ?`,
      ['getafe_barangays'],
    )
    return rows[0] || null
  } catch { return null }
}

export async function syncGetafePsgc({ version = configuredVersion(), force = false } = {}) {
  if (syncInFlight) return syncInFlight
  syncInFlight = (async () => {
    const attemptedAt = new Date()
    let pool
    try {
      pool = await getCmsPool()
      const token = configuredToken()
      if (!force) {
        const [stateRows, snapshotRows] = await Promise.all([
          pool.execute('SELECT source_version, record_count FROM psgc_sync_state WHERE dataset_key = ?', ['getafe_barangays']),
          pool.execute('SELECT COUNT(*)::int AS count FROM psgc_barangay_reference WHERE municipality_code = ?', [MUNICIPALITY_CODE]),
        ])
        const state = stateRows[0]?.[0]
        const snapshotCount = Number(snapshotRows[0]?.[0]?.count || 0)
        const snapshotIsValid = snapshotCount === 24 && Number(state?.record_count) === 24
        if (snapshotIsValid && (state.source_version === version || !token)) {
          return {
            configured: Boolean(token), synced: false, cached: true,
            version: state.source_version, requestedVersion: version,
            activeVersion: state.source_version, recordCount: snapshotCount,
          }
        }
      }
      if (!token) throw new Error('PSA PSGC API token is not configured. Set the protected PSA PSGC API token in Settings or provide PSGC_API_TOKEN to the server environment.')
      const records = await fetchGetafeBarangays(version, token)
      console.info(`[PSGC] API response validated for ${version}; records=${records.length}; sourceHost=classification.psa.gov.ph.`)

      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        await connection.execute('DELETE FROM psgc_barangay_reference WHERE municipality_code = ?', [MUNICIPALITY_CODE])
        for (const record of records) {
          await connection.execute(
            `INSERT INTO psgc_barangay_reference
              (psgc_code, municipality_code, correspondence_code, area_name, geographic_level, urban_rural,
               old_name, source_version, population_data, raw_payload, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, CURRENT_TIMESTAMP)`,
            [record.psgcCode, MUNICIPALITY_CODE, record.correspondenceCode, record.areaName, record.geographicLevel,
              record.urbanRural, record.oldName, version, JSON.stringify(record.populationData), JSON.stringify(record.rawPayload)],
          )
        }
        await connection.execute(
          `INSERT INTO psgc_sync_state (dataset_key, source_version, requested_version, record_count, snapshot_at, last_attempt_at, last_success_at, last_error)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, '')
           ON CONFLICT (dataset_key) DO UPDATE SET source_version=EXCLUDED.source_version, requested_version=EXCLUDED.requested_version,
             record_count=EXCLUDED.record_count, snapshot_at=EXCLUDED.snapshot_at, last_attempt_at=EXCLUDED.last_attempt_at,
             last_success_at=EXCLUDED.last_success_at, last_error=''`,
          ['getafe_barangays', version, version, records.length, attemptedAt],
        )
        await connection.commit()
      } catch (error) {
        await connection.rollback().catch(() => {})
        throw error
      } finally { connection.release() }

      await cacheService.invalidate('barangays-public')
      return { configured: true, synced: true, version, requestedVersion: version, activeVersion: version, recordCount: records.length }
    } catch (error) {
      const failureMessage = String(error?.message || 'PSA sync failed').replace(/[\r\n\t]/g, ' ').slice(0, 240)
      await pool?.execute(
        `INSERT INTO psgc_sync_state (dataset_key, source_version, requested_version, record_count, snapshot_at, last_attempt_at, last_error)
         VALUES (?, COALESCE((SELECT source_version FROM psgc_barangay_reference WHERE municipality_code = ? ORDER BY synced_at DESC LIMIT 1), ''), ?,
           (SELECT COUNT(*) FROM psgc_barangay_reference WHERE municipality_code = ?),
           COALESCE((SELECT MAX(synced_at) FROM psgc_barangay_reference WHERE municipality_code = ?), CURRENT_TIMESTAMP), ?, ?)
         ON CONFLICT (dataset_key) DO UPDATE SET requested_version=EXCLUDED.requested_version, record_count=EXCLUDED.record_count,
           last_attempt_at=EXCLUDED.last_attempt_at, last_error=EXCLUDED.last_error`,
        ['getafe_barangays', MUNICIPALITY_CODE, version, MUNICIPALITY_CODE, MUNICIPALITY_CODE, attemptedAt, failureMessage],
      ).catch(() => {})
      const state = await getPsgcSyncState()
      const activeVersion = state?.source_version || 'unknown'
      console.error(`[PSGC] Refresh failed; requested=${version}; active=${activeVersion}; reason=${failureMessage}`)
      return { configured: true, synced: false, version, requestedVersion: version, activeVersion, error: `Requested ${version}; active local snapshot is ${activeVersion}. ${failureMessage}` }
    } finally { syncInFlight = null }
  })()
  return syncInFlight
}

export function startPsgcSyncSchedule(canRun = () => true) {
  if (syncSchedule) return syncSchedule
  void syncGetafePsgc().then(result => {
    if (result.cached) console.info(`[PSGC] Using ${result.recordCount} saved Getafe barangays from database snapshot ${result.activeVersion}; no API request needed.`)
    else if (result.synced) console.info(`[PSGC] Saved ${result.recordCount} Getafe barangays from PSA ${result.version} to the database.`)
    else if (result.error) console.warn('[PSGC] Refresh failed; continuing with the local snapshot.')
  }).catch(() => console.warn('[PSGC] Refresh failed; continuing with the local snapshot.'))
  syncSchedule = setInterval(() => {
    if (!canRun()) return
    void syncGetafePsgc().then(result => {
      if (result.cached) console.info(`[PSGC] Using ${result.recordCount} saved Getafe barangays from database snapshot ${result.activeVersion}; no API request needed.`)
      else if (result.synced) console.info(`[PSGC] Saved ${result.recordCount} Getafe barangays from PSA ${result.version} to the database.`)
      else if (result.error) console.warn('[PSGC] Refresh failed; continuing with the local snapshot.')
    }).catch(() => console.warn('[PSGC] Refresh failed; continuing with the local snapshot.'))
  }, SYNC_INTERVAL_MS)
  syncSchedule.unref?.()
  return syncSchedule
}

export function stopPsgcSyncSchedule() {
  clearInterval(syncSchedule)
  syncSchedule = null
  return syncInFlight
}

export function enrichWithPsgc(item, reference) {
  if (!reference) return item
  const existingResearch = item.researchData && typeof item.researchData === 'object' ? item.researchData : {}
  const populationData = new Map()
  for (const row of [...(Array.isArray(reference.populationData) ? reference.populationData : []), ...(Array.isArray(existingResearch.populationData) ? existingResearch.populationData : [])]) {
    if (Number.isInteger(Number(row?.year)) && Number.isFinite(Number(row?.population))) populationData.set(Number(row.year), { year: Number(row.year), population: Number(row.population) })
  }
  const population2024 = existingResearch.population2024 ?? item.population ?? populationData.get(2024)?.population
  const classification = reference.urbanRural || existingResearch.classification || 'barangay'
  const autoDescription = existingResearch.psgcProfileAuto === true
    ? `Barangay ${reference.name} is officially listed by the Philippine Statistics Authority as a ${classification.toLowerCase()} barangay in Getafe, Bohol (PSGC code ${reference.psgcCode}). ${population2024 != null ? `The 2024 Census of Population recorded ${Number(population2024).toLocaleString('en-PH')} residents. ` : ''}The PSA PSGC record confirms the barangay's official name and administrative classification but does not explain the origin or meaning of its name. That local history needs confirmation from barangay or municipal records.`
    : item.description
  return {
    ...item,
    description: autoDescription,
    researchData: {
      ...existingResearch,
      ...(population2024 != null ? { population2024: Number(population2024) } : {}),
      classification: reference.urbanRural || existingResearch.classification,
      psgcData: {
        psgcCode: reference.psgcCode,
        correspondenceCode: reference.correspondenceCode,
        geographicLevel: reference.geographicLevel,
        urbanRural: reference.urbanRural,
        sourceVersion: reference.sourceVersion,
        syncedAt: reference.syncedAt,
        sourceUrl: SOURCE_URL,
        populationData: [...populationData.values()].sort((a, b) => a.year - b.year),
      },
    },
  }
}

export { normalizeName }
