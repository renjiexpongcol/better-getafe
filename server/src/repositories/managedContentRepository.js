import { getCmsPool } from '../services/database.js'

export function managedContentRepository(poolFactory = getCmsPool) {
  return {
    async list() {
      const [rows] = await (await poolFactory()).execute('SELECT key,title,kind,published,version,updated_at FROM managed_public_content ORDER BY title,key')
      return rows
    },
    async find(key, admin = false) {
      const [rows] = await (await poolFactory()).execute(`SELECT key,title,kind,content,published,version,updated_at FROM managed_public_content WHERE key=? ${admin ? '' : 'AND published=TRUE'}`, [key])
      return rows[0] || null
    },
    async save(key, data, actorId) {
      const connection = await (await poolFactory()).getConnection()
      try {
        await connection.beginTransaction()
        // A per-key advisory lock also serializes concurrent first-time creates.
        await connection.execute('SELECT pg_advisory_xact_lock(hashtext(?))', [`managed-content:${key}`])
        const [rows] = await connection.execute('SELECT * FROM managed_public_content WHERE key=? FOR UPDATE', [key])
        const old = rows[0]
        if (Number(data.version) !== (old?.version || 0)) throw Object.assign(new Error('This content changed. Reload it before saving.'), { status: 409 })
        const version = (old?.version || 0) + 1
        const [saved] = await connection.execute(`INSERT INTO managed_public_content(key,title,kind,content,published,version,updated_by) VALUES(?,?,?,?::jsonb,?,?,?) ON CONFLICT(key) DO UPDATE SET title=EXCLUDED.title,kind=EXCLUDED.kind,content=EXCLUDED.content,published=EXCLUDED.published,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=CURRENT_TIMESTAMP RETURNING key,title,kind,content,published,version,updated_at`, [key, data.title, data.kind, JSON.stringify(data.content), data.published, version, actorId])
        await connection.execute('INSERT INTO managed_public_content_audit(content_key,actor_id,action,version,previous_content) VALUES(?,?,?,?,?::jsonb)', [key, actorId, old ? 'updated' : 'created', version, old ? JSON.stringify(old) : null])
        await connection.commit()
        return saved[0]
      } catch (error) { await connection.rollback(); throw error }
      finally { connection.release() }
    },
  }
}
