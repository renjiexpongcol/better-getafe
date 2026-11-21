import assert from 'node:assert/strict'
import test from 'node:test'
import { createPostgresResource } from '../server/src/services/postgres.js'

test('reusing a physical PostgreSQL connection acquires one write lock per checkout', async t => {
  const previous = process.env.CMS_SUPABASE_DATABASE_URL
  process.env.CMS_SUPABASE_DATABASE_URL = 'postgresql://test:fixture@db.example.supabase.co/postgres'
  t.after(() => {
    if (previous === undefined) delete process.env.CMS_SUPABASE_DATABASE_URL
    else process.env.CMS_SUPABASE_DATABASE_URL = previous
  })
  const resource = createPostgresResource({}, 'database')
  t.after(() => resource.pool.end())
  const statements = []
  let releases = 0
  const physical = {
    async query(statement) {
      statements.push(statement)
      return { rows: [{ released: true }] }
    },
  }
  const pool = { async connect() {
    physical.release = () => { releases++ }
    return physical
  } }
  for (let i = 0; i < 2; i++) {
    const lease = await resource.getConnection(pool)
    await lease.query('UPDATE example SET flag = true')
    lease.release()
    lease.release()
    await assert.rejects(lease.query('SELECT 1'), /released/)
  }
  assert.equal(releases, 2)
  assert.equal(resource.users, 0)
  assert.equal(statements.filter(sql => sql.includes('pg_advisory_lock_shared')).length, 2)
})
