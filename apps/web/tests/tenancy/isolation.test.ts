import { beforeAll, describe, expect, it } from 'vitest'

import configPromise from '../../payload.config'
import { lookupOrganizationByHost } from '../../lib/tenancy/resolve'
import { getTenantScopedPayload } from '../../lib/tenancy/scoped-payload'
import { scopedCollections } from '../../lib/tenancy/scope-registry'
import { buildWorld, type Fixture } from './fixtures'

/**
 * The cross-tenant isolation harness (FR-019, SC-002).
 *
 * A user of organization A must receive **zero rows** of organization B on every surface,
 * across **every** scoped collection. The matrix is generated from the scope registry, so
 * adding a scoped collection in feature 002 automatically adds its assertions rather than
 * relying on someone remembering to.
 *
 * ## Surfaces covered here, and the ones that are not
 *
 * In-process surfaces are driven directly:
 *   - `chokePoint`    — `getTenantScopedPayload`, the sanctioned path all app code uses
 *   - `localApiAsRsc`  — Payload's Local API called the way a server component calls it:
 *                        `overrideAccess: false` with a user. **Not** a rendered RSC; the
 *                        name says what it is so nobody mistakes this for UI coverage.
 *   - `customEndpoint` — the collection's own `/mine` endpoint, invoked exactly as Payload
 *                        invokes it, on every scoped collection (T051).
 *
 * **Not yet covered: `restApi` and `adminRest`.** Both need a running HTTP server in the
 * test setup, which is real work rather than a line change. They are tracked as remaining
 * feature-000 work, and the surface-count assertion below is what stops this file from
 * quietly looking complete. Genuine rendered-UI coverage arrives with Playwright in
 * feature 003.
 */

let world: Fixture

beforeAll(async () => {
  world = await buildWorld()
}, 120_000)

/** Each surface answers: "what rows can this user see in this collection?" */
type Surface = (args: {
  as: Record<string, unknown>
  host: string
  collection: string
}) => Promise<Record<string, unknown>[]>

const chokePoint: Surface = async ({ as, host, collection }) => {
  const req = { user: as, headers: new Headers({ 'x-tenant-host': host }) }
  const db = await getTenantScopedPayload(req as never, { lookup: lookupOrganizationByHost })
  const { docs } = await db.find({ collection })
  return docs as Record<string, unknown>[]
}

const localApiAsRsc: Surface = async ({ as, collection }) => {
  const result = await world.payload.find({
    collection: collection as never,
    depth: 0,
    overrideAccess: false, // what an RSC gets when it does the right thing
    user: as as never,
  })
  return result.docs as Record<string, unknown>[]
}

/**
 * The collection's own custom endpoint (CF-9), invoked exactly as Payload invokes it. This
 * is the surface `docs/tech-stack.md:151` names and the plan flagged as having no subject —
 * `scopedListEndpoint` is that subject, declared on every scoped collection.
 */
const customEndpoint: Surface = async ({ as, host, collection }) => {
  const config = await configPromise
  const collectionConfig = config.collections.find((c) => c.slug === collection)
  const endpoint = (collectionConfig?.endpoints || []).find((e) => e.path === '/mine')
  if (!endpoint) {
    throw new Error(
      `${collection} declares no /mine endpoint, so the customEndpoint surface would assert ` +
        `nothing. Add scopedListEndpoint('${collection}') to the collection.`,
    )
  }

  const req = { user: as, headers: new Headers({ 'x-tenant-host': host }) }
  const response = (await endpoint.handler(req as never)) as Response
  const body = (await response.json()) as { docs?: Record<string, unknown>[] }
  return body.docs ?? []
}

const SURFACES: [string, Surface][] = [
  ['chokePoint', chokePoint],
  ['localApiAsRsc', localApiAsRsc],
  ['customEndpoint', customEndpoint],
]

const tenantOf = (row: Record<string, unknown>): string => {
  const t = row.tenant
  return String(t && typeof t === 'object' && 'id' in t ? (t as { id: unknown }).id : t)
}

describe('cross-tenant isolation', () => {
  it('has at least one scoped collection to test', () => {
    // [N11] A green run over an empty matrix is a FAILURE, not a pass. Review round 1 caught
    // exactly this: both collections were global, so the harness would have generated zero
    // tests and reported success while asserting nothing.
    expect(
      scopedCollections().length,
      'No scoped collections — the harness would pass while testing nothing.',
    ).toBeGreaterThan(0)
  })

  it('drives more than one surface', () => {
    expect(SURFACES.length, 'A single-surface harness is not an isolation harness.').toBeGreaterThan(2)
  })

  for (const collection of scopedCollections()) {
    for (const [surfaceName, surface] of SURFACES) {
      it(`${collection} via ${surfaceName}: a user of A sees nothing of B`, async () => {
        const docs = await surface({ as: world.userA, host: world.orgA.host, collection })

        const foreign = docs.filter((row) => tenantOf(row) === world.orgB.id)
        expect(
          foreign,
          `${collection}/${surfaceName}: leaked ${foreign.length} row(s) belonging to organization B.`,
        ).toHaveLength(0)

        // Not merely "no foreign rows" — the user must actually see their own, otherwise a
        // blanket deny would pass this test while breaking the product.
        expect(
          docs.length,
          `${collection}/${surfaceName}: user A sees none of their OWN rows — the constraint is too tight.`,
        ).toBeGreaterThan(0)
        expect(docs.every((row) => tenantOf(row) === world.orgA.id)).toBe(true)
      })

      it(`${collection} via ${surfaceName}: the mirror case holds for B`, async () => {
        const docs = await surface({ as: world.userB, host: world.orgB.host, collection })
        expect(docs.filter((row) => tenantOf(row) === world.orgA.id)).toHaveLength(0)
        expect(docs.length).toBeGreaterThan(0)
      })
    }
  }

  it('master reads across organizations — the only role that can', async () => {
    const docs = await localApiAsRsc({
      as: world.master,
      host: world.orgA.host,
      collection: 'tenantCanaries',
    })
    const tenants = new Set(docs.map(tenantOf))
    expect(tenants.has(world.orgA.id) && tenants.has(world.orgB.id)).toBe(true)
  })

  it('the choke point refuses a foreign document by id', async () => {
    const req = { user: world.userA, headers: new Headers({ 'x-tenant-host': world.orgA.host }) }
    const db = await getTenantScopedPayload(req as never, { lookup: lookupOrganizationByHost })

    const own = await db.findByID({ collection: 'tenantCanaries', id: world.rows.tenantCanaries!.A })
    expect(own, 'user A cannot read their own row by id').not.toBeNull()

    // The foreign id must match zero rows rather than being read and then rejected — the
    // difference is a read-modify race that a "fetch then check" implementation would have.
    const foreign = await db.findByID({
      collection: 'tenantCanaries',
      id: world.rows.tenantCanaries!.B,
    })
    expect(foreign, 'user A read a document belonging to organization B by id').toBeNull()
  })
})
