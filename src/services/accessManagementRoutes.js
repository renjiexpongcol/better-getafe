import crypto from 'node:crypto'
import { getCmsUsers } from '../repositories/cmsUserRepository.js'
import { id, now } from './identifiers.js'
import { ensureAuthorizationData, ensureBootstrapMembership, effectiveAccessFor, hasAccess, requireAccess, audit } from './authorizationService.js'

const parseJson = value => { try { return JSON.parse(value || '{}') } catch { return {} } }
const ids = values => [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))]

export function installAccessManagementRoutes(app, admin) {
  app.use('/api/admin/access', admin, async (req, res, next) => {
    try { if (req.method === 'GET') await requireAccess(req.admin, 'users.view'); next() }
    catch (error) { res.status(error.status || 403).json({ error: error.message }) }
  })

  app.get('/api/admin/access', async (req, res) => {
    try {
      const db = await ensureAuthorizationData(), users = await getCmsUsers()
      for (const user of users) await ensureBootstrapMembership(user)
      const groups = await db.prepare(`SELECT g.*, COUNT(DISTINCT ug.user_id) AS member_count, COUNT(DISTINCT gp.permission_id) AS permission_count
        FROM auth_groups g LEFT JOIN auth_user_groups ug ON ug.group_id=g.id LEFT JOIN auth_group_permissions gp ON gp.group_id=g.id
        GROUP BY g.id ORDER BY g.system_group DESC,g.name`).all()
      const permissions = await db.prepare('SELECT * FROM auth_permissions ORDER BY category,label').all()
      const policies = await db.prepare('SELECT * FROM auth_policies ORDER BY name').all().map(item => ({ ...item, condition: parseJson(item.condition_json) }))
      const memberships = await db.prepare('SELECT ug.user_id,g.id,g.name FROM auth_user_groups ug JOIN auth_groups g ON g.id=ug.group_id WHERE g.archived_at IS NULL ORDER BY g.name').all()
      const directory = users.map(user => ({ id: user.id, name: user.name, email: user.email, role: user.role, groups: memberships.filter(item => item.user_id === user.id).map(item => ({ id: item.id, name: item.name })) }))
      const activity = await db.prepare('SELECT * FROM auth_audit_logs ORDER BY created_at DESC LIMIT 100').all()
      res.json({ users: directory, groups, permissions, policies, activity })
    } catch (error) { console.error('Access management load failed:', error.message); res.status(503).json({ error: 'Access management is temporarily unavailable.' }) }
  })

  app.get('/api/admin/access/users/:id/effective', async (req, res) => {
    try {
      const user = (await getCmsUsers()).find(item => item.id === req.params.id)
      if (!user) return res.status(404).json({ error: 'User not found.' })
      res.json(await effectiveAccessFor(user))
    } catch (error) { res.status(503).json({ error: error.message || 'Effective access is unavailable.' }) }
  })

  app.get('/api/admin/access/groups/:id', async (req, res) => {
    try {
      const db = await ensureAuthorizationData(), group = await db.prepare('SELECT * FROM auth_groups WHERE id=?').get(req.params.id)
      if (!group) return res.status(404).json({ error: 'Group not found.' })
      const members = await db.prepare('SELECT user_id,created_at,created_by FROM auth_user_groups WHERE group_id=? ORDER BY created_at').all(group.id)
      const permissions = await db.prepare('SELECT p.* FROM auth_permissions p JOIN auth_group_permissions gp ON gp.permission_id=p.id WHERE gp.group_id=? ORDER BY p.category,p.label').all(group.id)
      const policies = await db.prepare('SELECT p.* FROM auth_policies p JOIN auth_group_policies gp ON gp.policy_id=p.id WHERE gp.group_id=? ORDER BY p.name').all(group.id).map(item => ({ ...item, condition: parseJson(item.condition_json) }))
      const activity = await db.prepare("SELECT * FROM auth_audit_logs WHERE target_id=? OR (target_type='membership' AND new_value LIKE ?) ORDER BY created_at DESC LIMIT 100").all(group.id, `%${group.id}%`)
      res.json({ group, members, permissions, policies, activity })
    } catch (error) { res.status(503).json({ error: error.message || 'Group details are unavailable.' }) }
  })

  app.post('/api/admin/access/groups', async (req, res) => {
    try {
      await requireAccess(req.admin, 'groups.manage')
      const db = await ensureAuthorizationData(), name = String(req.body?.name || '').trim(), description = String(req.body?.description || '').trim().slice(0, 1000)
      if (!/^[A-Za-z][A-Za-z0-9_-]{2,79}$/.test(name)) return res.status(422).json({ error: 'Use a group name of 3–80 letters, numbers, underscores, or hyphens.' })
      if (await db.prepare('SELECT 1 FROM auth_groups WHERE lower(name)=lower(?)').get(name)) return res.status(409).json({ error: 'A group with this name already exists.' })
      const permissionIds = ids(req.body?.permission_ids), valid = new Set(await db.prepare('SELECT id FROM auth_permissions').all().map(item => item.id)), actorAccess = await effectiveAccessFor(req.admin), actorPermissions = new Set(actorAccess.permissions.filter(permission => permission.allowed).map(permission => permission.id))
      if (permissionIds.some(permission => !valid.has(permission))) return res.status(422).json({ error: 'One or more permissions are invalid.' })
      if (permissionIds.some(permission => !actorPermissions.has(permission))) return res.status(403).json({ error: 'You cannot grant a permission that you do not hold.' })
      const groupId = id(), timestamp = now(), correlationId = crypto.randomUUID()
      await db.exec('BEGIN IMMEDIATE'); try {
        await db.prepare('INSERT INTO auth_groups (id,name,description,enabled,system_group,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(groupId, name, description, 1, 0, timestamp, timestamp)
        const link = await db.prepare('INSERT INTO auth_group_permissions (group_id,permission_id,created_at,created_by) VALUES (?,?,?,?)')
        for (const permissionId of permissionIds) link.run(groupId, permissionId, timestamp, req.admin.id)
        await audit(db, req.admin.id, 'GROUP_CREATED', 'group', groupId, null, { name, description, permission_ids: permissionIds }, correlationId)
        await db.exec('COMMIT')
      } catch (error) { await db.exec('ROLLBACK'); throw error }
      res.status(201).json({ id: groupId })
    } catch (error) { res.status(error.status || 503).json({ error: error.message || 'Group could not be created.' }) }
  })

  app.patch('/api/admin/access/groups/:id', async (req, res) => {
    try {
      await requireAccess(req.admin, 'groups.manage')
      const db = await ensureAuthorizationData(), group = await db.prepare('SELECT * FROM auth_groups WHERE id=?').get(req.params.id)
      if (!group) return res.status(404).json({ error: 'Group not found.' })
      const name = group.system_group ? group.name : String(req.body?.name || group.name).trim(), description = String(req.body?.description ?? group.description).trim().slice(0, 1000), enabled = req.body?.enabled === undefined ? group.enabled : req.body.enabled ? 1 : 0
      if (group.system_group && !enabled) return res.status(409).json({ error: 'The protected system administrator group cannot be disabled.' })
      await db.prepare('UPDATE auth_groups SET name=?,description=?,enabled=?,updated_at=? WHERE id=?').run(name, description, enabled, now(), group.id)
      await audit(db, req.admin.id, enabled ? 'GROUP_UPDATED' : 'GROUP_DISABLED', 'group', group.id, group, { name, description, enabled: Boolean(enabled) })
      res.json({ saved: true })
    } catch (error) { res.status(error.status || 503).json({ error: error.message || 'Group could not be updated.' }) }
  })

  app.delete('/api/admin/access/groups/:id', async (req, res) => {
    try {
      await requireAccess(req.admin, 'groups.manage')
      const db = await ensureAuthorizationData(), group = await db.prepare('SELECT * FROM auth_groups WHERE id=?').get(req.params.id)
      if (!group) return res.status(404).json({ error: 'Group not found.' })
      if (group.system_group) return res.status(409).json({ error: 'The protected system administrator group cannot be archived.' })
      const members = await db.prepare('SELECT COUNT(*) AS count FROM auth_user_groups WHERE group_id=?').get(group.id).count
      if (members) return res.status(409).json({ error: 'Remove all group members before archiving this group.' })
      const archivedAt = now()
      await db.prepare('UPDATE auth_groups SET enabled=0,archived_at=?,updated_at=? WHERE id=?').run(archivedAt, archivedAt, group.id)
      await audit(db, req.admin.id, 'GROUP_ARCHIVED', 'group', group.id, group, { ...group, enabled: false, archived_at: archivedAt })
      res.json({ archived: true })
    } catch (error) { res.status(error.status || 503).json({ error: error.message || 'Group could not be archived.' }) }
  })

  app.put('/api/admin/access/groups/:id/permissions', async (req, res) => {
    try {
      await requireAccess(req.admin, 'permissions.manage')
      const db = await ensureAuthorizationData(), group = await db.prepare('SELECT * FROM auth_groups WHERE id=?').get(req.params.id)
      if (!group) return res.status(404).json({ error: 'Group not found.' })
      if (group.system_group && req.admin.role !== 'super_admin') return res.status(403).json({ error: 'Only a super administrator can change the protected system group.' })
      const permissionIds = ids(req.body?.permission_ids), actorAccess = await effectiveAccessFor(req.admin), actorPermissions = new Set(actorAccess.permissions.filter(item => item.allowed).map(item => item.id))
      if (permissionIds.some(permission => !actorPermissions.has(permission))) return res.status(403).json({ error: 'You cannot grant a permission that you do not hold.' })
      const valid = new Set(await db.prepare('SELECT id FROM auth_permissions').all().map(item => item.id))
      if (permissionIds.some(permission => !valid.has(permission))) return res.status(422).json({ error: 'One or more permissions are invalid.' })
      const previous = await db.prepare('SELECT permission_id FROM auth_group_permissions WHERE group_id=?').all(group.id).map(item => item.permission_id)
      await db.exec('BEGIN IMMEDIATE'); try {
        await db.prepare('DELETE FROM auth_group_permissions WHERE group_id=?').run(group.id)
        const insert = await db.prepare('INSERT INTO auth_group_permissions (group_id,permission_id,created_at,created_by) VALUES (?,?,?,?)')
        for (const permission of permissionIds) insert.run(group.id, permission, now(), req.admin.id)
        for (const permission of permissionIds.filter(item => !previous.includes(item))) await audit(db, req.admin.id, 'PERMISSION_ADDED_TO_GROUP', 'group', group.id, null, { permission_id: permission })
        for (const permission of previous.filter(item => !permissionIds.includes(item))) await audit(db, req.admin.id, 'PERMISSION_REMOVED_FROM_GROUP', 'group', group.id, { permission_id: permission }, null)
        await db.exec('COMMIT')
      } catch (error) { await db.exec('ROLLBACK'); throw error }
      res.json({ saved: true })
    } catch (error) { res.status(error.status || 503).json({ error: error.message || 'Group permissions could not be updated.' }) }
  })

  app.put('/api/admin/access/groups/:id/members', async (req, res) => {
    try {
      await requireAccess(req.admin, 'groups.manage'); await requireAccess(req.admin, 'users.manage')
      const db = await ensureAuthorizationData(), group = await db.prepare('SELECT * FROM auth_groups WHERE id=?').get(req.params.id)
      if (!group) return res.status(404).json({ error: 'Group not found.' })
      if (group.system_group && req.admin.role !== 'super_admin') return res.status(403).json({ error: 'Only a super administrator can change protected system group membership.' })
      const userIds = ids(req.body?.user_ids), users = await getCmsUsers(), validUsers = new Set(users.map(item => item.id))
      if (userIds.some(userId => !validUsers.has(userId))) return res.status(422).json({ error: 'One or more users are invalid.' })
      if (userIds.includes(req.admin.id) !== Boolean(await db.prepare('SELECT 1 FROM auth_user_groups WHERE user_id=? AND group_id=?').get(req.admin.id, group.id))) return res.status(403).json({ error: 'You cannot change your own group membership.' })
      const previous = await db.prepare('SELECT user_id FROM auth_user_groups WHERE group_id=?').all(group.id).map(item => item.user_id)
      const protectedSuperIds = users.filter(item => item.role === 'super_admin').map(item => item.id)
      if (group.system_group && protectedSuperIds.some(userId => !userIds.includes(userId))) return res.status(409).json({ error: 'Super administrators cannot be removed from the protected system group.' })
      await db.exec('BEGIN IMMEDIATE'); try {
        await db.prepare('DELETE FROM auth_user_groups WHERE group_id=?').run(group.id)
        const insert = await db.prepare('INSERT INTO auth_user_groups (user_id,group_id,created_at,created_by) VALUES (?,?,?,?)')
        for (const userId of userIds) insert.run(userId, group.id, now(), req.admin.id)
        for (const userId of userIds.filter(item => !previous.includes(item))) await audit(db, req.admin.id, 'USER_ADDED_TO_GROUP', 'membership', userId, null, { user_id: userId, group_id: group.id })
        for (const userId of previous.filter(item => !userIds.includes(item))) await audit(db, req.admin.id, 'USER_REMOVED_FROM_GROUP', 'membership', userId, { user_id: userId, group_id: group.id }, null)
        await db.exec('COMMIT')
      } catch (error) { await db.exec('ROLLBACK'); throw error }
      res.json({ saved: true })
    } catch (error) { res.status(error.status || 503).json({ error: error.message || 'Group members could not be updated.' }) }
  })

  app.put('/api/admin/access/users/:id/groups', async (req, res) => {
    try {
      await requireAccess(req.admin, 'groups.manage'); await requireAccess(req.admin, 'users.manage')
      if (req.params.id === req.admin.id) return res.status(403).json({ error: 'You cannot change your own group membership.' })
      const db = await ensureAuthorizationData(), users = await getCmsUsers(), target = users.find(user => user.id === req.params.id)
      if (!target) return res.status(404).json({ error: 'User not found.' })
      const groupIds = ids(req.body?.group_ids), groups = await db.prepare('SELECT * FROM auth_groups WHERE archived_at IS NULL').all(), valid = new Set(groups.map(group => group.id))
      if (groupIds.some(groupId => !valid.has(groupId))) return res.status(422).json({ error: 'One or more groups are invalid.' })
      const previous = await db.prepare('SELECT group_id FROM auth_user_groups WHERE user_id=?').all(target.id).map(item => item.group_id)
      const protectedGroup = groups.find(group => group.system_group)
      if (req.admin.role !== 'super_admin' && protectedGroup && groupIds.includes(protectedGroup.id) !== previous.includes(protectedGroup.id)) return res.status(403).json({ error: 'Only a super administrator can change protected system group membership.' })
      const actorAccess = await effectiveAccessFor(req.admin), actorPermissions = new Set(actorAccess.permissions.filter(permission => permission.allowed).map(permission => permission.id))
      const newlyAssigned = groupIds.filter(groupId => !previous.includes(groupId))
      for (const groupId of newlyAssigned) {
        const required = await db.prepare('SELECT permission_id FROM auth_group_permissions WHERE group_id=?').all(groupId).map(item => item.permission_id)
        if (required.some(permission => !actorPermissions.has(permission))) return res.status(403).json({ error: 'You cannot assign a group that grants permissions you do not hold.' })
      }
      if (target.role === 'super_admin' && protectedGroup && !groupIds.includes(protectedGroup.id)) return res.status(409).json({ error: 'A super administrator cannot be removed from the protected system group.' })
      await db.exec('BEGIN IMMEDIATE'); try {
        await db.prepare('DELETE FROM auth_user_groups WHERE user_id=?').run(target.id)
        const insert = await db.prepare('INSERT INTO auth_user_groups (user_id,group_id,created_at,created_by) VALUES (?,?,?,?)')
        for (const groupId of groupIds) insert.run(target.id, groupId, now(), req.admin.id)
        for (const groupId of groupIds.filter(item => !previous.includes(item))) await audit(db, req.admin.id, 'USER_ADDED_TO_GROUP', 'membership', target.id, null, { user_id: target.id, group_id: groupId })
        for (const groupId of previous.filter(item => !groupIds.includes(item))) await audit(db, req.admin.id, 'USER_REMOVED_FROM_GROUP', 'membership', target.id, { user_id: target.id, group_id: groupId }, null)
        await db.exec('COMMIT')
      } catch (error) { await db.exec('ROLLBACK'); throw error }
      res.json({ saved: true })
    } catch (error) { res.status(error.status || 503).json({ error: error.message || 'User group membership could not be updated.' }) }
  })

  app.post('/api/admin/access/policies', async (req, res) => {
    try {
      await requireAccess(req.admin, 'policies.manage')
      const db = await ensureAuthorizationData(), name = String(req.body?.name || '').trim(), description = String(req.body?.description || '').trim().slice(0, 1000), permissionId = String(req.body?.permission_id || '').trim() || null, effect = req.body?.effect === 'deny' ? 'deny' : 'allow'
      if (!name || name.length > 120) return res.status(422).json({ error: 'Enter a policy name of up to 120 characters.' })
      const condition = req.body?.condition && typeof req.body.condition === 'object' ? req.body.condition : {}
      if (permissionId && !await db.prepare('SELECT 1 FROM auth_permissions WHERE id=?').get(permissionId)) return res.status(422).json({ error: 'Choose a valid permission.' })
      if (permissionId && !await hasAccess(req.admin, permissionId)) return res.status(403).json({ error: 'You cannot create a policy for a permission that you do not hold.' })
      const policyId = id(), timestamp = now(); await db.prepare('INSERT INTO auth_policies (id,name,description,effect,permission_id,condition_json,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(policyId, name, description, effect, permissionId, JSON.stringify(condition), 1, timestamp, timestamp); await audit(db, req.admin.id, 'POLICY_CREATED', 'policy', policyId, null, { name, description, effect, permissionId, condition }); res.status(201).json({ id: policyId })
    } catch (error) { res.status(error.status || 503).json({ error: error.message || 'Policy could not be created.' }) }
  })

  app.patch('/api/admin/access/policies/:id', async (req, res) => {
    try {
      await requireAccess(req.admin, 'policies.manage')
      const db = await ensureAuthorizationData(), policy = await db.prepare('SELECT * FROM auth_policies WHERE id=?').get(req.params.id)
      if (!policy) return res.status(404).json({ error: 'Policy not found.' })
      const name = String(req.body?.name ?? policy.name).trim(), description = String(req.body?.description ?? policy.description).trim().slice(0, 1000), permissionId = String(req.body?.permission_id ?? policy.permission_id ?? '').trim() || null, effect = req.body?.effect === 'deny' ? 'deny' : req.body?.effect === 'allow' ? 'allow' : policy.effect, enabled = req.body?.enabled === undefined ? policy.enabled : req.body.enabled ? 1 : 0
      if (!name || name.length > 120) return res.status(422).json({ error: 'Enter a policy name of up to 120 characters.' })
      if (permissionId && !await db.prepare('SELECT 1 FROM auth_permissions WHERE id=?').get(permissionId)) return res.status(422).json({ error: 'Choose a valid permission.' })
      if (permissionId && !await hasAccess(req.admin, permissionId)) return res.status(403).json({ error: 'You cannot update a policy for a permission that you do not hold.' })
      const condition = req.body?.condition && typeof req.body.condition === 'object' ? req.body.condition : parseJson(policy.condition_json)
      const updatedAt = now()
      await db.prepare('UPDATE auth_policies SET name=?,description=?,effect=?,permission_id=?,condition_json=?,enabled=?,updated_at=? WHERE id=?').run(name, description, effect, permissionId, JSON.stringify(condition), enabled, updatedAt, policy.id)
      await audit(db, req.admin.id, enabled ? 'POLICY_UPDATED' : 'POLICY_DISABLED', 'policy', policy.id, { ...policy, condition: parseJson(policy.condition_json) }, { name, description, effect, permissionId, condition, enabled: Boolean(enabled) })
      res.json({ saved: true })
    } catch (error) { res.status(error.status || 503).json({ error: error.message || 'Policy could not be updated.' }) }
  })

  app.put('/api/admin/access/groups/:id/policies', async (req, res) => {
    try {
      await requireAccess(req.admin, 'policies.manage')
      const db = await ensureAuthorizationData(), policyIds = ids(req.body?.policy_ids), valid = new Set(await db.prepare('SELECT id FROM auth_policies').all().map(item => item.id))
      if (!await db.prepare('SELECT 1 FROM auth_groups WHERE id=? AND archived_at IS NULL').get(req.params.id)) return res.status(404).json({ error: 'Group not found.' })
      if (policyIds.some(policy => !valid.has(policy))) return res.status(422).json({ error: 'One or more policies are invalid.' })
      const actorAccess = await effectiveAccessFor(req.admin), actorPermissions = new Set(actorAccess.permissions.filter(permission => permission.allowed).map(permission => permission.id))
      const policyPermissions = await db.prepare(`SELECT DISTINCT permission_id FROM auth_policies WHERE id IN (${policyIds.map(() => '?').join(',') || "''"}) AND permission_id IS NOT NULL`).all(...policyIds).map(item => item.permission_id)
      if (policyPermissions.some(permission => !actorPermissions.has(permission))) return res.status(403).json({ error: 'You cannot assign a policy for a permission that you do not hold.' })
      const previous = await db.prepare('SELECT policy_id FROM auth_group_policies WHERE group_id=?').all(req.params.id).map(item => item.policy_id)
      await db.exec('BEGIN IMMEDIATE'); try { await db.prepare('DELETE FROM auth_group_policies WHERE group_id=?').run(req.params.id); const insert = await db.prepare('INSERT INTO auth_group_policies (group_id,policy_id,created_at,created_by) VALUES (?,?,?,?)'); for (const policyId of policyIds) insert.run(req.params.id, policyId, now(), req.admin.id); await audit(db, req.admin.id, 'GROUP_POLICIES_UPDATED', 'group', req.params.id, previous, policyIds); await db.exec('COMMIT') } catch (error) { await db.exec('ROLLBACK'); throw error }
      res.json({ saved: true })
    } catch (error) { res.status(error.status || 503).json({ error: error.message || 'Group policies could not be updated.' }) }
  })
}


