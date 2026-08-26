import type { CollectionAfterChangeHook } from 'payload'

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

export type SeedFn = (sys: SystemScopedPayload, organizationId: string) => Promise<void>

/** Features 005+ push their defaults here. Empty in feature 000, by design. */
export const SEED_ON_CREATE: SeedFn[] = []

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
