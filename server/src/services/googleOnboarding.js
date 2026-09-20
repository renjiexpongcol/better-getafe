import { getPortalPool } from './cloudSql.js'

export const validMobile = value => /^\+?[0-9]{10,15}$/.test(String(value || '').replace(/[\s()-]/g, ''))

export async function rememberGoogleProfile(user, profile) {
  const picture = typeof profile.picture === 'string' && profile.picture.startsWith('https://') ? profile.picture : null
  await (await getPortalPool()).execute('INSERT INTO google_profiles (user_id, picture) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET picture=COALESCE(EXCLUDED.picture, google_profiles.picture)', [user.id, picture])
}

export async function googleOnboarding(user) {
  const pool = await getPortalPool()
  const [[google]] = await pool.execute('SELECT * FROM google_profiles WHERE user_id = ?', [user.id])
  if (!google) return { setupRequired: false }
  const [[profile]] = await pool.execute('SELECT * FROM resident_profiles WHERE user_id = ?', [user.id])
  const avatar = profile?.avatar_storage_path ? '/api/citizen/profile/avatar' : google.picture
  const complete = Boolean(profile?.full_name?.trim() && validMobile(profile?.mobile) && user.email && avatar)
  return { setupRequired: !google.completed || !google.password_set || !complete, googleAccount: true, passwordSet: Boolean(google.password_set), avatar_url: avatar, mobile: profile?.mobile || '', profileName: profile?.full_name || user.name }
}

export async function markGooglePasswordSet(userId) { await (await getPortalPool()).execute('UPDATE google_profiles SET password_set = TRUE, completed = FALSE WHERE user_id = ?', [userId]) }
export async function markGoogleIdentityVerified(userId, method) { await (await getPortalPool()).execute('UPDATE google_profiles SET identity_verified = TRUE, verification_method = ?, completed = FALSE WHERE user_id = ?', [method, userId]) }
export async function completeGoogleOnboarding(user) {
  const pool = await getPortalPool()
  await pool.execute('UPDATE google_profiles SET completed = TRUE WHERE user_id = ?', [user.id])
  if ((await googleOnboarding(user)).setupRequired) { await pool.execute('UPDATE google_profiles SET completed = FALSE WHERE user_id = ?', [user.id]); return false }
  return true
}
