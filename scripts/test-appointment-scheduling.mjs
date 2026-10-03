import test from 'node:test'
import assert from 'node:assert/strict'
import { appointmentAvailability, appointmentSlotLockValues, bookedSlots, isExactAppointmentMinute } from '../server/src/services/appointmentScheduling.js'

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

test('e-service availability excludes slots reserved by existing appointments', async () => {
  const bookedAt = new Date(Date.now() + 3 * 86400000)
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(bookedAt)
  const query = async sql => {
    if (sql.includes('appointment_schedule_config')) return [{ min_advance_minutes: 60, booking_horizon_days: 7, weekdays: [0, 1, 2, 3, 4, 5, 6], opening_time: '08:00', closing_time: '10:00', break_start: '12:00', break_end: '13:00', slot_minutes: 30, slot_capacity: 1, location: 'Municipal Hall' }]
    if (sql.includes('appointment_closures')) return []
    return [{ appointment_at: `${date}T08:00:00+08:00` }]
  }
  const result = await appointmentAvailability(query, 'service-id')
  const slots = result.dates.find(day => day.date === date).slots
  assert.equal(slots.some(slot => slot.time === '08:00'), false)
  assert.equal(slots.some(slot => slot.time === '08:30'), true)
})
