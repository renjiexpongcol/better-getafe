import { EserviceEngine } from './eserviceEngine.js'
import { effectiveAccessFor, requireAccess } from './authorizationService.js'
import { permissionQueryScope, legacyPolicyFields, eservicePolicyFields, validatedStaffQuery } from './staffQueryScope.js'

export const LEGACY_STAFF_STATUSES = ['submitted','processing','on_hold','needs_information','approved','completed','rejected','cancelled']
export const ESERVICE_STAFF_STATUSES = ['SUBMITTED','RECEIVED','IN_REVIEW','NEEDS_INFORMATION','FOR_ASSESSMENT','AWAITING_PAYMENT','PAID','FOR_APPROVAL','APPROVED','FOR_RELEASE','COMPLETED','REJECTED','CANCELLED']
const like = value => `%${value.replace(/[!%_]/g, character => `!${character}`)}%`

export async function staffLegacyScope(user, permission = 'requests.view', access = null) {
  if (['admin', 'super_admin'].includes(user?.role)) return { sql: 'TRUE', values: [] }
  const scope = await permissionQueryScope(user, permission, legacyPolicyFields, 'a.details',access)
  const unrouted = await permissionQueryScope(user, 'requests.unrouted.view', legacyPolicyFields, 'a.details',access)
  return { ...scope, sql: `(${scope.sql}) AND (EXISTS(SELECT 1 FROM eservice_department_members m WHERE m.user_id=? AND m.department_id=a.department_id) OR (a.department_id IS NULL AND (${unrouted.sql})))`, values: [...scope.values,user.id,...unrouted.values] }
}
export async function staffEserviceScope(user,access = null) {
  if (['admin', 'super_admin'].includes(user?.role)) return { sql: 'TRUE', values: [] }
  const scope = await permissionQueryScope(user, 'requests.department.view', eservicePolicyFields,null,access)
  return { ...scope, sql: `(${scope.sql}) AND r.submitted_at IS NOT NULL AND r.status<>'DRAFT' AND EXISTS(SELECT 1 FROM eservice_department_members m WHERE m.user_id=? AND m.department_id=r.department_id)`, values: [...scope.values,user.id] }
}
const countSql = (table, alias, scope, legacy) => `SELECT count(*)::integer AS total,
 count(*) FILTER(WHERE ${alias}.status ${legacy ? "IN ('submitted')" : "IN ('SUBMITTED','RECEIVED','FOR_APPROVAL')"})::integer AS pending,
 count(*) FILTER(WHERE ${alias}.status ${legacy ? "IN ('processing','on_hold','approved')" : "IN ('IN_REVIEW','FOR_ASSESSMENT','PAID','APPROVED','FOR_RELEASE')"})::integer AS "inProgress",
 count(*) FILTER(WHERE ${alias}.status=${legacy ? "'completed'" : "'COMPLETED'"})::integer AS completed,
 count(*) FILTER(WHERE ${alias}.due_at<now() AND ${alias}.status NOT IN (${legacy ? "'completed','rejected','cancelled'" : "'COMPLETED','REJECTED','CANCELLED'"}))::integer AS overdue,
 count(*) FILTER(WHERE ${alias}.status=${legacy ? "'needs_information'" : "'NEEDS_INFORMATION'"})::integer AS "awaitingResponse",
 count(*) FILTER(WHERE ${legacy ? "a.payment_status IN ('pending','unpaid')" : "r.status='AWAITING_PAYMENT'"})::integer AS "awaitingPayment",
 count(*) FILTER(WHERE ${alias}.assigned_user_id=?)::integer AS assigned,
 count(*) FILTER(WHERE ${alias}.assigned_user_id IS NULL AND ${alias}.status NOT IN (${legacy ? "'completed','rejected','cancelled'" : "'COMPLETED','REJECTED','CANCELLED'"}))::integer AS unassigned,
 count(*) FILTER(WHERE ${alias}.status=${legacy ? "'needs_information'" : "'NEEDS_INFORMATION'"} AND EXISTS(SELECT 1 FROM ${legacy ? 'application_documents d WHERE d.application_id=a.id AND d.verification_status IN (\'rejected\',\'replacement_required\')' : "request_documents d WHERE d.request_id=r.id AND d.status IN ('REJECTED','REPLACEMENT_REQUIRED') AND NOT EXISTS(SELECT 1 FROM request_documents n WHERE n.replaces_id=d.id)"}))::integer AS "awaitingDocuments"
 FROM ${table} ${alias} WHERE ${scope.sql} ${legacy ? "AND a.submitted_at IS NOT NULL AND a.status<>'draft'" : ''}`

