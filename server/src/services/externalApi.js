import crypto from 'node:crypto';
import ipaddr from 'ipaddr.js';
import { getPostgresRuntime } from '../repositories/postgresRuntime.js';
import { id, now } from './identifiers.js';

export const API_SCOPES = Object.freeze(['employees.read', 'departments.read']);
const API_PREFIX = 'gft_live_';

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const safeText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const invalidApiKeyInput = message => Object.assign(new Error(message), { status: 422 });

export function normalizeApiScopes(value) {
  if (!Array.isArray(value) || value.some(scope => typeof scope !== 'string' || !API_SCOPES.includes(scope))) {
    throw invalidApiKeyInput('Select valid API scopes.');
  }
  return [...new Set(value)];
}

export function normalizeIpAllowlist(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalidApiKeyInput('The IP allowlist must be a list of addresses or CIDR ranges.');
  return [...new Set(value.map(item => {
    if (typeof item !== 'string' || item.trim().length > 64) throw invalidApiKeyInput('Enter valid IP addresses or CIDR ranges.');
    const candidate = item.trim();
    if (!candidate) return '';
    try {
      if (candidate.includes('/')) {
        const [network, prefix] = ipaddr.parseCIDR(candidate);
        return `${network.toString()}/${prefix}`;
      }
      return ipaddr.process(candidate).toString();
    } catch {
      throw invalidApiKeyInput('Enter valid IP addresses or CIDR ranges.');
    }
  }).filter(Boolean))];
}

