import express from 'express'
import { id, now } from './identifiers.js'
import { getLocalSqlite } from '../repositories/postgresCompatibility.js'
import { getPortalUserById } from '../repositories/portalUserRepository.js'
import { writeCitizenFile, deleteCitizenFile } from './storage.js'
import { hasAccess, requireAccess } from './authorizationService.js'

const staffRoles = ['staff', 'it_support', 'content_manager']
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

const ensureStaffPermission = async (user, permission = 'requests.view', resource = null) => {
  if (!staffRoles.includes(user?.role)) throw new Error('Municipal staff access required.')
  await requireAccess(user, permission, resource)
}

const authorizationResource = application => {
  try { return { ...application, ...JSON.parse(application.details || '{}') } }
  catch { return application }
}

const readApplication = async (db, application) => {
  const resident = await getPortalUserById(application.user_id)
  let details = {}
  try { details = JSON.parse(application.details || '{}') } catch { /* Keep malformed legacy details empty. */ }
  const history = await db.prepare('SELECT id,status,note,created_at,previous_status,new_status,fulfillment_note,changed_by,changed_at,completion_date,closed_at FROM application_status_history WHERE application_id = ? ORDER BY created_at DESC').all(application.id)
  const documents = await db.prepare('SELECT id,name,document_kind,verification_status,created_at,CASE WHEN storage_path IS NOT NULL AND storage_path != \'\' THEN 1 ELSE 0 END AS downloadable FROM application_documents WHERE application_id = ? ORDER BY created_at DESC').all(application.id)
  return { ...application, resident_name: resident?.name || 'Resident', resident_email: resident?.email || '', details, history, documents }
}

