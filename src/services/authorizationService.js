import crypto from 'node:crypto'
import { getPostgresRuntime } from '../repositories/postgresRuntime.js'
import { id, now } from './identifiers.js'

export const permissionCatalog = [
  ['requests.view', 'Requests', 'View service requests', 'View request records and requester details.'],
  ['requests.create', 'Requests', 'Create service requests', 'Create requests on behalf of residents.'],
  ['requests.update', 'Requests', 'Update service requests', 'Change request details and processing status.'],
  ['requests.assign', 'Requests', 'Assign service requests', 'Assign requests to staff or departments.'],
  ['requests.fulfillment_note.create', 'Requests', 'Add fulfillment notes', 'Create traceable status and fulfillment notes.'],
  ['requests.complete', 'Requests', 'Complete service requests', 'Complete and fulfill service requests.'],
  ['requests.close', 'Requests', 'Close service requests', 'Close completed service requests.'],
  ['requests.delete', 'Requests', 'Delete service requests', 'Permanently remove service requests.', true],
  ['appointments.view', 'Appointments', 'View appointments', 'View municipal appointments.'],
  ['appointments.create', 'Appointments', 'Create appointments', 'Create appointments for residents.'],
  ['appointments.update', 'Appointments', 'Update appointments', 'Reschedule and update appointments.'],
  ['documents.view', 'Documents', 'View documents', 'View resident and issued documents.'],
  ['documents.process', 'Documents', 'Process documents', 'Upload and process municipal documents.'],
  ['documents.approve', 'Documents', 'Approve documents', 'Approve documents for release.'],
  ['content.news.manage', 'Content', 'Manage news', 'Create, edit, and publish news.'],
  ['content.events.manage', 'Content', 'Manage events', 'Create, edit, and publish events.'],
  ['content.categories.manage', 'Content', 'Manage categories', 'Create and organize public content categories.'],
  ['content.media.manage', 'Content', 'Manage media', 'Upload and maintain public media assets.'],
  ['directory.manage', 'Content', 'Manage public directory', 'Maintain barangays and municipal officials.'],
  ['privacy.manage', 'Governance', 'Manage privacy requests', 'Review and process resident privacy requests.', true],
  ['admin.dashboard.view', 'Administration', 'View administration dashboard', 'Open the administration workspace.'],
  ['users.view', 'Access Management', 'View users', 'View staff and administrator accounts.', true],
  ['users.manage', 'Access Management', 'Manage users', 'Create and modify staff accounts.', true],
  ['groups.manage', 'Access Management', 'Manage groups', 'Create groups and manage membership.', true],
  ['permissions.manage', 'Access Management', 'Manage permissions', 'Assign permissions to groups.', true],
  ['policies.manage', 'Access Management', 'Manage policies', 'Create and assign conditional policies.', true],
  ['audit.view', 'Governance', 'View audit log', 'Review immutable authorization history.', true],
  ['system.settings.manage', 'System', 'Manage system settings', 'Change system configuration.', true],
  ['system.database.view', 'System', 'View database settings', 'View sanitized database configuration and status.', true],
  ['system.database.configure', 'System', 'Configure database', 'Change database connection configuration.', true],
  ['system.database.test', 'System', 'Test database connection', 'Test a proposed database connection.', true],
  ['settings.view', 'System', 'View system settings', 'Open and review system configuration.', true],
  ['staff.dashboard.view', 'Staff Workspace', 'View staff dashboard', 'Open the municipal staff workspace.'],
  ['notifications.view', 'Staff Workspace', 'View staff notifications', 'View staff notifications.'],
  ['reports.view', 'Staff Workspace', 'View reports', 'View operational reports.'],
  ['help.view', 'Staff Workspace', 'View help', 'Open staff help and guidance.'],
]

