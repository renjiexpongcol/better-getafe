import crypto from 'node:crypto'
import { getCmsPool } from './database.js'
import { isAnalyticsCollectionEnabled, recordServerOperation, rejectDisabledAnalytics } from './websiteAnalyticsRoutes.js'

export function normalizeSearchTerm(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

function cleanSearchTerm(value, field, maxLength = 160) {
  if (typeof value !== 'string') throw Object.assign(new Error(`${field} is required.`), { status: 400 })
  const term = value.trim().replace(/\s+/g, ' ')
  if (!term || term.length > maxLength || /[\0\r\n]/.test(term)) throw Object.assign(new Error(`Enter a valid ${field.toLowerCase()}.`), { status: 400 })
  return term
}

export function validateSearchTopicPayload(body = {}) {
  const label = cleanSearchTerm(body.label, 'Label', 120)
  const canonicalQuery = cleanSearchTerm(body.canonicalQuery, 'Canonical query')
  if (typeof body.publicVisible !== 'boolean') throw Object.assign(new Error('Choose whether this topic is public.'), { status: 400 })
  const pinOrder = body.pinOrder === null || body.pinOrder === '' || body.pinOrder === undefined ? null : Number(body.pinOrder)
  if (pinOrder !== null && (!Number.isInteger(pinOrder) || pinOrder < 1 || pinOrder > 1000)) throw Object.assign(new Error('Pin order must be a whole number from 1 to 1000.'), { status: 400 })
  if (!Array.isArray(body.aliases) || body.aliases.length > 30) throw Object.assign(new Error('Add no more than 30 aliases.'), { status: 400 })
  const aliases = body.aliases.map(value => cleanSearchTerm(value, 'Alias')).filter(value => normalizeSearchTerm(value) !== normalizeSearchTerm(canonicalQuery))
  const terms = new Map([[normalizeSearchTerm(canonicalQuery), { term: canonicalQuery, canonical: true }]])
  for (const alias of aliases) {
    const key = normalizeSearchTerm(alias)
    const previous = terms.get(key)
    if (!previous) terms.set(key, { term: alias, canonical: false })
  }
  return { label, canonicalQuery, normalizedQuery: normalizeSearchTerm(canonicalQuery), publicVisible: body.publicVisible, pinOrder, terms: [...terms.entries()] }
}

async function queryRows(sql, values = []) {
  const pool = await getCmsPool()
  return (await pool.execute(sql, values))[0]
}

function reportDatabaseError(error, action) {
  console.warn(JSON.stringify({ event: 'site_search', action, code: error?.code || 'DATABASE_ERROR' }))
}

async function publicSuggestions() {
  const pinned = await queryRows(
    `SELECT id, label, canonical_query AS "canonicalQuery", pin_order AS "pinOrder"
       FROM search_topics
      WHERE public_visible = TRUE AND pin_order IS NOT NULL
      ORDER BY pin_order ASC, normalized_query ASC, id ASC`,
  )
  const popular = await queryRows(
    `SELECT t.id, t.label, t.canonical_query AS "canonicalQuery", SUM(d.typed_submissions)::bigint AS "typedSubmissions"
       FROM search_topics t
       JOIN search_topic_daily d ON d.topic_id = t.id
      WHERE t.public_visible = TRUE AND t.pin_order IS NULL
        AND d.search_date >= (SELECT date_value FROM website_analytics_settings WHERE setting_key = 'search_analytics_consent_start')
        AND d.search_date BETWEEN ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - 29) AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
        AND d.typed_submissions > 0
      GROUP BY t.id, t.label, t.canonical_query, t.normalized_query
      ORDER BY SUM(d.typed_submissions) DESC, t.normalized_query ASC, t.id ASC
      LIMIT 5`,
  )
  const terms = await queryRows(
    `SELECT st.topic_id AS "topicId", st.term, st.normalized_term AS "normalizedTerm", t.canonical_query AS "canonicalQuery"
       FROM search_topic_terms st JOIN search_topics t ON t.id = st.topic_id
      ORDER BY st.normalized_term ASC`,
  )
  const pinnedIds = new Set(pinned.map(topic => topic.id))
  return {
    pinned,
    popular: popular.filter(topic => !pinnedIds.has(topic.id)).slice(0, 5),
    terms,
  }
}

export async function completeSearch(payload = {}, getPool = getCmsPool) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => !['submissionId', 'topicId', 'source', 'zeroResults'].includes(key))) {
    throw Object.assign(new Error('Search completion contains unsupported fields.'), { status: 400 })
  }
  const { submissionId, topicId, source, zeroResults } = payload
  if (typeof submissionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)) {
    throw Object.assign(new Error('A valid search submission ID is required.'), { status: 400 })
  }
  if (!['typed', 'chip'].includes(source) || typeof zeroResults !== 'boolean') throw Object.assign(new Error('Invalid search completion.'), { status: 400 })
  if (topicId !== null && (typeof topicId !== 'string' || topicId.length > 160)) throw Object.assign(new Error('Invalid search topic.'), { status: 400 })

  const pool = await getPool()
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    let resolvedTopicId = topicId
    if (resolvedTopicId) {
      const [topics] = await connection.execute('SELECT id FROM search_topics WHERE id = ?', [resolvedTopicId])
      if (!topics.length) throw Object.assign(new Error('Search topic was not found.'), { status: 400 })
    }
    const [dates] = await connection.execute("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date AS search_date")
    const searchDate = dates[0].search_date
    const receiptDays = Math.max(1, Math.min(30, Number(process.env.WEBSITE_ANALYTICS_RECEIPT_DAYS) || 7))
    const [, insertResult] = await connection.execute(
      `INSERT INTO search_submission_receipts (submission_id, search_date, topic_id, source, zero_results, expires_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP + (?::integer * INTERVAL '1 day'))
       ON CONFLICT (submission_id) DO NOTHING RETURNING submission_id`,
      [submissionId, searchDate, resolvedTopicId, source, zeroResults, receiptDays],
    )
    if (!insertResult.rowCount) {
      await connection.commit()
      return { accepted: true, duplicate: true }
    }
    if (resolvedTopicId) {
      const column = source === 'typed' ? 'typed_submissions' : 'chip_clicks'
      const zeroColumn = source === 'typed' ? 'typed_zero_results' : 'chip_zero_results'
      await connection.execute(
        `INSERT INTO search_topic_daily (search_date, topic_id, ${column}, ${zeroColumn})
         VALUES (?, ?, 1, ?)
         ON CONFLICT (search_date, topic_id) DO UPDATE
         SET ${column} = search_topic_daily.${column} + 1,
             ${zeroColumn} = search_topic_daily.${zeroColumn} + EXCLUDED.${zeroColumn}`,
        [searchDate, resolvedTopicId, zeroResults ? 1 : 0],
      )
    } else if (source === 'typed') {
      await connection.execute(
        `INSERT INTO search_daily_unmatched (search_date, unmatched_typed_submissions, unmatched_zero_results)
         VALUES (?, 1, ?)
         ON CONFLICT (search_date) DO UPDATE
         SET unmatched_typed_submissions = search_daily_unmatched.unmatched_typed_submissions + 1,
             unmatched_zero_results = search_daily_unmatched.unmatched_zero_results + EXCLUDED.unmatched_zero_results`,
        [searchDate, zeroResults ? 1 : 0],
      )
    }
    await connection.execute(
      `INSERT INTO website_search_engagement_daily (report_date, topic_ref, source, completed_submissions)
       VALUES (?, ?, ?, 1)
       ON CONFLICT (report_date, topic_ref, source) DO UPDATE
       SET completed_submissions = website_search_engagement_daily.completed_submissions + 1`,
      [searchDate, resolvedTopicId || 'unmatched', source],
    )
    await connection.commit()
    return { accepted: true, duplicate: false }
  } catch (error) {
    await connection.rollback().catch(() => {})
    throw error
  } finally {
    connection.release()
  }
}

