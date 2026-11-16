export const APP_SURFACES = Object.freeze({ all: 'all', public: 'public', resident: 'resident', admin: 'admin' })

export function surfaceAllowsPath(surface, pathname) {
  if (!surface || surface === APP_SURFACES.all) return true
  const path = String(pathname || '/')
  if (surface === APP_SURFACES.public) return !path.startsWith('/app') && !path.startsWith('/admin')
  if (surface === APP_SURFACES.resident) return path.startsWith('/app') || path.startsWith('/auth')
  if (surface === APP_SURFACES.admin) return path.startsWith('/admin') || path.startsWith('/auth')
  return false
}
