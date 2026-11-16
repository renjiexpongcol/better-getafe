import { verifyPassword } from './passwordHashing.js'

const cmsRoles = ['admin', 'super_admin', 'staff', 'it_support', 'content_manager']

export async function selectLoginAccount(password, cmsUser, portalUser, dummyHash) {
  // Both domains allow independent accounts for the same normalized email.
  // Verify both records (or dummy hashes), never let lookup order substitute
  // for credential proof. CMS retains precedence only when its proof is valid.
  const [cmsCheck, portalCheck] = await Promise.all([
    verifyPassword(password, cmsUser?.password, dummyHash),
    verifyPassword(password, portalUser?.password, dummyHash),
  ])
  if (cmsUser && cmsRoles.includes(cmsUser.role) && cmsCheck.valid) return { user: cmsUser, kind: 'cms', passwordCheck: cmsCheck }
  if (portalUser?.role === 'resident' && portalCheck.valid) return { user: portalUser, kind: 'portal', passwordCheck: portalCheck }
  return null
}
