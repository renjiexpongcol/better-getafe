import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

const actor = { id: 'operator' }
const policy = { id: 'sample', name: 'Sample', description: '', permission_id: 'settings.edit', effect: 'allow', enabled: true, condition_json: {}, updated_at: '2026-01-01T00:00:00Z' }
let permitted, changes, audited, transactions
const db = {
  exec: async operation => transactions.push(operation),
  prepare: sql => ({
    get: async () => sql.includes('auth_policies') ? policy : { exists: true },
    run: async () => ({ changes }),
  }),
}
mock.module('../server/src/services/authorizationService.js', { namedExports: {
  ensureAuthorizationData: async () => db, ensureBootstrapMembership() {}, effectiveAccessFor() {},
  hasAccess: async () => true, requireAccess: async () => { if (!permitted) throw Object.assign(new Error('Forbidden'), { status: 403 }) },
  audit: async () => { audited++ },
} })
const { installAccessManagementRoutes } = await import('../server/src/services/accessManagementRoutes.js')
let patch
installAccessManagementRoutes({ use(){}, get(){}, post(){}, put(){}, delete(){}, patch(path, handler){ if (path.endsWith('/policies/:id')) patch = handler } }, () => {})
for (const [scenario, allowed, count, expected, operations] of [
  ['direct publish blocked', true, 1, 409, []],
  ['missing policy permission', false, 1, 403, []],
]) {
  test(scenario, async () => {
    permitted = allowed
    changes = count
    audited = 0
    transactions = []
    const res = { code: 200, status(value){ this.code = value; return this }, json(){} }
    await patch({ admin: actor, params: { id: policy.id }, body: { name: 'Edited', expected_updated_at: policy.updated_at } }, res)
    assert.equal(res.code, expected)
    assert.deepEqual(transactions, operations)
    assert.equal(audited, Number(expected === 200))
  })
}
