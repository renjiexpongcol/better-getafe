import express from 'express'
import { id, now } from './identifiers.js'
import { getLocalSqlite } from '../repositories/postgresCompatibility.js'
import { getPortalUserById } from '../repositories/portalUserRepository.js'
import { writeCitizenFile, deleteCitizenFile } from './storage.js'
import { hasAccess, requireAccess } from './authorizationService.js'
import { createInAppNotification, notificationEventKey, queueOptionalNotification } from './notificationService.js'

const staffRoles = ['staff', 'it_support', 'content_manager']
const safeStaffError = (error, fallback) => [400, 401, 403, 404, 409, 422].includes(Number(error?.status))
  ? String(error.message || fallback)
  : fallback
const allowedStatuses = ['submitted', 'processing', 'on_hold', 'needs_information', 'approved', 'completed', 'rejected', 'cancelled']
const validTransitions = {
  draft: ['submitted', 'processing', 'cancelled'],
  submitted: ['processing', 'on_hold', 'needs_information', 'approved', 'rejected', 'cancelled'],
  processing: ['on_hold', 'needs_information', 'approved', 'completed', 'rejected', 'cancelled'],
  on_hold: ['processing', 'needs_information', 'cancelled'],
  needs_information: ['processing', 'on_hold', 'approved', 'rejected', 'cancelled'],
  approved: ['processing', 'completed', 'cancelled'],
  rejected: [],
  cancelled: [],
  completed: [],
}

const transientDatabaseCodes = new Set([
  '08000', '08001', '08003', '08006', '08007', '53300', '57P01', '57P02', '57P03',
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE',
])
const isTransientDatabaseError = error => transientDatabaseCodes.has(String(error?.code || '').toUpperCase())
  || /connection (?:terminated|reset|refused)|client has encountered a connection error|timeout|pool has been ended/i.test(String(error?.message || ''))
const withReadRetry = async operation => {
  try { return await operation() }
  catch (error) {
    if (!isTransientDatabaseError(error)) throw error
    await new Promise(resolve => setTimeout(resolve, 75))
    return operation()
  }
}

const ensureStaffPermission = async (user, permission = 'requests.view', resource = null) => {
  if (!staffRoles.includes(user?.role)) throw new Error('Municipal staff access required.')
  await requireAccess(user, permission, resource)
}

const authorizationResource = application => {
  const details = application?.details
  if (!details) return application
  try { return { ...application, ...(typeof details === 'string' ? JSON.parse(details) : details) } }
  catch { return application }
}

const readApplication = async (db, application) => {
  const resident = await getPortalUserById(application.user_id)
  let details = {}
  try {
    details = typeof application.details === 'string'
      ? JSON.parse(application.details || '{}')
      : application.details || {}
  } catch { /* Keep malformed legacy details empty. */ }
  const history = await db.prepare('SELECT id,status,note,created_at,previous_status,new_status,fulfillment_note,changed_by,changed_at,completion_date,closed_at FROM application_status_history WHERE application_id = ? ORDER BY created_at DESC').all(application.id)
  const documents = await db.prepare('SELECT id,name,document_kind,verification_status,created_at,CASE WHEN storage_path IS NOT NULL AND storage_path != \'\' THEN 1 ELSE 0 END AS downloadable FROM application_documents WHERE application_id = ? ORDER BY created_at DESC').all(application.id)
  return { ...application, resident_name: resident?.name || 'Resident', resident_email: resident?.email || '', details, history, documents }
}