const defaultGroups = [
  ['Staff_Support', 'Handles citizen support and municipal service requests.', ['requests.view', 'requests.update', 'requests.fulfillment_note.create', 'requests.complete', 'requests.close', 'appointments.view', 'appointments.update', 'documents.view', 'documents.process', 'staff.dashboard.view', 'notifications.view', 'help.view']],
  ['Barangay_Staff', 'Handles requests and appointments scoped to an assigned barangay.', ['requests.view', 'requests.update', 'requests.fulfillment_note.create', 'appointments.view', 'appointments.update', 'documents.view', 'staff.dashboard.view', 'notifications.view', 'help.view']],
  ['Records_Officer', 'Processes and approves municipal records and documents.', ['requests.view', 'requests.update', 'requests.fulfillment_note.create', 'documents.view', 'documents.process', 'documents.approve', 'staff.dashboard.view']],
  ['Service_Approver', 'Approves, completes, and closes municipal service requests.', ['requests.view', 'requests.update', 'requests.fulfillment_note.create', 'requests.complete', 'requests.close', 'documents.view', 'documents.approve', 'staff.dashboard.view']],
  ['Content_Manager', 'Manages public news and event content.', ['admin.dashboard.view', 'content.news.manage', 'content.events.manage', 'content.categories.manage', 'content.media.manage']],
  ['System_Administrator', 'Protected system administration group.', permissionCatalog.map(item => item[0]), true],
]

