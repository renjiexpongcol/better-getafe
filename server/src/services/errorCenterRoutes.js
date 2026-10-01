import { getPostgresRuntime } from '../repositories/postgresRuntime.js'
import { requireAccess, audit } from './authorizationService.js'
import { now } from './identifiers.js';
import { sendPublicError } from './errorHandling.js'

const allowedStates = new Set(['open', 'acknowledged', 'resolved'])
const integer = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

const serialize = item => ({
  referenceId: item.reference_id,
  firstSeen: item.first_seen,
  lastSeen: item.last_seen,
  occurrenceCount: Number(item.occurrence_count || 0),
  state: item.state,
  service: item.service,
  route: item.route,
  method: item.method,
  status: Number(item.status),
  internalCode: item.internal_code,
  technicalMessage: item.technical_message,
  stackTrace: item.stack_trace,
  upstreamDependency: item.upstream_dependency,
  applicationVersion: item.application_version,
  environment: item.environment,
  adminNote: item.admin_note || '',
})

const permission = name => async (req, res, next) => {
  try { await requireAccess(req.admin, name); next() }
  catch { res.status(403).json({ error: 'You do not have permission to access the Error Center.' }) }
}

export function installErrorCenterRoutes(app, admin) {
  app.use('/api/admin/system/errors', admin, (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, private')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
    next()
  })

  app.get('/api/admin/system/errors', permission('system.errors.view'), async (req, res) => {
    try {
      const db = await getPostgresRuntime('database')
      const clauses = []
      const values = []
      const add = (clause, ...items) => { clauses.push(clause); values.push(...items) }
      const query = String(req.query.q || '').trim().slice(0, 160)
      if (query) add('(reference_id ILIKE ? OR service ILIKE ? OR route ILIKE ? OR internal_code ILIKE ? OR technical_message ILIKE ?)', ...Array(5).fill(`%${query}%`))
      if (req.query.service) add('service = ?', String(req.query.service).slice(0, 160))
      if (req.query.route) add('route ILIKE ?', `%${String(req.query.route).slice(0, 500)}%`)
      if (req.query.status && Number.isFinite(Number(req.query.status))) add('status = ?', integer(req.query.status, 500, 100, 599))
      if (req.query.state && allowedStates.has(String(req.query.state))) add('state = ?', String(req.query.state))
      if (req.query.from) {
        const from = new Date(String(req.query.from))
        if (Number.isNaN(from.getTime())) return res.status(422).json({ error: 'Choose a valid start date.' })
        add('last_seen >= ?', from.toISOString())
      }
      if (req.query.to) {
        const to = new Date(String(req.query.to))
        if (Number.isNaN(to.getTime())) return res.status(422).json({ error: 'Choose a valid end date.' })
        add('last_seen <= ?', to.toISOString())
      }
      const limit = integer(req.query.limit, 25, 1, 100)
      const page = integer(req.query.page, 1, 1, 10_000)
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
      const count = await db.prepare(`SELECT COUNT(*)::int AS total FROM system_error_groups ${where}`).get(...values)
      const rows = await db.prepare(`SELECT reference_id,first_seen,last_seen,occurrence_count,state,service,route,method,status,internal_code,technical_message,upstream_dependency,application_version,environment,admin_note
        FROM system_error_groups ${where} ORDER BY last_seen DESC LIMIT ? OFFSET ?`).all(...values, limit, (page - 1) * limit)
      res.json({ items: rows.map(serialize), pagination: { page, limit, total: Number(count?.total || 0), pages: Math.max(1, Math.ceil(Number(count?.total || 0) / limit)) } })
    } catch (error) { await sendPublicError(res, req, error, { context: 'unknown', message: 'The Error Center is temporarily unavailable.' }) }
  })

  app.get('/api/admin/system/errors/:referenceId', permission('system.errors.view'), async (req, res) => {
    try {
      const db = await getPostgresRuntime('database')
      const item = await db.prepare('SELECT * FROM system_error_groups WHERE reference_id=?').get(String(req.params.referenceId || '').toUpperCase())
      if (!item) return res.status(404).json({ error: 'Issue not found.' })
      res.json(serialize(item))
    } catch (error) { await sendPublicError(res, req, error, { context: 'unknown', message: 'The Error Center is temporarily unavailable.' }) }
  })

  app.patch('/api/admin/system/errors/:referenceId', permission('system.errors.manage'), async (req, res) => {
    try {
      const state = String(req.body?.state || '').toLowerCase()
      const note = String(req.body?.adminNote || '').trim().slice(0, 2000)
      if (!allowedStates.has(state)) return res.status(422).json({ error: 'Choose Open, Acknowledged, or Resolved.' })
      const db = await getPostgresRuntime('database')
      const reference = String(req.params.referenceId || '').toUpperCase()
      const item = await db.prepare('SELECT * FROM system_error_groups WHERE reference_id=?').get(reference)
      if (!item) return res.status(404).json({ error: 'Issue not found.' })
      await db.prepare('UPDATE system_error_groups SET state=?, admin_note=?, updated_at=? WHERE reference_id=?').run(state, note || null, now(), reference)
      await audit(db, req.admin.id, 'SYSTEM_ERROR_UPDATED', 'system_error_group', item.id, { state: item.state, adminNote: item.admin_note || '' }, { state, adminNote: note }, req.requestId)
      res.json(serialize({ ...item, state, admin_note: note }))
    } catch (error) { await sendPublicError(res, req, error, { context: 'form', message: 'The issue could not be updated. Please try again.' }) }
  })
}
