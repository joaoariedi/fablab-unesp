import { getPayload } from 'payload'

/**
 * The allowlisted reads that cannot themselves be tenant-filtered.
 *
 * ⚠ **This file is import-fenced.** `eslint.config.mjs` forbids importing it from anywhere
 * outside `lib/tenancy/`, and it is never re-exported from `index.ts`. Every function here
 * bypasses access control on purpose, so the list is short, exhaustive, and each entry
 * states why it cannot be scoped.
 *
 * The rule for adding one: a read belongs here only if scoping it is **impossible**, not
 * merely inconvenient. Two of the three below exist to *compare* tenants, which a
 * tenant-filtered query cannot do by definition; the third serves anonymous visitors who
 * have no tenant yet.
 */

/**
 * The Payload config is imported **lazily**, not at module scope.
 *
 * payload.config -> collections -> lib/tenancy -> payload.config is a real import cycle.
 * Under ESM a static cycle here resolves to `undefined` at init time depending on which
 * module the runtime enters first, producing a "config is not defined" failure that looks
 * random. A dynamic import defers the edge to call time, when the cycle is settled.
 */
const loadConfig = async () => (await import('../../payload.config')).default

const client = async () => getPayload({ config: await loadConfig() })

/**
 * Reads a single document's tenant so the same-tenant validator can compare it with the
 * document being written. Cannot be scoped: the entire question is "which tenant is this?",
 * and a scoped query would answer it by returning nothing.
 *
 * Returns only the tenant id — never the document — so a caller cannot use this as a
 * general-purpose reader.
 */
export async function unscopedLookupTenant(
  collection: string,
  id: string | number,
): Promise<string | null> {
  const payload = await client()
  try {
    const doc = await payload.findByID({
      collection: collection as never,
      id,
      depth: 0,
      overrideAccess: true, // deliberate: see the file header
    })
    const tenant = (doc as { tenant?: unknown })?.tenant
    if (tenant === null || tenant === undefined) return null
    return String(typeof tenant === 'object' && 'id' in tenant ? tenant.id : tenant)
  } catch {
    // A missing document is not an error here — the relationship validator treats an
    // unresolvable reference as "not same tenant" and rejects it.
    return null
  }
}

/**
 * Finds a user by e-mail across the whole platform.
 *
 * Cannot be scoped: identity is global, and the invite flow's entire job is to discover
 * whether an address already belongs to an account **in any organization**. Scoping it
 * would make the invite create a duplicate account for someone who already exists — the
 * exact outcome FR-021 forbids.
 *
 * Returns the id and nothing else. Anything richer would turn this into an account-
 * enumeration oracle if it ever leaked into a response (US8).
 */
export async function unscopedFindUserIdByEmail(email: string): Promise<string | number | null> {
  const payload = await client()
  const result = await payload.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true, // deliberate: see the file header
    where: { email: { equals: email } },
  })
  return result.docs[0]?.id ?? null
}
