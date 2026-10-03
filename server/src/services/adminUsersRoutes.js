import { provisionEmployee, getEmployeeProfile, updateEmployeePersonnel } from './employeeProvisioning.js';
import { getCmsUsers } from '../repositories/cmsUserRepository.js';
import { config } from '../config/index.js';
import { allPermissions, cmsRoles, permissionsFor } from '../config/permissions.js';
import { sendEmail } from './email.js';
import { ensureAuthorizationData, requireAccess, effectiveAccessFor } from './authorizationService.js';
import { passwordMeetsPolicy } from './passwordPolicy.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const safeAdminUserError = (error, fallback) => [400, 401, 403, 404, 409, 422].includes(Number(error?.status))
  ? String(error.message || fallback)
  : fallback;

export function buildStaffWelcomeEmail({ name, email, portalName, signInUrl, roleLabel }) {
  const resetUrl = `${signInUrl}/auth/forgot-password`;
  const text = `Hello ${name},\n\nYour ${portalName} staff account is ready.\n\nSign in: ${signInUrl}/auth/login\nEmail: ${email}\nRole: ${roleLabel}\n\nFor your security, set your password from the sign-in page using “Forgot password”. We will email you a verification code to confirm your address. Do not share that code with anyone. If you did not expect this account, contact the municipal administrator.\n\nRegards,\n${portalName}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f7fb;color:#18334e;font-family:Arial,Helvetica,sans-serif"><div style="max-width:620px;margin:30px auto;padding:0 16px"><div style="overflow:hidden;border:1px solid #dce6ef;border-radius:14px;background:#fff;box-shadow:0 8px 24px rgba(24,51,78,.08)"><div style="padding:26px 30px;background:#123c67;color:#fff"><div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:.8">${escapeHtml(portalName)}</div><h1 style="margin:9px 0 0;font-size:25px;line-height:1.2">Your staff account is ready</h1></div><div style="padding:30px"><p style="margin:0 0 16px;font-size:16px">Hello ${escapeHtml(name)},</p><p style="margin:0 0 22px;color:#58718a;line-height:1.6">An account has been created for you to access the ${escapeHtml(portalName)} municipal staff workspace.</p><div style="padding:18px;border:1px solid #dce8f2;border-radius:10px;background:#f7fbff"><p style="margin:0 0 10px;font-size:12px;color:#6c849a;text-transform:uppercase;letter-spacing:.8px;font-weight:bold">Account details</p><p style="margin:7px 0"><strong>Email:</strong> ${escapeHtml(email)}</p><p style="margin:7px 0"><strong>Role:</strong> ${escapeHtml(roleLabel)}</p></div><p style="margin:24px 0"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 18px;border-radius:7px;background:#1677d2;color:#fff;text-decoration:none;font-weight:bold">Set your password</a></p><div style="padding-top:18px;border-top:1px solid #e5edf4;color:#667e94;font-size:13px;line-height:1.6">Use “Forgot password” on the sign-in page and enter the verification code sent to your email. Never share that code. If you did not expect this account, contact the municipal administrator.</div></div></div><p style="margin:18px 0;text-align:center;color:#8194a5;font-size:11px">This is an automated message from ${escapeHtml(portalName)}.</p></div></body></html>`;
  return { text, html };
}

export function validateAccountChange(actor, target, values) {
  if (!values || typeof values.name !== 'string' || !values.name.trim() || values.name.length > 160) throw new Error('Enter a name of up to 160 characters.');
  if (![...cmsRoles, 'disabled'].includes(values.role)) throw new Error('Select a valid role.');
  if (target?.id === actor.id) throw new Error('Your own account is protected against access changes.');
  if (actor.role !== 'super_admin' && (target?.role === 'super_admin' || values.role === 'super_admin')) throw new Error('Only a super administrator can manage super administrators.');
  if ((!target || values.email !== undefined) && (typeof values.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || values.email.length > 254)) throw new Error('Enter a valid email address.');
  if (!target && values.password !== undefined && !passwordMeetsPolicy(values.password, config.get('authentication.passwordMinLength'))) throw new Error(`Use at least ${config.get('authentication.passwordMinLength')} characters with uppercase, lowercase, a number, and a special character. Avoid common passwords.`);
}

