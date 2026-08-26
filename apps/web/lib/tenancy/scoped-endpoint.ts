import type { Endpoint, PayloadRequest } from 'payload'

import { TenantUnresolvedError } from './errors'
import { getTenantScopedPayload } from './scoped-payload'

/**
 * A tenant-scoped read endpoint, shared by every scoped collection (FR-019, CF-9).
 *
 * **Why this exists at all.** "Custom endpoints" is one of the four surfaces the isolation
 * harness must assert against (`docs/tech-stack.md:151`), and a surface with no subject
 * tests nothing — the same vacuous-pass failure as a harness with no scoped collections.
 * Declaring one endpoint per scoped collection gives that surface something real to leak
 * through, if it can.
 *
 * **Why a factory rather than two hand-written handlers.** Two copies drift: the day one of
 * them forgets the choke point is the day the harness stops covering it, and a copy-paste
 * difference between two files is exactly the kind of thing review skims past. One
 * implementation means the harness's verdict applies to every collection that uses it.
 */
export function scopedListEndpoint(collectionSlug: string): Omit<Endpoint, 'root'> {
  return {
    path: '/mine',
    method: 'get',
    handler: async (req: PayloadRequest) => {
      try {
        // The choke point, exactly as any other caller uses it — no shortcut for being
        // "internal". If this endpoint could see across tenants, so could the app.
        const db = await getTenantScopedPayload(req)
        const { docs, totalDocs } = await db.find({ collection: collectionSlug, depth: 0 })
        return Response.json({ docs, totalDocs })
      } catch (err) {
        // An unresolved host is a 404, never an empty list: "no organization here" and
        // "this organization has nothing" are different answers, and collapsing them would
        // tell an unauthenticated prober which hosts exist.
        if (err instanceof TenantUnresolvedError) {
          return Response.json({ error: 'Not found' }, { status: 404 })
        }
        // Payload throws Forbidden for a user with no membership (verified in the spike:
        // 403, not zero rows). Surface it as such rather than as a 500.
        const status = (err as { status?: number })?.status
        if (status === 403) return Response.json({ error: 'Forbidden' }, { status: 403 })
        throw err
      }
    },
  }
}
