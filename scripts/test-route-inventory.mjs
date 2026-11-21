import test from 'node:test'
import assert from 'node:assert/strict'
import { discoverRoutes } from './route-inventory.mjs'

test('API route inventory resolves static route variables and enumerates dynamic handlers', async () => {
  const routes = await discoverRoutes()
  assert.ok(routes.length > 200, `Expected the full server route set, found ${routes.length}`)
  assert.ok(routes.some(route => route.method === 'GET' && route.path === '/api/admin/integration-hub'))
  assert.ok(routes.some(route => route.method === 'POST' && route.path === '/api/integrations/webhooks/:provider'))
  assert.ok(routes.some(route => route.method === 'POST' && route.path.startsWith('/api/admin/integration-hub/installations/:id/')))
  assert.equal(new Set(routes.map(route => `${route.method} ${route.path}`)).size, routes.length, 'Inventory should not contain duplicate method/path pairs')
})
