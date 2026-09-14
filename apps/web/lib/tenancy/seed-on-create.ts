import type { CollectionAfterChangeHook } from 'payload'

import { REGRAS_XP_CITE } from '../../collections/content/RegrasXp'
import { TENANT_RESOLUTION_TAG } from './resolve'
import { getSystemScopedPayload, type SystemScopedPayload } from './system-payload'

/**
 * Seed-on-create (FR-010, FR-031).
 *
 * Later features register the defaults a **new** organization must start with — feature 005
 * pushes the XP rules and the skills catalog here. Feature 000 ships the mechanism and its
 * test, so 005 has a defined place to plug into instead of inventing one.
 *
 * **Copy, never inherit.** Defaults are written into the new organization's own rows at
 * creation. The alternative — resolving to a global fallback at read time — leaves every
 * later reader asking "is this null, or inherited?", and that ambiguity is the kind that
 * gets debugged at 2am rather than designed away.
 */

export type SeedFn = ((sys: SystemScopedPayload, organizationId: string) => Promise<void>) & {
  /**
   * The collection this seed writes.
   *
   * Carried on the function so the registry is **self-describing**: anything that needs to know
   * "which collections already have a row the moment an organization exists" reads it from here
   * instead of keeping a second list that goes stale silently.
   *
   * `tests/tenancy/fixtures.ts` is the first such reader — it **adopts** these rows rather than
   * creating its own, because they are singletons per organization and a fixture row beside the
   * seeded one gave each lab two economies. That was measured: `isolation.test.ts`'s graphql
   * vantage point went red with *"a surface disclosed row 871, which this fixture did not
   * seed"*, and 871 and 873 both belonged to organization A. Nothing had leaked; there were two
   * of it.
   */
  readonly collection: string
}

/**
 * The XP economy a new organization starts with (T013, FR-009).
 *
 * `regrasXp.create` is a flat refusal for **every** role, so this is the only path by which
 * the row can ever arrive: the system client runs `overrideAccess: true` and therefore never
 * reaches that rule. A lab created without it has no economy at all, and every reader of the
 * curve — `creditXp`, the projections, the lab level, the ranking — divides by `undefined`.
 *
 * The three tunables are written explicitly from `REGRAS_XP_CITE` rather than left to the
 * collection's `defaultValue`s. Both spellings produce the same row today; this one keeps the
 * seed honest the day somebody removes a default, and it is why `RegrasXp.ts` exports the
 * constant instead of this file retyping `1 / 5 / 10` (CLR-010 — those numbers are the CITe
 * **seed**, and the authority afterwards is the row).
 *
 * `organizationId` is not read: `sys.create` injects the tenant for a scoped collection, and
 * naming it here again would be a second answer to a question the client already owns.
 */
const seedRegrasXp: SeedFn = Object.assign(
  async (sys: SystemScopedPayload) => {
    await sys.create({ collection: 'regrasXp', data: { ...REGRAS_XP_CITE } })
  },
  { collection: 'regrasXp' } as const,
)

/** Features 005+ push their defaults here. Feature 005 registers the XP economy (FR-009). */
export const SEED_ON_CREATE: SeedFn[] = [seedRegrasXp]

/**
 * Runs every registered seed against the **newly created** organization.
 *
 * **[N1] The system client is what makes this correct.** A master creating organization B
 * is being served on some *other* host, so a request-scoped client would resolve the
 * master's current tenant and seed B's defaults into it — or throw on an apex host. The
 * tenant here must be `doc.id`, named explicitly, which is the whole reason
 * `getSystemScopedPayload` exists.
 */
export const seedNewOrganization: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create') return doc

  const organizationId = String((doc as { id: string | number }).id)
  // `req` is passed so the seeded rows join the SAME transaction that created the
  // organization. Without it this hook opens its own connection, cannot see the still
  // uncommitted organization row, and Postgres rejects every seeded child with a
  // foreign-key violation — which is exactly how this was found.
  const sys = await getSystemScopedPayload(organizationId, { req })

  for (const seed of SEED_ON_CREATE) {
    await seed(sys, organizationId)
  }
  return doc
}

/**
 * Invalidates cached host→organization resolution whenever an organization changes.
 *
 * **[N3] This is correctness, not performance.** Without it a newly created organization
 * 404s until the cache entry expires, and a renamed domain keeps routing to the old owner.
 *
 * The `try` is not defensive padding: `revalidateTag` throws
 * `Invariant: static generation store missing` outside a Next request scope — measured in
 * spike S8 — and organizations are created by the seed script and by tests, both of which
 * run outside one. Letting that throw would break seeding to invalidate a cache that does
 * not exist in that context.
 */
export const revalidateTenantResolution: CollectionAfterChangeHook = async ({ doc }) => {
  try {
    const { revalidateTag } = await import('next/cache')
    // Next 16 requires a cache-life profile as the second argument — the one-argument form
    // from Next 15 no longer type-checks. 'max' means "valid until explicitly revalidated",
    // which is what an invalidate-on-change tag wants: the data is fresh precisely because
    // this hook fires, not because a timer expired.
    revalidateTag(TENANT_RESOLUTION_TAG, 'max')
  } catch {
    // Not in a Next request scope (seed, CLI, tests) — there is no cache to invalidate.
  }
  return doc
}
