import { config } from '../config/index.js'
import { normalizeMobile, validMobile } from '../../../src/data/residentContact.js'

export function smsConfigured() {
  return Boolean(config.get('authentication.smsApiKey'))
}

export async function sendSms(to, message) {
  if (!smsConfigured()) throw new Error('SMS verification is not configured.')
  if (!validMobile(to)) throw new Error('Provide a valid mobile number.')
  const mobile = normalizeMobile(to)
  const recipient = /^09\d{9}$/.test(mobile) ? `63${mobile.slice(1)}` : mobile.replace(/^\+/, '')
  const response = await fetch('https://api.semaphore.co/api/v4/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ apikey: config.get('authentication.smsApiKey'), number: recipient, message, ...(config.get('authentication.smsSenderName') ? { sendername: config.get('authentication.smsSenderName') } : {}) }),
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('SMS provider rejected the verification message.')
  const result = await response.json().catch(() => null)
  if (!Array.isArray(result) || !result.length || result.some(item => !item.message_id || !['queued', 'pending', 'sent'].includes(String(item.status || '').toLowerCase()))) throw new Error('SMS provider did not accept the verification message.')
}