export function ipAllowlistMatches(address, allowlist) {
  if (!Array.isArray(allowlist)) return false;
  try {
    const client = ipaddr.process(address);
    return allowlist.some(entry => {
      try {
        if (entry.includes('/')) return client.match(ipaddr.parseCIDR(entry));
        return client.toString() === ipaddr.process(entry).toString();
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export function parseApiKeyExpiry(value) {
  if (typeof value !== 'string' || !value) throw invalidApiKeyInput('Enter a valid expiration date.');
  let expiresAt;
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, yearText, monthText, dayText] = dateOnly;
    const year = Number(yearText), month = Number(monthText), day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw invalidApiKeyInput('Enter a valid expiration date.');
    }
    expiresAt = new Date(Date.UTC(year, month - 1, day + 1) - 1 - 8 * 60 * 60 * 1000);
  } else {
    expiresAt = new Date(value);
  }
  if (!Number.isFinite(expiresAt.getTime())) throw invalidApiKeyInput('Enter a valid expiration date.');
  return expiresAt;
}

export function createCredential() {
  const keyId = crypto.randomBytes(10).toString('base64url');
  const secret = crypto.randomBytes(32).toString('base64url');
  return { keyId, secret, value: `${API_PREFIX}${keyId}.${secret}`, prefix: `${API_PREFIX}${keyId.slice(0, 8)}` };
}

function oneTime(row, credential) {
  return { id: row.id, keyId: row.key_id, name: row.name, secret: credential.value, secretShownOnce: true, createdAt: row.created_at, expiresAt: row.expires_at, scopes: row.scopes };
}

export async function listExternalApiKeys() {
  const db = await getPostgresRuntime('database');
  return db.prepare(`SELECT id,key_id,key_prefix,name,description,scopes,ip_allowlist,enabled,revoked_at,expires_at,last_used_at,created_at,updated_at FROM external_api_keys ORDER BY created_at DESC`).all();
}

export async function createExternalApiKey(input, actor, ip) {
  const name = safeText(input?.name, 120);
  if (!name) throw Object.assign(new Error('A unique API key name is required.'), { status: 422 });
  const scopes = normalizeApiScopes(input?.scopes);
  if (!scopes.length) throw Object.assign(new Error('Select at least one API scope.'), { status: 422 });
  const expiresAt = input?.expiresAt ? parseApiKeyExpiry(input.expiresAt) : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) throw Object.assign(new Error('The expiration date must be in the future.'), { status: 422 });
  const credential = createCredential();
  const db = await getPostgresRuntime('database');
  const rowId = id();
  try {
    const row = await db.prepare(`INSERT INTO external_api_keys(id,key_id,key_prefix,name,description,scopes,ip_allowlist,secret_hash,expires_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`).get(rowId, credential.keyId, credential.prefix, name, safeText(input?.description, 500), JSON.stringify(scopes), JSON.stringify(normalizeIpAllowlist(input?.ipAllowlist)), digest(credential.secret), expiresAt?.toISOString() || null, actor, now(), now());
    await db.prepare(`INSERT INTO external_api_key_audit(id,api_key_id,actor_id,action,ip_address,metadata) VALUES (?,?,?,?,?,?)`).run(id(), rowId, actor, 'created', ip || null, JSON.stringify({ scopes }));
    return oneTime(row, credential);
  } catch (error) {
    if (error?.code === '23505') throw Object.assign(new Error('An API key with that name already exists.'), { status: 409 });
    throw error;
  }
}

export async function updateExternalApiKey(idValue, input, actor, ip) {
  const db = await getPostgresRuntime('database');
  const row = await db.prepare('SELECT * FROM external_api_keys WHERE id=?').get(idValue);
  if (!row) throw Object.assign(new Error('API key not found.'), { status: 404 });
  if (input?.enabled !== undefined && typeof input.enabled !== 'boolean') throw invalidApiKeyInput('Enabled must be true or false.');
  const enabled = input?.enabled === undefined ? row.enabled : Boolean(input.enabled);
  const scopes = input?.scopes === undefined ? row.scopes : normalizeApiScopes(input.scopes);
  if (!scopes.length) throw Object.assign(new Error('Select at least one API scope.'), { status: 422 });
  await db.prepare('UPDATE external_api_keys SET description=?,scopes=?,ip_allowlist=?,enabled=?,updated_at=? WHERE id=?').run(safeText(input?.description ?? row.description, 500), JSON.stringify(scopes), JSON.stringify(input?.ipAllowlist === undefined ? row.ip_allowlist : normalizeIpAllowlist(input.ipAllowlist)), enabled, now(), idValue);
  await db.prepare('INSERT INTO external_api_key_audit(id,api_key_id,actor_id,action,ip_address,metadata) VALUES (?,?,?,?,?,?)').run(id(), idValue, actor, enabled ? 'enabled' : 'disabled', ip || null, JSON.stringify({ scopes }));
  return db.prepare('SELECT id,key_id,key_prefix,name,description,scopes,ip_allowlist,enabled,revoked_at,expires_at,last_used_at,created_at,updated_at FROM external_api_keys WHERE id=?').get(idValue);
}

export async function revokeExternalApiKey(idValue, actor, ip) {
  const db = await getPostgresRuntime('database');
  const row = await db.prepare('SELECT id FROM external_api_keys WHERE id=?').get(idValue);
  if (!row) throw Object.assign(new Error('API key not found.'), { status: 404 });
  await db.prepare('UPDATE external_api_keys SET enabled=FALSE,revoked_at=?,updated_at=? WHERE id=?').run(now(), now(), idValue);
  await db.prepare('INSERT INTO external_api_key_audit(id,api_key_id,actor_id,action,ip_address) VALUES (?,?,?,?,?)').run(id(), idValue, actor, 'revoked', ip || null);
  return { revoked: true };
}

export async function rotateExternalApiKey(idValue, actor, ip) {
  const db = await getPostgresRuntime('database');
  const current = await db.prepare('SELECT * FROM external_api_keys WHERE id=?').get(idValue);
  if (!current) throw Object.assign(new Error('API key not found.'), { status: 404 });
  const credential = createCredential();
  const rotated = now();
  const row = await db.prepare('UPDATE external_api_keys SET key_id=?,key_prefix=?,secret_hash=?,enabled=TRUE,revoked_at=NULL,created_at=?,updated_at=? WHERE id=? RETURNING *').get(credential.keyId, credential.prefix, digest(credential.secret), rotated, rotated, idValue);
  await db.prepare('INSERT INTO external_api_key_audit(id,api_key_id,actor_id,action,ip_address) VALUES (?,?,?,?,?)').run(id(), idValue, actor, 'rotated', ip || null);
  return oneTime(row, credential);
}

function parseCredential(value) {
  const token = String(value || '').replace(/^Bearer\s+/i, '').trim();
  const match = token.match(/^gft_live_([A-Za-z0-9_-]{14})\.([A-Za-z0-9_-]{43})$/);
  return match ? { keyId: match[1], secret: match[2] } : null;
}

export async function authenticateExternalApi(req, requiredScope) {
  const credential = parseCredential(req.get('x-api-key') || req.get('authorization'));
  if (!credential) return { status: 401, error: 'API authentication required.' };
  const db = await getPostgresRuntime('database');
  const row = await db.prepare('SELECT * FROM external_api_keys WHERE key_id=? AND enabled=TRUE AND revoked_at IS NULL').get(credential.keyId);
  if (!row || (row.expires_at && new Date(row.expires_at) <= new Date()) || !crypto.timingSafeEqual(Buffer.from(row.secret_hash, 'hex'), Buffer.from(digest(credential.secret), 'hex'))) return { status: 401, error: 'Invalid API credentials.' };
  const scopes = Array.isArray(row.scopes) ? row.scopes : JSON.parse(row.scopes || '[]');
  if (requiredScope && !scopes.includes(requiredScope)) return { status: 403, error: 'The API key is not authorized for this operation.' };
  const allowedIps = Array.isArray(row.ip_allowlist) ? row.ip_allowlist : JSON.parse(row.ip_allowlist || '[]');
  if (allowedIps.length && !ipAllowlistMatches(req.ip, allowedIps)) return { status: 403, error: 'The API key is not allowed from this network.' };
  await db.prepare('UPDATE external_api_keys SET last_used_at=?,last_used_ip=?,updated_at=? WHERE id=?').run(now(), req.ip || null, now(), row.id);
  return { row, scopes };
}

export function publicEmployee(row) {
  return { employeeId: row.eid, firstName: row.first_name || '', middleName: row.middle_name || '', lastName: row.last_name || '', suffix: row.suffix || '', email: row.email, contactNumber: row.phone || '', department: row.department || '', division: row.division || '', position: row.position || '', employmentStatus: row.employment_status || '', employmentType: row.employment_type || '', dateHired: row.hire_date || null, officeAssignment: row.office_assignment || '', supervisor: row.supervisor_name || '' };
}

export async function listEmployees({ idValue, limit = 50, offset = 0 } = {}) {
  const db = await getPostgresRuntime('database');
  const query = `SELECT u.email,u.name AS full_name,split_part(u.name,' ',1) AS first_name,split_part(u.name,' ',array_length(string_to_array(u.name,' '),1)) AS last_name,e.* ,s.name AS supervisor_name FROM employee_profiles e JOIN users u ON u.id=e.user_id LEFT JOIN users s ON s.id=e.supervisor_id WHERE ($1::text IS NULL OR e.eid=$1) ORDER BY e.eid LIMIT $2 OFFSET $3`;
  return db.prepare(query).all(idValue || null, limit, offset);
}