export function installStaffRoutes(app, admin) {
  const queueNotification = options => { void queueOptionalNotification(options).catch(error => console.error('Optional notification queue failed:', error.message)) }
  app.get('/api/staff/notifications', admin, async (req, res) => {
    res.set('Cache-Control', 'no-store')
    try {
      await ensureStaffPermission(req.admin, 'notifications.view')
      const db = await getLocalSqlite()
      const items = await db.prepare('SELECT id,title,message,application_id,document_id,created_at,read_at FROM notifications WHERE user_id = ? AND archived_at IS NULL ORDER BY created_at DESC LIMIT 100').all(req.admin.id)
      res.json({ items })
    } catch (error) {
      if (Number(error?.status) === 403) return res.status(403).json({ error: 'You do not have permission to view staff notifications.' })
      console.error('Staff notifications lookup failed:', error.message)
      res.status(503).json({ error: 'Notifications are temporarily unavailable. Try again.' })
    }
  })
  app.get('/api/staff/dashboard', admin, async (req, res) => {
    try { await withReadRetry(() => ensureStaffPermission(req.admin)) } catch (error) { return res.status(403).json({ error: safeStaffError(error, 'Municipal staff access required.') }) }
    try {
      const candidateRows = await withReadRetry(async () => {
        const db = await getLocalSqlite()
        return db.prepare(`SELECT a.*, (SELECT note FROM application_status_history WHERE application_id = a.id ORDER BY created_at DESC LIMIT 1) AS latest_note FROM applications a ORDER BY last_updated DESC`).all()
      })
      const authorizedRows = []
      for (const application of candidateRows) if (await withReadRetry(() => hasAccess(req.admin, 'requests.view', authorizationResource(application)))) authorizedRows.push(application)
      const rows = authorizedRows.filter(application => !application.closed_at)
      const applications = await Promise.all(rows.map(application => withReadRetry(async () => readApplication(await getLocalSqlite(), application))))
      const completedCount = authorizedRows.filter(application => application.status === 'completed' || application.closed_at).length
      const counts = applications.reduce((result, application) => {
        const status = String(application.status || '').toLowerCase()
        result.total += 1
        if (['submitted', 'draft'].includes(status)) result.pending += 1
        if (['processing', 'under_review', 'in_progress'].includes(status)) result.inProgress += 1
        if (['approved', 'completed', 'released'].includes(status)) result.completed += 1
        return result
      }, { total: 0, pending: 0, inProgress: 0, completed: 0 })
      counts.completed = completedCount
      res.json({ counts, applications })
    } catch (error) {
      console.error('Staff dashboard lookup failed:', error.message)
      res.status(503).json({ error: 'Staff service requests are temporarily unavailable.' })
    }
  })

  app.get('/api/staff/applications/:id', admin, async (req, res) => {
    try { await withReadRetry(() => ensureStaffPermission(req.admin)) } catch (error) { return res.status(403).json({ error: safeStaffError(error, 'Municipal staff access required.') }) }
    try {
      const application = await withReadRetry(async () => {
        const db = await getLocalSqlite()
        return db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id)
      })
      if (!application) return res.status(404).json({ error: 'Service request not found.' })
      await withReadRetry(() => requireAccess(req.admin, 'requests.view', authorizationResource(application)))
      res.json(await withReadRetry(async () => readApplication(await getLocalSqlite(), application)))
    } catch (error) {
      if ([400, 401, 403, 404, 409, 422].includes(Number(error?.status))) return res.status(error.status).json({ error: safeStaffError(error, 'The service request is unavailable.') })
      console.error('Staff request lookup failed:', error.message)
      res.status(503).json({ error: 'The service request is temporarily unavailable.' })
    }
  })

  app.post('/api/staff/applications/:id/documents', admin, express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png'], limit: '5mb' }), async (req, res) => {
    try { await ensureStaffPermission(req.admin, 'documents.process') } catch (error) { return res.status(403).json({ error: safeStaffError(error, 'Municipal document processing access required.') }) }
    const name = String(req.query.name || 'municipal-document').replace(/[\\/\0\r\n]/g, '_').trim().slice(0, 255)
    const type = req.get('content-type')?.split(';')[0].trim().toLowerCase()
    const bytes = req.body
    const validSignature = Buffer.isBuffer(bytes) && (type === 'application/pdf' ? bytes.subarray(0, 5).toString('ascii') === '%PDF-' : type === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) : type === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : false)
    if (!name || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 5 * 1024 * 1024 || !validSignature) return res.status(422).json({ error: 'Upload a valid PDF, JPEG, or PNG smaller than 5 MB.' })
    try {
      const db = await getLocalSqlite()
      const application = await db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id)
      if (!application) return res.status(404).json({ error: 'Service request not found.' })
      try { await requireAccess(req.admin, 'documents.process', authorizationResource(application)) } catch (error) { return res.status(403).json({ error: safeStaffError(error, 'You are not authorized to process this request.') }) }
      const documentId = id()
      const extension = type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : 'jpg'
      const storagePath = `citizen-private/documents/${application.user_id}/${documentId}.${extension}`
      await writeCitizenFile(storagePath, bytes, type)
      try {
        const timestamp = now()
        await db.prepare('INSERT INTO application_documents (id,application_id,user_id,name,storage_path,verification_status,document_kind,created_at) VALUES (?,?,?,?,?,?,?,?)').run(documentId, application.id, application.user_id, name, storagePath, 'approved', 'issued', timestamp)
        const notification = await createInAppNotification({ db, userId: application.user_id, title: 'Document ready for download', message: `${name} is now available for download from your ${application.service_name} request.`, applicationId: application.id, documentId, type: 'document.ready', eventKey: notificationEventKey('document.ready', { documentId }) })
        queueNotification({ userId: application.user_id, type: 'document.ready', eventId: documentId, applicationId: application.id, documentId, notificationId: notification.id, data: { serviceName: application.service_name, reference: application.reference_number, status: 'Ready', applicationId: application.id, documentId } })
      } catch (error) { await deleteCitizenFile(storagePath).catch(() => {}); throw error }
      res.status(201).json({ id: documentId, name, status: 'approved', downloadable: true })
    } catch (error) {
      console.error('Staff document upload failed:', error.message)
      res.status(503).json({ error: 'The document could not be uploaded.' })
    }
  })

  app.patch('/api/staff/applications/:id', admin, async (req, res) => {
    try { await ensureStaffPermission(req.admin, 'requests.update') } catch (error) { return res.status(403).json({ error: safeStaffError(error, 'Municipal request-update access required.') }) }
    const status = String(req.body?.status || '').trim().toLowerCase()
    if (!allowedStatuses.includes(status)) return res.status(422).json({ error: 'Choose a valid request status.' })
    const fulfillment = req.body?.fulfillment && typeof req.body.fulfillment === 'object' ? req.body.fulfillment : {}
    const note = String(fulfillment.note || req.body?.note || '').trim().slice(0, 2000)
    const reason = String(fulfillment.reason || '').trim().slice(0, 2000)
    const waitingFor = String(fulfillment.waiting_for || '').trim().slice(0, 1000)
    const requestedInformation = String(fulfillment.requested_information || '').trim().slice(0, 2000)
    const completionSummary = String(fulfillment.completion_summary || '').trim().slice(0, 2000)
    const actionTaken = String(fulfillment.action_taken || '').trim().slice(0, 2000)
      const completionDate = String(fulfillment.completion_date || '').trim()
      const followUpDate = String(fulfillment.follow_up_date || '').trim()
      const supportingReference = String(fulfillment.supporting_reference || '').trim().slice(0, 500)
      const visibility = [fulfillment.visibility, fulfillment.note_visibility, fulfillment.noteVisibility, req.body?.note_visibility, req.body?.noteVisibility].includes('internal') ? 'internal' : 'public'
    try {
      const db = await getLocalSqlite()
      const application = await db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id)
      if (!application) return res.status(404).json({ error: 'Service request not found.' })
      const protectedResource = authorizationResource(application)
      try { await requireAccess(req.admin, 'requests.update', protectedResource) } catch (error) { return res.status(403).json({ error: safeStaffError(error, 'You are not authorized to update this request.') }) }
      const previousStatus = String(application.status || 'submitted').toLowerCase()
      if (application.closed_at) return res.status(409).json({ error: 'This request is already closed and cannot be updated.' })
      if (previousStatus === 'completed' && status === 'completed') return res.status(409).json({ error: 'This request has already been completed.' })
      if (status !== previousStatus) {
        try { await requireAccess(req.admin, 'requests.fulfillment_note.create', protectedResource); if (status === 'completed') { await requireAccess(req.admin, 'requests.complete', protectedResource); await requireAccess(req.admin, 'requests.close', protectedResource) } } catch (error) { return res.status(403).json({ error: safeStaffError(error, 'You are not authorized to complete this request.') }) }
        if (!validTransitions[previousStatus]?.includes(status)) return res.status(409).json({ error: `The request cannot move from ${previousStatus.replace(/_/g, ' ')} to ${status.replace(/_/g, ' ')}.` })
        const requirements = {
          processing: note,
          on_hold: reason && waitingFor,
          needs_information: requestedInformation,
          rejected: reason && note,
          cancelled: reason && note,
          completed: completionSummary && actionTaken && completionDate,
        }
        if (requirements[status] !== undefined && !requirements[status]) return res.status(422).json({ error: `Complete the required fulfillment information for ${status.replace(/_/g, ' ')}.` })
        if (!note && !['on_hold', 'needs_information', 'completed'].includes(status)) return res.status(422).json({ error: 'A fulfillment note is required for this status change.' })
        if (status === 'completed' && !/^\d{4}-\d{2}-\d{2}$/.test(completionDate)) return res.status(422).json({ error: 'Enter a valid completion date.' })
      }
      const timestamp = now()
      const historyNote = [note, reason && `Reason: ${reason}`, waitingFor && `Waiting for: ${waitingFor}`, requestedInformation && `Information needed: ${requestedInformation}`, followUpDate && `Follow-up date: ${followUpDate}`, completionSummary && `Completion summary: ${completionSummary}`, actionTaken && `Action taken: ${actionTaken}`, supportingReference && `Supporting reference: ${supportingReference}`].filter(Boolean).join('\n')
      const closedAt = status === 'completed' ? timestamp : null
      const historyId = id()
      let notification = null
      await db.exec('BEGIN')
      try {
        const update = await db.prepare('UPDATE applications SET status = ?, last_updated = ?, completed_at = CASE WHEN ? = \'completed\' THEN ? ELSE completed_at END, closed_at = ?, closed_by = CASE WHEN ?::timestamptz IS NOT NULL THEN ? ELSE closed_by END WHERE id = ? AND status = ? AND closed_at IS NULL').run(status, timestamp, status, timestamp, closedAt, closedAt, req.admin.id, application.id, application.status)
        if (update.changes !== 1) {
          await db.exec('ROLLBACK')
          return res.status(409).json({ error: 'This request changed while you were updating it. Refresh the request and try again.' })
        }
        if (status !== previousStatus || historyNote) {
          await db.prepare('INSERT INTO application_status_history (id,application_id,status,note,created_at,previous_status,new_status,fulfillment_note,changed_by,changed_at,completion_date,closed_at,visibility) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(historyId, application.id, status, historyNote || null, timestamp, previousStatus, status, historyNote || null, req.admin.id, timestamp, status === 'completed' ? completionDate : null, closedAt, visibility)
          if (status !== previousStatus || visibility === 'public') {
            const type = status === 'approved' ? 'request.approved' : status === 'rejected' ? 'request.rejected' : status === 'completed' ? 'request.completed' : 'request.status_changed'
            notification = await createInAppNotification({ db, userId: application.user_id, title: `Request update · ${application.service_name}`, message: visibility === 'public' && historyNote ? historyNote : `Your request status is now ${status.replace(/_/g, ' ')}.`, applicationId: application.id, type, eventKey: notificationEventKey(type, { applicationId: application.id }, historyId) })
          }
        }
        await db.exec('COMMIT')
      } catch (error) { await db.exec('ROLLBACK'); throw error }
      if (notification) {
        const type = status === 'approved' ? 'request.approved' : status === 'rejected' ? 'request.rejected' : status === 'completed' ? 'request.completed' : 'request.status_changed'
        queueNotification({ userId: application.user_id, type, eventId: historyId, applicationId: application.id, notificationId: notification.id, data: { serviceName: application.service_name, reference: application.reference_number, status, applicationId: application.id } })
      }
      const updated = await db.prepare('SELECT * FROM applications WHERE id = ?').get(application.id)
      res.json({ saved: true, closed: Boolean(closedAt), application: await readApplication(db, updated) })
    } catch (error) {
      console.error('Staff request update failed:', error.message)
      res.status(503).json({ error: 'The service request could not be updated.' })
    }
  })
}
