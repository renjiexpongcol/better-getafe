import test from 'node:test'
import assert from 'node:assert/strict'
import { activateStorage, writeCitizenFile } from '../server/src/services/storage.js'

test('every confidential upload rejects public or unverifiable bucket ACLs before writing bytes', async () => {
  for (const acl of [{}, { Owner: { ID: 'owner' }, Grants: [{ Grantee: { Type: 'Group', URI: 'public' } }] }]) {
    let writes = 0
    activateStorage({ provider: 'backblaze', bucket: 'test-only', client: { send: async command => { if (command.constructor.name === 'PutObjectCommand') writes++; return acl }, destroy() {} } })
    try {
      await assert.rejects(() => writeCitizenFile('citizen-private/test/document.pdf', Buffer.from('%PDF-1.4'), 'application/pdf'), { code: 'PRIVATE_BUCKET_REQUIRED' })
      assert.equal(writes, 0)
    } finally { activateStorage(null) }
  }
})

test('verified private bucket uploads preserve content and MIME type', async () => {
  let saved
  activateStorage({ provider: 'backblaze', bucket: 'test-only', client: { send: async command => {
    if (command.constructor.name === 'GetBucketAclCommand') return { Owner: { ID: 'owner' }, Grants: [{ Grantee: { Type: 'CanonicalUser', ID: 'owner' }, Permission: 'FULL_CONTROL' }] }
    saved = command.input; return {}
  }, destroy() {} } })
  try {
    await writeCitizenFile('citizen-private/test/document.pdf', Buffer.from('%PDF-1.4'), 'application/pdf')
    assert.equal(saved.ContentType, 'application/pdf')
    assert.equal(saved.Body.toString(), '%PDF-1.4')
  } finally { activateStorage(null) }
})