async function audit(db, actorId, action, targetType, targetId, previousValue, newValue, correlationId = crypto.randomUUID()) {
  await db.prepare('INSERT INTO auth_audit_logs (id,actor_id,action,target_type,target_id,previous_value,new_value,correlation_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id(), actorId, action, targetType, targetId, previousValue == null ? null : JSON.stringify(previousValue), newValue == null ? null : JSON.stringify(newValue), correlationId, now())
}

export async function ensureAuthorizationData() {
  const db = await getPostgresRuntime('database'), timestamp = now()
  await db.exec('BEGIN')
  try {
    const permissionInsert = db.prepare('INSERT INTO auth_permissions (id,category,label,description,sensitive) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET category=EXCLUDED.category,label=EXCLUDED.label,description=EXCLUDED.description,sensitive=EXCLUDED.sensitive')
    for (const [permissionId, category, label, description, sensitive = false] of permissionCatalog) await permissionInsert.run(permissionId, category, label, description, sensitive)
    for (const [name, description, permissions, systemGroup = false] of defaultGroups) {
      let group = await db.prepare('SELECT * FROM auth_groups WHERE name = ?').get(name)
      let created = false
      if (!group) { const groupId = id(); await db.prepare('INSERT INTO auth_groups (id,name,description,enabled,system_group,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(groupId, name, description, true, systemGroup, timestamp, timestamp); group = { id: groupId }; created = true }
      // Seed editable default groups once. The protected system group tracks
      // newly introduced permissions so upgrades cannot lock administrators
      // out of new management modules.
      if (created || systemGroup) {
        const link = db.prepare('INSERT INTO auth_group_permissions (group_id,permission_id,created_at,created_by) VALUES (?,?,?,?) ON CONFLICT DO NOTHING')
        for (const permissionId of permissions) await link.run(group.id, permissionId, timestamp, 'system')
      }
    }
    await db.exec('COMMIT')
  } catch (error) { await db.exec('ROLLBACK'); throw error }
  return db
}

export async function ensureBootstrapMembership(user) {
  const db = await ensureAuthorizationData()
  if (!user?.id || user.role === 'disabled') return db
  const bootstrapped = await db.prepare('SELECT 1 FROM auth_user_bootstrap WHERE user_id = ?').get(user.id)
  if (bootstrapped) return db
  const groupName = ['super_admin', 'admin', 'it_support'].includes(user.role) ? 'System_Administrator' : user.role === 'content_manager' ? 'Content_Manager' : user.role === 'staff' ? 'Staff_Support' : null
  await db.exec('BEGIN')
  try {
    if (groupName) {
      const group = await db.prepare('SELECT id FROM auth_groups WHERE name = ?').get(groupName)
      if (!group) throw new Error(`Default authorization group unavailable: ${groupName}`)
      await db.prepare('INSERT INTO auth_user_groups (user_id,group_id,created_at,created_by) VALUES (?,?,?,?) ON CONFLICT DO NOTHING').run(user.id, group.id, now(), 'system-migration')
    }
    await db.prepare('INSERT INTO auth_user_bootstrap (user_id,created_at) VALUES (?,?) ON CONFLICT DO NOTHING').run(user.id, now())
    await db.exec('COMMIT')
  } catch (error) { await db.exec('ROLLBACK'); throw error }
  return db
}

function readPath(source, path) { return String(path || '').split('.').reduce((value, key) => value?.[key], source) }
function policyMatches(condition, user, resource) {
  if (!condition || !Object.keys(condition).length) return true
  if (Array.isArray(condition.all)) return condition.all.every(item => policyMatches(item, user, resource))
  if (Array.isArray(condition.any)) return condition.any.some(item => policyMatches(item, user, resource))
  const resourceField = condition.resource_field || condition.resourceField
  const userField = condition.user_field || condition.userField
  if (resourceField && userField) return readPath(resource, resourceField) === readPath(user, userField)
  return Object.entries(condition).every(([left, right]) => {
    const actual = left.startsWith('resource.') ? readPath(resource, left.slice(9)) : readPath(resource, left)
    const expected = typeof right === 'string' && right.startsWith('user.') ? readPath(user, right.slice(5)) : right
    return actual === expected
  })
}

export async function effectiveAccessFor(user, resource = null) {
  const db = await ensureBootstrapMembership(user)
  const groups = await db.prepare('SELECT g.* FROM auth_groups g JOIN auth_user_groups ug ON ug.group_id=g.id WHERE ug.user_id=? AND g.enabled=TRUE AND g.archived_at IS NULL ORDER BY g.name').all(user.id)
  const entries = new Map()
  for (const group of groups) {
    const permissions = await db.prepare('SELECT p.* FROM auth_permissions p JOIN auth_group_permissions gp ON gp.permission_id=p.id WHERE gp.group_id=?').all(group.id)
    const policies = await db.prepare('SELECT p.* FROM auth_policies p JOIN auth_group_policies gp ON gp.policy_id=p.id WHERE gp.group_id=? AND p.enabled=TRUE').all(group.id)
    for (const permission of permissions) {
      const applicable = policies.filter(policy => !policy.permission_id || policy.permission_id === permission.id)
      let allowed = true
      const policyTrace = []
      for (const policy of applicable) {
        let condition = {}; try { condition = typeof policy.condition_json === 'string' ? JSON.parse(policy.condition_json || '{}') : (policy.condition_json || {}) } catch { condition = { invalid: true } }
        const matches = resource === null ? null : policyMatches(condition, user, resource)
        policyTrace.push({ id: policy.id, name: policy.name, effect: policy.effect, matched: matches })
        if (resource !== null && ((policy.effect === 'deny' && matches) || (policy.effect === 'allow' && !matches))) allowed = false
      }
      const current = entries.get(permission.id) || { id: permission.id, category: permission.category, label: permission.label, description: permission.description, allowed: false, denied: false, sources: [] }
      current.allowed ||= allowed
      current.denied ||= !allowed
      current.sources.push({ groupId: group.id, group: group.name, allowed, policies: policyTrace })
      entries.set(permission.id, current)
    }
  }
  const permissions = [...entries.values()].map(permission => ({ ...permission, allowed: permission.allowed && !permission.denied })).sort((a, b) => a.id.localeCompare(b.id))
  return { groups, permissions }
}

export async function hasAccess(user, permission, resource = null) {
  if (!user) return false
  const effective = await effectiveAccessFor(user, resource)
  return effective.permissions.some(item => item.id === permission && item.allowed)
}

export async function requireAccess(user, permission, resource = null) {
  if (!await hasAccess(user, permission, resource)) { const error = new Error(`Permission required: ${permission}`); error.status = 403; throw error }
}

export { audit }
