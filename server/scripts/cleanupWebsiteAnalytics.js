import pg from 'pg'
import { DATABASE_MIGRATION_FREEZE_LOCK_ID, supabaseConnectionOptions } from '../src/services/postgres.js'

const { Pool } = pg
const pool = new Pool({ ...supabaseConnectionOptions('database'), application_name: 'better-getafe-analytics-cleanup' })
const batchSize = Math.max(1, Math.min(5000, Number(process.env.WEBSITE_ANALYTICS_CLEANUP_BATCH_SIZE) || 1000))
const maxBatches = Math.max(1, Math.min(100, Number(process.env.WEBSITE_ANALYTICS_CLEANUP_MAX_BATCHES) || 20))
const months = Math.max(1, Math.min(36, Number(process.env.WEBSITE_ANALYTICS_ROLLUP_MONTHS) || 13))

const jobs = [
  ['website_analytics_event_receipts', `WITH expired AS (SELECT event_id FROM website_analytics_event_receipts WHERE expires_at < CURRENT_TIMESTAMP ORDER BY expires_at LIMIT $1) DELETE FROM website_analytics_event_receipts r USING expired e WHERE r.event_id = e.event_id`],
  ['website_search_result_click_receipts', `WITH expired AS (SELECT submission_id, result_hash FROM website_search_result_click_receipts WHERE expires_at < CURRENT_TIMESTAMP ORDER BY expires_at LIMIT $1) DELETE FROM website_search_result_click_receipts r USING expired e WHERE r.submission_id = e.submission_id AND r.result_hash = e.result_hash`],
  ['website_announcement_impression_receipts', `WITH expired AS (SELECT impression_id FROM website_announcement_impression_receipts WHERE expires_at < CURRENT_TIMESTAMP ORDER BY expires_at LIMIT $1) DELETE FROM website_announcement_impression_receipts r USING expired e WHERE r.impression_id = e.impression_id`],
  ['website_navigation_impression_receipts', `WITH expired AS (SELECT impression_id FROM website_navigation_impression_receipts WHERE expires_at < CURRENT_TIMESTAMP ORDER BY expires_at LIMIT $1) DELETE FROM website_navigation_impression_receipts r USING expired e WHERE r.impression_id = e.impression_id`],
  ['search_submission_receipts', `WITH expired AS (SELECT submission_id FROM search_submission_receipts WHERE expires_at < CURRENT_TIMESTAMP ORDER BY expires_at LIMIT $1) DELETE FROM search_submission_receipts r USING expired e WHERE r.submission_id = e.submission_id`],
  ['website_page_view_daily', `WITH expired AS (SELECT ctid FROM website_page_view_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - ($2::integer * INTERVAL '1 month'))::date LIMIT $1) DELETE FROM website_page_view_daily r USING expired e WHERE r.ctid = e.ctid`],
  ['website_action_daily', `WITH expired AS (SELECT ctid FROM website_action_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - ($2::integer * INTERVAL '1 month'))::date LIMIT $1) DELETE FROM website_action_daily r USING expired e WHERE r.ctid = e.ctid`],
  ['search_topic_daily', `WITH expired AS (SELECT ctid FROM search_topic_daily WHERE search_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - ($2::integer * INTERVAL '1 month'))::date LIMIT $1) DELETE FROM search_topic_daily r USING expired e WHERE r.ctid = e.ctid`],
  ['search_daily_unmatched', `WITH expired AS (SELECT ctid FROM search_daily_unmatched WHERE search_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - ($2::integer * INTERVAL '1 month'))::date LIMIT $1) DELETE FROM search_daily_unmatched r USING expired e WHERE r.ctid = e.ctid`],
  ['website_service_journey_daily', `WITH expired AS (SELECT ctid FROM website_service_journey_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - ($2::integer * INTERVAL '1 month'))::date LIMIT $1) DELETE FROM website_service_journey_daily r USING expired e WHERE r.ctid = e.ctid`],
  ['website_search_engagement_daily', `WITH expired AS (SELECT ctid FROM website_search_engagement_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - ($2::integer * INTERVAL '1 month'))::date LIMIT $1) DELETE FROM website_search_engagement_daily r USING expired e WHERE r.ctid = e.ctid`],
  ['website_search_result_click_daily', `WITH expired AS (SELECT ctid FROM website_search_result_click_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - ($2::integer * INTERVAL '1 month'))::date LIMIT $1) DELETE FROM website_search_result_click_daily r USING expired e WHERE r.ctid = e.ctid`],
  ['website_open_data_daily', `WITH expired AS (SELECT ctid FROM website_open_data_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - ($2::integer * INTERVAL '1 month'))::date LIMIT $1) DELETE FROM website_open_data_daily r USING expired e WHERE r.ctid = e.ctid`],
  ['website_operation_daily', `WITH expired AS (SELECT ctid FROM website_operation_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - ($2::integer * INTERVAL '1 month'))::date LIMIT $1) DELETE FROM website_operation_daily r USING expired e WHERE r.ctid = e.ctid`],
  ['website_public_404_daily', `WITH expired AS (SELECT ctid FROM website_public_404_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - ($2::integer * INTERVAL '1 month'))::date LIMIT $1) DELETE FROM website_public_404_daily r USING expired e WHERE r.ctid = e.ctid`],
  ['website_content_view_daily', `WITH expired AS (SELECT ctid FROM website_content_view_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - ($2::integer * INTERVAL '1 month'))::date LIMIT $1) DELETE FROM website_content_view_daily r USING expired e WHERE r.ctid = e.ctid`],
  ['website_announcement_daily', `WITH expired AS (SELECT ctid FROM website_announcement_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - ($2::integer * INTERVAL '1 month'))::date LIMIT $1) DELETE FROM website_announcement_daily r USING expired e WHERE r.ctid = e.ctid`],
  ['website_navigation_daily', `WITH expired AS (SELECT ctid FROM website_navigation_daily WHERE report_date < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - ($2::integer * INTERVAL '1 month'))::date LIMIT $1) DELETE FROM website_navigation_daily r USING expired e WHERE r.ctid = e.ctid`],
]

try {
  const gate = await pool.connect()
  await gate.query('SELECT pg_advisory_lock_shared($1)', [DATABASE_MIGRATION_FREEZE_LOCK_ID])
  try {
  const deleted = {}
  for (const [table, sql] of jobs) {
    let total = 0
    for (let batch = 0; batch < maxBatches; batch++) {
      const result = table.endsWith('receipts')
        ? await pool.query(sql, [batchSize])
        : await pool.query(sql, [batchSize, months])
      total += result.rowCount || 0
      if (!result.rowCount || result.rowCount < batchSize) break
    }
    deleted[table] = total
  }
  console.info(JSON.stringify({ event: 'website_analytics_cleanup_completed', deleted, batch_size: batchSize, max_batches: maxBatches, rollup_months: months }))
  } finally {
    await gate.query('SELECT pg_advisory_unlock_shared($1)', [DATABASE_MIGRATION_FREEZE_LOCK_ID]).catch(() => {})
    gate.release()
  }
} catch (error) {
  console.error(JSON.stringify({ event: 'website_analytics_cleanup_failed', code: error?.code || 'DATABASE_ERROR' }))
  process.exitCode = 1
} finally {
  await pool.end()
}