async function getAdminTopics() {
  const rows = await queryRows(
    `SELECT t.id, t.label, t.canonical_query AS "canonicalQuery", t.public_visible AS "publicVisible",
            t.pin_order AS "pinOrder", t.created_at AS "createdAt", t.updated_at AS "updatedAt",
            st.term, st.is_canonical AS "isCanonical"
       FROM search_topics t LEFT JOIN search_topic_terms st ON st.topic_id = t.id
      ORDER BY t.normalized_query ASC, st.is_canonical DESC, st.normalized_term ASC`,
  )
  const topics = new Map()
  for (const row of rows) {
    if (!topics.has(row.id)) topics.set(row.id, { id: row.id, label: row.label, canonicalQuery: row.canonicalQuery, publicVisible: row.publicVisible, pinOrder: row.pinOrder, createdAt: row.createdAt, updatedAt: row.updatedAt, aliases: [] })
    if (row.term && !row.isCanonical) topics.get(row.id).aliases.push(row.term)
  }
  return [...topics.values()]
}

async function saveTopic(topicId, payload) {
  const topic = validateSearchTopicPayload(payload)
  const pool = await getCmsPool()
  const connection = await pool.getConnection()
  const id = topicId || crypto.randomUUID()
  try {
    await connection.beginTransaction()
    if (topicId) {
      const [current] = await connection.execute('SELECT id FROM search_topics WHERE id = ? FOR UPDATE', [topicId])
      if (!current.length) throw Object.assign(new Error('Search topic was not found.'), { status: 404 })
      await connection.execute(
        `UPDATE search_topics SET label = ?, canonical_query = ?, normalized_query = ?, public_visible = ?, pin_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [topic.label, topic.canonicalQuery, topic.normalizedQuery, topic.publicVisible, topic.pinOrder, topicId],
      )
      await connection.execute('DELETE FROM search_topic_terms WHERE topic_id = ?', [topicId])
    } else {
      await connection.execute(
        `INSERT INTO search_topics (id, label, canonical_query, normalized_query, public_visible, pin_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, topic.label, topic.canonicalQuery, topic.normalizedQuery, topic.publicVisible, topic.pinOrder],
      )
    }
    for (const [normalizedTerm, term] of topic.terms) {
      await connection.execute(
        'INSERT INTO search_topic_terms (normalized_term, term, topic_id, is_canonical) VALUES (?, ?, ?, ?)',
        [normalizedTerm, term.term, id, term.canonical],
      )
    }
    await connection.commit()
    return { id, ...topic, aliases: topic.terms.filter(([, value]) => !value.canonical).map(([, value]) => value.term) }
  } catch (error) {
    await connection.rollback().catch(() => {})
    if (error?.code === '23505') throw Object.assign(new Error('A canonical query or alias already belongs to another topic.'), { status: 409 })
    throw error
  } finally {
    connection.release()
  }
}

