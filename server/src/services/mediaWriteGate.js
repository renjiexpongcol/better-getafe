import { AsyncLocalStorage } from 'node:async_hooks'
import { getCmsPool } from './database.js'

export const mediaWriteLockId = 63820492
export const maxDirectUploadSeconds = 900
const writeContext = new AsyncLocalStorage()
const paused = () => Object.assign(new Error('Media writes are paused for Azure migration.'), { status: 503, code: 'MEDIA_WRITES_PAUSED' })

export async function withBackblazeWrite(operation) {
  if (process.env.MEDIA_MIGRATION_FREEZE === 'true') throw paused()
  if (writeContext.getStore()) return operation()
  const connection = await (await getCmsPool()).getConnection({ mediaGate: true })
  try {
    await connection.beginTransaction()
    const [[{ locked }]] = await connection.execute('SELECT pg_try_advisory_xact_lock_shared(?) AS locked', [mediaWriteLockId])
    if (!locked) throw paused()
    const [[prepared]] = await connection.execute("SELECT 1 FROM media_migration_runs WHERE status IN ('restart_required', 'active', 'accepted') OR (mode = 'cutover' AND status = 'running') LIMIT 1")
    if (prepared) throw paused()
    return await writeContext.run(true, operation)
  } finally {
    try { await connection.rollback() } finally { connection.release() }
  }
}
