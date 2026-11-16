import { validatedStaffQuery } from './staffQueryScope.js'
import express from 'express'
import { id, now } from './identifiers.js'
import { getLocalSqlite } from '../repositories/postgresCompatibility.js'
import { getPortalUserById } from '../repositories/portalUserRepository.js'
import { optionalSubmissionNotification, persistDocument } from './submissionPersistence.js'
import { hasAccess, requireAccess } from './authorizationService.js'
import { createInAppNotification, notificationEventKey, queueOptionalNotification } from './notificationService.js'
import { staffDashboard, staffApplicationList, requireLegacyDepartment } from './staffOperations.js'
import { getEmployeeProfile, updateEmployeePersonnel } from './employeeProvisioning.js'
import { getCmsUserById } from '../repositories/cmsUserRepository.js'
import { EserviceEngine } from './eserviceEngine.js'
import { createStaffNotification } from './staffNotifications.js'
import { readCitizenFile } from './storage.js'

const staffRoles = ['staff', 'it_support', 'content_manager', 'admin', 'super_admin']
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
  // Legacy form details may supply barangay scope, but never override trusted
  // ownership, assignment, status or department fields on the application.
  try { return { ...(typeof details === 'string' ? JSON.parse(details) : details), ...application } }
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
  const history = await db.prepare('SELECT id,status,note,created_at,previous_status,new_status,fulfillment_note,changed_by,changed_at,completion_date,closed_at,visibility FROM application_status_history WHERE application_id = ? ORDER BY created_at DESC').all(application.id)
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
      const items = await db.prepare('SELECT id,title,message,application_id,request_id,created_at,read_at FROM staff_notifications WHERE user_id = ? ORDER BY created_at DESC,id DESC LIMIT 100').all(req.admin.id)
      res.json({ items })
    } catch (error) {
      if (Number(error?.status) === 403) return res.status(403).json({ error: 'You do not have permission to view staff notifications.' })
      console.error('Staff notifications lookup failed:', error.message)
      res.status(503).json({ error: 'Notifications are temporarily unavailable. Try again.' })
    }
  })
  app.patch('/api/staff/notifications/:id/read', admin, async (req,res) => {
    try {
      await ensureStaffPermission(req.admin,'notifications.view')
      const db=await getLocalSqlite()
      const item=await db.prepare('UPDATE staff_notifications SET read_at=COALESCE(read_at,now()) WHERE id::text=? AND user_id=? RETURNING id,read_at').get(req.params.id,req.admin.id)
      if (!item) return res.status(404).json({error:'Notification not found.'})
      res.json(item)
    } catch(error) {res.status(error.status===403?403:503).json({error:safeStaffError(error,'Notification could not be updated.')})}
  })
  const selfProfile = async user => {
    const profile=await getEmployeeProfile(user.id)
    if(!profile) throw Object.assign(new Error('Employee profile not found.'),{status:404})
    return Object.fromEntries(['user_id','eid','name','email','department','position','phone','office_assignment','employment_status','employment_type','hire_date','mfa_status','password_status','last_login_at','groups'].map(key=>[key,profile[key]]))
  }
  app.get('/api/staff/me',admin,async(req,res)=>{
    try {if(!staffRoles.includes(req.admin.role)) return res.status(403).json({error:'Staff access required.'});res.json(await selfProfile(req.admin))}
    catch(error){res.status(error.status||503).json({error:safeStaffError(error,'Your employee profile is temporarily unavailable.')})}
  })
  app.patch('/api/staff/me',admin,async(req,res)=>{
    try {
      if(!staffRoles.includes(req.admin.role)) return res.status(403).json({error:'Staff access required.'})
      if(Object.keys(req.body||{}).some(key=>key!=='phone') || typeof req.body?.phone!=='string' || req.body.phone.length>32 || /[\0\r\n]/.test(req.body.phone)) return res.status(422).json({error:'Only your contact phone number can be updated here.'})
      await updateEmployeePersonnel(req.admin.id,{phone:req.body.phone.trim()},req.admin)
      res.json(await selfProfile(req.admin))
    } catch(error){res.status(error.status||503).json({error:safeStaffError(error,'Your contact details could not be saved.')})}
  })
  app.get('/api/staff/applications',admin,async(req,res)=>{
    try {await ensureStaffPermission(req.admin);res.json(await staffApplicationList(req.admin,req.query))}
    catch(error){res.status(error.status||503).json({error:safeStaffError(error,'Service requests are temporarily unavailable.')})}
  })
  app.get('/api/staff/dashboard', admin, async (req, res) => {
    try { await withReadRetry(() => ensureStaffPermission(req.admin,'staff.dashboard.view')) } catch (error) { return res.status(403).json({ error: safeStaffError(error, 'Municipal staff access required.') }) }
    try {
      res.json(await withReadRetry(()=>staffDashboard(req.admin)))
    } catch (error) {
      console.error('Staff dashboard lookup failed:', error.message)
      res.status(error.status===403?403:503).json({ error: safeStaffError(error,'Staff service requests are temporarily unavailable.') })
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
      await requireLegacyDepartment(req.admin,application)
      await withReadRetry(() => requireAccess(req.admin, 'requests.view', authorizationResource(application)))
      res.json(await withReadRetry(async () => readApplication(await getLocalSqlite(), application)))
    } catch (error) {
      if ([400, 401, 403, 404, 409, 422].includes(Number(error?.status))) return res.status(error.status).json({ error: safeStaffError(error, 'The service request is unavailable.') })
      console.error('Staff request lookup failed:', error.message)
      res.status(503).json({ error: 'The service request is temporarily unavailable.' })
    }
  })
  app.get('/api/staff/applications/:id/documents/:documentId',admin,async(req,res)=>{
    try {
      await ensureStaffPermission(req.admin,'documents.view')
      const db=await getLocalSqlite(),application=await db.prepare('SELECT * FROM applications WHERE id=?').get(req.params.id)
      if(!application) return res.status(404).json({error:'Request not found.'})
      await requireLegacyDepartment(req.admin,application)
      await requireAccess(req.admin,'requests.view',authorizationResource(application))
      await requireAccess(req.admin,'documents.view',authorizationResource(application))
      const document=await db.prepare('SELECT * FROM application_documents WHERE id=? AND application_id=?').get(req.params.documentId,application.id)
      if(!document?.storage_path) return res.status(404).json({error:'Document not found.'})
      const bytes=await readCitizenFile(document.storage_path)
      res.set({'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${String(document.name||'document').replace(/["\r\n]/g,'_')}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}).send(bytes)
    } catch(error){res.status(error.status||503).json({error:safeStaffError(error,'The document is temporarily unavailable.')})}
  })
  app.get('/api/staff/applications/:id/assignees',admin,async(req,res)=>{
    try {
      await ensureStaffPermission(req.admin,'requests.assign');
      const engine=new EserviceEngine(),[row]=await engine.read('SELECT * FROM applications WHERE id=?',[req.params.id]);
      if(!row)return res.status(404).json({error:'Request not found.'});
      await requireLegacyDepartment(req.admin,row);await requireAccess(req.admin,'requests.assign',authorizationResource(row));
      const ids=row.department_id?(await engine.read('SELECT user_id FROM eservice_department_members WHERE department_id=?',[row.department_id])).map(member=>member.user_id):[req.admin.id,row.assigned_user_id].filter(Boolean);
      const items=[];
      for(const userId of [...new Set(ids)]){const account=await getCmsUserById(userId);if(!account||!staffRoles.includes(account.role))continue;if(!await hasAccess(account,'requests.view',authorizationResource(row)))continue;try{await requireLegacyDepartment(account,row)}catch{continue}items.push({id:account.id,name:account.name,eid:account.eid})}
      res.json({items});
    }catch(error){res.status(error.status||503).json({error:safeStaffError(error,'Staff assignments are unavailable.')})}
  })
  app.post('/api/staff/applications/:id/assign' ,admin,async(req,res)=>{
    try {
      await ensureStaffPermission(req.admin,'requests.assign')
      const assignee=await getCmsUserById(req.body?.assigned_user_id)
      if(!assignee || !staffRoles.includes(assignee.role)) return res.status(422).json({error:'Choose an active staff member.'})
      const engine=new EserviceEngine()
      const application=await engine.transaction(async db=>{
        const [row]=await db('SELECT * FROM applications WHERE id=? FOR UPDATE',[req.params.id])
        if(!row) throw Object.assign(new Error('Request not found.'),{status:404})
        await requireLegacyDepartment(req.admin,row)
        await requireAccess(req.admin,'requests.assign',authorizationResource(row))
        await requireAccess(assignee,'requests.view',authorizationResource(row))
        await requireLegacyDepartment(assignee,row)
        if(!Number.isInteger(req.body.version) || req.body.version!==row.version) throw Object.assign(new Error('This request changed. Refresh before assigning it.'),{status:409})
        if(row.closed_at || ['completed','rejected','cancelled'].includes(row.status)) throw Object.assign(new Error('Closed requests cannot be assigned.'),{status:409})
        if(row.assigned_user_id===assignee.id)throw Object.assign(new Error('This request is already assigned to that staff member.'),{status:409})
        const eventId=id()
        await db('INSERT INTO application_assignments(id,application_id,assigned_user_id,assigned_by) VALUES(?,?,?,?)',[eventId,row.id,assignee.id,req.admin.id])
        await db('INSERT INTO application_status_history(id,application_id,status,note,created_at,changed_by,visibility) VALUES(?,?,?,?,now(),?,\'internal\')',[id(),row.id,row.status,`Assigned to ${assignee.name}`,req.admin.id])
        await createStaffNotification(db,{userId:assignee.id,eventKey:`legacy-assignment:${eventId}`,title:'Request assigned',message:`${row.reference_number} · ${row.service_name}`,applicationId:row.id})
        return (await db('UPDATE applications SET assigned_user_id=?,version=version+1,last_updated=now() WHERE id=? RETURNING *',[assignee.id,row.id]))[0]
      })
      res.json({application})
    } catch(error){res.status(error.status||503).json({error:safeStaffError(error,'Assignment could not be saved.')})}
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
      await requireLegacyDepartment(req.admin,application)
      try { await requireAccess(req.admin, 'documents.process', authorizationResource(application)) } catch (error) { return res.status(403).json({ error: safeStaffError(error, 'You are not authorized to process this request.') }) }
      const { document, created } = await persistDocument(db, { applicationId: application.id, userId: application.user_id, name, bytes, type, status: 'approved', kind: 'issued', createdAt: now() })
      const documentId = document.id
      if (created) await optionalSubmissionNotification(async () => {
        const notification = await createInAppNotification({ db, userId: application.user_id, title: 'Document ready for download', message: `${name} is now available for download from your ${application.service_name} request.`, applicationId: application.id, documentId, type: 'document.ready', eventKey: notificationEventKey('document.ready', { documentId }) })
        queueNotification({ userId: application.user_id, type: 'document.ready', eventId: documentId, applicationId: application.id, documentId, notificationId: notification.id, data: { serviceName: application.service_name, reference: application.reference_number, status: 'Ready', applicationId: application.id, documentId } })
      }, documentId)
      res.status(201).json({ id: documentId, name, status: document.verification_status, downloadable: true })
    } catch (error) {
      console.error(JSON.stringify({ event: 'staff_document_upload_failed', error: error?.name || 'Error' }))
      res.status(error.status||503).json({ error:safeStaffError(error,'The document could not be uploaded.') })
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
      await requireLegacyDepartment(req.admin,application)
      const protectedResource = authorizationResource(application)
      try { await requireAccess(req.admin, 'requests.update', protectedResource) } catch (error) { return res.status(403).json({ error: safeStaffError(error, 'You are not authorized to update this request.') }) }
      if(followUpDate)validatedStaffQuery({from:followUpDate})
      if(status==='completed'&&completionDate)validatedStaffQuery({from:completionDate})
      const previousStatus = String(application.status || 'submitted').toLowerCase()
      if (req.body?.previous_status && req.body.previous_status !== previousStatus) return res.status(409).json({error:'This request changed. Refresh the request and try again.'})
      if (req.body?.version !== undefined && req.body.version !== application.version) return res.status(409).json({error:'This request changed. Refresh the request and try again.'})
      if (application.closed_at) return res.status(409).json({ error: 'This request is already closed and cannot be updated.' })
      if (previousStatus === 'completed' && status === 'completed') return res.status(409).json({ error: 'This request has already been completed.' })
      if (status !== previousStatus) {
        try { await requireAccess(req.admin, 'requests.fulfillment_note.create', protectedResource); if (status === 'completed') { await requireAccess(req.admin, 'requests.complete', protectedResource); await requireAccess(req.admin, 'requests.close', protectedResource) } } catch (error) { return res.status(403).json({ error: safeStaffError(error, 'You are not authorized to complete this request.') }) }
        if(status==='approved')await requireAccess(req.admin,'documents.approve',protectedResource)
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
        const update = await db.prepare('UPDATE applications SET status = ?, last_updated = ?, version=version+1, due_at=COALESCE((NULLIF(?, \'\')::date+1)::timestamp AT TIME ZONE \'Asia/Manila\',due_at), completed_at = CASE WHEN ? = \'completed\' THEN ? ELSE completed_at END, closed_at = ?, closed_by = CASE WHEN ?::timestamptz IS NOT NULL THEN ? ELSE closed_by END WHERE id = ? AND status = ? AND version=? AND closed_at IS NULL').run(status, timestamp, followUpDate, status, timestamp, closedAt, closedAt, req.admin.id, application.id, application.status,application.version)
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
        if(application.assigned_user_id&&application.assigned_user_id!==req.admin.id)await createStaffNotification((sql,values)=>db.prepare(sql).all(...values),{userId:application.assigned_user_id,eventKey:`legacy-update:${historyId}`,title:'Assigned request updated',message:`${application.reference_number} is now ${status.replaceAll('_',' ')}.`,applicationId:application.id})
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
      res.status(error.status||503).json({ error:safeStaffError(error,'The service request could not be updated.') })
    }
  })
}
