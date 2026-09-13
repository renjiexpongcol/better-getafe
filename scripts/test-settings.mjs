import { mock } from 'node:test';
import assert from 'node:assert/strict';

let database = {};
mock.module('../src/repositories/localDb.js', { namedExports: {
  isGcp: () => false,
  getLocalDb: async () => structuredClone(database),
  saveLocalDb: async value => { database = structuredClone(value); },
} });
const { updateSettings, effectiveSettings, settingsHistory } = await import('../src/services/applicationSettings.js');
const actor = { id: 'test-admin', ip: '127.0.0.1' };
assert.throws(() => updateSettings({ 'database.password': 'never-store-this' }, actor));
assert.throws(() => updateSettings({ 'general.timezone': 'Invalid/Timezone' }, actor));
assert.throws(() => updateSettings({ 'general.url': 'javascript:alert(1)' }, actor));
await Promise.all([
  updateSettings({ 'general.name': 'Test municipality' }, actor),
  updateSettings({ 'general.company': 'Test company' }, actor),
]);
assert.equal((await effectiveSettings()).values['general.name'], 'Test municipality');
assert.equal((await effectiveSettings()).values['general.company'], 'Test company');
assert.equal((await settingsHistory()).length, 2);
await updateSettings({ 'general.name': 'Test municipality' }, actor);
assert.equal((await settingsHistory()).length, 2);
assert.equal(JSON.stringify(database).includes('never-store-this'), false);
console.log('Settings validation, concurrent local saves, audit persistence and secret rejection pass.');
