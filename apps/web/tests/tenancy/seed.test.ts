import { getPayload } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import config from '../../payload.config'
import { SEED_ON_CREATE, type SeedFn } from '../../lib/tenancy/seed-on-create'
import { CITE_ORGANIZATION, seed } from '../../seed/index'
import { resetWorld } from './fixtures'

/**
 * Bootstrap guarantees (FR-026, FR-031, CLR-003, US1 edge).
 *
 * The seed is the first thing a newcomer runs and the first thing they re-run when
 * something else looks broken, so "harmless twice" is a functional requirement rather than
 * a nicety.
 */

beforeAll(async () => {
  const payload = await getPayload({ config })
  await resetWorld(payload)
}, 120_000)

afterEach(() => {
  vi.unstubAllEnvs()
  SEED_ON_CREATE.length = 0
})

describe('seed: idempotence (T047, US1 edge)', () => {
  it('creates the CITe organization and a dev master on a clean database', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SEED_MASTER_EMAIL', 'master@seed-test.local')
    vi.stubEnv('SEED_MASTER_PASSWORD', 'seed-test-password-123')

    const report = await seed()
    expect(report.organization).toBe('created')
    expect(report.master).toBe('created')
  })

  it('re-running duplicates neither the organization nor the master', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SEED_MASTER_EMAIL', 'master@seed-test.local')
    vi.stubEnv('SEED_MASTER_PASSWORD', 'seed-test-password-123')

    const second = await seed()
    expect(second.organization).toBe('already-present')
    expect(second.master).toBe('already-present')

    const payload = await getPayload({ config })
    const orgs = await payload.find({
      collection: 'organizations',
      where: { slug: { equals: CITE_ORGANIZATION.slug } },
      overrideAccess: true,
    })
    const masters = await payload.find({
      collection: 'users',
      where: { email: { equals: 'master@seed-test.local' } },
      overrideAccess: true,
    })

    expect(orgs.totalDocs, 'the organization was duplicated on re-run').toBe(1)
    expect(masters.totalDocs, 'the master was duplicated on re-run').toBe(1)
  })
})

describe('seed: no credential in production (T048, CLR-003)', () => {
  it('ignores SEED_MASTER_* in production rather than honouring it', async () => {
    // Setting these in production looks like an operator asking for a seeded master.
    // Doing it would leave a password that was written down somewhere first, which is
    // exactly what CLR-003 exists to prevent — so the seed refuses and says why.
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SEED_MASTER_EMAIL', 'should-be-ignored@example.com')
    vi.stubEnv('SEED_MASTER_PASSWORD', 'should-be-ignored-password')

    const report = await seed()
    expect(report.master).toBe('skipped-production')
    expect(report.notes.join(' ')).toMatch(/create the first user at \/admin/i)

    const payload = await getPayload({ config })
    const leaked = await payload.find({
      collection: 'users',
      where: { email: { equals: 'should-be-ignored@example.com' } },
      overrideAccess: true,
    })
    expect(leaked.totalDocs, 'production seeded a master from configuration').toBe(0)
  })

  it('reports clearly when no master credentials are configured', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SEED_MASTER_EMAIL', '')
    vi.stubEnv('SEED_MASTER_PASSWORD', '')

    const report = await seed()
    expect(report.master).toBe('skipped-not-configured')
  })
})

describe('seed-on-create registry (T057, FR-031)', () => {
  it('runs registered seeds against the NEW organization, copying rather than inheriting', async () => {
    const seenTenants: string[] = []

    // A fixture seed that actually writes. An empty registry would make this test pass
    // vacuously — the same failure mode as a harness with no scoped collections — so the
    // assertion below checks the copy landed, not merely that the loop ran.
    const fixtureSeed: SeedFn = async (sys, organizationId) => {
      seenTenants.push(organizationId)
      await sys.create({
        collection: 'tenantCanaries',
        data: { label: `seeded-for-${organizationId}` },
      })
    }
    SEED_ON_CREATE.push(fixtureSeed)

    const payload = await getPayload({ config })
    const org = await payload.create({
      collection: 'organizations',
      data: { name: 'Seed Target', slug: 'seed-target', status: 'active' },
      overrideAccess: true,
    })

    expect(seenTenants, 'the registered seed never ran').toEqual([String(org.id)])

    const copied = await payload.find({
      collection: 'tenantCanaries',
      where: { label: { equals: `seeded-for-${org.id}` } },
      depth: 0,
      overrideAccess: true,
    })
    expect(copied.totalDocs, 'the seed ran but wrote nothing').toBe(1)

    // The defaults belong to the NEW organization — [N1]: a request-scoped client would
    // have written them into whichever tenant the creating master was being served on.
    const row = copied.docs[0] as { tenant?: unknown }
    const tenant = row.tenant
    const tenantId = String(tenant && typeof tenant === 'object' && 'id' in tenant ? tenant.id : tenant)
    expect(tenantId, 'seeded row landed in the wrong organization').toBe(String(org.id))
  })

  it('an empty registry is a no-op, not an error', async () => {
    const payload = await getPayload({ config })
    const org = await payload.create({
      collection: 'organizations',
      data: { name: 'No Seeds', slug: 'no-seeds', status: 'active' },
      overrideAccess: true,
    })
    expect(org.id).toBeDefined()
  })
})
