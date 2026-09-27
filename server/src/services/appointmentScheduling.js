export function bookedSlots(appointments) {
  const counts = new Map()
  for (const appointment of appointments) {
    const timestamp = new Date(appointment.appointment_at).getTime()
    if (!Number.isFinite(timestamp)) continue
    const key = new Date(timestamp).toISOString()
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

export function isExactAppointmentMinute(date) {
  return date instanceof Date
    && Number.isFinite(date.getTime())
    && date.getSeconds() === 0
    && date.getMilliseconds() === 0
}

export function appointmentSlotLockValues(date) {
  if (!isExactAppointmentMinute(date)) throw new Error('Appointment time must be an exact minute.')
  return ['citizen-appointment-slot', date.toISOString()]
}
