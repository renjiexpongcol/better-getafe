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

const dayKey = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
const slotDate = (date, time) => new Date(`${date}T${time}:00+08:00`)

export async function appointmentAvailability(query, serviceId) {
  const [config] = await query('SELECT * FROM appointment_schedule_config WHERE id = 1')
  if (!config) throw new Error('Appointment scheduling is unavailable.')
  const now = new Date(), start = new Date(now.getTime() + config.min_advance_minutes * 60000), end = new Date(now.getTime() + config.booking_horizon_days * 86400000)
  const weekdays = Array.isArray(config.weekdays) ? config.weekdays : JSON.parse(config.weekdays)
  const closures = new Set((await query('SELECT closure_date FROM appointment_closures')).map(row => row.closure_date instanceof Date ? dayKey(row.closure_date) : String(row.closure_date).slice(0, 10)))
  const occupied = bookedSlots(await query("SELECT appointment_at FROM appointments WHERE appointment_at >= ? AND appointment_at <= ? AND status IN ('requested','scheduled','confirmed')", [start.toISOString(), end.toISOString()]))
  const dates = [], cursor = new Date(start)
  cursor.setUTCHours(0, 0, 0, 0)
  for (; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = dayKey(cursor), weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'short' }).format(cursor)), slots = []
    if (weekdays.includes(weekday) && !closures.has(date)) {
      const open = Number(config.opening_time.slice(0, 2)) * 60 + Number(config.opening_time.slice(3))
      const close = Number(config.closing_time.slice(0, 2)) * 60 + Number(config.closing_time.slice(3))
      const breakStart = Number(config.break_start.slice(0, 2)) * 60 + Number(config.break_start.slice(3))
      const breakEnd = Number(config.break_end.slice(0, 2)) * 60 + Number(config.break_end.slice(3))
      for (let minute = open; minute + config.slot_minutes <= close; minute += config.slot_minutes) {
        if (minute >= breakStart && minute < breakEnd) continue
        const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
        const at = slotDate(date, time)
        if (at <= start) continue
        const available = config.slot_capacity - (occupied.get(at.toISOString()) || 0)
        if (available > 0) slots.push({ time, available })
      }
    }
    dates.push({ date, slots })
  }
  return { config: { start: dayKey(start), end: dayKey(end), location: config.location, slot_minutes: config.slot_minutes }, dates, service_id: serviceId }
}
