import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '../server/src/config/ConfigService.js';
import { refreshStorageSelection, selectedStorageProvider, getVerifiedAzureStatus, setVerifiedAzureStatus, storageJournalUnavailable } from '../server/src/services/storageSelection.js';
const db = status => ({ execute: async () => [status ? [{ status }] : []] });
const failure = code => ({ execute: async () => { throw Object.assign(Error('private'), { code }); } });

test('provider selection uses environment, saved settings and committed cutover in a fixed order', async () => {
  setVerifiedAzureStatus(undefined);
  await refreshStorageSelection(db());
  const service = env => new ConfigService({ provider: {}, secrets: { open: async (_key, value) => value }, env });
  assert.equal((await service({}).resolve({ 'storage.provider': 'local' })).values['storage.provider'], 'local');
  assert.equal((await service({ CMS_MEDIA_PROVIDER: 'backblaze' }).resolve({ 'storage.provider': 'azure' })).values['storage.provider'], 'backblaze');
  await refreshStorageSelection(db('accepted'));
  const snapshot = await service({ CMS_MEDIA_PROVIDER: 'backblaze' }).resolve({});
  assert.equal(snapshot.values['storage.provider'], 'azure');
  assert.equal(snapshot.values['storage.configuredProvider'], 'azure');
  assert.equal(snapshot.sources['storage.provider'], 'migration-journal');
  assert.equal(getVerifiedAzureStatus(), 'accepted');
  // Losing the journal cannot silently return to an old B2 environment.
  await refreshStorageSelection(failure('ECONNREFUSED'));
  assert.equal(storageJournalUnavailable(), true);
  assert.equal(selectedStorageProvider('backblaze'), 'azure');
  await refreshStorageSelection(db('accepted'));
  assert.equal(storageJournalUnavailable(), false);
  setVerifiedAzureStatus(undefined);
});
test('older databases without a cutover journal retain their configured provider', async () => {
  setVerifiedAzureStatus(undefined);
  await refreshStorageSelection(failure('42P01'));
  assert.equal(storageJournalUnavailable(), false);
  assert.equal(selectedStorageProvider('backblaze'), 'backblaze');
});