export function installStaffRoutes(app, admin) {
  app.get('/api/staff/dashboard', admin, async (req, res) => {
    try { await ensureStaffPermission(req.admin) } catch (error) { return res.status(403).json({ error: error.message }) }
    try {
      const db = await getLocalSqlite()
      const candidateRows = await db.prepare(`SELECT a.*, (SELECT note FROM application_status_history WHERE application_id = a.id ORDER BY created_at DESC LIMIT 1) AS latest_note FROM applications a ORDER BY last_updated DESC`).all()
      const authorizedRows = []
      for (const application of candidateRows) if (await hasAccess(req.admin, 'requests.view', authorizationResource(application))) authorizedRows.push(application)
      const rows = authorizedRows.filter(application => !application.closed_at)
      const applications = await Promise.all(rows.map(application => readApplication(db, application)))
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
    try { await ensureStaffPermission(req.admin) } catch (error) { return res.status(403).json({ error: error.message }) }
    try {
      const db = await getLocalSqlite()
      const application = await db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id)
      if (!application) return res.status(404).json({ error: 'Service request not found.' })
      try { await requireAccess(req.admin, 'requests.view', authorizationResource(application)) } catch (error) { return res.status(403).json({ error: error.message }) }
      res.json(await readApplication(db, application))
    } catch (error) {
      console.error('Staff request lookup failed:', error.message)
      res.status(503).json({ error: 'The service request is temporarily unavailable.' })
    }
  })

  app.post('/api/staff/applications/:id/documents', admin, express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png'], limit: '5mb' }), async (req, res) => {
    try { await ensureStaffPermission(req.admin, 'documents.process') } catch (error) { return res.status(403).json({ error: error.message }) }
    const name = String(req.query.name || 'municipal-document').replace(/[\\/\0\r\n]/g, '_').trim().slice(0, 255)
    const type = req.get('content-type')?.split(';')[0].trim().toLowerCase()
    const bytes = req.body
    const validSignature = Buffer.isBuffer(bytes) && (type === 'application/pdf' ? bytes.subarray(0, 5).toString('ascii') === '%PDF-' : type === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) : type === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : false)
    if (!name || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 5 * 1024 * 1024 || !validSignature) return res.status(422).json({ error: 'Upload a valid PDF, JPEG, or PNG smaller than 5 MB.' })
    try {
      const db = await getLocalSqlite()
      const application = await db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id)
      if (!application) return res.status(404).json({ error: 'Service request not found.' })
      try { await requireAccess(req.admin, 'documents.process', authorizationResource(application)) } catch (error) { return res.status(403).json({ error: error.message }) }
      const documentId = id()
      const extension = type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : 'jpg'
      const storagePath = `citizen-private/documents/${application.user_id}/${documentId}.${extension}`
      await writeCitizenFile(storagePath, bytes, type)
      try {
        const timestamp = now()
        await db.prepare('INSERT INTO application_documents (id,application_id,user_id,name,storage_path,verification_status,document_kind,created_at) VALUES (?,?,?,?,?,?,?,?)').run(documentId, application.id, application.user_id, name, storagePath, 'approved', 'issued', timestamp)
        await db.prepare('INSERT INTO notifications (id,user_id,title,message,application_id,document_id,created_at) VALUES (?,?,?,?,?,?,?)').run(id(), application.user_id, 'Document ready for download', `${name} is now available for download from your ${application.service_name} request.`, application.id, documentId, timestamp)
      } catch (error) { await deleteCitizenFile(storagePath).catch(() => {}); throw error }
      res.status(201).json({ id: documentId, name, status: 'approved', downloadable: true })
    } catch (error) {
      console.error('Staff document upload failed:', error.message)
      res.status(503).json({ error: 'The document could not be uploaded.' })
    }
  })

  app.patch('/api/staff/applications/:id', admin, async (req, res) => {
    try { await ensureStaffPermission(req.admin, 'requests.update') } catch (error) { return res.status(403).json({ error: error.message }) }
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
    try {
      const db = await getLocalSqlite()
      const application = await db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id)
      if (!application) return res.status(404).json({ error: 'Service request not found.' })
      const protectedResource = authorizationResource(application)
      try { await requireAccess(req.admin, 'requests.update', protectedResource) } catch (error) { return res.status(403).json({ error: error.message }) }
      const previousStatus = String(application.status || 'submitted').toLowerCase()
      if (application.closed_at) return res.status(409).json({ error: 'This request is already closed and cannot be updated.' })
      if (previousStatus === 'completed' && status === 'completed') return res.status(409).json({ error: 'This request has already been completed.' })
      if (status !== previousStatus) {
        try { await requireAccess(req.admin, 'requests.fulfillment_note.create', protectedResource); if (status === 'completed') { await requireAccess(req.admin, 'requests.complete', protectedResource); await requireAccess(req.admin, 'requests.close', protectedResource) } } catch (error) { return res.status(403).json({ error: error.message }) }
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
      await db.exec('BEGIN')
      try {
        await db.prepare('UPDATE applications SET status = ?, last_updated = ?, completed_at = CASE WHEN ? = \'completed\' THEN ? ELSE completed_at END, closed_at = ?, closed_by = CASE WHEN ? IS NOT NULL THEN ? ELSE closed_by END WHERE id = ?').run(status, timestamp, status, timestamp, closedAt, closedAt, req.admin.id, application.id)
        if (status !== previousStatus || historyNote) {
          await db.prepare('INSERT INTO application_status_history (id,application_id,status,note,created_at,previous_status,new_status,fulfillment_note,changed_by,changed_at,completion_date,closed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id(), application.id, status, historyNote || null, timestamp, previousStatus, status, historyNote || null, req.admin.id, timestamp, status === 'completed' ? completionDate : null, closedAt)
          await db.prepare('INSERT INTO notifications (id,user_id,title,message,application_id,created_at) VALUES (?,?,?,?,?,?)').run(id(), application.user_id, `Request update · ${application.service_name}`, historyNote || `Your request status is now ${status.replace(/_/g, ' ')}.`, application.id, timestamp)
        }
        await db.exec('COMMIT')
      } catch (error) { await db.exec('ROLLBACK'); throw error }
      const updated = await db.prepare('SELECT * FROM applications WHERE id = ?').get(application.id)
      res.json({ saved: true, closed: Boolean(closedAt), application: await readApplication(db, updated) })
    } catch (error) {
      console.error('Staff request update failed:', error.message)
      res.status(503).json({ error: 'The service request could not be updated.' })
    }
  })
}


