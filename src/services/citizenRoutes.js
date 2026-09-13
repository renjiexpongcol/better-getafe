import express from 'express'
import { getLocalSqlite, id, now } from '../repositories/localDb.js'
import { citizenServices } from '../data/citizenServices.js'
import { config } from '../config/index.js'
import { writeCitizenFile, readCitizenFile, deleteCitizenFile } from './storage.js'
import { getWeatherAt } from './getafeWeather.js'
import { barangays } from '../data/barangays.js'

export function installCitizenRoutes(app, resident, safeUser) {
  app.use('/api/citizen', (req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  const database = async () => {
    const db = await getLocalSqlite()
    for (const [table, column, definition] of [
      ['resident_profiles', 'avatar_storage_path', 'TEXT'],
      ['application_documents', 'document_kind', "TEXT NOT NULL DEFAULT 'uploaded'"],
      ['notifications', 'application_id', 'TEXT'], ['notifications', 'document_id', 'TEXT'],
    ]) {
      if (!db.prepare(`PRAGMA table_info(${table})`).all().some(item => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
    return db
  }
  const ownedApplication = (db, req, applicationId) => db.prepare('SELECT * FROM applications WHERE id = ? AND user_id = ?').get(applicationId, req.resident.id)
  const notify = (db, userId, title, message, applicationId = null, documentId = null) => db.prepare('INSERT INTO notifications (id,user_id,title,message,application_id,document_id,created_at) VALUES (?,?,?,?,?,?,?)').run(id(), userId, title, message, applicationId, documentId, now())
  const profileView = profile => {
    if (!profile) return null
    const view = { ...profile, avatar_url: profile.avatar_storage_path ? `/api/citizen/profile/avatar?v=${encodeURIComponent(profile.updated_at || '')}` : null }
    delete view.avatar_storage_path
    return view
  }

  app.get('/api/citizen/dashboard', resident, async (req, res) => {
    const db = await database(), userId = req.resident.id
    const applications = db.prepare(`SELECT a.*, (SELECT note FROM application_status_history WHERE application_id = a.id ORDER BY created_at DESC LIMIT 1) AS latest_note FROM applications a WHERE user_id = ? ORDER BY last_updated DESC`).all(userId)
    const documents = db.prepare('SELECT id,application_id,name,verification_status,document_kind,created_at,CASE WHEN storage_path IS NOT NULL AND storage_path != \'\' THEN 1 ELSE 0 END AS downloadable FROM application_documents WHERE user_id = ? ORDER BY created_at DESC').all(userId)
    const payments = db.prepare('SELECT p.*, a.service_name FROM payments p LEFT JOIN applications a ON a.id = p.application_id AND a.user_id = p.user_id WHERE p.user_id = ? ORDER BY p.created_at DESC').all(userId)
    const appointments = db.prepare('SELECT * FROM appointments WHERE user_id = ? ORDER BY appointment_at').all(userId)
    const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? AND archived_at IS NULL ORDER BY created_at DESC').all(userId)
    const profile = db.prepare('SELECT * FROM resident_profiles WHERE user_id = ?').get(userId) || { full_name: req.resident.name }
    res.json({ user: safeUser(req.resident), profile: profileView(profile), applications, documents, payments, appointments, notifications })
  })
  app.get('/api/citizen/profile', resident, async (req, res) => {
    const db = await database(), profile = db.prepare('SELECT * FROM resident_profiles WHERE user_id = ?').get(req.resident.id)
    res.json(profileView(profile || { user_id: req.resident.id, full_name: req.resident.name, email: req.resident.email, verification_status: 'unverified' }))
  })
  app.put('/api/citizen/profile', resident, async (req, res) => {
    const db = await database(), timestamp = now(), body = req.body || {}
    db.prepare(`INSERT INTO resident_profiles (user_id, full_name, mobile, barangay, house_lot, street, purok_sitio, municipality, province, zip_code, verification_status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified', ?) ON CONFLICT(user_id) DO UPDATE SET full_name=excluded.full_name, mobile=excluded.mobile, barangay=excluded.barangay, house_lot=excluded.house_lot, street=excluded.street, purok_sitio=excluded.purok_sitio, municipality=excluded.municipality, province=excluded.province, zip_code=excluded.zip_code, updated_at=excluded.updated_at`).run(req.resident.id, String(body.full_name || req.resident.name).slice(0, 160), String(body.mobile || '').slice(0, 32), String(body.barangay || '').slice(0, 160), String(body.house_lot || '').slice(0, 160), String(body.street || '').slice(0, 160), String(body.purok_sitio || '').slice(0, 160), String(body.municipality || 'Getafe').slice(0, 100), String(body.province || 'Bohol').slice(0, 100), String(body.zip_code || '').slice(0, 16), timestamp)
    res.json({ ok: true, profile: profileView(db.prepare('SELECT * FROM resident_profiles WHERE user_id = ?').get(req.resident.id)) })
  })
  app.post('/api/citizen/profile/avatar', resident, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }), async (req, res) => {
    if (!config.get('features.uploads')) return res.status(403).json({ error: 'Profile uploads are currently disabled.' })
    const bytes = req.body, type = req.get('content-type')?.split(';')[0].trim().toLowerCase()
    const signatures = { 'image/jpeg': value => value.toString('hex', 0, 3) === 'ffd8ff', 'image/png': value => value.toString('hex', 0, 8) === '89504e470d0a1a0a', 'image/webp': value => value.toString('ascii', 0, 4) === 'RIFF' && value.toString('ascii', 8, 12) === 'WEBP' }
    if (!Buffer.isBuffer(bytes) || !bytes.length || !signatures[type]?.(bytes)) return res.status(422).json({ error: 'Upload a valid JPEG, PNG or WebP profile photo, up to 5 MB.' })
    const db = await database(), previous = db.prepare('SELECT avatar_storage_path FROM resident_profiles WHERE user_id = ?').get(req.resident.id)?.avatar_storage_path || null
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type], key = `profiles/${req.resident.id}/avatar.${extension}`
    await writeCitizenFile(key, bytes, type)
    try {
      const timestamp = now()
      db.prepare(`INSERT INTO resident_profiles (user_id, full_name, avatar_storage_path, verification_status, updated_at) VALUES (?, ?, ?, 'unverified', ?) ON CONFLICT(user_id) DO UPDATE SET avatar_storage_path=excluded.avatar_storage_path, updated_at=excluded.updated_at`).run(req.resident.id, req.resident.name, key, timestamp)
      if (previous && previous !== key) await deleteCitizenFile(previous)
    } catch (error) { await deleteCitizenFile(key); throw error }
    res.status(201).json({ ok: true, avatar_url: `/api/citizen/profile/avatar?v=${encodeURIComponent(now())}` })
  })
  app.get('/api/citizen/profile/avatar', resident, async (req, res) => {
    const db = await database(), profile = db.prepare('SELECT avatar_storage_path FROM resident_profiles WHERE user_id = ?').get(req.resident.id)
    if (!profile?.avatar_storage_path) return res.sendStatus(404)
    try { const bytes = await readCitizenFile(profile.avatar_storage_path); const type = profile.avatar_storage_path.endsWith('.png') ? 'image/png' : profile.avatar_storage_path.endsWith('.webp') ? 'image/webp' : 'image/jpeg'; res.set('Content-Type', type).set('Cache-Control', 'private, max-age=300').send(bytes) }
    catch { res.sendStatus(404) }
  })
  app.get('/api/citizen/weather', resident, async (req, res) => {
    const db = await database(), profile = db.prepare('SELECT barangay FROM resident_profiles WHERE user_id = ?').get(req.resident.id)
    const selected = barangays.find(item => item.name.toLowerCase() === String(profile?.barangay || '').trim().toLowerCase()) || barangays.find(item => item.name === 'Poblacion')
    if (!selected?.coords) return res.status(404).json({ error: 'Add your barangay to your profile to see local weather.' })
    try { res.set('Cache-Control', 'private, max-age=600').json({ barangay: selected.name, ...await getWeatherAt(selected.coords.lat, selected.coords.lng) }) }
    catch { res.status(502).json({ error: 'Weather is temporarily unavailable.' }) }
  })
  app.get('/api/citizen/applications/:id', resident, async (req, res) => {
    const db = await database(), application = ownedApplication(db, req, req.params.id)
    if (!application) return res.status(404).json({ error: 'Application not found.' })
    res.json({ ...application, history: db.prepare('SELECT * FROM application_status_history WHERE application_id = ? ORDER BY created_at DESC').all(application.id) })
  })
  app.post('/api/citizen/applications', resident, async (req, res) => {
    const service = citizenServices.find(item => item.name === req.body?.service_name)
    const concern = req.body?.service_name === 'Report a Concern'
    if (!service && !concern) return res.status(422).json({ error: 'Choose an available municipal service.' })
    const details = req.body?.details
    if (!details || typeof details.purpose !== 'string' || !details.purpose.trim() || details.purpose.length > 4000) return res.status(422).json({ error: 'Enter the purpose or details of your request (up to 4,000 characters).' })
    const db = await database(), applicationId = id(), created = now(), reference = `GETAFE-${new Date().getFullYear()}-${applicationId.slice(0, 8).toUpperCase()}`
    db.exec('BEGIN')
    try {
      db.prepare('INSERT INTO applications (id,user_id,reference_number,service_name,status,payment_status,submitted_at,last_updated,details) VALUES (?,?,?,?,?,?,?,?,?)').run(applicationId, req.resident.id, reference, service?.name || 'Report a Concern', 'submitted', 'not_required', created, created, JSON.stringify({ purpose: details.purpose.trim() }))
      db.prepare('INSERT INTO application_status_history (id,application_id,status,note,created_at) VALUES (?,?,?,?,?)').run(id(), applicationId, 'submitted', 'Application submitted by resident.', created)
      notify(db, req.resident.id, 'Application submitted', `${service?.name || 'Your concern'} has been submitted. Reference: ${reference}.`, applicationId)
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); throw error }
    res.status(201).json({ id: applicationId, reference_number: reference })
  })
  app.patch('/api/citizen/notifications/:id/read', resident, async (req, res) => {
    const db = await database()
    const result = db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?').run(now(), req.params.id, req.resident.id)
    if (!result.changes) return res.status(404).json({ error: 'Notification not found.' })
    res.json({ ok: true })
  })
  app.post('/api/citizen/appointments', resident, async (req, res) => {
    const service = citizenServices.find(item => item.id === req.body?.service_id), date = new Date(req.body?.appointment_at)
    if (!service || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) return res.status(422).json({ error: 'Choose a service and a future appointment date.' })
    const departments = { certificates: 'Municipal Civil Registrar', business: 'Business Permit and Licensing Office', health: 'Municipal Health Office', education: 'Municipal Social Welfare and Development' }
    const db = await database(), appointmentId = id()
    db.prepare('INSERT INTO appointments (id,user_id,department,service,appointment_at,status,created_at) VALUES (?,?,?,?,?,?,?)').run(appointmentId, req.resident.id, departments[service.category], service.name, date.toISOString(), 'requested', now())
    res.status(201).json({ id: appointmentId, status: 'requested' })
  })
  app.post('/api/citizen/documents', resident, express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png'], limit: '5mb' }), async (req, res) => {
    if (!config.get('features.uploads')) return res.status(403).json({ error: 'Document uploads are currently disabled.' })
    const db = await database(), applicationId = String(req.query.application_id || '')
    if (!ownedApplication(db, req, applicationId)) return res.status(404).json({ error: 'Select one of your applications.' })
    const bytes = req.body, type = req.get('content-type')
    const signatures = { 'application/pdf': '255044462d', 'image/jpeg': 'ffd8ff', 'image/png': '89504e470d0a1a0a' }
    if (!Buffer.isBuffer(bytes) || !bytes.length || !signatures[type] || !bytes.toString('hex', 0, 8).startsWith(signatures[type])) return res.status(422).json({ error: 'Upload a valid PDF, JPEG or PNG, up to 5 MB.' })
    const name = String(req.query.name || 'Document').replace(/[\r\n\\/]/g, '_').slice(0, 160), documentId = id(), key = `citizen-private/documents/${req.resident.id}/${documentId}.${{ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[type]}`
    await writeCitizenFile(key, bytes, type)
    try { db.prepare('INSERT INTO application_documents (id,application_id,user_id,name,storage_path,document_kind,created_at) VALUES (?,?,?,?,?,?,?)').run(documentId, applicationId, req.resident.id, name, key, 'uploaded', now()) }
    catch (error) { await deleteCitizenFile(key); throw error }
    res.status(201).json({ id: documentId })
  })
  app.get('/api/citizen/documents/:id/download', resident, async (req, res) => {
    const db = await database(), document = db.prepare('SELECT * FROM application_documents WHERE id = ? AND user_id = ?').get(req.params.id, req.resident.id)
    if (!document?.storage_path) return res.status(404).json({ error: 'This document is not available for download.' })
    const bytes = await readCitizenFile(document.storage_path)
    res.set('Content-Type', 'application/octet-stream').set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`).send(bytes)
  })
  app.use('/api/citizen', (error, req, res, next) => {
    if (res.headersSent) return next(error)
    res.status(error.status === 413 ? 413 : 503).json({ error: error.status === 413 ? 'Files must be smaller than 5 MB.' : 'The citizen service is temporarily unavailable. Please try again.' })
  })
}
