import test from 'node:test'
import assert from 'node:assert/strict'
import { appointmentSlotLockValues, bookedSlots, isExactAppointmentMinute } from '../server/src/services/appointmentScheduling.js'

test('PostgreSQL timestamp values and string timestamps count against the same slot', () => {
  const counts = bookedSlots([
    { appointment_at: new Date('2026-09-28T02:00:00.000Z') },
    { appointment_at: '2026-09-28T10:00:00+08:00' },
    { appointment_at: 'not-a-date' },
  ])
  assert.equal(counts.get('2026-09-28T02:00:00.000Z'), 2)
  assert.equal(counts.size, 1)
})

test('appointment requests must match a whole-minute slot', () => {
  assert.equal(isExactAppointmentMinute(new Date('2026-09-28T10:00:00+08:00')), true)
  assert.equal(isExactAppointmentMinute(new Date('2026-09-28T10:00:30+08:00')), false)
  assert.equal(isExactAppointmentMinute(new Date('invalid')), false)
})

test('equivalent timezone representations share one advisory-lock key', () => {
  assert.deepEqual(
    appointmentSlotLockValues(new Date('2026-09-28T10:00:00+08:00')),
    appointmentSlotLockValues(new Date('2026-09-28T02:00:00.000Z')),
  )
})
