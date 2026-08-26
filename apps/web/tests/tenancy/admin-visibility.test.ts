import { beforeAll, describe, expect, it } from 'vitest'

import configPromise from '../../payload.config'
import { scopedCollections } from '../../lib/tenancy/scope-registry'
import { buildWorld, type Fixture } from './fixtures'

/**
 * Admin visibility by role (FR-022, US9).
 *
 * The requirement has two halves and both matter: an organization admin must see **their
 * own** organizations' data, and must **not** be able to enumerate `organizations` or
 * `users`. Knowing which other labs exist on the platform, or which addresses hold
 * accounts, is the same enumeration US8 forbids on the invite endpoint — it just leaks
 * through a list view instead of a status code.
 */

let world: Fixture

beforeAll(async () => {
  world = await buildWorld()
}, 120_000)

const read = async (collection: string, as: Record<string, unknown>) => {
  try {
    const result = await world.payload.find({
      collection: collection as never,
      depth: 0,
      overrideAccess: false,
      user: as as never,
    })
    return { ok: true as const, docs: result.docs as Record<string, unknown>[] }
  } catch (err) {
    // A user with no permission gets Forbidden rather than an empty page — verified in the
    // spike. SC-002's "zero rows **or** 403" wording covers both, deliberately.
    return { ok: false as const, status: (err as { status?: number })?.status }
  }
}

describe('global collections are hidden from organization admins', () => {
  it('an org admin cannot enumerate organizations', async () => {
    const result = await read('organizations', world.userA)
    if (result.ok) {
      expect(
        result.docs,
        'an organization admin listed the platform\'s organizations',
      ).toHaveLength(0)
    } else {
      expect(result.status).toBe(403)
    }
  })

  it('a master can', async () => {
    const result = await read('organizations', world.master)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.docs.length).toBeGreaterThanOrEqual(2)
  })

  it('an org admin sees only their own user row, never the directory', async () => {
    const result = await read('users', world.userA)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const ids = result.docs.map((d) => String(d.id))
      expect(ids, 'an organization admin read another account').toEqual([String(world.userA.id)])
    }
  })

  it('a master sees every user', async () => {
    const result = await read('users', world.master)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.docs.length).toBeGreaterThanOrEqual(3)
  })
})

describe('admin.hidden matches the access rules', () => {
  it('hides organizations and users from a non-master in the admin UI', async () => {
    const config = await configPromise
    for (const slug of ['organizations', 'users']) {
      const collection = config.collections.find((c) => c.slug === slug)
      const hidden = collection?.admin?.hidden
      expect(typeof hidden, `${slug} declares no admin.hidden`).toBe('function')

      // `hidden` is presentation and access is enforcement; they must agree, or the panel
      // shows a collection every click of which returns 403.
      const asAdmin = (hidden as (a: { user: unknown }) => boolean)({ user: world.userA })
      const asMaster = (hidden as (a: { user: unknown }) => boolean)({ user: world.master })
      expect(asAdmin, `${slug} is visible to an organization admin`).toBe(true)
      expect(asMaster, `${slug} is hidden from master`).toBe(false)
    }
  })
})

describe('a user who administers TWO organizations', () => {
  it('sees the scoped data of both, and only those two', async () => {
    // US9's edge case. The access constraint is `tenant: { in: [...] }`, so this is the
    // assertion that distinguishes a working `in` from an accidental "first membership wins".
    const both = await world.payload.create({
      collection: 'users',
      data: {
        email: `two-orgs-${Date.now()}@example.com`,
        password: 'fixture-password-123',
        role: 'user',
        orgs: [
          { organization: Number(world.orgA.id), role: 'admin' },
          { organization: Number(world.orgB.id), role: 'admin' },
        ],
      },
      overrideAccess: true,
    })

    for (const collection of scopedCollections()) {
      const result = await read(collection, { ...both, collection: 'users' })
      expect(result.ok, `${collection}: a two-org admin was denied outright`).toBe(true)
      if (!result.ok) continue

      const tenants = new Set(
        result.docs.map((d) => {
          const t = d.tenant
          return String(t && typeof t === 'object' && 'id' in t ? (t as { id: unknown }).id : t)
        }),
      )
      expect(
        tenants,
        `${collection}: a two-org admin did not see both organizations`,
      ).toEqual(new Set([world.orgA.id, world.orgB.id]))
    }
  })

  it('still cannot enumerate organizations', async () => {
    // Two memberships is not a step towards being master. The global collections stay shut.
    const both = await world.payload.create({
      collection: 'users',
      data: {
        email: `two-orgs-b-${Date.now()}@example.com`,
        password: 'fixture-password-123',
        role: 'user',
        orgs: [
          { organization: Number(world.orgA.id), role: 'admin' },
          { organization: Number(world.orgB.id), role: 'admin' },
        ],
      },
      overrideAccess: true,
    })

    const result = await read('organizations', { ...both, collection: 'users' })
    if (result.ok) expect(result.docs).toHaveLength(0)
    else expect(result.status).toBe(403)
  })
})
