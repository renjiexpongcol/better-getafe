import { googleOnboarding, completeGoogleOnboarding, validMobile, markGooglePasswordSet, markGoogleIdentityVerified } from './googleOnboarding.js'
import express from 'express'
import { getPostgresRuntime } from '../repositories/postgresRuntime.js'
import { id, now } from './identifiers.js'
import { citizenServices } from '../data/citizenServices.js'
import { config } from '../config/index.js'
import { writeCitizenFile, readCitizenFile, deleteCitizenFile } from './storage.js'
import { getWeatherAt } from './getafeWeather.js'
import { barangays } from '../data/barangays.js'
import { sendEmail } from './email.js'
import { actionThrottle, issueCode, issueSmsCode, verifyCode } from './authSecurity.js'
import { replacePassword } from './passwords.js'
import { smsConfigured } from './sms.js'
import crypto from 'node:crypto'

export function installCitizenRoutes(app, resident, safeUser) {
  app.use('/api/citizen', (req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  const database = () => getPostgresRuntime('portal')
  const ownedApplication = async (db, req, applicationId) => await db.prepare('SELECT * FROM applications WHERE id = ? AND user_id = ?').get(applicationId, req.resident.id)
  const notify = async (db, userId, title, message, applicationId = null, documentId = null) => await db.prepare('INSERT INTO notifications (id,user_id,title,message,application_id,document_id,created_at) VALUES (?,?,?,?,?,?,?)').run(id(), userId, title, message, applicationId, documentId, now())
  const passwordMatches = (password, stored) => { try { const [salt, digest] = String(stored || '').split(':'); if (!salt || !digest) return false; const actual = crypto.scryptSync(password, salt, 64).toString('hex'); return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(digest, 'hex')) } catch { return false } }
  const profileView = profile => {
    if (!profile) return null
    const view = { ...profile, avatar_url: profile.avatar_storage_path ? `/api/citizen/profile/avatar?v=${encodeURIComponent(profile.updated_at || '')}` : null }
    delete view.avatar_storage_path
    return view
  }
  const appointmentConfiguration = async db => await db.prepare('SELECT * FROM appointment_schedule_config WHERE id = 1').get()
  const dayKey = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  const slotDate = (date, time) => new Date(`${date}T${time}:00+08:00`)
  const appointmentAvailability = async (db, serviceId) => {
    const config = await appointmentConfiguration(db), today = new Date(), start = new Date(today.getTime() + config.min_advance_minutes * 60000), end = new Date(today.getTime() + config.booking_horizon_days * 86400000)
    const weekdays = Array.isArray(config.weekdays) ? config.weekdays : JSON.parse(config.weekdays), closures = new Set((await db.prepare('SELECT closure_date FROM appointment_closures').all()).map(item => item.closure_date))
    const appointments = await db.prepare("SELECT appointment_at FROM appointments WHERE appointment_at >= ? AND appointment_at <= ? AND status IN ('requested','scheduled','confirmed')").all(start.toISOString(), end.toISOString())
    const occupied = new Map(); appointments.forEach(item => occupied.set(item.appointment_at, (occupied.get(item.appointment_at) || 0) + 1))
    const dates = [], cursor = new Date(start); cursor.setUTCHours(0, 0, 0, 0)
    for (; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = dayKey(cursor), weekday = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'short' }).formatToParts(cursor).find(item => item.type === 'weekday') ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'short' }).format(cursor)) : 0)
      const slots = []
      if (weekdays.includes(weekday) && !closures.has(date)) for (let minute = Number(config.opening_time.slice(0,2)) * 60 + Number(config.opening_time.slice(3)); minute + config.slot_minutes <= Number(config.closing_time.slice(0,2)) * 60 + Number(config.closing_time.slice(3)); minute += config.slot_minutes) {
        const time = `${String(Math.floor(minute / 60)).padStart(2,'0')}:${String(minute % 60).padStart(2,'0')}`, breakStart = Number(config.break_start.slice(0,2)) * 60 + Number(config.break_start.slice(3)), breakEnd = Number(config.break_end.slice(0,2)) * 60 + Number(config.break_end.slice(3))
        if (minute >= breakStart && minute < breakEnd) continue
        const at = slotDate(date, time); if (at <= start) continue
        const count = occupied.get(at.toISOString()) || 0; if (count < config.slot_capacity) slots.push({ time, available: config.slot_capacity - count })
      }
      dates.push({ date, slots })
    }
    return { config: { start: dayKey(start), end: dayKey(end), location: config.location, slot_minutes: config.slot_minutes }, dates, service_id: serviceId }
  }

  app.get('/api/citizen/dashboard', resident, async (req, res) => {
    const db = await database(), userId = req.resident.id
    const applications = await db.prepare(`SELECT a.*, (SELECT note FROM application_status_history WHERE application_id = a.id ORDER BY created_at DESC LIMIT 1) AS latest_note FROM applications a WHERE user_id = ? ORDER BY last_updated DESC`).all(userId)
    const documents = await db.prepare('SELECT id,application_id,name,verification_status,document_kind,created_at,CASE WHEN storage_path IS NOT NULL AND storage_path != \'\' THEN 1 ELSE 0 END AS downloadable FROM application_documents WHERE user_id = ? ORDER BY created_at DESC').all(userId)
    const payments = await db.prepare('SELECT p.*, a.service_name FROM payments p LEFT JOIN applications a ON a.id = p.application_id AND a.user_id = p.user_id WHERE p.user_id = ? ORDER BY p.created_at DESC').all(userId)
    const settlements = await db.prepare('SELECT * FROM settlement_requests WHERE user_id = ? ORDER BY created_at DESC').all(userId)
    const privacyRequests = await db.prepare('SELECT id,request_type,scope,status,created_at,updated_at,review_note FROM privacy_requests WHERE user_id = ? ORDER BY created_at DESC').all(userId)
    const appointments = await db.prepare('SELECT * FROM appointments WHERE user_id = ? ORDER BY appointment_at').all(userId)
    const notifications = await db.prepare('SELECT * FROM notifications WHERE user_id = ? AND archived_at IS NULL ORDER BY created_at DESC').all(userId)
    const profile = await db.prepare('SELECT * FROM resident_profiles WHERE user_id = ?').get(userId) || { full_name: req.resident.name }
    res.json({ user: safeUser(req.resident), profile: { ...profileView(profile), avatar_url: profileView(profile)?.avatar_url || (await googleOnboarding(req.resident)).avatar_url || null }, applications, documents, payments, settlements, privacyRequests, appointments, notifications })
  })
  app.get('/api/citizen/profile', resident, async (req, res) => {
    const db = await database(), profile = await db.prepare('SELECT * FROM resident_profiles WHERE user_id = ?').get(req.resident.id)
    const onboarding = await googleOnboarding(req.resident)
    res.json({ ...profileView(profile || { user_id: req.resident.id, full_name: req.resident.name, verification_status: 'unverified' }), email: req.resident.email, ...onboarding })
  })
  app.put('/api/citizen/profile', resident, async (req, res) => {
    const db = await database(), timestamp = now(), body = req.body || {}
    if ((await googleOnboarding(req.resident)).googleAccount && (!String(body.full_name || '').trim() || !validMobile(body.mobile))) return res.status(422).json({ error: 'Provide your full name and a valid mobile number (10–15 digits).' })
    if (body.barangay && !barangays.some(item => item.name === String(body.barangay).trim())) return res.status(422).json({ error: 'Choose one of Getafe’s 24 barangays.' })
    await db.prepare(`INSERT INTO resident_profiles (user_id, full_name, mobile, gender, barangay, house_lot, street, purok_sitio, municipality, province, zip_code, verification_status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified', ?) ON CONFLICT(user_id) DO UPDATE SET full_name=excluded.full_name, mobile=excluded.mobile, gender=excluded.gender, barangay=excluded.barangay, house_lot=excluded.house_lot, street=excluded.street, purok_sitio=excluded.purok_sitio, municipality=excluded.municipality, province=excluded.province, zip_code=excluded.zip_code, updated_at=excluded.updated_at`).run(req.resident.id, String(body.full_name || req.resident.name).slice(0, 160), String(body.mobile || '').slice(0, 32), String(body.gender || '').slice(0, 16), String(body.barangay || '').slice(0, 160), String(body.house_lot || '').slice(0, 160), String(body.street || '').slice(0, 160), String(body.purok_sitio || '').slice(0, 160), String(body.municipality || 'Getafe').slice(0, 100), String(body.province || 'Bohol').slice(0, 100), String(body.zip_code || '').slice(0, 16), timestamp)
    res.json({ ok: true, profile: profileView(await db.prepare('SELECT * FROM resident_profiles WHERE user_id = ?').get(req.resident.id)) })
  })
  app.put('/api/citizen/notification-preferences', resident, async (req, res) => {
    const db = await database(), profile = await db.prepare('SELECT * FROM resident_profiles WHERE user_id = ?').get(req.resident.id)
    const emailNotifications = req.body?.emailNotifications === true
    const smsNotifications = req.body?.smsNotifications === true
    if (smsNotifications && (!smsConfigured() || !validMobile(profile?.mobile))) return res.status(422).json({ error: smsConfigured() ? 'Save a valid mobile number before enabling SMS notifications.' : 'SMS notifications are not configured yet.' })
    const timestamp = now()
    await db.prepare(`INSERT INTO resident_profiles (user_id, full_name, mobile, email_notifications, sms_notifications, municipality, province, verification_status, updated_at) VALUES (?, ?, ?, ?, ?, 'Getafe', 'Bohol', 'unverified', ?) ON CONFLICT(user_id) DO UPDATE SET email_notifications=excluded.email_notifications, sms_notifications=excluded.sms_notifications, updated_at=excluded.updated_at`).run(req.resident.id, profile?.full_name || req.resident.name, profile?.mobile || '', emailNotifications ? 1 : 0, smsNotifications ? 1 : 0, timestamp)
    res.json({ ok: true, emailNotifications, smsNotifications })
  })
  app.post('/api/citizen/onboarding/complete', resident, async (req, res) => {
    if (!await completeGoogleOnboarding(req.resident)) return res.status(422).json({ error: 'Complete your profile and create a password before continuing.' })
    res.json({ ok: true })
  })
  app.get('/api/citizen/onboarding/options', resident, async (req, res) => {
    res.json({ email: true, sms: smsConfigured() })
  })
  app.post('/api/citizen/onboarding/password', resident, async (req, res) => {
    if (!(await googleOnboarding(req.resident)).googleAccount) return res.status(403).json({ error: 'This setup is only available to Google accounts.' })
    const password = String(req.body?.password || '')
    if (password.length < 8 || password.length > 1024 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return res.status(422).json({ error: 'Use at least 8 characters with uppercase, lowercase, a number, and a special character.' })
    await replacePassword(req.resident.id, 'portal', password, { touchUpdatedAt: false })
    await markGooglePasswordSet(req.resident.id)
    res.json({ ok: true })
  })
  app.post('/api/citizen/onboarding/verification/request', resident, async (req, res) => {
    if (!(await googleOnboarding(req.resident)).googleAccount) return res.status(403).json({ error: 'This setup is only available to Google accounts.' })
    const method = req.body?.method === 'sms' ? 'sms' : 'email'
    const db = await database(), profile = await db.prepare('SELECT mobile FROM resident_profiles WHERE user_id = ?').get(req.resident.id)
    if (method === 'sms' && (!smsConfigured() || !validMobile(profile?.mobile))) return res.status(422).json({ error: smsConfigured() ? 'Save a valid mobile number before requesting an SMS code.' : 'SMS verification is not configured. Choose email verification.' })
    if (!await actionThrottle('onboarding-code', req.resident.id, 5, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many verification requests. Try again later.' })
    const payload = { userId: req.resident.id, method }
    const challengeId = method === 'sms' ? await issueSmsCode(profile.mobile, 'google-onboarding', payload) : await issueCode(req.resident.email, 'google-onboarding', payload)
    res.json({ challengeId, method })
  })
  app.post('/api/citizen/onboarding/verification/confirm', resident, async (req, res) => {
    const payload = await verifyCode(String(req.body?.challengeId || ''), String(req.body?.code || ''), 'google-onboarding')
    if (!payload || payload.userId !== req.resident.id) return res.status(401).json({ error: 'Invalid or expired verification code.' })
    await markGoogleIdentityVerified(req.resident.id, payload.method)
    res.json({ ok: true, method: payload.method })
  })
  app.post('/api/citizen/profile/avatar', resident, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }), async (req, res) => {
    if (!config.get('features.uploads')) return res.status(403).json({ error: 'Profile uploads are currently disabled.' })
    const bytes = req.body, type = req.get('content-type')?.split(';')[0].trim().toLowerCase()
    const signatures = { 'image/jpeg': value => value.toString('hex', 0, 3) === 'ffd8ff', 'image/png': value => value.toString('hex', 0, 8) === '89504e470d0a1a0a', 'image/webp': value => value.toString('ascii', 0, 4) === 'RIFF' && value.toString('ascii', 8, 12) === 'WEBP' }
    if (!Buffer.isBuffer(bytes) || !bytes.length || !signatures[type]?.(bytes)) return res.status(422).json({ error: 'Upload a valid JPEG, PNG or WebP profile photo, up to 5 MB.' })
    const db = await database(), previous = (await db.prepare('SELECT avatar_storage_path FROM resident_profiles WHERE user_id = ?').get(req.resident.id))?.avatar_storage_path || null
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type], key = `profiles/${req.resident.id}/avatar.${extension}`
    await writeCitizenFile(key, bytes, type)
    try {
      const timestamp = now()
      await db.prepare(`INSERT INTO resident_profiles (user_id, full_name, avatar_storage_path, verification_status, updated_at) VALUES (?, ?, ?, 'unverified', ?) ON CONFLICT(user_id) DO UPDATE SET avatar_storage_path=excluded.avatar_storage_path, updated_at=excluded.updated_at`).run(req.resident.id, req.resident.name, key, timestamp)
      if (previous && previous !== key) await deleteCitizenFile(previous)
    } catch (error) { await deleteCitizenFile(key); throw error }
    res.status(201).json({ ok: true, avatar_url: `/api/citizen/profile/avatar?v=${encodeURIComponent(now())}` })
  })
  app.get('/api/citizen/profile/avatar', resident, async (req, res) => {
    const db = await database(), profile = await db.prepare('SELECT avatar_storage_path FROM resident_profiles WHERE user_id = ?').get(req.resident.id)
    if (!profile?.avatar_storage_path) return res.sendStatus(404)
    try { const bytes = await readCitizenFile(profile.avatar_storage_path); const type = profile.avatar_storage_path.endsWith('.png') ? 'image/png' : profile.avatar_storage_path.endsWith('.webp') ? 'image/webp' : 'image/jpeg'; res.set('Content-Type', type).send(bytes) }
    catch { res.sendStatus(404) }
  })
  // A browser address-bar navigation cannot send this header. This is an
  // additional browser/API boundary; resident still performs the real auth.
  const citizenFetchOnly = (req, res, next) => {
    if (req.get('X-Requested-With') !== 'GetafeCitizenPortal') {
      if (req.accepts('html')) {
        return res.status(403).type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Access Restricted · Getafe Citizen Portal</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f8fafc; color: #172033; }
    .card { width: min(100%, 520px); padding: 42px 38px; border: 1px solid #e2e8f0; border-radius: 20px; background: #fff; box-shadow: 0 20px 55px rgba(15, 23, 42, .10); text-align: center; }
    .icon { width: 64px; height: 64px; display: grid; place-items: center; margin: 0 auto 24px; border-radius: 18px; background: #eff6ff; color: #2563eb; }
    .icon svg { width: 30px; height: 30px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; }
    h1 { margin: 0 0 13px; font-size: clamp(1.7rem, 4vw, 2.15rem); letter-spacing: -.04em; }
    p { margin: 0 auto 26px; max-width: 420px; color: #64748b; font-size: 1rem; line-height: 1.65; }
    .badge { display: inline-flex; align-items: center; padding: 8px 13px; border-radius: 999px; background: #fef2f2; color: #b91c1c; font-size: .78rem; font-weight: 800; letter-spacing: .04em; }
    @media (max-width: 480px) { .card { padding: 34px 24px; } }
  </style>
</head>
<body>
  <main class="card" role="main">
    <div class="icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v2"/></svg>
    </div>
    <h1>Access Restricted</h1>
    <span class="badge">HTTP 403 Forbidden</span>
  </main>
</body>
</html>`)
      }

      return res.status(403).json({
        error: 'Forbidden',
        message: 'Direct API access restricted. Please use the Getafe Citizen Portal application.',
      })
    }
    next()
  }

  app.get('/api/citizen/weather', citizenFetchOnly, resident, async (req, res) => {
    const db = await database(), profile = await db.prepare('SELECT barangay FROM resident_profiles WHERE user_id = ?').get(req.resident.id)
    const selected = barangays.find(item => item.name.toLowerCase() === String(profile?.barangay || '').trim().toLowerCase()) || barangays.find(item => item.name === 'Poblacion')
    if (!selected?.coords) return res.status(404).json({ error: 'Add your barangay to your profile to see local weather.' })
    try { res.json({ barangay: selected.name, ...await getWeatherAt(selected.coords.lat, selected.coords.lng) }) }
    catch { res.status(502).json({ error: 'Weather is temporarily unavailable.' }) }
  })
  app.get('/api/citizen/applications/:id', resident, async (req, res) => {
    const db = await database(), application = await ownedApplication(db, req, req.params.id)
    if (!application) return res.status(404).json({ error: 'Application not found.' })
    res.json({ ...application, history: await db.prepare('SELECT * FROM application_status_history WHERE application_id = ? ORDER BY created_at DESC').all(application.id) })
  })
  app.post('/api/citizen/applications', resident, async (req, res) => {
    const service = citizenServices.find(item => item.name === req.body?.service_name)
    const concern = req.body?.service_name === 'Report a Concern'
    if (concern && !await actionThrottle('citizen-concern', `${req.resident.id}:${req.ip || 'unknown'}`, 5, 60 * 60 * 1000)) return res.status(429).json({ error: 'You have reached the hourly concern-report limit. Please try again later.' })
    if (!service && !concern) return res.status(422).json({ error: 'Choose an available municipal service.' })
    const details = req.body?.details
    if (!details || typeof details.purpose !== 'string' || !details.purpose.trim() || details.purpose.length > 4000) return res.status(422).json({ error: 'Enter the purpose or details of your request (up to 4,000 characters).' })
    const db = await database(), applicationId = id(), created = now(), reference = `GETAFE-${new Date().getFullYear()}-${applicationId.slice(0, 8).toUpperCase()}`
    const attachment = concern && details.attachment?.data ? details.attachment : null
    let attachmentBytes = null
    if (attachment) {
      const data = String(attachment.data || '')
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 === 1) return res.status(422).json({ error: 'The supporting file is invalid.' })
      attachmentBytes = Buffer.from(data, 'base64')
      const type = String(attachment.type || '').toLowerCase()
      const signatures = type === 'image/jpeg' ? attachmentBytes.length >= 3 && attachmentBytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
        : type === 'image/png' ? attachmentBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : type === 'application/pdf' ? attachmentBytes.subarray(0, 5).toString('ascii') === '%PDF-'
            : type === 'image/webp' ? (attachmentBytes.length >= 12 && attachmentBytes.toString('ascii', 0, 4) === 'RIFF' && attachmentBytes.toString('ascii', 8, 12) === 'WEBP')
              : type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? attachmentBytes.subarray(0, 2).toString('ascii') === 'PK'
                : type === 'application/msword' ? attachmentBytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) : false
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'].includes(type) || !signatures || attachmentBytes.length > 5 * 1024 * 1024) return res.status(422).json({ error: 'Attach a valid JPG, PNG, PDF, DOC, or DOCX file smaller than 5 MB.' })
    }
    await db.exec('BEGIN')
    try {
      await db.prepare('INSERT INTO applications (id,user_id,reference_number,service_name,status,payment_status,submitted_at,last_updated,details) VALUES (?,?,?,?,?,?,?,?,?)').run(applicationId, req.resident.id, reference, service?.name || 'Report a Concern', 'submitted', 'not_required', created, created, JSON.stringify({ purpose: details.purpose.trim() }))
      await db.prepare('INSERT INTO application_status_history (id,application_id,status,note,created_at) VALUES (?,?,?,?,?)').run(id(), applicationId, 'submitted', 'Application submitted by resident.', created)
      await notify(db, req.resident.id, 'Application submitted', `${service?.name || 'Your concern'} has been submitted. Reference: ${reference}.`, applicationId)
      await db.exec('COMMIT')
    } catch (error) { await db.exec('ROLLBACK'); throw error }
    if (concern && config.get('general.supportEmail')) {
      const subject = `Report a Concern · ${reference}`
      const text = `A resident submitted a report concern.\n\nReference: ${reference}\nResident: ${req.resident.name}\nEmail: ${req.resident.email}\n\nDetails:\n${details.purpose.trim()}`
      const attachments = attachmentBytes ? [{ filename: String(attachment.name || 'supporting-file').replace(/[\\/\r\n]/g, '_').slice(0, 160), content: attachmentBytes, contentType: attachment.type || 'application/octet-stream' }] : []
      if (attachmentBytes) await writeCitizenFile(`citizen-private/concerns/${req.resident.id}/${applicationId}-${attachments[0].filename}`, attachmentBytes, attachments[0].contentType)
      try { await sendEmail(config.get('general.supportEmail'), subject, text, undefined, undefined, attachments) } catch (error) { console.error('Unable to email report concern:', error.message) }
    }
    res.status(201).json({ id: applicationId, reference_number: reference })
  })
  app.post('/api/citizen/settlements', resident, async (req, res) => {
    const allowed = new Set(['Ordinance Violation', 'Public Market Stall', 'Miscellaneous Fees', 'Transport Franchise'])
    const category = String(req.body?.category || '').trim()
    const referenceNumber = String(req.body?.reference_number || '').trim().slice(0, 80)
    const amount = Number(req.body?.amount)
    const paymentMethod = String(req.body?.payment_method || '').trim()
    const notes = String(req.body?.notes || '').trim().slice(0, 1000)
    if (!allowed.has(category)) return res.status(422).json({ error: 'Choose a valid settlement type.' })
    if (!referenceNumber) return res.status(422).json({ error: 'Enter the notice, stall, fee, or franchise reference number.' })
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) return res.status(422).json({ error: 'Enter a valid amount between ₱0.01 and ₱10,000,000.' })
    if (!['Treasurer’s Office', 'GCash / e-wallet', 'Bank transfer'].includes(paymentMethod)) return res.status(422).json({ error: 'Choose a payment channel.' })
    const db = await database(), settlementId = id(), created = now(), tracking = `SET-${new Date().getFullYear()}-${settlementId.slice(0, 8).toUpperCase()}`
    await db.prepare('INSERT INTO settlement_requests (id,user_id,category,reference_number,amount,payment_method,status,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(settlementId, req.resident.id, category, referenceNumber, amount, paymentMethod, 'for_verification', notes, created)
    await notify(db, req.resident.id, 'Settlement request received', `${category} settlement ${tracking} was submitted for Treasurer verification.`, null)
    res.status(201).json({ id: settlementId, tracking_number: tracking })
  })
  app.post('/api/citizen/privacy-requests/verify-password', resident, async (req, res) => {
    const password = String(req.body?.password || '')
    if (!password || !passwordMatches(password, req.resident.password)) return res.status(401).json({ error: 'Password confirmation failed. Please try again.' })
    res.json({ ok: true })
  })
  app.post('/api/citizen/privacy-requests', resident, async (req, res) => {
    const allowed = new Set(['account_data', 'uploaded_files', 'close_account', 'all_eligible'])
    const scope = String(req.body?.scope || '')
    const password = String(req.body?.password || '')
    if (!allowed.has(scope)) return res.status(422).json({ error: 'Choose a valid privacy request scope.' })
    if (!password || !passwordMatches(password, req.resident.password)) return res.status(401).json({ error: 'Password confirmation failed. Please try again.' })
    const db = await database(), requestId = id(), created = now(), reference = `PRIV-${new Date().getFullYear()}-${requestId.slice(0, 8).toUpperCase()}`
    await db.exec('BEGIN')
    try {
      await db.prepare('INSERT INTO privacy_requests (id,user_id,request_type,scope,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(requestId, req.resident.id, 'Data deletion', scope, 'submitted', created, created)
      await db.prepare('INSERT INTO privacy_request_events (id,request_id,actor_id,actor_type,event,note,created_at) VALUES (?,?,?,?,?,?,?)').run(id(), requestId, req.resident.id, 'resident', 'submitted', 'Request received. Official records remain protected by applicable retention requirements.', created)
      await notify(db, req.resident.id, 'Privacy request submitted', `Your data privacy request ${reference} was received and is now Submitted.`, null)
      await db.exec('COMMIT')
    } catch (error) { await db.exec('ROLLBACK'); throw error }
    if (req.resident.email) try { await sendEmail(req.resident.email, `Privacy request received · ${reference}`, `Your data privacy request ${reference} was received and is now Submitted. The municipality will review eligible account data separately from records that must be retained by law or public-records policy.`) } catch (error) { console.error('Unable to send privacy request acknowledgement:', error.message) }
    res.status(201).json({ id: requestId, reference_number: reference, status: 'submitted' })
  })
  app.patch('/api/citizen/notifications/:id/read', resident, async (req, res) => {
    const db = await database()
    const result = await db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?').run(now(), req.params.id, req.resident.id)
    if (!result.changes) return res.status(404).json({ error: 'Notification not found.' })
    res.json({ ok: true })
  })
  app.patch('/api/citizen/notifications/read-all', resident, async (req, res) => {
    const db = await database()
    const result = await db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ? AND read_at IS NULL').run(now(), req.resident.id)
    res.json({ ok: true, updated: result.changes })
  })
  app.get('/api/citizen/appointments/availability', resident, async (req, res) => {
    const service = citizenServices.find(item => item.id === req.query.service_id)
    if (!service) return res.status(422).json({ error: 'Choose an available service.' })
    res.json(await appointmentAvailability(await database(), service.id))
  })
  app.post('/api/citizen/documents', resident, express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png'], limit: '5mb' }), async (req, res) => {
    const applicationId = String(req.query.application_id || ''), name = String(req.query.name || 'uploaded-document').replace(/[\\/\0\r\n]/g, '_').trim().slice(0, 255)
    const type = req.get('content-type')?.split(';')[0].trim().toLowerCase(), bytes = req.body
    const validSignature = Buffer.isBuffer(bytes) && (type === 'application/pdf' ? bytes.subarray(0, 5).toString('ascii') === '%PDF-' : type === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) : type === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : false)
    if (!applicationId || !name || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 5 * 1024 * 1024 || !validSignature) return res.status(422).json({ error: 'Upload a valid PDF, JPEG, or PNG smaller than 5 MB.' })
    const db = await database(), application = await ownedApplication(db, req, applicationId)
    if (!application) return res.status(404).json({ error: 'Application not found.' })
    const documentId = id(), extension = type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : 'jpg', storagePath = `citizen-private/documents/${req.resident.id}/${documentId}.${extension}`
    await writeCitizenFile(storagePath, bytes, type)
    try {
      await db.prepare('INSERT INTO application_documents (id,application_id,user_id,name,storage_path,verification_status,document_kind,created_at) VALUES (?,?,?,?,?,?,?,?)').run(documentId, applicationId, req.resident.id, name, storagePath, 'pending', 'uploaded', now())
      await notify(db, req.resident.id, 'Document uploaded', `${name} was uploaded to application ${application.reference_number}.`, applicationId, documentId)
    } catch (error) { await deleteCitizenFile(storagePath).catch(() => {}); throw error }
    res.status(201).json({ id: documentId, name, status: 'pending' })
  })
  app.post('/api/citizen/appointments', resident, async (req, res) => {
    const service = citizenServices.find(item => item.id === req.body?.service_id), date = new Date(req.body?.appointment_at), contact = String(req.body?.contact_number || '').replace(/\s+/g, ''), barangay = barangays.find(item => item.id === req.body?.barangay_id)
    if (!service || !Number.isFinite(date.getTime())) return res.status(422).json({ error: 'Choose an available appointment slot.' })
    if (!barangay) return res.status(422).json({ error: 'Choose a barangay for this appointment.' })
    if (contact && !/^09\d{9}$/.test(contact)) return res.status(422).json({ error: 'Enter a valid Philippine mobile number.' })
    const departments = { certificates: 'Municipal Civil Registrar', business: 'Business Permit and Licensing Office', health: 'Municipal Health Office', education: 'Municipal Social Welfare and Development' }
    const db = await database(), appointmentId = id()
    await db.exec('BEGIN IMMEDIATE')
    let integration, reference
    try {
      const availability = await appointmentAvailability(db, service.id), day = availability.dates.find(item => item.date === dayKey(date)), time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
      if (!day?.slots.some(slot => slot.time === time)) { await db.exec('ROLLBACK'); return res.status(409).json({ error: 'That slot is no longer available. Please select another time.' }) }
      integration = await db.prepare('SELECT notification_email,portal_url FROM barangay_appointment_integrations WHERE barangay_id = ?').get(barangay.id) || {}
      reference = `GTF-APT-${appointmentId.slice(0, 8).toUpperCase()}`
      await db.prepare('INSERT INTO appointments (id,user_id,department,service,service_id,appointment_at,reason,contact_number,barangay,barangay_portal_url,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(appointmentId, req.resident.id, departments[service.category], service.name, service.id, date.toISOString(), String(req.body?.reason || '').slice(0, 1000), contact, barangay.name, integration.portal_url || null, 'requested', now())
      await db.exec('COMMIT')
    } catch (error) { await db.exec('ROLLBACK'); throw error }
    const recipient = integration.notification_email || config.get('general.supportEmail')
    if (recipient) try { await sendEmail(recipient, `Appointment request · ${reference}`, `A new appointment request was submitted.\n\nReference: ${reference}\nBarangay: ${barangay.name}\nService: ${service.name}\nTime: ${date.toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}\nResident: ${req.resident.name}\nContact: ${contact}\nReason: ${String(req.body?.reason || '').slice(0, 1000)}`) } catch (error) { console.error('Unable to send barangay appointment email:', error.message) }
    res.status(201).json({ id: appointmentId, reference_number: reference, status: 'requested', barangay_portal_url: integration.portal_url || null })
  })
  app.get('/api/citizen/documents/:id/download', resident, async (req, res) => {
    const db = await database(), document = await db.prepare('SELECT * FROM application_documents WHERE id = ? AND user_id = ?').get(req.params.id, req.resident.id)
    if (!document?.storage_path) return res.status(404).json({ error: 'This document is not available for download.' })
    const bytes = await readCitizenFile(document.storage_path)
    res.set('Content-Type', 'application/octet-stream').set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`).send(bytes)
  })
  app.use('/api/citizen', (error, req, res, next) => {
    if (res.headersSent) return next(error)
    res.status(error.status === 413 ? 413 : 503).json({ error: error.status === 413 ? 'Files must be smaller than 5 MB.' : 'The citizen service is temporarily unavailable. Please try again.' })
  })
}
