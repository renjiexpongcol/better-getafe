const normalizePhilippineNumber = value => {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 11) return `63${digits.slice(1)}`
  return digits
}

export function smsConfigured() {
  return Boolean(process.env.SEMAPHORE_API_KEY)
}

export async function sendSms(to, message) {
  if (!smsConfigured()) throw new Error('SMS verification is not configured.')
  const response = await fetch('https://api.semaphore.co/api/v4/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ apikey: process.env.SEMAPHORE_API_KEY, number: normalizePhilippineNumber(to), message, ...(process.env.SEMAPHORE_SENDER_NAME ? { sendername: process.env.SEMAPHORE_SENDER_NAME } : {}) }),
  })
  if (!response.ok) throw new Error('SMS provider rejected the verification message.')
}
