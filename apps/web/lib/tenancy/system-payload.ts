import { getPayload, type Payload, type PayloadRequest } from 'payload'

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

  const req = options.req
  // **The request's OWN Payload instance, when there is one.**
  //
  // `getPayload` is keyed, and a second key is a second instance with its own connection pool.
  // Importing a fresh one here means a hook running inside a keyed instance's transaction writes
  // through a *different* pool — which cannot see the row that transaction has not committed.
  //
  // Measured the day `SEED_ON_CREATE` stopped being empty: `tests/uploads/native-upload.test.ts`
  // builds `getPayload({ config, key: 'native-upload-t034' })`, created an organization, and the
  // seed hook failed with `23503 — Key (tenant_id)=(15241) is not present in table
  // "organizations"`. Passing `req` was not enough and never could have been: the transaction id
  // it carries belongs to an instance this function was not using.
  //
  // `req.payload` is the authority on which instance is running the operation. The import stays
  // as the fallback for the callers that have no request at all.
  const payload =
    (req?.payload as Payload | undefined) ??
    (await getPayload({ config: (await import('../../payload.config')).default }))
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

      // The tenant id travels as a string through this module (hosts, params and headers are
      // all strings), but `organizations` uses Postgres integer ids. The scalar `tenant`
      // field coerces `"1"`, an **array row's** relationship does not — it fails with
      // `Orgs N > Organization is invalid`, naming the row rather than the type. Coerce here,
      // guarded so string ids (uuid, if the adapter ever changes) pass through untouched.
      const orgRef: string | number = /^\d+$/.test(tenantId) ? Number(tenantId) : tenantId

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
            { organization: orgRef, role },
          ],
        } as never,
      })
      return true
    },
  }
}