export async function staffDashboard(user, engine = new EserviceEngine()) {
  await requireAccess(user, 'staff.dashboard.view')
  const access=await effectiveAccessFor(user)
  const [legacy, eservice] = await Promise.all([staffLegacyScope(user,'requests.view',access),staffEserviceScope(user,access)])
  const [oldCounts, newCounts, recentLegacy, recentEservice] = await Promise.all([
    engine.read(countSql('applications','a',legacy,true),[user.id,...legacy.values]),
    engine.read(countSql('service_requests','r',eservice,false),[user.id,...eservice.values]),
    engine.read(`SELECT a.id,a.reference_number,a.service_name,a.status,a.submitted_at,a.last_updated,a.department_id,a.assigned_user_id,u.name AS resident_name,d.name AS department_name FROM applications a JOIN portal_users u ON u.id=a.user_id LEFT JOIN departments d ON d.id=a.department_id WHERE ${legacy.sql} AND a.submitted_at IS NOT NULL AND a.status<>'draft' ORDER BY a.last_updated DESC,a.id DESC LIMIT 8`,legacy.values),
    engine.read(`SELECT r.id,r.request_number,r.status,r.submitted_at,r.updated_at,r.department_id,r.assigned_user_id,s.name AS service_name,u.name AS applicant_name,d.name AS department_name FROM service_requests r JOIN services s ON s.id=r.service_id JOIN portal_users u ON u.id=r.applicant_user_id JOIN departments d ON d.id=r.department_id WHERE ${eservice.sql} ORDER BY r.updated_at DESC,r.id DESC LIMIT 8`,eservice.values),
  ])
  const sources = { legacy: oldCounts[0], eservices: newCounts[0] }
  const counts = Object.fromEntries(Object.keys(sources.legacy).map(key => [key, Number(sources.legacy[key]) + Number(sources.eservices[key])]))
  const names = await engine.staffIdentities([...recentLegacy,...recentEservice].map(row => row.assigned_user_id))
  const applications = recentLegacy.map(row => ({ ...row, assigned_user_name:names.get(row.assigned_user_id) || null }))
  const recent = [...applications.map(row=>({...row,source:'legacy',reference:row.reference_number,applicant_name:row.resident_name,updated_at:row.last_updated})),...recentEservice.map(row=>({...row,source:'eservice',reference:row.request_number,assigned_user_name:names.get(row.assigned_user_id) || null}))].sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at)).slice(0,8)
  return { counts,sources,applications,recent,scope:'Requests in your assigned departments and explicitly delegated support scope',generated_at:new Date().toISOString() }
}

export async function staffApplicationList(user, query, engine = new EserviceEngine()) {
  await requireAccess(user,'requests.view')
  const filters = validatedStaffQuery(query,LEGACY_STAFF_STATUSES), scope = await staffLegacyScope(user)
  const conditions = [`(${scope.sql})`,`a.submitted_at IS NOT NULL`,`a.status<>'draft'`], values = [...scope.values]
  for (const [key,column] of [['status','status'],['service','service_name'],['department_id','department_id']]) if (filters[key]) { conditions.push(`a.${column}=?`);values.push(filters[key]) }
  if (filters.assigned === 'me') { conditions.push('a.assigned_user_id=?');values.push(user.id) }
  if (filters.assigned === 'unassigned') conditions.push('a.assigned_user_id IS NULL')
  if (filters.search) { conditions.push("(a.reference_number ILIKE ? ESCAPE '!' OR u.name ILIKE ? ESCAPE '!' OR a.service_name ILIKE ? ESCAPE '!')");values.push(...Array(3).fill(like(filters.search))) }
  if (filters.from) {conditions.push("a.submitted_at>=?::date::timestamp AT TIME ZONE 'Asia/Manila'");values.push(filters.from)}
  if (filters.to) {conditions.push("a.submitted_at<(?::date+1)::timestamp AT TIME ZONE 'Asia/Manila'");values.push(filters.to)}
  const where=conditions.join(' AND '), join='FROM applications a JOIN portal_users u ON u.id=a.user_id LEFT JOIN departments d ON d.id=a.department_id'
  const sorts={submitted_desc:'a.submitted_at DESC',submitted_asc:'a.submitted_at ASC',updated_desc:'a.last_updated DESC',updated_asc:'a.last_updated ASC',priority:"CASE WHEN a.due_at<now() THEN 0 WHEN a.status='needs_information' THEN 1 WHEN a.status='submitted' THEN 2 ELSE 3 END,a.submitted_at ASC"}
  const [count,items,options] = await Promise.all([
    engine.read(`SELECT count(*)::integer AS total ${join} WHERE ${where}`,values),
    engine.read(`SELECT a.id,a.reference_number,a.service_name,a.status,a.submitted_at,a.last_updated,a.department_id,a.assigned_user_id,a.version,u.name AS resident_name,d.name AS department_name ${join} WHERE ${where} ORDER BY ${sorts[filters.sort]},a.id LIMIT ? OFFSET ?`,[...values,filters.limit,(filters.page-1)*filters.limit]),
    engine.read(`SELECT DISTINCT a.service_name,a.department_id,d.name AS department_name ${join} WHERE ${scope.sql} AND a.submitted_at IS NOT NULL AND a.status<>'draft' ORDER BY a.service_name`,scope.values),
  ])
  const names=await engine.staffIdentities(items.map(row=>row.assigned_user_id))
  return {items:items.map(row=>({...row,assigned_user_name:names.get(row.assigned_user_id)||null})),total:count[0].total,page:filters.page,limit:filters.limit,options}
}

export async function requireLegacyDepartment(user, application) {
  if (['admin', 'super_admin'].includes(user?.role)) return
  if (application.department_id) {
    const engine = new EserviceEngine()
    if (!(await engine.read('SELECT 1 FROM eservice_department_members WHERE user_id=? AND department_id=?',[user.id,application.department_id])).length) throw Object.assign(new Error('This request belongs to another department.'),{status:403})
  } else await requireAccess(user,'requests.unrouted.view',application)
}
