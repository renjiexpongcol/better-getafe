import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfigService } from '../server/src/config/ConfigService.js';
import { deploymentConfiguration } from '../server/src/config/deployment.js';
import { supabaseConnectionOptions } from '../server/src/services/postgres.js';

test('deployment validation keeps Preview closed until isolation is verified', () => {
  const configuration = deploymentConfiguration({ VERCEL: '1', VERCEL_ENV: 'preview', APP_URL: 'https://preview.example', SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64') });
  assert.match(configuration.errors.join(' '), /isolated/);
  assert.equal(deploymentConfiguration({ VERCEL: '1', VERCEL_ENV: 'production', APP_URL: 'https://portal.example', SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64') }).errors.length, 0);
  assert.ok(deploymentConfiguration({ VERCEL: '1', APP_URL: 'http://localhost:5173' }).errors.length >= 2);
});

test('infrastructure environment values override saved settings without opening saved secrets', async () => {
  const service = new ConfigService({ provider: {}, secrets: { open() { throw new Error('must not decrypt overridden secret'); } }, env: {
    NODE_ENV: 'production', APP_URL: 'https://portal.example', GOOGLE_CLIENT_ID: 'current-client', GOOGLE_CLIENT_SECRET: 'current-secret',
    AZURE_STORAGE_CONNECTION_STRING: 'fixture-string', AZURE_STORAGE_ACCOUNT_NAME: 'lgumedia', AZURE_STORAGE_CONTAINER_NAME: 'portal-media', CMS_MEDIA_PROVIDER: 'azure',
  } });
  const { values, sources } = await service.resolve({ 'general.url': 'https://old.example', 'google.clientId': 'old-client', 'google.clientSecret': { encrypted: 1 }, 'storage.azureConnectionString': { encrypted: 1 }, 'storage.azureContainer': 'old-container' });
  assert.equal(values['general.url'], 'https://portal.example');
  assert.equal(values['storage.azureContainer'], 'portal-media');
  assert.equal(values['google.clientSecret'], 'current-secret');
  assert.equal(sources['storage.azureConnectionString'], 'environment');
});

test('serverless database selection validates pooler mode, identity, TLS and Preview target', () => {
  const env = { VERCEL: '1', VERCEL_ENV: 'production', SUPABASE_PROJECT_REF: 'wrgbfwexraarwxpoqzpv', DATABASE_URL: 'postgresql://postgres.wrgbfwexraarwxpoqzpv:fixture@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres' };
  assert.equal(supabaseConnectionOptions('database', env).ssl.rejectUnauthorized, true);
  assert.throws(() => supabaseConnectionOptions('database', { ...env, DATABASE_URL: env.DATABASE_URL.replace('5432', '6543') }), /Session pooler/);
  assert.throws(() => supabaseConnectionOptions('database', { ...env, SUPABASE_PROJECT_REF: 'differentproject' }), /must match/);
  assert.throws(() => supabaseConnectionOptions('database', { ...env, VERCEL_ENV: 'preview' }), /isolated/);
});
