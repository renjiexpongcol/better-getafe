import crypto from 'node:crypto'
import { getCmsPool, getPortalPool } from './database.js'

const VIEWPORTS = new Set(['mobile', 'tablet', 'desktop', 'unknown'])
const SOURCES = new Set(['direct_or_unknown', 'internal', 'search', 'external', 'none'])
const ACTIONS = new Set(['browse_services_click', 'report_concern_click', 'open_data_xlsx_request'])
const SERVICE_STAGES = new Set(['service_viewed', 'requirements_opened', 'service_form_download_clicked', 'service_apply_clicked'])
const SEARCH_RESULT_TYPES = new Set(['page', 'service', 'office', 'barangay', 'news', 'event', 'dataset'])
const POSITION_BUCKETS = new Set(['1', '2-3', '4-10', '11+'])
const OPEN_DATA_ACTIVITIES = new Set(['dataset_view', 'query_request', 'csv_download_click', 'xlsx_download_click'])
const CONTENT_TYPES = new Set(['news', 'announcement', 'event', 'meeting', 'service'])
const ANNOUNCEMENT_INTERACTIONS = new Set(['impression', 'open', 'dismiss'])
const NAVIGATION_VIEWPORTS = VIEWPORTS
const PLACEMENT_KEY = /^(?:home\.[a-z0-9._-]{1,58}|header\.[a-z0-9_-]{1,48}|footer\.[a-z0-9_-]{1,48}|services\.[a-z0-9_-]{1,48})$/
const DATASET_ID = /^[A-Za-z0-9][A-Za-z0-9._~:-]{0,191}$/
const PUBLIC_ROUTE_ROOTS = new Set(['accessibility', 'barangays', 'community', 'contact', 'data', 'departments', 'discover', 'events', 'info', 'legal', 'news', 'newsletter', 'officials', 'search', 'services', 'tourism', 'weather'])
const ROUTE_PARAMETER = /^:(?:id|kind|officialslug|slug|token)$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const isAnalyticsCollectionEnabled = () => process.env.NODE_ENV === 'production' && process.env.WEBSITE_ANALYTICS_ENABLED !== 'false'

export function rejectDisabledAnalytics(req, res, reason = process.env.NODE_ENV !== 'production' ? 'non_production' : 'kill_switch') {
  console.info(JSON.stringify({ event: 'website_analytics_ingest_disabled', request_id: req.requestId || null, reason }))
  return res.set('Cache-Control', 'no-store').status(403).json({ code: 'ANALYTICS_DISABLED', error: 'Website analytics collection is disabled.' })
}

function ingestionFailure(error) {
  const code = String(error?.code || '')
  if (['42P01', '42703', '42P10'].includes(code)) return { reason: 'schema_incomplete', code }
  if (['42501', '25006'].includes(code)) return { reason: 'database_not_writable', code }
  if (['40001', '40P01', '55P03', '57014'].includes(code)) return { reason: 'database_busy', code, retryAfter: '5' }
  if (/^(?:08[A-Z0-9]{3}|57P0[123]|53300|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH)$/.test(code)) {
    return { reason: 'database_unavailable', code, retryAfter: '30' }
  }
  return { reason: 'database_write_failed', code: /^[0-9A-Z]{5}$/.test(code) ? code : undefined }
}

function badRequest(message) { return Object.assign(new Error(message), { status: 400 }) }
const LATENCY_BUCKETS = [0, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000, 240000, 240001]
const ROUTE_FAMILIES = new Set(['api', 'asset', 'services', 'data', 'news', 'events', 'barangays', 'other', 'unknown'])
const REFERRING_SECTIONS = new Set(['home', 'services', 'data', 'news', 'events', 'barangays', 'other', 'unknown'])
function latencyBucket(durationMs) { const duration = Math.max(0, Number(durationMs) || 0); return LATENCY_BUCKETS.find(value => duration <= value) ?? 240001 }

export async function recordServerOperation({ operation, datasetId = 'none', outcome, category = 'none', cacheStatus = 'unknown', durationMs, synthetic = false }, getPool = getCmsPool) {
  if (process.env.NODE_ENV !== 'production' || synthetic) return false
  if (!['search', 'dataset_query', 'dataset_export', 'public_404'].includes(operation)) return false
  const safeDatasetId = typeof datasetId === 'string' && DATASET_ID.test(datasetId) ? datasetId : 'unknown'
  const safeOutcome = outcome === 'success' ? 'success' : 'failure'
  const safeCategory = ['none', 'timeout', 'upstream_error', 'invalid_request', 'server_error', 'not_found'].includes(category) ? category : 'server_error'
  const safeCache = ['hit', 'miss', 'unknown', 'none'].includes(cacheStatus) ? cacheStatus : 'unknown'
  try {
    const pool = await getPool()
    await pool.execute(
      `INSERT INTO website_operation_daily (report_date, operation, dataset_id, outcome, category, cache_status, latency_bucket_ms, requests)
       VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT (report_date, operation, dataset_id, outcome, category, cache_status, latency_bucket_ms)
       DO UPDATE SET requests = website_operation_daily.requests + 1`,
      [operation, safeDatasetId, safeOutcome, safeCategory, safeCache, latencyBucket(durationMs)],
    )
    return true
  } catch (error) {
    console.warn(JSON.stringify({ event: 'website_operation_metric_failed', code: error?.code || 'DATABASE_ERROR' }))
    return false
  }
}

