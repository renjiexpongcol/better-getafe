import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { installAdminUsersRoutes, validateAccountChange } from '../src/services/adminUsersRoutes.js';
import { config } from '../src/config/index.js';
import { authorizeChanges } from '../src/config/permissions.js';

const actor = { id: 'operator', role: 'admin' };
const target = { id: 'other', role: 'admin' };
const values = { name: 'Test account', role: 'admin', email: 'test@example.com', password: 'test-password-long' };
test('self access cannot be changed, including disabling the final operator', () => {
  assert.throws(() => validateAccountChange(actor, actor, { ...values, role: 'disabled' }), /own account/);
});
test('ordinary administrators cannot promote or modify super administrators', () => {
  assert.throws(() => validateAccountChange(actor, target, { ...values, role: 'super_admin' }), /Only a super/);
  assert.throws(() => validateAccountChange(actor, { ...target, role: 'super_admin' }, values), /Only a super/);
});
test('super administrators can assign roles to other accounts', () => {
  assert.doesNotThrow(() => validateAccountChange({ ...actor, role: 'super_admin' }, target, { ...values, role: 'super_admin' }));
});
test('invalid roles, email, and short passwords are rejected', () => {
  for (const patch of [{ role: 'resident' }, { name: '' }, { email: 'invalid' }, { password: 'short' }]) assert.throws(() => validateAccountChange(actor, null, { ...values, ...patch }));
});
test('ordinary administrators cannot remove their own recovery grants', () => {
  assert.throws(() => authorizeChanges(actor, { 'security.permissionGrants': JSON.stringify({ operator: [] }) }), /own settings recovery/);
});
test('user API denies insufficient permissions and cross-origin writes before accessing data', async () => {
  const original = config.get;
  let restricted = true;
  config.get = key => key === 'security.permissionGrants' ? JSON.stringify({ operator: restricted ? ['settings.view'] : undefined }) : original.call(config, key);
  const app = express(); app.use(express.json());
  installAdminUsersRoutes(app, (req, res, next) => { req.admin = actor; next(); });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/admin/users`;
  try {
    assert.equal((await fetch(url)).status, 403);
    restricted = false;
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: JSON.stringify(values) })).status, 403);
    assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 415);
  } finally { config.get = original; await new Promise(resolve => server.close(resolve)); }
});
