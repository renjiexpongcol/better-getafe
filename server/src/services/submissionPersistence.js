import crypto from 'node:crypto'
import { writeCitizenFile, deleteCitizenFile } from './storage.js'

export function submissionId(scope, values) {
  // Existing TEXT primary keys enforce uniqueness across replicas and restarts.
  return crypto.createHash('sha256').update(JSON.stringify([scope, ...values])).digest('hex')
}

export async function persistDocument(db, { applicationId, userId, name, bytes, type, status, kind, createdAt }) {
  const documentId = submissionId('document', [applicationId, userId, kind, name, type, crypto.createHash('sha256').update(bytes).digest('hex')])
  const extension = type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : 'jpg'
  const storagePath = `citizen-private/documents/${userId}/${documentId}.${extension}`
  let uploadAttempted = false, commitAttempted = false
  await db.exec('BEGIN')
  try {
    // Keep the lock through cleanup so a failing request cannot delete the
    // object being uploaded by a concurrent retry of the same document.
    await db.prepare('SELECT pg_advisory_xact_lock(hashtext(?), hashtext(?))').get('document-upload', documentId)
    const existing = await db.prepare('SELECT * FROM application_documents WHERE id = ?').get(documentId)
    if (existing) {
      await db.exec('COMMIT')
      return { document: existing, created: false }
    }
    uploadAttempted = true
    await writeCitizenFile(storagePath, bytes, type)
    await db.prepare('INSERT INTO application_documents (id,application_id,user_id,name,storage_path,verification_status,document_kind,created_at) VALUES (?,?,?,?,?,?,?,?)').run(documentId, applicationId, userId, name, storagePath, status, kind, createdAt)
    commitAttempted = true
    await db.exec('COMMIT')
    return { document: { id: documentId, name, verification_status: status }, created: true }
  } catch (error) {
    if (uploadAttempted && !commitAttempted) {
      // Nothing has committed, and the advisory lock still protects this key.
      try { await deleteCitizenFile(storagePath) }
      catch {
        console.error(JSON.stringify({ event: 'document_cleanup_required', documentId }))
      }
    } else if (commitAttempted) {
      // A lost COMMIT acknowledgement is ambiguous. Preserve the object and
      // let the deterministic identifier make a retry safe.
      console.error(JSON.stringify({ event: 'document_commit_requires_reconciliation', documentId }))
    }
    await db.exec('ROLLBACK').catch(() => {})
    throw error
  }
}

export async function optionalSubmissionNotification(work, submissionId) {
  try { return await work() }
  catch {
    console.error(JSON.stringify({ event: 'submission_notification_failed', submissionId }))
    return null
  }
}
