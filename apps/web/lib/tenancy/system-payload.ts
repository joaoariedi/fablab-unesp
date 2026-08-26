import { getPayload, type PayloadRequest } from 'payload'

import { buildTenantClient, type TenantScopedPayload } from './client'

/**
 * The explicit-tenant write client (FR-032).
 *
 * ⚠ **Import-fenced and never exported from `index.ts`.** `eslint.config.mjs` blocks
 * importing this module outside `lib/tenancy/`. It runs with `overrideAccess: true`, which
 * makes it the single most dangerous object in the codebase, so its consumers are
 * enumerated rather than discovered.
 *
 * **Why it has to exist.** Two operations have no request tenant to infer:
 *
 *   - *Seed-on-create* runs when a master creates organization B while being served on some
 *     other host. A request-scoped client would resolve the master's host and seed the
 *     **wrong** organization, or throw on an apex host.
 *   - *Invite* writes a membership into the global `users` collection, which organization
 *     admins cannot see — a request-scoped write would be denied by the very access rule
 *     FR-022 requires.
 *
 * In both cases the tenant is **named by the caller**, never inferred from the URL. That is
 * the property that makes this safe enough to exist.
 */

export type MembershipRole = 'admin' | 'staff' | 'maker'

/**
 * **[CF-1]** `addMembership` is declared here rather than discovered during implementation.
 * The plan review caught that the invite path needed an operation the client's type did not
 * offer — a gap that would have surfaced as an ad-hoc `payload.update` somewhere outside
 * this module, which is exactly the leak the import boundary exists to prevent.
 */
export type SystemScopedPayload = TenantScopedPayload & {
  /**
   * Adds `{ organization: tenantId, role }` to a user's memberships, idempotently.
   *
   * Returns `true` when a membership was added and `false` when the user was already a
   * member — FR-021's no-op, reported rather than silently swallowed so the caller can log
   * which branch it took without leaking it into the response.
   */
  addMembership: (userId: string | number, role: MembershipRole) => Promise<boolean>
}

export type SystemClientOptions = {
  /**
   * **Propagate the `req` when calling from inside a hook.** Payload runs each operation in
   * a transaction, and a client built without `req` opens its own connection — so a hook
   * writing a child row cannot see the parent row its own operation just inserted, and
   * Postgres rejects the write with a foreign-key violation.
   *
   * Measured, not theorised: seed-on-create failed with
   * `Key (tenant_id)=(2) is not present in table "organizations"` until this was threaded
   * through. `docs/tech-stack.md` names this as mandatory fix #1 for exactly the same
   * reason on the XP ledger — the hook must share the transaction of the action that
   * caused it.
   */
  req?: PayloadRequest
}

export async function getSystemScopedPayload(
  tenantId: string,
  options: SystemClientOptions = {},
): Promise<SystemScopedPayload> {
  if (!tenantId) {
    throw new Error('getSystemScopedPayload requires an explicit tenant id — it never infers one.')
  }

  const payload = await getPayload({ config: (await import('../../payload.config')).default })
  const req = options.req
  const base = buildTenantClient({ payload, tenantId, overrideAccess: true, req })

  return {
    ...base,

    addMembership: async (userId, role) => {
      const user = await payload.findByID({
        collection: 'users',
        id: userId,
        depth: 0,
        overrideAccess: true,
        ...(req ? { req } : {}),
      })

      const existing = (user as { orgs?: { organization?: unknown; role?: string }[] }).orgs ?? []
      const already = existing.some((row) => {
        const ref = row?.organization
        const id = typeof ref === 'object' && ref !== null && 'id' in ref ? ref.id : ref
        return String(id) === String(tenantId)
      })
      if (already) return false

      await payload.update({
        collection: 'users',
        id: userId,
        depth: 0,
        overrideAccess: true,
        ...(req ? { req } : {}),
        data: {
          orgs: [
            ...existing.map((row) => {
              const ref = row?.organization
              const id = typeof ref === 'object' && ref !== null && 'id' in ref ? ref.id : ref
              return { organization: id, role: row?.role }
            }),
            { organization: tenantId, role },
          ],
        } as never,
      })
      return true
    },
  }
}
