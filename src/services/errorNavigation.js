import { ROUTES } from '../routeRegistry.js'
import { getProtectedRouteState } from '../routeConfig.js'
import { MODULE_REGISTRY, resolveModuleAccess } from '../applicationModuleRegistry.js'

const publicDestinations = new Set([...Object.values(ROUTES.public), '/departments', '/tourism', '/services/directory', '/info/about', '/info/history', '/legal/privacy', '/legal/terms'])
export function isSafeErrorDestination(destination, auth = {}) {
  if (typeof destination !== 'string' || !destination.startsWith('/') || destination.startsWith('//') || /[\\?#]/.test(destination)) return false
  if (publicDestinations.has(destination)) return true
  const shell = destination === '/admin' || destination.startsWith('/admin/') ? 'admin' : destination === '/app/staff' || destination.startsWith('/app/staff/') ? 'staff' : 'app'
  const requiredRole = shell === 'app' ? 'citizen' : shell
  if (getProtectedRouteState({user:auth.user,requiredRole}) !== 'allowed' || auth.loading || auth.sessionUnavailable || auth.user?.setupRequired) return false
  if (shell === 'admin') return destination === ROUTES.admin.root && resolveModuleAccess('admin', 'dashboard', auth.user).state === 'allowed'
  const entry = Object.entries(MODULE_REGISTRY[shell]).find(([,module]) => module.path === destination)
  return Boolean(entry && resolveModuleAccess(shell,entry[0],auth.user).state === 'allowed')
}
export function getErrorNavigationContext(pathname, auth = {}, previous) {
  const path = String(pathname || '/')
  const privatePath = /^\/(app|admin)(\/|$)/.test(path)
  let destination=ROUTES.public.home, label='Back to Home'
  if (privatePath) {
    const choices = [
      [ROUTES.admin.root,'Back to Admin'],
      [ROUTES.staff.root,'Back to Staff Dashboard'],
      [ROUTES.app.root,'Back to Dashboard'],
    ]
    const choice=choices.find(([target]) => isSafeErrorDestination(target,auth))
    if(choice) [destination,label]=choice
  }
  const showBack=Boolean(previous?.successful && previous.pathname !== path && isSafeErrorDestination(previous.pathname,auth))
  return {label,destination,secondaryLabel:'Go Back',showBack,backDestination:showBack?previous.pathname:null,helpDestination:destination===ROUTES.staff.root && isSafeErrorDestination(ROUTES.staff.help,auth)?ROUTES.staff.help:destination===ROUTES.app.root?ROUTES.app.help:ROUTES.public.contact}
}
