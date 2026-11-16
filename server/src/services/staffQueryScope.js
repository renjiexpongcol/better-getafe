import { effectiveAccessFor } from './authorizationService.js'
import { getPostgresRuntime } from '../repositories/postgresRuntime.js'

const fail = message => { const error = new Error(message); error.status = 400; throw error }
const pathValue = (object, path) => String(path || '').split('.').reduce((value, key) => value?.[key], object)
const pattern = value => String(value).replace(/[!%_]/g, character => `!${character}`)

// Compile the same editable resource policies used by requireAccess, before
// aggregation/pagination. Only server-owned SQL expressions enter this map.
export function compileResourcePolicy(condition, user, fields, details = null) {
  const values = []
  const field = path => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_.]{0,159}$/.test(path)) throw new Error('Unsupported resource policy field.')
    const parts = path.split('.'), root = parts.shift()
    if(!fields[root]&&!details)throw new Error('Unsupported resource policy field.')
    if(fields[root] && ['submitted_at','created_at','updated_at','last_updated','completed_at','closed_at','due_at'].includes(root))throw new Error('Date resource policies require administrator review.');
    const expression = fields[root] ? `COALESCE(to_jsonb(${fields[root]}),'null'::jsonb)` : details ? `${details}->'${root}'` : 'NULL::jsonb'
    return parts.length ? `(${expression})#>'{${parts.join(',')}}'` : expression
  }
  const compare = (path, expected, operator = 'equals') => {
    const expression = field(path)
    if (['equals', 'not_equals'].includes(operator)) {
      if(expected!==null&&typeof expected==='object')return operator==='not_equals'?'TRUE':'FALSE';
      values.push(expected === undefined ? null : JSON.stringify(expected))
      return `(${expression} IS ${operator === 'not_equals' ? '' : 'NOT '}DISTINCT FROM ?::jsonb)`
    }
    if (['contains', 'starts_with', 'ends_with'].includes(operator)) {
      values.push(`${operator !== 'starts_with' ? '%' : ''}${pattern(expected ?? '').toLowerCase()}${operator !== 'ends_with' ? '%' : ''}`)
      return `(CASE WHEN jsonb_typeof(${expression}) IN ('object','array') THEN NULL ELSE lower(COALESCE(${expression}#>>'{}','')) END LIKE ? ESCAPE '!')`
    }
    const operators = { greater_than: '>', greater_or_equal: '>=', less_than: '<', less_or_equal: '<=' }
    if (!operators[operator]) throw new Error('Unsupported resource policy operator.')
    const number = Number(expected)
    if (!Number.isFinite(number)) return 'FALSE'
    values.push(number)
    return `(CASE WHEN COALESCE(${expression}#>>'{}','') ~ '^[+-]{0,1}[0-9]+([.][0-9]+){0,1}$' THEN (${expression}#>>'{}')::numeric ELSE NULL END ${operators[operator]} ?)`
  }
  const visit = node => {
    if (!node || !Object.keys(node).length) return 'TRUE'
    if (Array.isArray(node.all)) return `(${node.all.map(visit).join(' AND ') || 'TRUE'})`
    if (Array.isArray(node.any)) return `(${node.any.map(visit).join(' OR ') || 'FALSE'})`
    const resourceField = node.resource_field || node.resourceField
    const userField = node.user_field || node.userField
    if (resourceField && node.operator) return compare(resourceField, node.value_source === 'literal' ? node.value : pathValue(user, node.user_field), node.operator)
    if (resourceField && userField) return compare(resourceField, pathValue(user, userField))
    return `(${Object.entries(node).map(([left, right]) => compare(left.replace(/^resource\./, ''), typeof right === 'string' && right.startsWith('user.') ? pathValue(user, right.slice(5)) : right)).join(' AND ')})`
  }
  return { sql: visit(condition), values }
}

export async function permissionQueryScope(user, permission, fields, details = null, suppliedAccess = null) {
  const access = suppliedAccess || await effectiveAccessFor(user)
  const entry = access.permissions.find(item => item.id === permission && item.allowed)
  if (!entry) return { sql: 'FALSE', values: [], allowed: false }
  const policyIds = [...new Set(entry.sources.flatMap(source => source.policies.map(policy => policy.id)))]
  if (!policyIds.length) return { sql: 'TRUE', values: [], allowed: true }
  const db = await getPostgresRuntime('database')
  const policies = await db.prepare('SELECT id,effect,condition_json FROM auth_policies WHERE id=ANY(?::text[]) AND enabled=TRUE').all(policyIds)
  const predicates = [], values = []
  for (const policy of policies) {
    let condition
    try { condition = typeof policy.condition_json === 'string' ? JSON.parse(policy.condition_json) : policy.condition_json }
    catch { throw Object.assign(new Error('Request access policy is invalid. Contact your administrator.'), { status: 403 }) }
    let scope
    try { scope = compileResourcePolicy(condition, user, fields, details) }
    catch { throw Object.assign(new Error('Request access policy is unsupported. Contact your administrator.'), { status: 403 }) }
    predicates.push(policy.effect === 'deny' ? `NOT (${scope.sql})` : `(${scope.sql})`)
    values.push(...scope.values)
  }
  // Existing effectiveAccessFor uses deny precedence across all granting groups.
  return { sql: predicates.join(' AND ') || 'FALSE', values, allowed: true }
}

export function validatedStaffQuery(query = {}, statuses = []) {
  const scalar = key => { if (query[key] !== undefined && typeof query[key] !== 'string') fail('Invalid filter.'); return query[key] || '' }
  const integer = (key, fallback, max) => { const raw = scalar(key); if (raw && (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > max)) fail('Invalid pagination.'); return raw ? Number(raw) : fallback }
  const search = scalar('search').trim()
  if (search.length > 100 || /[\0\r\n]/.test(search)) fail('Search must be at most 100 characters.')
  const status = scalar('status'), assigned = scalar('assigned'), sort = scalar('sort') || 'submitted_desc'
  if (status && statuses.length && !statuses.includes(status)) fail('Choose a supported status.')
  if (assigned && !['me', 'unassigned'].includes(assigned)) fail('Choose a supported assignment filter.')
  if (!['submitted_desc','submitted_asc','updated_desc','updated_asc','priority'].includes(sort)) fail('Choose a supported sort order.')
  const from = scalar('from'), to = scalar('to')
  for (const date of [from, to]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date)) fail('Choose a valid date.')
  if (from && to && from > to) fail('The end date must follow the start date.')
  const service=scalar('service'),service_id=scalar('service_id'),department_id=scalar('department_id')
  if(service.length>160||department_id.length>200)fail('Choose a supported service or department.')
  if(service_id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(service_id))fail('Choose a supported service.')
  return { page: integer('page',1,100000), limit: integer('limit',20,100), search, status, assigned, sort, from, to, service,service_id,department_id }
}

export const legacyPolicyFields = Object.fromEntries(['id','user_id','reference_number','service_name','status','payment_status','submitted_at','last_updated','completed_at','closed_at','closed_by','department_id','assigned_user_id','version','due_at'].map(key => [key, `a.${key}`]))
export const eservicePolicyFields = Object.fromEntries(['id','request_number','service_id','applicant_user_id','department_id','status','assigned_user_id','submitted_at','created_at','updated_at','version','due_at','completed_at','payment_required','configuration_revision'].map(key => [key, `r.${key}`]))
