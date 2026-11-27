import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizedCron, runScheduledJob } from '../server/src/services/scheduledJobs.js';

test('scheduled endpoints reject missing, malformed and mismatched credentials', () => {
  const key = 'scheduler-test-credential-32-characters-long';
  assert.equal(authorizedCron(`Bearer ${key}`, key), true);
  for (const header of [undefined, '', 'Bearer wrong', `bearer ${key}`]) assert.equal(authorizedCron(header, key), false);
  assert.equal(authorizedCron('Bearer undefined', undefined), false);
});

test('a duplicate durable claim does not execute the job', async () => {
  let executed = 0;
  const pool = { execute: async () => [[]] };
  const result = await runScheduledJob('psgc', { pool, work: async () => executed++ });
  assert.equal(result.accepted, false);
  assert.equal(executed, 0);
});

test('completion is recorded only after execution and failures retain retry state', async () => {
  const events = [];
  const pool = { execute: async sql => { events.push(sql.includes('INSERT') ? 'claim' : sql.includes("status='failed'") ? 'failed' : 'succeeded'); return [[{ attempts: 1 }]]; } };
  const result = await runScheduledJob('psgc', { pool, work: async () => { await Promise.resolve(); events.push('work'); } });
  assert.equal(result.completed, true);
  assert.deepEqual(events, ['claim', 'work', 'succeeded']);
  events.length = 0;
  await assert.rejects(runScheduledJob('media-cleanup', { pool, work: async () => { throw new Error('private provider failure'); } }), error => error.status === 503 && !error.message.includes('private'));
  assert.deepEqual(events, ['claim', 'failed']);
  await assert.rejects(runScheduledJob('arbitrary-command', { pool }), error => error.status === 404);
});
