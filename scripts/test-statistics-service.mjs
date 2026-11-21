import test from 'node:test'
import assert from 'node:assert/strict'
import { statisticsService } from '../server/src/services/statisticsService.js'

test('successful identical statistics requests share the fetch and cached result', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ rows: [{ barangay: 'Banacon' }] })))
  const [first, concurrent] = await Promise.all([statisticsService.dataset('cached'), statisticsService.dataset('cached')])
  assert.deepEqual(first.data, { rows: [{ barangay: 'Banacon' }] })
  assert.deepEqual(concurrent, first)
  assert.equal((await statisticsService.dataset('cached')).cache, 'HIT')
  assert.equal(fetch.mock.callCount(), 1)
})

test('oversized statistics responses abort and a later retry can succeed', async t => {
  let signal
  const request = t.mock.method(globalThis, 'fetch', async (_, options) => {
    signal = options.signal
    return new Response(null, { headers: { 'content-length': String(65 * 1024 * 1024) } })
  })
  await assert.rejects(statisticsService.dataset('retry'), { code: 'RESPONSE_TOO_LARGE' })
  assert.ok(signal.aborted)
  request.mock.mockImplementation(async () => new Response('{"rows":[]}'))
  assert.equal((await statisticsService.dataset('retry')).cache, 'MISS')
})
