import { getPortalPool } from './database.js'
import { hashPassword } from './passwordHashing.js'
import { validMobile } from '../../../src/data/residentContact.js'
import { config } from '../config/index.js'

export { validMobile } from '../../../src/data/residentContact.js'

export async function rememberGoogleProfile(user, profile) {
  const picture = typeof profile.picture === 'string' && profile.picture.startsWith('https://') ? profile.picture : null
  const pool = await getPortalPool()
  await pool.execute('INSERT INTO google_profiles (user_id, picture) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET picture=COALESCE(EXCLUDED.picture, google_profiles.picture)', [user.id, picture])
  await pool.execute('UPDATE portal_users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE id = ?', [user.id])
}

export async function googleOnboarding(user) {
  const pool = await getPortalPool()
  const [[google]] = await pool.execute('SELECT * FROM google_profiles WHERE user_id = ?', [user.id])
  if (!google) return { setupRequired: false }
  const [[profile]] = await pool.execute('SELECT * FROM resident_profiles WHERE user_id = ?', [user.id])
  const avatar = profile?.avatar_storage_path ? '/api/citizen/profile/avatar' : google.picture
  const mobileVerificationRequired = Boolean(config.get('authentication.requireMobileVerification'))
  const complete = Boolean(profile?.full_name?.trim() && validMobile(profile?.mobile) && user.email && (!mobileVerificationRequired || profile.mobile_verified_at))
  return { setupRequired: !google.completed || !google.password_set || !complete, googleAccount: true, passwordSet: Boolean(google.password_set), avatar_url: avatar, mobile: profile?.mobile || '', profileName: profile?.full_name || user.name, mobileVerified: Boolean(profile?.mobile_verified_at), mobileVerificationRequired }
}

export async function markGooglePasswordSet(userId) { await (await getPortalPool()).execute('UPDATE google_profiles SET password_set = TRUE, completed = FALSE WHERE user_id = ?', [userId]) }
export async function setGoogleInitialPassword(userId, password) {
  const encoded = await hashPassword(password)
  const connection = await (await getPortalPool()).getConnection()
  try {
    await connection.beginTransaction()
    const [[profile]] = await connection.execute('SELECT password_set FROM google_profiles WHERE user_id=? FOR UPDATE', [userId])
    if (!profile || profile.password_set) throw Object.assign(new Error('Initial password setup is already complete. Use Change password.'), { status:409 })
    await connection.execute('UPDATE portal_users SET password=?,updated_at=? WHERE id=?', [encoded,new Date(),userId])
    await connection.execute('UPDATE google_profiles SET password_set=TRUE,completed=FALSE WHERE user_id=?', [userId])
    await connection.commit()
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}
export async function markGoogleIdentityVerified(userId, method) { await (await getPortalPool()).execute('UPDATE google_profiles SET identity_verified = TRUE, verification_method = ?, completed = FALSE WHERE user_id = ?', [method, userId]) }
export async function completeGoogleOnboarding(user) {
  const pool = await getPortalPool()
  await pool.execute('UPDATE google_profiles SET completed = TRUE WHERE user_id = ?', [user.id])
  if ((await googleOnboarding(user)).setupRequired) { await pool.execute('UPDATE google_profiles SET completed = FALSE WHERE user_id = ?', [user.id]); return false }
  return true
}
