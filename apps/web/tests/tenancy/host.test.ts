import { getPayload } from 'payload'
import { beforeEach, describe, expect, it } from 'vitest'

import config from '../../payload.config'
import { TenantUnresolvedError } from '../../lib/tenancy/errors'
import { lookupOrganizationByHost, resolveTenant } from '../../lib/tenancy/resolve'
import { getTenantScopedPayload } from '../../lib/tenancy/scoped-payload'
import { resetWorld } from './fixtures'

/**
 * Host → organization resolution (FR-011, FR-012, SC-006, SC-012).
 *
 * **These tests exist because of spike S8.** `unstable_cache`, `revalidateTag` and
 * `headers()` all throw outside a Next request scope, so a resolver that reached for them
 * on its main path could not be tested at all. `lookupOrganizationByHost` is the seam that
 * makes this file possible; it is injected below rather than imported through the cache.
 */

const payloadClient = async () => getPayload({ config })

beforeEach(async () => {
  await resetWorld(await payloadClient())
})

const makeOrg = async (slug: string, name: string, extra: Record<string, unknown> = {}) => {
  const payload = await payloadClient()
  return payload.create({
    collection: 'organizations',
    data: { name, slug, status: 'active', ...extra },
    overrideAccess: true,
  })
}

describe('sovereign fallback (SC-006, FR-012)', () => {
  it('resolves ANY host to the single organization, with no master user', async () => {
    // A self-hosted lab is a normal deploy with one organization, not a special mode. There
    // is deliberately no master in this test: `TENANCY_MODE` does not exist, so a sovereign
    // install must work through the same code path as a multi-tenant one.
    const only = await makeOrg('sozinho', 'Lab Sozinho')

    for (const host of ['whatever.example.org', 'localhost:3000', 'another.host.tld']) {
      const { organization } = await lookupOrganizationByHost(host)
      expect(organization?.id, `host ${host} did not fall back to the single organization`).toBe(
        only.id,
      )
    }

    const users = await (await payloadClient()).find({ collection: 'users', overrideAccess: true })
    expect(users.totalDocs, 'the fallback needed a master user to work').toBe(0)
  })

  it('marks the fallback as NOT cacheable', async () => {
    await makeOrg('sozinho', 'Lab Sozinho')
    const result = await lookupOrganizationByHost('anything.example.org')

    // [N3] Correctness, not performance. Caching `b.example.com -> org A` would keep serving
    // org A's tenant context on org B's subdomain for the whole cache lifetime once org B
    // exists — a cross-tenant mis-resolution, not a stale 404.
    expect(result.cacheable, 'a sovereign-fallback hit was marked cacheable').toBe(false)
  })
})

describe('subdomain and declared domains', () => {
  it('resolves <slug>.<domain> to the matching organization', async () => {
    const a = await makeOrg('org-a', 'A')
    await makeOrg('org-b', 'B')

    expect((await lookupOrganizationByHost('org-a.plataforma.br')).organization?.id).toBe(a.id)
  })

  it('resolves a host listed in organizations.domains', async () => {
    const a = await makeOrg('org-a', 'A', { domains: [{ domain: 'fablab.bauru.br' }] })
    await makeOrg('org-b', 'B')

    expect((await lookupOrganizationByHost('fablab.bauru.br')).organization?.id).toBe(a.id)
  })

  it('ignores the port when matching', async () => {
    const a = await makeOrg('org-a', 'A')
    await makeOrg('org-b', 'B')
    expect((await lookupOrganizationByHost('org-a.localhost:3000')).organization?.id).toBe(a.id)
  })

  it('resolves only ACTIVE organizations, including in the fallback', async () => {
    // Spec decision 6: the status field exists and only `active` resolves by host here.
    await makeOrg('suspensa', 'Suspensa', { status: 'suspended' })

    const bySlug = await lookupOrganizationByHost('suspensa.plataforma.br')
    expect(bySlug.organization).toBeNull()

    // And it must not sneak in through the single-organization fallback either.
    const byFallback = await lookupOrganizationByHost('anything.example.org')
    expect(byFallback.organization, 'a suspended organization resolved via the fallback').toBeNull()
  })
})

describe('an unknown host with several organizations is a 404, never a guess', () => {
  it('returns null rather than "the first organization"', async () => {
    await makeOrg('org-a', 'A')
    await makeOrg('org-b', 'B')

    const result = await lookupOrganizationByHost('nobody.example.org')
    expect(result.organization, 'an unknown host silently picked an organization').toBeNull()
    expect(result.cacheable, 'a miss was marked cacheable').toBe(false)
  })

  it('the choke point turns that into a thrown error, not an empty result set', async () => {
    await makeOrg('org-a', 'A')
    await makeOrg('org-b', 'B')

    const req = { user: null, headers: new Headers({ 'x-tenant-host': 'nobody.example.org' }) }
    await expect(
      getTenantScopedPayload(req as never, { lookup: lookupOrganizationByHost }),
    ).rejects.toBeInstanceOf(TenantUnresolvedError)
  })

  it('an empty host resolves to nothing', async () => {
    await makeOrg('org-a', 'A')
    await makeOrg('org-b', 'B')
    expect((await lookupOrganizationByHost('')).organization).toBeNull()
  })
})

describe('tenant cannot be spoofed by a header (SC-012)', () => {
  it('ignores a forged x-tenant and resolves from the host', async () => {
    const a = await makeOrg('org-a', 'A')
    const b = await makeOrg('org-b', 'B')

    // The proxy strips `x-tenant` before the app sees it — spike S9 verified that end to
    // end. This asserts the second half: even if one arrived, the choke point never reads
    // it. Resolution has exactly one input, the forwarded host.
    const req = {
      user: null,
      headers: new Headers({
        'x-tenant-host': 'org-a.plataforma.br',
        'x-tenant': String(b.id),
        'x-tenant-id': String(b.id),
      }),
    }

    const db = await getTenantScopedPayload(req as never, { lookup: lookupOrganizationByHost })
    expect(db.tenantId, 'a forged header influenced tenant resolution').toBe(String(a.id))
  })

  it('resolveTenant takes its answer from the injected lookup only', async () => {
    const a = await makeOrg('org-a', 'A')
    const organization = await resolveTenant('org-a.plataforma.br', lookupOrganizationByHost)
    expect(organization?.id).toBe(a.id)
  })
})
