import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ConfigService } from '../src/config/ConfigService.js';
import { SecretProvider } from '../src/config/SecretProvider.js';
import { DatabaseSettingsProvider } from '../src/config/DatabaseSettingsProvider.js';
const env = { SETTINGS_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'), APP_NAME: 'Environment app' };
async function fixture(t, prepare) {
 const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getafe-config-'));
 t.after(() => fs.rm(directory, { recursive: true, force: true }));
 const file = path.join(directory, 'settings.json');
 await fs.writeFile(file, JSON.stringify({ settings: {}, history: [] }));
 const provider = new DatabaseSettingsProvider({ file, poolProvider: async () => null });
 const service = new ConfigService({ provider, secrets: new SecretProvider(env), env, prepare });
 await service.load();
 return { service, provider, file };
}
const actor = { id: 'administrator', ip: '127.0.0.1' };
test('precedence, sources, persistence across restart, false/zero, and reset', async t => {
 const { service, provider } = await fixture(t);
 assert.equal(service.get('general.name'), 'Environment app');
 assert.equal(service.snapshot().metadata['general.name'].source, 'environment');
 await service.update({ 'general.name': 'Dashboard app', 'features.uploads': false, 'database.queueLimit': 0 }, actor);
 const restarted = new ConfigService({ provider, secrets: new SecretProvider(env), env });
 await restarted.load();
 assert.equal(restarted.get('general.name'), 'Dashboard app');
 assert.equal(restarted.get('features.uploads'), false);
 assert.equal(restarted.get('database.queueLimit'), 0);
 assert.equal(restarted.snapshot().metadata['general.name'].source, 'database');
 await restarted.update({ 'general.name': null }, actor);
 assert.equal(restarted.get('general.name'), 'Environment app');
 assert.equal(restarted.snapshot().metadata['general.name'].overridden, false);
});
test('secrets are encrypted at rest, masked in snapshots/audit, blank preserved and reset supported', async t => {
 const { service, provider, file } = await fixture(t);
 const password = 'ultra-private-test-password';
 const openWeatherKey = 'openweather-test-key-123';
 await service.update({ 'email.password': password, 'weather.openWeatherApiKey': openWeatherKey }, actor);
 assert.equal(service.get('email.password'), password);
 assert.equal(service.get('weather.openWeatherApiKey'), openWeatherKey);
 assert.equal(service.snapshot().values['email.password'], null);
 assert.equal(service.snapshot().metadata['email.password'].configured, true);
 const saved = await fs.readFile(file, 'utf8');
 assert.ok(!saved.includes(password));
 assert.ok(!saved.includes(openWeatherKey));
 assert.ok(!JSON.stringify(service.snapshot()).includes(password));
 assert.ok(!JSON.stringify(service.snapshot()).includes(openWeatherKey));
 assert.ok(!JSON.stringify(await provider.history()).includes(password));
 assert.ok(!JSON.stringify(await provider.history()).includes(openWeatherKey));
 await service.update({ 'email.password': '' }, actor);
 assert.equal(service.get('email.password'), password);
 await service.update({ 'email.password': null }, actor);
 assert.equal(service.get('email.password'), '');
 await service.update({ 'weather.openWeatherApiKey': null }, actor);
 assert.equal(service.get('weather.openWeatherApiKey'), '');
});
test('failed connection test preserves persisted values and active configuration', async t => {
 let active = 'local';
 const { service, provider } = await fixture(t, async next => {
  if (next['database.host'] === 'bad-host') throw new Error('Connection failed');
  return { activate: () => { active = next['database.host']; }, discard: async () => {} };
 });
 const before = active;
 await assert.rejects(service.update({ 'database.host': 'bad-host', 'general.name': 'Must not save' }, actor));
 assert.equal(active, before);
 assert.equal(service.get('general.name'), 'Environment app');
 assert.deepEqual(await provider.read(), {});
});
test('storage save failure discards prepared resources; reload failure retains known-good values', async t => {
 let discarded = 0;
 const { service, provider } = await fixture(t, async () => ({ activate() {}, discard: async () => discarded++ }));
 provider.file = `${provider.file}/impossible`;
 await assert.rejects(service.update({ 'general.name': 'Cannot commit' }, actor));
 assert.equal(discarded, 1);
 assert.equal(service.get('general.name'), 'Environment app');
 provider.read = async () => { throw new Error('Unavailable'); };
 await assert.rejects(service.load(true));
 assert.equal(service.get('general.name'), 'Environment app');
 assert.equal(service.available, false);
});
test('serialized updates preserve unrelated fields and audit entries', async t => {
 const { service, provider } = await fixture(t);
 await Promise.all([service.update({ 'general.name': 'A' }, actor), service.update({ 'general.company': 'B' }, actor)]);
 assert.equal(service.get('general.name'), 'A'); assert.equal(service.get('general.company'), 'B');
 assert.equal((await provider.history()).length, 2);
});
test('unknown keys, wrong types, invalid URLs, and master keys are rejected', async t => {
 const { service } = await fixture(t);
 for (const patch of [{ SETTINGS_ENCRYPTION_KEY: 'bad' }, { 'storage.signedUrlMinutes': 999999 }, { 'storage.provider': 's3' }, { 'general.url': 'javascript:alert(1)' }, { 'features.uploads': 'false' }]) assert.throws(() => service.update(patch, actor));
});
test('AES-GCM authenticates both the ciphertext and setting key', async () => {
 const secrets = new SecretProvider(env), envelope = await secrets.seal('email.password', 'hidden');
 await assert.rejects(secrets.open('database.password', envelope));
 const changed = { ...envelope, ciphertext: Buffer.from('tampered').toString('base64') };
 await assert.rejects(secrets.open('email.password', changed));
});
test('Secret Manager references pin versions and never persist plaintext', async () => {
 const calls = [];
 const secrets = new SecretProvider({ SETTINGS_SECRET_PROJECT: 'test-project', NODE_ENV: 'production' }, {
  createSecret: async request => { calls.push(request); },
  addSecretVersion: async () => [{ name: 'projects/test-project/secrets/test/versions/7' }],
  accessSecretVersion: async () => [{ payload: { data: Buffer.from('secret') } }],
 });
 const envelope = await secrets.seal('email.password', 'secret');
 assert.deepEqual(envelope, { secret_ref: 'projects/test-project/secrets/test/versions/7' });
 assert.equal(await secrets.open('email.password', envelope), 'secret');
 assert.equal(calls.length, 1);
 await assert.rejects(new SecretProvider({ NODE_ENV: 'production' }).seal('email.password', 'secret'), /SETTINGS_SECRET_PROJECT/);
});
