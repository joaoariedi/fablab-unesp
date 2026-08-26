import { beforeAll, describe, expect, it } from 'vitest'

import { getSystemScopedPayload } from '../../lib/tenancy/system-payload'
import { buildWorld, type Fixture } from './fixtures'

/**
 * The explicit-tenant system client (FR-032, CF-9).
 *
 * This is the single most dangerous object in the codebase: it runs with
 * `overrideAccess: true`, so nothing but its own scoping stands between it and every
 * organization's data. That is exactly why it gets its own isolation test rather than being
 * covered incidentally by the harness.
 *
 * The property under test is narrow and total: **it scopes to the id it was given, and to
 * nothing else** — never the request's tenant, never all tenants.
 */

let world: Fixture

beforeAll(async () => {
  world = await buildWorld()
}, 120_000)

describe('scopes to the tenant it was named with', () => {
  it('reads only organization A when built for organization A', async () => {
    const sys = await getSystemScopedPayload(world.orgA.id)
    const { docs } = await sys.find<{ tenant?: unknown }>({ collection: 'tenantCanaries' })

    expect(docs.length).toBeGreaterThan(0)
    for (const row of docs) {
      const t = row.tenant
      const id = String(t && typeof t === 'object' && 'id' in t ? (t as { id: unknown }).id : t)
      expect(id, 'the system client returned another organization\'s row').toBe(world.orgA.id)
    }
  })

  it('cannot reach a foreign document by id', async () => {
    const sys = await getSystemScopedPayload(world.orgA.id)
    const foreign = await sys.findByID({
      collection: 'tenantCanaries',
      id: world.rows.tenantCanaries!.B,
    })
    expect(foreign, 'the system client read a document from organization B').toBeNull()
  })

  it('stamps the named tenant on create, not the request\'s', async () => {
    const sys = await getSystemScopedPayload(world.orgB.id)
    const created = await sys.create<{ id: string | number; tenant?: unknown }>({
      collection: 'tenantCanaries',
      data: { label: 'system-created' },
    })

    const t = created.tenant
    const id = String(t && typeof t === 'object' && 'id' in t ? (t as { id: unknown }).id : t)
    expect(id).toBe(world.orgB.id)
  })

  it('refuses to be built without a tenant — it never infers one', async () => {
    // The whole safety argument is "the caller names the tenant". An empty id would mean
    // an unscoped client with access control off, which is the worst object this codebase
    // could produce.
    await expect(getSystemScopedPayload('')).rejects.toThrow(/explicit tenant id/i)
  })

  it('does not tenant-stamp a GLOBAL collection', async () => {
    // [CF-8] `users` has no tenant column. Stamping it would write a field that does not
    // exist; filtering by it would return zero rows forever. The scope registry decides.
    const sys = await getSystemScopedPayload(world.orgA.id)
    const { docs } = await sys.find({ collection: 'users' })
    expect(docs.length, 'a global collection came back tenant-filtered to nothing').toBeGreaterThan(0)
  })
})

describe('addMembership (CF-1)', () => {
  it('adds the membership and reports that it did', async () => {
    const sys = await getSystemScopedPayload(world.orgB.id)
    const added = await sys.addMembership(world.userA.id as string | number, 'staff')
    expect(added).toBe(true)
  })

  it('is idempotent and reports the no-op', async () => {
    const sys = await getSystemScopedPayload(world.orgB.id)
    const again = await sys.addMembership(world.userA.id as string | number, 'maker')
    expect(again, 'a repeat membership was added instead of being a no-op').toBe(false)
  })

  it('adds to the tenant the client was named with, not the user\'s existing one', async () => {
    const client = await getSystemScopedPayload(world.orgB.id)
    const { docs } = await client.find<{ id: string | number; orgs?: { organization?: unknown }[] }>({
      collection: 'users',
    })
    const userA = docs.find((d) => String(d.id) === String(world.userA.id))
    const ids = (userA?.orgs ?? []).map((r) => {
      const ref = r.organization
      return String(ref && typeof ref === 'object' && 'id' in ref ? (ref as { id: unknown }).id : ref)
    })
    expect(ids).toContain(world.orgB.id)
  })
})
