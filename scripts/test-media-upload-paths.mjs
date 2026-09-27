import test from 'node:test'
import assert from 'node:assert/strict'
import { isMediaUploadPath } from '../server/src/services/mediaUploadPath.js'

const uuid = '3fb2c0f4-b937-4a02-8f52-d7ed9a37f417'

test('media upload proxy accepts the configured storage prefix', () => {
  assert.equal(isMediaUploadPath(`media/2026/09/${uuid}.jpg`, 'media'), true)
  assert.equal(isMediaUploadPath(`public/news/2026/09/${uuid}.webp`, 'public/news'), true)
})

test('media upload proxy rejects mismatched prefixes and malformed keys', () => {
  assert.equal(isMediaUploadPath(`media/2026/09/${uuid}.jpg`, 'public/news'), false)
  assert.equal(isMediaUploadPath(`public/news/2026/13/${uuid}.jpg`, 'public/news'), false)
  assert.equal(isMediaUploadPath(`public/news/2026/09/not-a-uuid.jpg`, 'public/news'), false)
})
