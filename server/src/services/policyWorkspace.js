import { getCmsUserById } from '../repositories/cmsUserRepository.js'
import { effectiveAccessFor, audit, ensureAuthorizationData, hasAccess, requireAccess } from './authorizationService.js'
import { id } from './identifiers.js'

const scope = `SELECT e.policy_id FROM auth_policy_editors e
  JOIN auth_user_groups m ON m.group_id=e.group_id
  JOIN auth_groups g ON g.id=m.group_id
  WHERE m.user_id=? AND g.enabled AND g.archived_at IS NULL AND e.expires_at>CURRENT_TIMESTAMP`
function fail(status, message) { throw Object.assign(new Error(message), { status }) }
function handler(work) {
  return async (req,res) => {
    const db = await ensureAuthorizationData().catch(() => null)
    if (!db) return res.status(503).json({error:'Policy workspace unavailable.'})
    try {
      await db.exec('BEGIN')
      const result = await work(db, req.apiAccount, req)
      await db.exec('COMMIT')
      res.json(result)
    } catch (error) {
      await db.exec('ROLLBACK').catch(() => {})
      const status = [403,404,409,422].includes(error.status) ? error.status : 503
      res.status(status).json({error:status === 503 ? 'Policy workspace unavailable.' : error.message})
    }
  }
}
async function canEdit(db, actor, policyId) {
  if (await hasAccess(actor,'policies.manage')) return
  await requireAccess(actor,'policies.edit',{policy_id:policyId})
  if (!await db.prepare('SELECT 1 FROM ('+scope+') s WHERE policy_id=?').get(actor.id,policyId)) fail(403,'This policy is outside your delegation.')
}
export function installPolicyWorkspace(app, validateCondition) {
  app.get('/api/admin/policy-workspace',handler(async (db,actor) => {
    const manager = await hasAccess(actor,'policies.manage')
    if (!manager) await requireAccess(actor,'policies.edit')
    // Keep the policy directory usable on Supabase projects that have not yet
    // applied the optional delegation/revision migration. These tables only
    // enable workflow editing; the existing policy records remain readable.
    const workflowSchema = await db.prepare(`SELECT to_regclass('public.auth_policy_editors') AS editors,
      to_regclass('public.auth_policy_proposals') AS proposals`).get()
    const workflowReady = Boolean(workflowSchema?.editors && workflowSchema?.proposals)
    const editorFields = workflowReady ? 'e.group_id AS editor_group,e.expires_at' : 'NULL AS editor_group,NULL AS expires_at'
    const editorJoin = workflowReady ? 'LEFT JOIN auth_policy_editors e ON p.id=e.policy_id ' : ''
    const policies = await db.prepare(`SELECT p.*,perm.label AS permission_label,${editorFields} FROM auth_policies p LEFT JOIN auth_permissions perm ON perm.id=p.permission_id ${editorJoin}`+
      (manager ? '' : 'WHERE p.id IN ('+scope+') ')+'ORDER BY p.name').all(...(manager ? [] : [actor.id]))
    const revisions = workflowReady ? await db.prepare('SELECT * FROM auth_policy_proposals '+(manager ? '' : 'WHERE policy_id IN ('+scope+') ')+'ORDER BY created_at DESC').all(...(manager ? [] : [actor.id])) : []
    const groups = manager && workflowReady ? await db.prepare('SELECT id,name FROM auth_groups WHERE enabled AND archived_at IS NULL ORDER BY name').all() : []
    return {manager,policies,revisions,groups,readOnly:!workflowReady}
  }))
  app.post('/api/admin/policy-workspace/simulate',handler(async (db,actor,req) => {
    await requireAccess(actor,'users.view')
    await requireAccess(actor,'policies.manage')
    const {user_id,permission,resource} = req.body
    if (!resource || typeof resource !== 'object' || Array.isArray(resource)) fail(422,'Enter a resource context.')
    if (!await db.prepare('SELECT id FROM auth_permissions WHERE id=?').get(permission)) fail(422,'Unknown permission.')
    const target=await getCmsUserById(user_id)
    if (!target) fail(404,'Employee unavailable.')
    if (target.role==='disabled') return {allowed:false,reason:'Account disabled',sources:[]}
    const allowed=await hasAccess(target,permission,resource)
    const entry=(await effectiveAccessFor(target,resource)).permissions.find(p=>p.id===permission)
    const reason=['admin','super_admin'].includes(target.role)?'Administrator access':entry?'Group grants and policy conditions':'No group grants this permission'
    return {allowed,reason,sources:entry?.sources || []}
  }))
  app.put('/api/admin/policy-workspace/:id/delegation',handler(async (db,actor,req) => {
    await requireAccess(actor,'policies.manage')
    const policy = await db.prepare('SELECT * FROM auth_policies WHERE id=? FOR UPDATE').get(req.params.id)
    if (!policy) fail(404,'Policy unavailable.')
    const {group_id,expires_at,reason} = req.body
    if (!String(reason || '').trim()) fail(422,'Enter a reason for this change.')
    if (group_id && (!Number.isFinite(Date.parse(expires_at)) || Date.parse(expires_at)<=Date.now())) fail(422,'Choose a future expiry date.')
    const previous=await db.prepare('SELECT * FROM auth_policy_editors WHERE policy_id=?').get(policy.id)
    await db.prepare('DELETE FROM auth_policy_editors WHERE policy_id=?').run(policy.id)
    if (group_id) {
      if (!await db.prepare('SELECT id FROM auth_groups WHERE id=? AND enabled AND archived_at IS NULL').get(group_id)) fail(422,'Choose an active group.')
      await db.prepare('INSERT INTO auth_policy_editors(policy_id,group_id,expires_at,granted_by,reason) VALUES(?,?,?,?,?)').run(policy.id,group_id,expires_at,actor.id,reason)
    }
    await audit(db,actor.id,'POLICY_DELEGATION_CHANGED','policy',policy.id,previous,{group_id,expires_at,reason})
    return {saved:true}
  }))
  app.post('/api/admin/policy-workspace/:id/proposals',handler(async (db,actor,req) => {
    const p=await db.prepare('SELECT * FROM auth_policies WHERE id=? FOR UPDATE').get(req.params.id)
    if (!p) fail(404,'Policy unavailable.')
    await canEdit(db,actor,p.id)
    const {name,description,effect,enabled,condition,reason,expected_updated_at}=req.body
    if (Date.parse(expected_updated_at)!==Date.parse(p.updated_at)) fail(409,'Reopen the latest policy before submitting.')
    if (!name?.trim() || name.length>120 || typeof description!=='string' || description.length>1000 || !reason?.trim() || !['allow','deny'].includes(effect) || typeof enabled!=='boolean' || !condition || typeof condition!=='object' || Array.isArray(condition)) fail(422,'Check the policy fields and enter a justification.')
    validateCondition(condition)
    const proposal=id()
    await db.prepare('INSERT INTO auth_policy_proposals(id,policy_id,author_id,base_version,before_value,proposed_value,reason) VALUES(?,?,?,?,?,?,?)').run(proposal,p.id,actor.id,p.updated_at,JSON.stringify(p),JSON.stringify({name,description,effect,enabled,condition}),reason)
    await audit(db,actor.id,'POLICY_SUBMITTED','policy',p.id,null,{proposal,reason})
    return {id:proposal}
  }))
  app.post('/api/admin/policy-workspace/:id/review',handler(async (db,actor,req) => {
    await requireAccess(actor,'policies.manage')
    const r=await db.prepare('SELECT * FROM auth_policy_proposals WHERE id=? FOR UPDATE').get(req.params.id)
    if (!r) fail(404,'Revision unavailable.')
    if (r.status!=='pending') fail(409,'This revision was already reviewed.')
    if (r.author_id===actor.id) fail(403,'Another administrator must review this revision.')
    const accept=req.body.decision==='publish'
    if (!accept && req.body.decision!=='reject') fail(422,'Choose a review decision.')
    if (accept) {
      const p=await db.prepare('SELECT * FROM auth_policies WHERE id=? FOR UPDATE').get(r.policy_id)
      if (p.permission_id) await requireAccess(actor,p.permission_id)
      const v=r.proposed_value
      const result=await db.prepare(`UPDATE auth_policies SET name=?,description=?,effect=?,enabled=?,condition_json=?,updated_at=date_trunc('millisecond',CURRENT_TIMESTAMP) WHERE id=? AND updated_at=?`).run(v.name,v.description,v.effect,v.enabled,JSON.stringify(v.condition),r.policy_id,r.base_version)
      if (!result.changes) fail(409,'The policy has changed since this revision was submitted.')
    }
    const status=accept?'published':'rejected'
    await db.prepare('UPDATE auth_policy_proposals SET status=?,reviewer_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?').run(status,actor.id,r.id)
    await audit(db,actor.id,'POLICY_REVIEWED','policy',r.policy_id,r.before_value,{revision:r.id,status})
    return {status}
  }))
}