async function getAnalytics(days) {
  const [topics, unmatched] = await Promise.all([
    queryRows(
      `SELECT t.id, t.label, t.canonical_query AS "canonicalQuery",
              COALESCE(SUM(d.typed_submissions), 0)::bigint AS "typedSubmissions",
              COALESCE(SUM(d.chip_clicks), 0)::bigint AS "chipClicks",
              COALESCE(SUM(d.typed_zero_results), 0)::bigint AS "typedZeroResults",
              COALESCE(SUM(d.chip_zero_results), 0)::bigint AS "chipZeroResults"
         FROM search_topics t LEFT JOIN search_topic_daily d ON d.topic_id = t.id
          AND d.search_date >= (SELECT date_value FROM website_analytics_settings WHERE setting_key = 'search_analytics_consent_start')
          AND d.search_date BETWEEN ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer - 1))
                                AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
        GROUP BY t.id, t.label, t.canonical_query, t.normalized_query
        ORDER BY t.normalized_query ASC`,
      [days],
    ),
    queryRows(
      `SELECT COALESCE(SUM(unmatched_typed_submissions), 0)::bigint AS "typedSubmissions",
              COALESCE(SUM(unmatched_zero_results), 0)::bigint AS "zeroResultCount"
         FROM search_daily_unmatched
        WHERE search_date >= (SELECT date_value FROM website_analytics_settings WHERE setting_key = 'search_analytics_consent_start')
          AND search_date BETWEEN ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - (?::integer - 1))
                              AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date`,
      [days],
    ),
  ])
  return {
    days,
    topics: topics.map(topic => {
      const typed = Number(topic.typedSubmissions) || 0
      const clicks = Number(topic.chipClicks) || 0
      const zero = (Number(topic.typedZeroResults) || 0) + (Number(topic.chipZeroResults) || 0)
      return { ...topic, typedSubmissions: typed, chipClicks: clicks, typedZeroResults: Number(topic.typedZeroResults) || 0, chipZeroResults: Number(topic.chipZeroResults) || 0, zeroResultCount: zero, zeroResultRate: typed + clicks ? zero / (typed + clicks) : 0 }
    }),
    unmatched: { typedSubmissions: Number(unmatched[0]?.typedSubmissions) || 0, zeroResultCount: Number(unmatched[0]?.zeroResultCount) || 0 },
  }
}