export function installAdminUsersRoutes(app, admin) {
  app.use('/api/admin/users', admin, async (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      const allowed = new Set([config.get('general.url'), process.env.PUBLIC_SITE_URL, ...(process.env.API_CORS_ORIGINS || '').split(',')].map(value => { try { return value ? new URL(value).origin : '' } catch { return '' } }).filter(Boolean));
      if (process.env.NODE_ENV !== 'production') allowed.add('http://localhost:5173');
      if (req.get('origin') && !allowed.has(req.get('origin'))) return res.status(403).json({ error: 'Cross-origin account changes are not allowed.' });
      if (!req.is('application/json')) return res.status(415).json({ error: 'Use application/json.' });
    }
    try { await requireAccess(req.admin, ['GET', 'HEAD'].includes(req.method) ? 'users.view' : 'users.manage'); }
    catch (error) { return res.status(error.status || 403).json({ error: safeAdminUserError(error, 'Access denied.') }); }
    next();
  });
  app.get('/api/admin/users', async (req, res) => {
    try { res.json({ users: (await getCmsUsers()).map(user => ({ id: user.id, name: user.name, email: user.email, role: user.role, eid: user.eid, department: user.department, position: user.position, createdAt: user.created_at, permissions: permissionsFor(user) })), permissions: allPermissions, canGrantSuper: req.admin.role === 'super_admin' }); }
    catch { res.status(503).json({ error: 'Accounts are currently unavailable.' }); }
  });
  app.get('/api/admin/users/:id/profile', async (req,res) => {
    try { const profile = await getEmployeeProfile(req.params.id); if (!profile) return res.status(404).json({ error:'Employee not found.' }); res.json(profile); }
    catch { res.status(503).json({ error:'Employee profile is unavailable.' }); }
  });
  app.patch('/api/admin/users/:id/profile', async (req,res) => {
    try {
      const target = (await getCmsUsers()).find(user => user.id === req.params.id);
      if (!target) return res.status(404).json({ error:'Employee not found.' });
      if (target.role === 'super_admin' && req.admin.role !== 'super_admin') return res.status(403).json({ error:'Only a super administrator can modify this employee.' });
      await updateEmployeePersonnel(req.params.id,req.body,req.admin); res.json({ saved:true });
    }
    catch (error) { res.status(error.status || 503).json({ error:safeAdminUserError(error,'Employee profile could not be saved.') }); }
  });
  const save = async (req, res) => {
    try {
      const users = await getCmsUsers();
      const target = req.params.id ? users.find(user => user.id === req.params.id) : null;
      if (req.params.id && !target) return res.status(404).json({ error: 'Account not found.' });
      try {
        validateAccountChange(req.admin, target, req.body);
      } catch (error) { return res.status(400).json({ error: error.message || 'Account details are invalid.' }); }
      if (!target && users.some(user => user.email.toLowerCase() === req.body.email.trim().toLowerCase())) return res.status(409).json({ error: 'This email already has an account.' });
      for (const field of ['department','position']) if ((!target || req.body[field] !== undefined) && (typeof req.body[field] !== 'string' || !req.body[field].trim() || req.body[field].length > 160)) return res.status(422).json({ error: 'Enter the employee department and position.' });
      let groupIds = req.body.group_ids;
      if (groupIds !== undefined && (!Array.isArray(groupIds) || groupIds.length > 30 || groupIds.some(value => typeof value !== 'string'))) return res.status(422).json({ error:'Select valid permission groups.' });
      const db = await ensureAuthorizationData();
      if (!target && !groupIds?.length) {
        const groupName = req.body.role === 'content_manager' ? 'Content_Manager' : ['admin','super_admin','it_support'].includes(req.body.role) ? 'System_Administrator' : 'Staff_Support';
        const group = await db.prepare('SELECT id FROM auth_groups WHERE name=? AND enabled=TRUE AND archived_at IS NULL').get(groupName);
        if (!group) return res.status(422).json({ error:'Default permission group is unavailable.' });
        groupIds = [group.id];
      }
      let grantablePermissions;
      if (!target && groupIds?.length) {
        await requireAccess(req.admin,'groups.manage');
        const access = await effectiveAccessFor(req.admin);
        grantablePermissions = access.permissions.filter(permission => permission.allowed).map(permission => permission.id);
        for (const groupId of new Set(groupIds)) {
          const group = await db.prepare('SELECT id FROM auth_groups WHERE id=? AND enabled=TRUE AND archived_at IS NULL').get(groupId);
          if (!group) return res.status(422).json({ error:'Selected permission group is unavailable.' });
          const grants = await db.prepare('SELECT permission_id FROM auth_group_permissions WHERE group_id=?').all(groupId);
          if (grants.some(grant => !access.permissions.some(permission => permission.id === grant.permission_id && permission.allowed))) return res.status(403).json({ error:'You cannot grant permissions you do not hold.' });
        }
      }
      const email = req.body.email?.trim().toLowerCase();
      const { id, eid } = await provisionEmployee({ ...req.body, grantablePermissions, group_ids:groupIds, department:req.body.department ?? target?.department, position:req.body.position ?? target?.position, name:req.body.name.trim(), email:email ?? target?.email }, target?.id, req.admin);
      if (!target) {
        try {
          const portalName = config.get('general.name');
          const signInUrl = config.get('general.url') || 'http://localhost:5173';
          const roleLabel = req.body.role === 'staff' ? 'Municipal staff' : req.body.role === 'super_admin' ? 'Super administrator' : 'Administrator';
          const { text, html } = buildStaffWelcomeEmail({ name: req.body.name.trim(), email, portalName, signInUrl, roleLabel });
          await sendEmail(email, `${portalName} · Your staff account is ready`, text, undefined, undefined, [], html);
          return res.status(201).json({ id, eid, saved: true, emailSent: true });
        } catch (error) {
          return res.status(201).json({ id, eid, saved: true, emailSent: false, warning: 'Account created, but the welcome email could not be sent. Verify SMTP settings and ask the employee to use Forgot password.' });
        }
      }
      res.status(200).json({ id, eid, saved: true });
    } catch (error) { res.status(error.code === '23505' ? 409 : error.status || 503).json({ error:error.code === '23505' ? 'This email already has an account.' : safeAdminUserError(error,'Account could not be saved. Please try again.') }); }
  };
  app.post('/api/admin/users', save);
  app.patch('/api/admin/users/:id', save);
}
