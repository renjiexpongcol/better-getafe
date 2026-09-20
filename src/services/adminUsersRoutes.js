import { getCmsUsers, saveCmsAccount } from '../repositories/cmsUserRepository.js';
import { config } from '../config/index.js';
import { allPermissions, cmsRoles, permissionsFor } from '../config/permissions.js';
import { sendEmail } from './email.js';
import { ensureAuthorizationData, requireAccess } from './authorizationService.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

export function validateAccountChange(actor, target, values) {
  if (!values || typeof values.name !== 'string' || !values.name.trim() || values.name.length > 160) throw new Error('Enter a name of up to 160 characters.');
  if (![...cmsRoles, 'disabled'].includes(values.role)) throw new Error('Select a valid role.');
  if (target?.id === actor.id) throw new Error('Your own account is protected against access changes.');
  if (actor.role !== 'super_admin' && (target?.role === 'super_admin' || values.role === 'super_admin')) throw new Error('Only a super administrator can manage super administrators.');
  if (!target && (typeof values.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || values.email.length > 254)) throw new Error('Enter a valid email address.');
  if (!target && (typeof values.password !== 'string' || values.password.length < 12 || values.password.length > 128)) throw new Error('Use an initial password between 12 and 128 characters.');
}

export function installAdminUsersRoutes(app, admin) {
  app.use('/api/admin/users', admin, async (req, res, next) => {
    try { await requireAccess(req.admin, ['GET', 'HEAD'].includes(req.method) ? 'users.view' : 'users.manage'); }
    catch (error) { return res.status(error.status || 403).json({ error: error.message }); }
    if (!['GET', 'HEAD'].includes(req.method)) {
      const allowed = new Set([`${req.protocol}://${req.get('host')}`]);
      if (config.get('general.url')) allowed.add(new URL(config.get('general.url')).origin);
      if (process.env.NODE_ENV !== 'production') allowed.add('http://localhost:5173');
      if ((req.get('origin') && !allowed.has(req.get('origin'))) || req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'Cross-origin account changes are not allowed.' });
      if (!req.is('application/json')) return res.status(415).json({ error: 'Use application/json.' });
    }
    next();
  });
  app.get('/api/admin/users', async (req, res) => {
    try { res.json({ users: (await getCmsUsers()).map(user => ({ id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.created_at, permissions: permissionsFor(user) })), permissions: allPermissions, canGrantSuper: req.admin.role === 'super_admin' }); }
    catch { res.status(503).json({ error: 'Accounts are currently unavailable.' }); }
  });
  const save = async (req, res) => {
    try {
      const users = await getCmsUsers();
      const target = req.params.id ? users.find(user => user.id === req.params.id) : null;
      if (req.params.id && !target) return res.status(404).json({ error: 'Account not found.' });
      try {
        validateAccountChange(req.admin, target, req.body);
      } catch (error) { return res.status(400).json({ error: error.message }); }
      if (!target && users.some(user => user.email.toLowerCase() === req.body.email.trim().toLowerCase())) return res.status(409).json({ error: 'This email already has an account.' });
      const email = req.body.email?.trim().toLowerCase();
      const id = await saveCmsAccount({ ...req.body, name: req.body.name.trim(), email }, target?.id);
      if (!target) {
        // New accounts are group-first: mark the legacy role migration as
        // handled so their access comes only from explicit group membership.
        const authorizationDb = await ensureAuthorizationData();
        authorizationDb.prepare('INSERT OR IGNORE INTO auth_user_bootstrap (user_id,created_at) VALUES (?,datetime(\'now\'))').run(id);
        try {
          const portalName = config.get('general.name');
          const signInUrl = config.get('general.url') || 'http://localhost:5173';
          const roleLabel = req.body.role === 'staff' ? 'Municipal staff' : req.body.role === 'super_admin' ? 'Super administrator' : 'Administrator';
          const text = `Hello ${req.body.name.trim()},\n\nYour ${portalName} staff account is ready.\n\nSign in: ${signInUrl}/auth/login\nEmail: ${email}\nTemporary password: ${req.body.password}\nRole: ${roleLabel}\n\nFor your security, sign in as soon as possible and change the temporary password. Never share your password or this email. If you did not expect this account, contact the municipal administrator.\n\nRegards,\n${portalName}`;
          const html = `<!doctype html><html><body style="margin:0;background:#f3f7fb;color:#18334e;font-family:Arial,Helvetica,sans-serif"><div style="max-width:620px;margin:30px auto;padding:0 16px"><div style="overflow:hidden;border:1px solid #dce6ef;border-radius:14px;background:#fff;box-shadow:0 8px 24px rgba(24,51,78,.08)"><div style="padding:26px 30px;background:#123c67;color:#fff"><div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:.8">${escapeHtml(portalName)}</div><h1 style="margin:9px 0 0;font-size:25px;line-height:1.2">Your staff account is ready</h1></div><div style="padding:30px"><p style="margin:0 0 16px;font-size:16px">Hello ${escapeHtml(req.body.name.trim())},</p><p style="margin:0 0 22px;color:#58718a;line-height:1.6">An account has been created for you to access the ${escapeHtml(portalName)} municipal staff workspace.</p><div style="padding:18px;border:1px solid #dce8f2;border-radius:10px;background:#f7fbff"><p style="margin:0 0 10px;font-size:12px;color:#6c849a;text-transform:uppercase;letter-spacing:.8px;font-weight:bold">Account details</p><p style="margin:7px 0"><strong>Email:</strong> ${escapeHtml(email)}</p><p style="margin:7px 0"><strong>Temporary password:</strong> <span style="font-family:monospace;color:#123c67">${escapeHtml(req.body.password)}</span></p><p style="margin:7px 0"><strong>Role:</strong> ${escapeHtml(roleLabel)}</p></div><p style="margin:24px 0"><a href="${escapeHtml(signInUrl)}/auth/login" style="display:inline-block;padding:12px 18px;border-radius:7px;background:#1677d2;color:#fff;text-decoration:none;font-weight:bold">Sign in to the portal</a></p><div style="padding-top:18px;border-top:1px solid #e5edf4;color:#667e94;font-size:13px;line-height:1.6"><strong style="color:#18334e">Keep your account secure</strong><br>Change the temporary password after signing in. Never share your password or this email. If you did not expect this account, contact the municipal administrator.</div></div></div><p style="margin:18px 0;text-align:center;color:#8194a5;font-size:11px">This is an automated message from ${escapeHtml(portalName)}.</p></div></body></html>`;
          await sendEmail(email, `${portalName} · Your staff account is ready`, text, undefined, undefined, [], html);
          return res.status(201).json({ id, saved: true, emailSent: true });
        } catch (error) {
          return res.status(201).json({ id, saved: true, emailSent: false, warning: 'Account created, but the welcome email could not be sent. Verify SMTP settings and provide the initial password securely.' });
        }
      }
      res.status(200).json({ id, saved: true });
    } catch { res.status(503).json({ error: 'Account could not be saved. Please try again.' }); }
  };
  app.post('/api/admin/users', save);
  app.patch('/api/admin/users/:id', save);
}