export async function recordPublicNotFound(routeFamily, referringSection, synthetic = false, getPool = getCmsPool) {
  if (process.env.NODE_ENV !== 'production' || synthetic) return false
  const family = ROUTE_FAMILIES.has(routeFamily) ? routeFamily : 'unknown'
  const section = REFERRING_SECTIONS.has(referringSection) ? referringSection : 'unknown'
  try {
    const pool = await getPool()
    await pool.execute(
      `INSERT INTO website_public_404_daily (report_date, route_family, referring_section, responses)
       VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date, ?, ?, 1)
       ON CONFLICT (report_date, route_family, referring_section)
       DO UPDATE SET responses = website_public_404_daily.responses + 1`,
      [family, section],
    )
    return true
  } catch (error) {
    console.warn(JSON.stringify({ event: 'website_404_metric_failed', code: error?.code || 'DATABASE_ERROR' }))
    return false
  }
}
function validPublicRouteKey(routeKey) {
  if (routeKey === '/') return true
  if (typeof routeKey !== 'string' || routeKey.length > 120 || !routeKey.startsWith('/') || routeKey.includes('//') || /[?#%\\\0]/.test(routeKey)) return false
  const segments = routeKey.slice(1).split('/')
  if (!PUBLIC_ROUTE_ROOTS.has(segments[0])) return false
  return segments.every(segment => /^[a-z0-9-]{1,48}$/.test(segment) || ROUTE_PARAMETER.test(segment))
}
function assertOnlyKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw badRequest('Analytics event has unsupported fields.')
}

async function assertPublishedContent(connection, event) {
  if (event.contentType === 'service') {
    const [managedRows] = await connection.execute('SELECT key FROM managed_public_content WHERE key = ? AND published = TRUE AND kind = \'page\'', [event.contentId])
    if (managedRows.length) return
    if (!UUID.test(event.contentId)) throw badRequest('This published service page is not available.')
    const portalPool = await getPortalPool()
    const [serviceRows] = await portalPool.execute('SELECT id FROM services WHERE id = ?::uuid AND published = TRUE', [event.contentId])
    if (!serviceRows.length) throw badRequest('This published service page is not available.')
    return
  }
  const [rows] = await connection.execute('SELECT id, content_type, is_important FROM news WHERE id = ? AND status = \'published\'', [event.contentId])
  const row = rows[0]
  if (!row) throw badRequest('This published content item is not available.')
  const type = String(row.content_type || 'news').toLowerCase()
  const expected = type === 'event' || type === 'meeting' ? type : row.is_important ? 'announcement' : 'news'
  if (expected !== event.contentType) throw badRequest('The public content type does not match this item.')
}

async function assertImportantArticle(connection, articleId) {
  const [rows] = await connection.execute('SELECT id FROM news WHERE id = ? AND status = \'published\' AND is_important = TRUE', [articleId])
  if (!rows.length) throw badRequest('This active announcement is not available.')
}

async function assertNavigationDestination(connection, event) {
  const destination = event.destinationId
  if (destination === 'external' || isPublicNavigationRoute(destination)) return
  if (destination.startsWith('topic:')) {
    const id = destination.slice(6)
    const [rows] = await connection.execute('SELECT id FROM search_topics WHERE id = ? AND public_visible = TRUE', [id])
    if (rows.length) return
  } else if (destination.startsWith('service:')) {
    const id = destination.slice(8)
    if (UUID.test(id)) {
      const portalPool = await getPortalPool()
      const [rows] = await portalPool.execute('SELECT id FROM services WHERE id = ?::uuid AND published = TRUE', [id])
      if (rows.length) return
    }
  }
  throw badRequest('This public navigation destination is not available.')
}

function isPublicNavigationRoute(destination) {
  return destination === '/' || destination === '/other' || (destination.startsWith('/') && PUBLIC_ROUTE_ROOTS.has(destination.slice(1)))
}

function validNavigationDestination(destination) {
  if (typeof destination !== 'string' || destination.length > 192) return false
  return destination === 'external' || isPublicNavigationRoute(destination)
    || /^(?:topic|service):[A-Za-z0-9][A-Za-z0-9._~:-]*$/.test(destination)
}

export function validateAnalyticsBatch(body = {}) {
  assertOnlyKeys(body, ['version', 'events'])
  if (body.version !== 1 || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 20) throw badRequest('Submit between 1 and 20 version 1 analytics events.')
  const seen = new Set()
  const events = body.events.map(event => {
    assertOnlyKeys(event, ['eventId', 'type', 'routeKey', 'viewport', 'entrySource', 'action', 'serviceId', 'stage', 'submissionId', 'topicId', 'source', 'resultType', 'resultId', 'positionBucket', 'datasetId', 'activity', 'contentId', 'contentType', 'articleId', 'interaction', 'impressionId', 'placementKey', 'destinationId', 'slotPosition'])
    if (typeof event.eventId !== 'string' || !UUID.test(event.eventId)) throw badRequest('A valid event ID is required.')
    if (seen.has(event.eventId)) throw badRequest('Event IDs in a batch must be unique.')
    seen.add(event.eventId)
    if (event.type === 'page_view') {
      if (!validPublicRouteKey(event.routeKey)) throw badRequest('This public route cannot be recorded.')
      if (!VIEWPORTS.has(event.viewport)) throw badRequest('Choose a valid viewport size category.')
      const entrySource = event.entrySource === undefined ? 'none' : event.entrySource
      if (!SOURCES.has(entrySource)) throw badRequest('Choose a valid entry source category.')
      if (event.action !== undefined) throw badRequest('Page views cannot contain an action.')
      return { eventId: event.eventId, type: event.type, routeKey: event.routeKey, viewport: event.viewport, entrySource }
    }
    if (event.type === 'action') {
      if (!ACTIONS.has(event.action)) throw badRequest('This public action cannot be recorded.')
      if (event.routeKey !== undefined || event.viewport !== undefined || event.entrySource !== undefined) throw badRequest('Action events may contain only an action key.')
      return { eventId: event.eventId, type: event.type, action: event.action }
    }
    if (event.type === 'service_journey') {
      if (typeof event.serviceId !== 'string' || !DATASET_ID.test(event.serviceId) || !SERVICE_STAGES.has(event.stage) || !VIEWPORTS.has(event.viewport)) throw badRequest('Choose a valid service journey step.')
      return { eventId: event.eventId, type: event.type, serviceId: event.serviceId, stage: event.stage, viewport: event.viewport }
    }
    if (event.type === 'search_result_click') {
      if (typeof event.submissionId !== 'string' || !UUID.test(event.submissionId)) throw badRequest('A valid search submission ID is required.')
      if (event.topicId !== null && (typeof event.topicId !== 'string' || event.topicId.length > 160)) throw badRequest('Choose a valid search topic.')
      if (!['typed', 'chip'].includes(event.source) || !SEARCH_RESULT_TYPES.has(event.resultType) || !POSITION_BUCKETS.has(event.positionBucket)) throw badRequest('Choose valid search result dimensions.')
      if (typeof event.resultId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._~:/-]{0,191}$/.test(event.resultId) || event.resultId.includes('//') || event.resultId.includes('?') || event.resultId.includes('#')) throw badRequest('A valid result identifier is required.')
      return { eventId: event.eventId, type: event.type, submissionId: event.submissionId, topicId: event.topicId || null, source: event.source, resultType: event.resultType, resultId: event.resultId, positionBucket: event.positionBucket }
    }
    if (event.type === 'open_data') {
      if (typeof event.datasetId !== 'string' || !DATASET_ID.test(event.datasetId) || !OPEN_DATA_ACTIVITIES.has(event.activity)) throw badRequest('Choose a valid Open Data activity.')
      return { eventId: event.eventId, type: event.type, datasetId: event.datasetId, activity: event.activity }
    }
    if (event.type === 'content_view') {
      if (typeof event.contentId !== 'string' || !DATASET_ID.test(event.contentId) || !CONTENT_TYPES.has(event.contentType)) throw badRequest('Choose a valid public content identifier and type.')
      return { eventId: event.eventId, type: event.type, contentId: event.contentId, contentType: event.contentType }
    }
    if (event.type === 'announcement') {
      if (typeof event.articleId !== 'string' || !DATASET_ID.test(event.articleId) || !UUID.test(event.impressionId) || !ANNOUNCEMENT_INTERACTIONS.has(event.interaction)) throw badRequest('Choose a valid announcement interaction.')
      return { eventId: event.eventId, type: event.type, articleId: event.articleId, impressionId: event.impressionId, interaction: event.interaction }
    }
    if (event.type === 'navigation') {
      const slotPosition = event.slotPosition === undefined ? 0 : Number(event.slotPosition)
      if (!PLACEMENT_KEY.test(event.placementKey || '') || !validNavigationDestination(event.destinationId) || !NAVIGATION_VIEWPORTS.has(event.viewport) || !['impression', 'click'].includes(event.interaction) || !Number.isInteger(slotPosition) || slotPosition < 0 || slotPosition > 5) throw badRequest('Choose valid public navigation placement dimensions.')
      if (event.interaction === 'impression' && !UUID.test(event.impressionId || '')) throw badRequest('A navigation impression ID is required.')
      if (event.interaction === 'click' && event.impressionId != null && !UUID.test(event.impressionId)) throw badRequest('A valid navigation impression ID is required.')
      return { eventId: event.eventId, type: event.type, placementKey: event.placementKey, destinationId: event.destinationId, slotPosition, viewport: event.viewport, interaction: event.interaction, impressionId: event.impressionId || null }
    }
    throw badRequest('Choose a supported analytics event type.')
  })
  return events
}

