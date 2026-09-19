import { getLocalSqlite } from '../repositories/localDb.js'

export const validMobile = value => /^\+?[0-9]{10,15}$/.test(String(value || '').replace(/[\s()-]/g, ''))

async function database() {
  const db = await getLocalSqlite()
  db.exec('CREATE TABLE IF NOT EXISTS google_profiles (user_id TEXT PRIMARY KEY, picture TEXT, completed INTEGER NOT NULL DEFAULT 0, password_set INTEGER NOT NULL DEFAULT 0, identity_verified INTEGER NOT NULL DEFAULT 0, verification_method TEXT)')
  const columns = new Set(db.prepare('PRAGMA table_info(google_profiles)').all().map(column => column.name))
  if (!columns.has('password_set')) db.exec('ALTER TABLE google_profiles ADD COLUMN password_set INTEGER NOT NULL DEFAULT 0')
  if (!columns.has('identity_verified')) db.exec('ALTER TABLE google_profiles ADD COLUMN identity_verified INTEGER NOT NULL DEFAULT 0')
  if (!columns.has('verification_method')) db.exec('ALTER TABLE google_profiles ADD COLUMN verification_method TEXT')
  return db
}

export async function rememberGoogleProfile(user, profile) {
  const db = await database()
  const picture = typeof profile.picture === 'string' && profile.picture.startsWith('https://') ? profile.picture : null
  db.prepare('INSERT INTO google_profiles (user_id, picture) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET picture=COALESCE(excluded.picture, google_profiles.picture)').run(user.id, picture)
}

export async function googleOnboarding(user) {
  const db = await database()
  const google = db.prepare('SELECT * FROM google_profiles WHERE user_id = ?').get(user.id)
  if (!google) return { setupRequired: false }
  const profile = db.prepare('SELECT * FROM resident_profiles WHERE user_id = ?').get(user.id)
  const avatar = profile?.avatar_storage_path ? '/api/citizen/profile/avatar' : google.picture
  const complete = Boolean(profile?.full_name?.trim() && validMobile(profile?.mobile) && user.email && avatar)
  return { setupRequired: !google.completed || !google.password_set || !complete, googleAccount: true, passwordSet: Boolean(google.password_set), avatar_url: avatar, mobile: profile?.mobile || '', profileName: profile?.full_name || user.name }
}

export async function markGooglePasswordSet(userId) {
  const db = await database()
  db.prepare('UPDATE google_profiles SET password_set = 1, completed = 0 WHERE user_id = ?').run(userId)
}

export async function markGoogleIdentityVerified(userId, method) {
  const db = await database()
  db.prepare('UPDATE google_profiles SET identity_verified = 1, verification_method = ?, completed = 0 WHERE user_id = ?').run(method, userId)
}

export async function completeGoogleOnboarding(user) {
  const db = await database()
  db.prepare('UPDATE google_profiles SET completed = 1 WHERE user_id = ?').run(user.id)
  if ((await googleOnboarding(user)).setupRequired) {
    db.prepare('UPDATE google_profiles SET completed = 0 WHERE user_id = ?').run(user.id)
    return false
  }
  return true
}
