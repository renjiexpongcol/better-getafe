import test from 'node:test'
import assert from 'node:assert/strict'
import { dateLabel, needsAction, parseDate, upcomingAppointments } from '../src/services/citizenData.js'

test('staff requests for information appear in the resident attention list', () => {
  assert(needsAction({ status: 'needs_information' }))
  assert(needsAction({ status: 'NEEDS_INFORMATION' }))
  assert(!needsAction({ status: 'completed' }))
})

test('dates support database timestamps, explicit offsets, Date objects and invalid values', () => {
  const instant = '2026-10-03T01:00:00Z'
  assert.equal(parseDate(new Date(instant)).toISOString(), instant.replace('Z', '.000Z'))
  assert.equal(parseDate('2026-10-03 01:00:00').toISOString(), parseDate('2026-10-03T09:00:00+08:00').toISOString())
  assert.equal(dateLabel('invalid'), 'Date unavailable')
  assert.equal(parseDate(null), null)
  assert.match(dateLabel('2026-10-03'), /October 3, 2026/)
})

test('upcoming appointments exclude canceled and invalid times and sort future reservations', () => {
  const later = new Date(Date.now() + 86400000), earlier = new Date(Date.now() + 3600000)
  const results = upcomingAppointments([{ id: 'later', status: 'requested', appointment_at: later }, { id: 'earlier', status: 'confirmed', appointment_at: earlier.toISOString() }, { id: 'canceled', status: 'cancelled', appointment_at: later }, { id: 'invalid', status: 'requested', appointment_at: 'invalid' }])
  assert.deepEqual(results.map(item => item.id), ['earlier', 'later'])
})