export async function persistAnalyticsEvents(events, getPool = getCmsPool) {
  const pool = await getPool()
  const connection = await pool.getConnection()
  const views = new Map()
  const actions = new Map()
  const serviceSteps = new Map()
  const searchClicks = new Map()
  const dataActivities = new Map()
  const contentViews = new Map()
  const announcementTotals = new Map()
  const navigationTotals = new Map()
  let accepted = 0
  try {
    await connection.beginTransaction()
    const [dates] = await connection.execute("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS report_date")
    const { report_date: reportDate } = dates[0]
    const receiptDays = Math.max(1, Math.min(30, Number(process.env.WEBSITE_ANALYTICS_RECEIPT_DAYS) || 7))
    for (const event of events) {
      const [, result] = await connection.execute(
        `INSERT INTO website_analytics_event_receipts (event_id, expires_at)
         VALUES (?, CURRENT_TIMESTAMP + (?::integer * INTERVAL '1 day'))
         ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
        [event.eventId, receiptDays],
      )
      if (!result.rowCount) continue
      accepted++
      if (event.type === 'page_view') {
        const key = [event.routeKey, event.viewport, event.entrySource].join('\u001f')
        const previous = views.get(key) || { routeKey: event.routeKey, viewport: event.viewport, entrySource: event.entrySource, count: 0 }
        previous.count++
        views.set(key, previous)
      } else if (event.type === 'action') actions.set(event.action, (actions.get(event.action) || 0) + 1)
      else if (event.type === 'service_journey') {
        const key = [event.serviceId, event.viewport, event.stage].join('\u001f')
        const value = serviceSteps.get(key) || { serviceId: event.serviceId, viewport: event.viewport, stage: event.stage, count: 0 }
        value.count++
        serviceSteps.set(key, value)
      } else if (event.type === 'open_data') {
        const key = [event.datasetId, event.activity].join('\u001f')
        const value = dataActivities.get(key) || { datasetId: event.datasetId, activity: event.activity, count: 0 }
        value.count++
        dataActivities.set(key, value)
      } else if (event.type === 'content_view') {
        await assertPublishedContent(connection, event)
        const key = [event.contentId, event.contentType].join('\u001f')
        const value = contentViews.get(key) || { contentId: event.contentId, contentType: event.contentType, count: 0 }
        value.count++
        contentViews.set(key, value)
      } else if (event.type === 'announcement') {
        if (event.interaction === 'impression') await assertImportantArticle(connection, event.articleId)
        const [receiptRows] = await connection.execute("SELECT article_id, to_char(report_date, 'YYYY-MM-DD') AS report_date, has_open, has_dismiss FROM website_announcement_impression_receipts WHERE impression_id = ? FOR UPDATE", [event.impressionId])
        const receipt = receiptRows[0]
        if (event.interaction === 'impression') {
          const [, insertResult] = await connection.execute(
            `INSERT INTO website_announcement_impression_receipts (impression_id, article_id, report_date, expires_at)
             VALUES (?, ?, ?::date, CURRENT_TIMESTAMP + (?::integer * INTERVAL '1 day'))
             ON CONFLICT (impression_id) DO NOTHING RETURNING impression_id`,
            [event.impressionId, event.articleId, reportDate, receiptDays],
          )
          if (insertResult.rowCount) {
            const key = [reportDate, event.articleId, 'impression'].join('\u001f')
            announcementTotals.set(key, (announcementTotals.get(key) || 0) + 1)
          }
        } else {
          if (!receipt || receipt.article_id !== event.articleId) throw Object.assign(new Error('Announcement impression is not eligible for engagement.'), { status: 400 })
          const flag = event.interaction === 'open' ? 'has_open' : 'has_dismiss'
          if (!receipt[flag]) {
            await connection.execute(`UPDATE website_announcement_impression_receipts SET ${flag} = TRUE WHERE impression_id = ?`, [event.impressionId])
            const key = [receipt.report_date, event.articleId, event.interaction].join('\u001f')
            announcementTotals.set(key, (announcementTotals.get(key) || 0) + 1)
          }
        }
      } else if (event.type === 'navigation') {
        await assertNavigationDestination(connection, event)
        const makeNavigationKey = date => [date, event.placementKey, event.destinationId, event.slotPosition, event.viewport].join('\u001f')
        const key = makeNavigationKey(reportDate)
        const value = navigationTotals.get(key) || { reportDate, placementKey: event.placementKey, destinationId: event.destinationId, slotPosition: event.slotPosition, viewport: event.viewport, impressions: 0, clicks: 0, impressionsWithClick: 0 }
        if (event.interaction === 'impression') {
          const [, insertResult] = await connection.execute(
            `INSERT INTO website_navigation_impression_receipts (impression_id, report_date, placement_key, destination_id, slot_position, viewport, expires_at)
             VALUES (?, ?::date, ?, ?, ?, ?, CURRENT_TIMESTAMP + (?::integer * INTERVAL '1 day'))
             ON CONFLICT (impression_id) DO NOTHING RETURNING impression_id`,
            [event.impressionId, reportDate, event.placementKey, event.destinationId, event.slotPosition, event.viewport, receiptDays],
          )
          if (insertResult.rowCount) value.impressions++
        } else {
          value.clicks++
          if (event.impressionId) {
            const [receiptRows] = await connection.execute("SELECT to_char(report_date, 'YYYY-MM-DD') AS report_date, placement_key, destination_id, slot_position, viewport, has_click FROM website_navigation_impression_receipts WHERE impression_id = ? FOR UPDATE", [event.impressionId])
            const receipt = receiptRows[0]
            if (receipt && receipt.placement_key === event.placementKey && receipt.destination_id === event.destinationId && Number(receipt.slot_position) === event.slotPosition && receipt.viewport === event.viewport && !receipt.has_click) {
              await connection.execute('UPDATE website_navigation_impression_receipts SET has_click = TRUE WHERE impression_id = ?', [event.impressionId])
              const impressionDate = receipt.report_date
              const impressionKey = makeNavigationKey(impressionDate)
              const impressionRollup = navigationTotals.get(impressionKey) || { ...value, reportDate: impressionDate, impressions: 0, clicks: 0, impressionsWithClick: 0 }
              impressionRollup.impressionsWithClick++
              navigationTotals.set(impressionKey, impressionRollup)
            }
          }
        }
        navigationTotals.set(key, value)
      } else if (event.type === 'search_result_click') {
        const [submissions] = await connection.execute('SELECT topic_id, source, search_date, has_result_click FROM search_submission_receipts WHERE submission_id = ? FOR UPDATE', [event.submissionId])
        const submission = submissions[0]
        if (!submission || submission.source !== event.source || String(submission.topic_id || '') !== String(event.topicId || '')) throw Object.assign(new Error('Search submission is not eligible for result engagement.'), { status: 400 })
        const resultHash = crypto.createHash('sha256').update(`${event.resultType}\u001f${event.resultId}`).digest('hex')
        const [, clickReceipt] = await connection.execute(
          `INSERT INTO website_search_result_click_receipts (submission_id, result_hash, expires_at)
           VALUES (?, ?, CURRENT_TIMESTAMP + (?::integer * INTERVAL '1 day'))
           ON CONFLICT (submission_id, result_hash) DO NOTHING RETURNING submission_id`,
          [event.submissionId, resultHash, Math.max(1, Math.min(30, Number(process.env.WEBSITE_ANALYTICS_RECEIPT_DAYS) || 7))],
        )
        if (clickReceipt.rowCount) {
          const topicRef = event.topicId || 'unmatched'
          const key = [topicRef, event.source, event.resultType, event.positionBucket].join('\u001f')
          const value = searchClicks.get(key) || { topicRef, source: event.source, resultType: event.resultType, positionBucket: event.positionBucket, count: 0 }
          value.count++
          searchClicks.set(key, value)
          if (!submission.has_result_click) {
            await connection.execute('UPDATE search_submission_receipts SET has_result_click = TRUE WHERE submission_id = ?', [event.submissionId])
            await connection.execute(
              `INSERT INTO website_search_engagement_daily (report_date, topic_ref, source, searches_with_result_click)
               VALUES (?, ?, ?, 1)
               ON CONFLICT (report_date, topic_ref, source) DO UPDATE SET searches_with_result_click = website_search_engagement_daily.searches_with_result_click + 1`,
              [submission.search_date, topicRef, event.source],
            )
          }
        }
      }
    }
    for (const row of views.values()) {
      await connection.execute(
        `INSERT INTO website_page_view_daily (report_date, route_key, viewport, entry_source, views)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (report_date, route_key, viewport, entry_source) DO UPDATE
         SET views = website_page_view_daily.views + EXCLUDED.views`,
        [dates[0].report_date, row.routeKey, row.viewport, row.entrySource, row.count],
      )
    }
    for (const [action, count] of actions) {
      await connection.execute(
        `INSERT INTO website_action_daily (report_date, action_key, actions)
         VALUES (?, ?, ?)
         ON CONFLICT (report_date, action_key) DO UPDATE
         SET actions = website_action_daily.actions + EXCLUDED.actions`,
        [dates[0].report_date, action, count],
      )
    }
    for (const value of serviceSteps.values()) await connection.execute(
      `INSERT INTO website_service_journey_daily (report_date, service_id, viewport, stage, transitions)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT (report_date, service_id, viewport, stage)
       DO UPDATE SET transitions = website_service_journey_daily.transitions + EXCLUDED.transitions`,
      [dates[0].report_date, value.serviceId, value.viewport, value.stage, value.count],
    )
    for (const value of dataActivities.values()) await connection.execute(
      `INSERT INTO website_open_data_daily (report_date, dataset_id, activity, events)
       VALUES (?, ?, ?, ?) ON CONFLICT (report_date, dataset_id, activity)
       DO UPDATE SET events = website_open_data_daily.events + EXCLUDED.events`,
      [dates[0].report_date, value.datasetId, value.activity, value.count],
    )
    for (const value of contentViews.values()) await connection.execute(
      `INSERT INTO website_content_view_daily (report_date, content_id, content_type, views)
       VALUES (?, ?, ?, ?) ON CONFLICT (report_date, content_id, content_type)
       DO UPDATE SET views = website_content_view_daily.views + EXCLUDED.views`,
      [dates[0].report_date, value.contentId, value.contentType, value.count],
    )
    for (const [key, count] of announcementTotals) {
      const [date, articleId, interaction] = key.split('\u001f')
      await connection.execute(
        `INSERT INTO website_announcement_daily (report_date, article_id, interaction, interactions)
         VALUES (?, ?, ?, ?) ON CONFLICT (report_date, article_id, interaction)
         DO UPDATE SET interactions = website_announcement_daily.interactions + EXCLUDED.interactions`,
        [date, articleId, interaction, count],
      )
    }
    for (const value of navigationTotals.values()) await connection.execute(
      `INSERT INTO website_navigation_daily (report_date, placement_key, destination_id, slot_position, viewport, impressions, clicks, impressions_with_click)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (report_date, placement_key, destination_id, slot_position, viewport)
       DO UPDATE SET impressions = website_navigation_daily.impressions + EXCLUDED.impressions,
         clicks = website_navigation_daily.clicks + EXCLUDED.clicks,
         impressions_with_click = website_navigation_daily.impressions_with_click + EXCLUDED.impressions_with_click`,
      [value.reportDate, value.placementKey, value.destinationId, value.slotPosition, value.viewport, value.impressions, value.clicks, value.impressionsWithClick],
    )
    for (const value of searchClicks.values()) await connection.execute(
      `INSERT INTO website_search_result_click_daily (report_date, topic_ref, source, result_type, position_bucket, result_clicks)
       VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (report_date, topic_ref, source, result_type, position_bucket)
       DO UPDATE SET result_clicks = website_search_result_click_daily.result_clicks + EXCLUDED.result_clicks`,
      [dates[0].report_date, value.topicRef, value.source, value.resultType, value.positionBucket, value.count],
    )
    await connection.commit()
    return { accepted, duplicates: events.length - accepted, committed: true }
  } catch (error) {
    await connection.rollback().catch(() => {})
    throw error
  } finally { connection.release() }
}

function cleanDate(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badRequest(`${field} must be a calendar date.`)
  const date = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw badRequest(`${field} must be a calendar date.`)
  return value
}

export function validateReportRange(query = {}) {
  const range = String(query.range || '7d')
  if (range === 'today') return { range, from: null, to: null, days: 1 }
  if (range === '7d') return { range, from: null, to: null, days: 7 }
  if (range === '30d') return { range, from: null, to: null, days: 30 }
  if (range !== 'custom') throw badRequest('Choose Today, 7 days, 30 days, or a custom date range.')
  const from = cleanDate(query.from, 'Start date')
  const to = cleanDate(query.to, 'End date')
  if (from > to) throw badRequest('Start date must be on or before the end date.')
  const days = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1
  if (days > 366) throw badRequest('Custom date ranges are limited to 366 days.')
  return { range, from, to, days }
}

async function getReport({ range, from, to, days }) {
  const pool = await getCmsPool()
  const custom = range === 'custom'
  const dateClause = custom ? 'report_date BETWEEN ?::date AND ?::date' : "report_date BETWEEN ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer - 1)) AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date"
  const values = custom ? [from, to] : [days]
  const [pageRows] = await pool.execute(
    `SELECT to_char(report_date, 'YYYY-MM-DD') AS date, route_key AS "routeKey", viewport, entry_source AS "entrySource", views::text AS views
       FROM website_page_view_daily WHERE ${dateClause} ORDER BY report_date ASC, route_key ASC, viewport ASC`, values)
  const [actionRows] = await pool.execute(
    `SELECT report_date AS date, action_key AS action, actions::text AS actions
       FROM website_action_daily WHERE ${dateClause} ORDER BY report_date ASC, action_key ASC`, values)
  const [searchRows] = await pool.execute(
    `SELECT COALESCE(SUM(typed_submissions), 0)::text AS typed,
            COALESCE(SUM(chip_clicks), 0)::text AS chips,
            COALESCE(SUM(typed_zero_results), 0)::text AS typed_zeros,
            COALESCE(SUM(chip_zero_results), 0)::text AS chip_zeros
       FROM search_topic_daily WHERE search_date >= (SELECT date_value FROM website_analytics_settings WHERE setting_key = 'search_engagement_start')
         AND ${custom ? 'search_date BETWEEN ?::date AND ?::date' : "search_date BETWEEN ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer - 1)) AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date"}`, values)
  const [unmatchedRows] = await pool.execute(
    `SELECT COALESCE(SUM(unmatched_typed_submissions), 0)::text AS typed,
            COALESCE(SUM(unmatched_zero_results), 0)::text AS zeros
       FROM search_daily_unmatched WHERE search_date >= (SELECT date_value FROM website_analytics_settings WHERE setting_key = 'search_engagement_start')
         AND ${custom ? 'search_date BETWEEN ?::date AND ?::date' : "search_date BETWEEN ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer - 1)) AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date"}`, values)
  const [journeyRows] = await pool.execute(
    `SELECT service_id AS "serviceId", viewport, stage, SUM(transitions)::text AS transitions
       FROM website_service_journey_daily WHERE ${dateClause}
       GROUP BY service_id, viewport, stage ORDER BY service_id, stage, viewport`, values)
  const engagementDateClause = custom ? 'report_date BETWEEN ?::date AND ?::date' : "report_date BETWEEN ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer - 1)) AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date"
  const engagementValues = custom ? [from, to] : [days]
  const [engagementRows] = await pool.execute(
    `SELECT topic_ref AS "topicRef", source, SUM(completed_submissions)::text AS submissions,
            SUM(searches_with_result_click)::text AS "searchesWithClick"
       FROM website_search_engagement_daily WHERE report_date >= (SELECT date_value FROM website_analytics_settings WHERE setting_key = 'search_engagement_start')
         AND ${engagementDateClause} GROUP BY topic_ref, source ORDER BY topic_ref, source`, engagementValues)
  const [resultClickRows] = await pool.execute(
    `SELECT topic_ref AS "topicRef", source, result_type AS "resultType", position_bucket AS "positionBucket", SUM(result_clicks)::text AS clicks
       FROM website_search_result_click_daily WHERE report_date >= (SELECT date_value FROM website_analytics_settings WHERE setting_key = 'search_engagement_start')
         AND ${engagementDateClause} GROUP BY topic_ref, source, result_type, position_bucket ORDER BY topic_ref, source, result_type, position_bucket`, engagementValues)
  const [openDataRows] = await pool.execute(
    `SELECT dataset_id AS "datasetId", activity, SUM(events)::text AS events
       FROM website_open_data_daily WHERE ${dateClause} GROUP BY dataset_id, activity ORDER BY dataset_id, activity`, values)
  const [operationRows] = await pool.execute(
    `SELECT operation, dataset_id AS "datasetId", outcome, category, cache_status AS "cacheStatus", latency_bucket_ms AS "latencyBucketMs", SUM(requests)::text AS requests
       FROM website_operation_daily WHERE ${dateClause} GROUP BY operation, dataset_id, outcome, category, cache_status, latency_bucket_ms
       ORDER BY operation, dataset_id, outcome, category, cache_status, latency_bucket_ms`, values)
  const [notFoundRows] = await pool.execute(
    `SELECT route_family AS "routeFamily", referring_section AS "referringSection", SUM(responses)::text AS responses
       FROM website_public_404_daily WHERE ${dateClause} GROUP BY route_family, referring_section ORDER BY route_family, referring_section`, values)
  const [contentViewRows] = await pool.execute(
    `SELECT report_date::text AS date, content_id AS "contentId", content_type AS "contentType", views::text AS views
       FROM website_content_view_daily
       WHERE report_date >= ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - INTERVAL '13 months')::date
       ORDER BY report_date, content_type, content_id`)
  const [newsMetadataRows] = await pool.execute(
    `SELECT id AS "contentId", title,
            CASE WHEN lower(content_type) IN ('event', 'meeting') THEN lower(content_type)
                 WHEN is_important THEN 'announcement' ELSE 'news' END AS "contentType",
            is_important AS "isImportant", published_at::date::text AS "publishedDate", updated_at::date::text AS "lastUpdated"
       FROM news WHERE status = 'published'`)
  const [managedMetadataRows] = await pool.execute(
    `SELECT key AS "contentId", title, 'service' AS "contentType", NULL::text AS "publishedDate", updated_at::date::text AS "lastUpdated"
       FROM managed_public_content WHERE published = TRUE AND kind = 'page'`)
  let serviceMetadataRows = []
  try {
    const portalPool = await getPortalPool()
    ;[serviceMetadataRows] = await portalPool.execute(
      `SELECT id::text AS "contentId", name AS title, 'service' AS "contentType", NULL::text AS "publishedDate", updated_at::date::text AS "lastUpdated"
         FROM services WHERE published = TRUE`)
  } catch { /* Service metadata is optional to aggregate reporting. */ }
  const [announcementRows] = await pool.execute(
    `SELECT article_id AS "articleId", interaction, SUM(interactions)::text AS interactions
       FROM website_announcement_daily WHERE ${dateClause}
       GROUP BY article_id, interaction ORDER BY article_id, interaction`, values)
  const [navigationRows] = await pool.execute(
    `SELECT placement_key AS "placementKey", destination_id AS "destinationId", slot_position AS "slotPosition", viewport,
            SUM(impressions)::text AS impressions, SUM(clicks)::text AS clicks, SUM(impressions_with_click)::text AS "impressionsWithClick"
       FROM website_navigation_daily WHERE ${dateClause}
       GROUP BY placement_key, destination_id, slot_position, viewport
       ORDER BY placement_key, slot_position, destination_id, viewport`, values)
  const [topicMetadataRows] = await pool.execute('SELECT id, label FROM search_topics WHERE public_visible = TRUE')
  const number = value => Number(value) || 0
  const [todayRows] = await pool.execute("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date::text AS today")
  const todayDate = todayRows[0]?.today
  const metadata = new Map([...newsMetadataRows, ...managedMetadataRows, ...serviceMetadataRows].map(row => [String(row.contentId), row]))
  const contentByKey = new Map()
  const todayTimestamp = todayDate ? Date.parse(`${todayDate}T00:00:00Z`) : Date.now()
  for (const item of metadata.values()) {
    if (!CONTENT_TYPES.has(item.contentType)) continue
    const publishedDate = item.publishedDate || null
    const publicationTimestamp = publishedDate ? Date.parse(`${publishedDate}T00:00:00Z`) : NaN
    contentByKey.set(`${item.contentType}\u001f${item.contentId}`, {
      contentId: String(item.contentId), contentType: item.contentType, title: item.title,
      publishedDate, lastUpdated: item.lastUpdated || null, firstSevenDays: 0, last30Days: 0,
      firstSevenDaysInProgress: Number.isFinite(publicationTimestamp) ? todayTimestamp < publicationTimestamp + 7 * 86400000 : null,
    })
  }
  for (const row of contentViewRows) {
    const item = metadata.get(String(row.contentId)) || { contentId: row.contentId, title: row.contentId, contentType: row.contentType, publishedDate: null, lastUpdated: null }
    const key = `${row.contentType}\u001f${row.contentId}`
    const content = contentByKey.get(key) || { contentId: row.contentId, contentType: row.contentType, title: item.title, publishedDate: item.publishedDate || null, lastUpdated: item.lastUpdated || null, firstSevenDays: 0, last30Days: 0 }
    const reportDate = String(row.date).slice(0, 10)
    const count = number(row.views)
    if (reportDate >= (todayDate ? new Date(todayTimestamp - 29 * 86400000).toISOString().slice(0, 10) : '') && reportDate <= todayDate) content.last30Days += count
    if (content.publishedDate) {
      const pub = Date.parse(`${content.publishedDate}T00:00:00Z`)
      if (Number.isFinite(pub) && Date.parse(`${reportDate}T00:00:00Z`) >= pub && Date.parse(`${reportDate}T00:00:00Z`) < pub + 7 * 86400000 && reportDate <= todayDate) content.firstSevenDays += count
      content.firstSevenDaysInProgress = todayTimestamp < pub + 7 * 86400000
    } else content.firstSevenDaysInProgress = null
    contentByKey.set(key, content)
  }
  const contentReach = [...contentByKey.values()].sort((a, b) => b.last30Days - a.last30Days || String(a.title).localeCompare(String(b.title)))
  const highTrafficServices = contentReach.filter(item => item.contentType === 'service' && item.last30Days >= 25)
  const announcementCounts = new Map()
  for (const row of announcementRows) {
    const item = announcementCounts.get(row.articleId) || { articleId: row.articleId, impressions: 0, opens: 0, dismissals: 0 }
    item[row.interaction === 'impression' ? 'impressions' : row.interaction === 'open' ? 'opens' : 'dismissals'] = number(row.interactions)
    announcementCounts.set(row.articleId, item)
  }
  const announcements = [...announcementCounts.values()].map(item => ({
    ...item, title: metadata.get(String(item.articleId))?.title || item.articleId,
    openRate: item.impressions ? item.opens / item.impressions : null,
    dismissRate: item.impressions ? item.dismissals / item.impressions : null,
  })).sort((a, b) => b.impressions - a.impressions || String(a.title).localeCompare(String(b.title)))
  const topicLabels = new Map(topicMetadataRows.map(row => [String(row.id), row.label]))
  const routeLabels = { '/': 'Homepage', '/accessibility': 'Accessibility', '/barangays': 'Barangays', '/community': 'Community', '/contact': 'Contact', '/data': 'Open Data', '/departments': 'Departments', '/discover': 'Discover Getafe', '/events': 'Events', '/info': 'Information', '/legal': 'Legal information', '/news': 'News & Updates', '/newsletter': 'Newsletter', '/officials': 'Officials', '/search': 'Search', '/services': 'Services', '/tourism': 'Tourism', '/weather': 'Weather', '/other': 'Other public destination', external: 'External website' }
  const navigation = navigationRows.map(row => {
    const destinationTitle = row.destinationId.startsWith('topic:') ? topicLabels.get(row.destinationId.slice(6)) || row.destinationId
      : row.destinationId.startsWith('service:') ? metadata.get(row.destinationId.slice(8))?.title || row.destinationId
        : routeLabels[row.destinationId] || row.destinationId
    return { ...row, destinationTitle, impressions: number(row.impressions), clicks: number(row.clicks), impressionsWithClick: number(row.impressionsWithClick), clickThroughRate: number(row.impressions) ? number(row.impressionsWithClick) / number(row.impressions) : null }
  })
  const [instrumentationRows] = await pool.execute("SELECT date_value::text AS date FROM website_analytics_settings WHERE setting_key = 'content_navigation_start'")
  const pages = pageRows.map(row => ({ ...row, views: number(row.views) }))
  const daily = new Map()
  for (const row of pages) daily.set(row.date, (daily.get(row.date) || 0) + row.views)
  const pageTotals = new Map()
  const viewports = new Map()
  const sources = new Map()
  for (const row of pages) {
    pageTotals.set(row.routeKey, (pageTotals.get(row.routeKey) || 0) + row.views)
    viewports.set(row.viewport, (viewports.get(row.viewport) || 0) + row.views)
    if (row.entrySource !== 'none') sources.set(row.entrySource, (sources.get(row.entrySource) || 0) + row.views)
  }
  const actionTotals = new Map()
  for (const row of actionRows) actionTotals.set(row.action, (actionTotals.get(row.action) || 0) + number(row.actions))
  const today = todayRows[0]?.today
  if (today && !custom) {
    const end = Date.parse(`${today}T00:00:00Z`)
    for (let offset = days - 1; offset >= 0; offset--) {
      const date = new Date(end - offset * 86400000).toISOString().slice(0, 10)
      if (!daily.has(date)) daily.set(date, 0)
    }
  } else if (custom) {
    const end = Date.parse(`${to}T00:00:00Z`)
    const start = Date.parse(`${from}T00:00:00Z`)
    for (let at = start; at <= end; at += 86400000) {
      const date = new Date(at).toISOString().slice(0, 10)
      if (!daily.has(date)) daily.set(date, 0)
    }
  }
  const actions = [...actionTotals].map(([action, count]) => ({ action, actions: count }))
  const serviceJourneys = journeyRows.map(row => ({ ...row, transitions: number(row.transitions) }))
  const engagement = engagementRows.map(row => ({ ...row, submissions: number(row.submissions), searchesWithClick: number(row.searchesWithClick) }))
  const resultClicks = resultClickRows.map(row => ({ ...row, clicks: number(row.clicks) }))
  const searchEngagementTotals = engagement.reduce((total, row) => ({
    submissions: total.submissions + row.submissions,
    searchesWithClick: total.searchesWithClick + row.searchesWithClick,
  }), { submissions: 0, searchesWithClick: 0 })
  const totalResultClicks = resultClicks.reduce((total, row) => total + row.clicks, 0)
  const openData = openDataRows.map(row => ({ ...row, events: number(row.events) }))
  const operations = operationRows.map(row => ({ ...row, latencyBucketMs: number(row.latencyBucketMs), requests: number(row.requests) }))
  const operationTotals = new Map()
  const operationLatencies = new Map()
  for (const row of operations) {
    const key = [row.operation, row.datasetId].join('\u001f')
    const aggregate = operationTotals.get(key) || { operation: row.operation, datasetId: row.datasetId, requests: 0, successes: 0, failures: 0, categories: new Map(), cache: new Map() }
    aggregate.requests += row.requests
    aggregate[row.outcome === 'success' ? 'successes' : 'failures'] += row.requests
    if (row.outcome === 'failure') aggregate.categories.set(row.category, (aggregate.categories.get(row.category) || 0) + row.requests)
    if (row.cacheStatus === 'hit' || row.cacheStatus === 'miss') aggregate.cache.set(row.cacheStatus, (aggregate.cache.get(row.cacheStatus) || 0) + row.requests)
    operationTotals.set(key, aggregate)
    const histogram = operationLatencies.get(key) || []
    histogram.push([row.latencyBucketMs, row.requests])
    operationLatencies.set(key, histogram)
  }
  const percentileBucket = (histogram, percentile) => {
    const rows = histogram.sort((a, b) => a[0] - b[0])
    const total = rows.reduce((sum, [, count]) => sum + count, 0)
    if (!total) return null
    const threshold = Math.ceil(total * percentile)
    let count = 0
    for (const [bucket, value] of rows) { count += value; if (count >= threshold) return bucket === 240001 ? '>240s' : bucket }
    return null
  }
  const reliability = [...operationTotals.values()].map(value => ({
    operation: value.operation, datasetId: value.datasetId, requests: value.requests, successes: value.successes, failures: value.failures,
    successRate: value.requests ? value.successes / value.requests : null,
    failureCategories: [...value.categories].map(([category, count]) => ({ category, count })),
    cache: [...value.cache].map(([status, count]) => ({ status, count })),
    latencyP50BucketMs: percentileBucket(operationLatencies.get([value.operation, value.datasetId].join('\u001f')) || [], .5),
    latencyP95BucketMs: percentileBucket(operationLatencies.get([value.operation, value.datasetId].join('\u001f')) || [], .95),
  }))
  const public404 = notFoundRows.map(row => ({ ...row, responses: number(row.responses) }))
  const typedSearches = number(searchRows[0]?.typed) + number(unmatchedRows[0]?.typed)
  const chipClicks = number(searchRows[0]?.chips)
  const typedZeroResults = number(searchRows[0]?.typed_zeros) + number(unmatchedRows[0]?.zeros)
  const chipZeroResults = number(searchRows[0]?.chip_zeros)
  const zeroResults = typedZeroResults + chipZeroResults
  return {
    range, from, to, days, timezone: 'Asia/Manila', contentNavigationStart: instrumentationRows[0]?.date || null,
    totals: { pageViews: pages.reduce((sum, row) => sum + row.views, 0), typedSearches, chipClicks, typedZeroResults, chipZeroResults, unmatchedSearches: number(unmatchedRows[0]?.typed), zeroResults, zeroResultRate: typedSearches + chipClicks ? zeroResults / (typedSearches + chipClicks) : null, zeroResultDenominator: typedSearches + chipClicks },
    daily: [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, pageViews]) => ({ date, pageViews })),
    topPages: [...pageTotals].map(([routeKey, pageViews]) => ({ routeKey, pageViews })).sort((a, b) => b.pageViews - a.pageViews || a.routeKey.localeCompare(b.routeKey)),
    viewports: [...viewports].map(([viewport, pageViews]) => ({ viewport, pageViews })),
    entrySources: [...sources].map(([entrySource, pageViews]) => ({ entrySource, pageViews })),
    actions,
    serviceJourneys,
    contentReach,
    highTrafficServices,
    announcements,
    navigation,
    searchEngagement: {
      ...searchEngagementTotals,
      resultClicks: totalResultClicks,
      clickThroughRate: searchEngagementTotals.submissions ? searchEngagementTotals.searchesWithClick / searchEngagementTotals.submissions : null,
      byTopic: engagement,
      clicksByResult: resultClicks,
    },
    openData,
    reliability,
    public404,
  }
}

async function cleanupBatch() {
  const pool = await getCmsPool()
  const rollupMonths = Math.max(1, Math.min(36, Number(process.env.WEBSITE_ANALYTICS_ROLLUP_MONTHS) || 13))
  for (let batch = 0; batch < 10; batch++) {
    await pool.execute(`WITH expired AS (SELECT event_id FROM website_analytics_event_receipts WHERE expires_at < CURRENT_TIMESTAMP ORDER BY expires_at LIMIT 1000) DELETE FROM website_analytics_event_receipts r USING expired e WHERE r.event_id = e.event_id`)
    await pool.execute(`WITH expired AS (SELECT submission_id, result_hash FROM website_search_result_click_receipts WHERE expires_at < CURRENT_TIMESTAMP ORDER BY expires_at LIMIT 1000) DELETE FROM website_search_result_click_receipts r USING expired e WHERE r.submission_id = e.submission_id AND r.result_hash = e.result_hash`)
    await pool.execute(`WITH expired AS (SELECT impression_id FROM website_announcement_impression_receipts WHERE expires_at < CURRENT_TIMESTAMP ORDER BY expires_at LIMIT 1000) DELETE FROM website_announcement_impression_receipts r USING expired e WHERE r.impression_id = e.impression_id`)
    await pool.execute(`WITH expired AS (SELECT impression_id FROM website_navigation_impression_receipts WHERE expires_at < CURRENT_TIMESTAMP ORDER BY expires_at LIMIT 1000) DELETE FROM website_navigation_impression_receipts r USING expired e WHERE r.impression_id = e.impression_id`)
    await pool.execute(`WITH expired AS (SELECT submission_id FROM search_submission_receipts WHERE expires_at < CURRENT_TIMESTAMP ORDER BY expires_at LIMIT 1000) DELETE FROM search_submission_receipts r USING expired e WHERE r.submission_id = e.submission_id`)
    await pool.execute(`WITH expired AS (SELECT ctid FROM website_page_view_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer * INTERVAL '1 month'))::date LIMIT 1000) DELETE FROM website_page_view_daily r USING expired e WHERE r.ctid = e.ctid`, [rollupMonths])
    await pool.execute(`WITH expired AS (SELECT ctid FROM website_action_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer * INTERVAL '1 month'))::date LIMIT 1000) DELETE FROM website_action_daily r USING expired e WHERE r.ctid = e.ctid`, [rollupMonths])
    await pool.execute(`WITH expired AS (SELECT ctid FROM search_topic_daily WHERE search_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer * INTERVAL '1 month'))::date LIMIT 1000) DELETE FROM search_topic_daily r USING expired e WHERE r.ctid = e.ctid`, [rollupMonths])
    await pool.execute(`WITH expired AS (SELECT ctid FROM search_daily_unmatched WHERE search_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer * INTERVAL '1 month'))::date LIMIT 1000) DELETE FROM search_daily_unmatched r USING expired e WHERE r.ctid = e.ctid`, [rollupMonths])
    await pool.execute(`WITH expired AS (SELECT ctid FROM website_service_journey_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer * INTERVAL '1 month'))::date LIMIT 1000) DELETE FROM website_service_journey_daily r USING expired e WHERE r.ctid = e.ctid`, [rollupMonths])
    await pool.execute(`WITH expired AS (SELECT ctid FROM website_search_engagement_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer * INTERVAL '1 month'))::date LIMIT 1000) DELETE FROM website_search_engagement_daily r USING expired e WHERE r.ctid = e.ctid`, [rollupMonths])
    await pool.execute(`WITH expired AS (SELECT ctid FROM website_search_result_click_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer * INTERVAL '1 month'))::date LIMIT 1000) DELETE FROM website_search_result_click_daily r USING expired e WHERE r.ctid = e.ctid`, [rollupMonths])
    await pool.execute(`WITH expired AS (SELECT ctid FROM website_open_data_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer * INTERVAL '1 month'))::date LIMIT 1000) DELETE FROM website_open_data_daily r USING expired e WHERE r.ctid = e.ctid`, [rollupMonths])
    await pool.execute(`WITH expired AS (SELECT ctid FROM website_operation_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer * INTERVAL '1 month'))::date LIMIT 1000) DELETE FROM website_operation_daily r USING expired e WHERE r.ctid = e.ctid`, [rollupMonths])
    await pool.execute(`WITH expired AS (SELECT ctid FROM website_public_404_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer * INTERVAL '1 month'))::date LIMIT 1000) DELETE FROM website_public_404_daily r USING expired e WHERE r.ctid = e.ctid`, [rollupMonths])
    await pool.execute(`WITH expired AS (SELECT ctid FROM website_content_view_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer * INTERVAL '1 month'))::date LIMIT 1000) DELETE FROM website_content_view_daily r USING expired e WHERE r.ctid = e.ctid`, [rollupMonths])
    await pool.execute(`WITH expired AS (SELECT ctid FROM website_announcement_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer * INTERVAL '1 month'))::date LIMIT 1000) DELETE FROM website_announcement_daily r USING expired e WHERE r.ctid = e.ctid`, [rollupMonths])
    await pool.execute(`WITH expired AS (SELECT ctid FROM website_navigation_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer * INTERVAL '1 month'))::date LIMIT 1000) DELETE FROM website_navigation_daily r USING expired e WHERE r.ctid = e.ctid`, [rollupMonths])
  }
}

export function scheduleWebsiteAnalyticsCleanup() {
  const timer = setInterval(() => cleanupBatch().catch(error => console.warn(JSON.stringify({ event: 'website_analytics_cleanup_failed', code: error?.code || 'DATABASE_ERROR' }))), 6 * 60 * 60 * 1000)
  timer.unref?.()
  return timer
}

export function registerWebsiteAnalyticsRoutes(app, { admin, permission }) {
  app.post('/api/analytics/events', async (req, res) => {
    // Public analytics events are anonymous even when a caller manually adds
    // an administrator cookie; API audit logs must not attach that identity.
    req.apiSession = { kind: 'anonymous-analytics' }
    if (!isAnalyticsCollectionEnabled()) return rejectDisabledAnalytics(req, res)
    try {
      const events = validateAnalyticsBatch(req.body || {})
      if (req.get?.('x-analytics-synthetic') === 'true') return res.set('Cache-Control', 'no-store').status(200).json({ accepted: 0, duplicates: 0, excluded: events.length, committed: false })
      const result = await persistAnalyticsEvents(events)
      return res.set('Cache-Control', 'no-store').status(202).json(result)
    } catch (error) {
      res.set('Cache-Control', 'no-store')
      if (Number(error?.status) === 400) return res.status(400).json({ error: error.message })
      const { reason, code, retryAfter } = ingestionFailure(error)
      console.warn(JSON.stringify({ event: 'website_analytics_ingest_failed', request_id: req.requestId || null, reason, code }))
      if (retryAfter) res.set('Retry-After', retryAfter)
      return res.status(503).json({ code: 'ANALYTICS_UNAVAILABLE', error: 'Analytics are temporarily unavailable.' })
    }
  })
  app.get('/api/admin/analytics/website', admin, permission('analytics.view'), async (req, res) => {
    try {
      const range = validateReportRange(req.query || {})
      const report = await getReport(range)
      return res.set('Cache-Control', 'no-store, private').json({ enabled: isAnalyticsCollectionEnabled(), ...report })
    } catch (error) {
      const status = Number(error?.status) === 400 ? 400 : 503
      if (status === 503) console.warn(JSON.stringify({ event: 'website_analytics_report_failed', request_id: req.requestId || null, reason: ingestionFailure(error).reason }))
      return res.set('Cache-Control', 'no-store, private').status(status).json({ error: status === 400 ? error.message : 'Website analytics are temporarily unavailable.' })
    }
  })
  return scheduleWebsiteAnalyticsCleanup()
}
