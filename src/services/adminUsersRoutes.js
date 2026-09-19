import { getCmsUsers, saveCmsAccount } from '../repositories/cmsUserRepository.js';
import { config } from '../config/index.js';
import { allPermissions, cmsRoles, permissionsFor, requirePermission } from '../config/permissions.js';
import { sendEmail } from './email.js';

export function validateAccountChange(actor, target, values) {
  if (!values || typeof values.name !== 'string' || !values.name.trim() || values.name.length > 160) throw new Error('Enter a name of up to 160 characters.');
  if (![...cmsRoles, 'disabled'].includes(values.role)) throw new Error('Select a valid role.');
  if (target?.id === actor.id) throw new Error('Your own account is protected against access changes.');
  if (actor.role !== 'super_admin' && (target?.role === 'super_admin' || values.role === 'super_admin')) throw new Error('Only a super administrator can manage super administrators.');
  if (!target && (typeof values.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || values.email.length > 254)) throw new Error('Enter a valid email address.');
  if (!target && (typeof values.password !== 'string' || values.password.length < 12 || values.password.length > 128)) throw new Error('Use an initial password between 12 and 128 characters.');
}

export function installAdminUsersRoutes(app, admin) {
  app.use('/api/admin/users', admin, (req, res, next) => {
    try { requirePermission(req.admin, 'settings.security.edit'); requirePermission(req.admin, 'settings.edit'); }
    catch { return res.status(403).json({ error: 'User management requires security and settings edit permissions.' }); }
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
        // A newly created administrator inherits full settings permissions.
        if ((!target || target.role === 'disabled') && req.body.role === 'admin' && permissionsFor(req.admin).length !== allPermissions.length) throw new Error('Full settings access is required to create or reactivate an administrator.');
      } catch (error) { return res.status(400).json({ error: error.message }); }
      if (!target && users.some(user => user.email.toLowerCase() === req.body.email.trim().toLowerCase())) return res.status(409).json({ error: 'This email already has an account.' });
      const email = req.body.email?.trim().toLowerCase();
      const id = await saveCmsAccount({ ...req.body, name: req.body.name.trim(), email }, target?.id);
      if (!target) {
        try {
          await sendEmail(email, `${config.get('general.name')} administrator account`, `Hello ${req.body.name.trim()},\n\nAn administrator account has been created for you on the ${config.get('general.name')}.\n\nEmail: ${email}\nInitial password: ${req.body.password}\nRole: ${req.body.role}\n\nPlease sign in and change this password immediately. Keep this message confidential.`);
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
