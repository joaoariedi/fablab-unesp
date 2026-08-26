import { getPayload } from 'payload'

/**
 * Host → organization resolution.
 *
 * **Why this file is split in two.** Spike S8 measured what `next/cache` does outside a
 * Next request scope: `unstable_cache` throws `Invariant: incrementalCache missing`,
 * `revalidateTag` throws `Invariant: static generation store missing`, and `headers()`
 * throws outright. A resolver that reaches for those at the top of its call path cannot be
 * exercised by a test at all — SC-006 and CHK031 would have had no way to run.
 *
 * So `lookupOrganizationByHost` is pure of `next/cache` and is what tests call.
 * `resolveTenant` is the cached wrapper production uses, and it takes its lookup as a
 * parameter so a test can substitute one.
 */

export const TENANT_RESOLUTION_TAG = 'tenant-resolution'

export type ResolvedOrganization = {
  id: string | number
  slug: string
  name: string
  status: string
}

export type HostResolution = {
  organization: ResolvedOrganization | null
  /**
   * Whether this answer may be cached.
   *
   * **[N3] This flag is correctness, not performance.** Under a single-organization install
   * *any* host resolves to that organization via the sovereign fallback. Caching
   * `b.example.com → org A` would keep serving **org A's tenant context on org B's
   * subdomain** for the whole cache lifetime once org B is created — a cross-tenant
   * mis-resolution, not a stale 404. `null` is equally uncacheable: an organization created
   * a second later would 404 until the entry expired.
   */
  cacheable: boolean
}

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

type OrganizationDoc = { id: string | number; slug?: unknown; name?: unknown; status?: unknown }

const asResolved = (doc: OrganizationDoc): ResolvedOrganization => ({
  id: doc.id,
  slug: String(doc.slug ?? ''),
  name: String(doc.name ?? ''),
  status: String(doc.status ?? ''),
})

/**
 * The pure half: no `next/cache`, so it runs anywhere — including Vitest.
 *
 * Resolution order, and only `active` organizations match at any step:
 *   1. `<slug>.<domain>` — the first host label against `organizations.slug`
 *   2. the full host against `organizations.domains[]`
 *   3. sovereign fallback — when exactly one organization exists, any host resolves to it
 *   4. otherwise `null`, which the caller turns into a 404, never "the first organization"
 *
 * @example
 *   const { organization } = await lookupOrganizationByHost('bauru.localhost')
 */
export async function lookupOrganizationByHost(host: string): Promise<HostResolution> {
  const cleaned = (host ?? '').trim().toLowerCase()
  if (!cleaned) return { organization: null, cacheable: false }

  const hostname = cleaned.split(':')[0] ?? ''
  const payload = await client()

  // 1 + 2: a definite match on slug or a declared domain. Both are cacheable because they
  // are keyed to data that, when it changes, revalidates the tag.
  const label = hostname.split('.')[0] ?? ''
  const definite = await payload.find({
    collection: 'organizations',
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true, // an anonymous visitor has no tenant yet — this is the bypass
    where: {
      and: [
        { status: { equals: 'active' } },
        { or: [{ slug: { equals: label } }, { 'domains.domain': { equals: hostname } }] },
      ],
    },
  })

  const found = definite.docs[0]
  if (found) return { organization: asResolved(found), cacheable: true }

  // 3: sovereign fallback — a self-hosted lab is a normal deploy with one organization,
  // not a special mode. Never cacheable; see HostResolution.cacheable.
  const all = await payload.find({
    collection: 'organizations',
    depth: 0,
    limit: 2, // 2 is enough to answer "is there exactly one?"
    pagination: false,
    overrideAccess: true,
    where: { status: { equals: 'active' } },
  })

  if (all.docs.length === 1 && all.docs[0]) {
    return { organization: asResolved(all.docs[0]), cacheable: false }
  }

  // 4: unknown host with zero or several organizations.
  return { organization: null, cacheable: false }
}

/** Injectable so tests can drive `resolveTenant` without `next/cache`. */
export type HostLookup = (host: string) => Promise<HostResolution>

/**
 * The cached path production uses.
 *
 * Only a **definite** match is served from cache; the sovereign fallback and `null` are
 * recomputed every time, which is what keeps a newly created organization reachable
 * immediately instead of after a cache lifetime.
 */
export async function resolveTenant(
  host: string,
  lookup: HostLookup = cachedDefiniteLookup,
): Promise<ResolvedOrganization | null> {
  const result = await lookup(host)
  return result.organization
}

/**
 * `unstable_cache` is imported lazily so that merely importing this module does not drag
 * `next/cache` into a non-Next runtime. Tests inject their own lookup and never reach here.
 */
const cachedDefiniteLookup: HostLookup = async (host) => {
  const { unstable_cache } = await import('next/cache')
  const cached = unstable_cache(
    async (h: string) => lookupOrganizationByHost(h),
    ['tenant-by-host'],
    { tags: [TENANT_RESOLUTION_TAG] },
  )
  const result = await cached(host)
  // Re-run uncacheable answers so a sovereign fallback or a miss is never served stale.
  return result.cacheable ? result : lookupOrganizationByHost(host)
}