export function registerSearchRoutes(app, { admin, permission, permissionAny = permissions => permission(permissions[0]) }) {
  app.get('/api/search/suggestions', async (req, res) => {
    const started = Date.now()
    const synthetic = req.get?.('x-analytics-synthetic') === 'true'
    try {
      const result = await publicSuggestions()
      void recordServerOperation({ operation: 'search', outcome: 'success', category: 'none', cacheStatus: 'unknown', durationMs: Date.now() - started, synthetic })
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300').json(result)
    } catch (error) {
      void recordServerOperation({ operation: 'search', outcome: 'failure', category: 'server_error', cacheStatus: 'unknown', durationMs: Date.now() - started, synthetic })
      reportDatabaseError(error, 'suggestions')
      res.set('Cache-Control', 'no-store').status(503).json({ error: 'Search suggestions are temporarily unavailable.' })
    }
  })
  app.post('/api/search/complete', async (req, res) => {
    const started = Date.now()
    const synthetic = req.get?.('x-analytics-synthetic') === 'true'
    // Public analytics submissions remain anonymous even if a caller happens
    // to attach a CMS cookie. The security audit logs the endpoint outcome only.
    req.apiSession = { kind: 'anonymous-search' }
    if (!isAnalyticsCollectionEnabled()) return rejectDisabledAnalytics(req, res)
    if (req.get?.('x-analytics-synthetic') === 'true') return res.set('Cache-Control', 'no-store').status(202).json({ accepted: true, excluded: true, committed: true })
    try {
      // 202 is retained for API compatibility. completeSearch commits the
      // idempotent receipt and daily increment before this response is sent.
      const completion = await completeSearch(req.body || {})
      void recordServerOperation({ operation: 'search', outcome: 'success', category: 'none', cacheStatus: 'none', durationMs: Date.now() - started, synthetic })
      res.set('Cache-Control', 'no-store').status(202).json({ ...completion, committed: true })
    } catch (error) {
      const failureStatus = Number(error?.status)
      void recordServerOperation({ operation: 'search', outcome: 'failure', category: failureStatus === 400 ? 'invalid_request' : failureStatus === 503 ? 'upstream_error' : 'server_error', cacheStatus: 'none', durationMs: Date.now() - started, synthetic })
      const status = [400, 404].includes(Number(error?.status)) ? Number(error.status) : 503
      if (status === 503) reportDatabaseError(error, 'complete')
      res.set('Cache-Control', 'no-store').status(status).json({ error: status === 503 ? 'Search analytics are temporarily unavailable.' : error.message })
    }
  })
  app.get('/api/admin/search/topics', admin, permission('search.manage'), async (_req, res) => {
    try { res.set('Cache-Control', 'no-store, private').json({ items: await getAdminTopics() }) }
    catch (error) { reportDatabaseError(error, 'admin_topics'); res.status(503).json({ error: 'Search topics are temporarily unavailable.' }) }
  })
  app.post('/api/admin/search/topics', admin, permission('search.manage'), async (req, res) => {
    try { res.set('Cache-Control', 'no-store, private').status(201).json({ item: await saveTopic(null, req.body) }) }
    catch (error) {
      const status = [400, 404, 409].includes(Number(error?.status)) ? Number(error.status) : 503
      if (status === 503) reportDatabaseError(error, 'save_topic')
      res.set('Cache-Control', 'no-store, private').status(status).json({ error: error.message || 'Search topic could not be saved.' })
    }
  })
  app.put('/api/admin/search/topics/:id', admin, permission('search.manage'), async (req, res) => {
    try { res.set('Cache-Control', 'no-store, private').json({ item: await saveTopic(req.params.id, req.body) }) }
    catch (error) {
      const status = [400, 404, 409].includes(Number(error?.status)) ? Number(error.status) : 503
      if (status === 503) reportDatabaseError(error, 'save_topic')
      res.set('Cache-Control', 'no-store, private').status(status).json({ error: error.message || 'Search topic could not be saved.' })
    }
  })
  app.get('/api/admin/search/analytics', admin, permissionAny(['analytics.view', 'search.manage']), async (req, res) => {
    const days = Number(req.query.days || 7)
    if (![7, 30].includes(days)) return res.status(400).json({ error: 'Choose a 7-day or 30-day reporting period.' })
    try { res.set('Cache-Control', 'no-store, private').json(await getAnalytics(days)) }
    catch (error) { reportDatabaseError(error, 'analytics'); res.status(503).json({ error: 'Search analytics are temporarily unavailable.' }) }
  })
}
