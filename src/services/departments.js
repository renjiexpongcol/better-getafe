import { cachedRequest } from './requestCache'
import { destinationRequest } from './destinations'

// Coalesce simultaneous reads, including StrictMode effects, without retaining
// published office data after navigation or delaying CMS publication changes.
export const departmentRequest = url => cachedRequest(url, () => destinationRequest(url, { cache: 'no-store' }), { ttl: 0, persist: false })
