import { beforeAll, describe, expect, it } from 'vitest'

import { REST_GET } from '@payloadcms/next/routes'

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
 * ## The five surfaces
 *
 *   - `chokePoint`     — `getTenantScopedPayload`, the sanctioned path all app code uses
 *   - `localApiAsRsc`  — Payload's Local API called the way a server component calls it:
 *                        `overrideAccess: false` with a user. **Not** a rendered RSC; the
 *                        name says what it is so nobody mistakes this for UI coverage.
 *   - `customEndpoint` — the collection's own `/mine` endpoint, invoked as Payload invokes it
 *   - `restApi`        — Payload's generated REST API via the real route handler, bearer auth
 *   - `adminRest`      — the same REST endpoints via a session cookie, as the admin panel uses
 *
 * `docs/tech-stack.md` names four surfaces; this covers all of them, and splits REST into
 * its two authentication paths because an access rule can hold for a bearer token and not
 * for a session cookie — which would leak through the panel while every API test stayed
 * green.
 *
 * **What this does not cover.** The REST surfaces call the route handler in-process rather
 * than over a socket, so Next's router and the proxy layer are excluded — neither carries
 * tenancy logic, and the proxy was measured separately in spike S9. Genuine rendered-UI
 * coverage arrives with Playwright in feature 003.
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

/**
 * Payload's generated REST API — the public one, mounted at `app/(payload)/api/[...slug]`.
 *
 * This drives the **real** route handler (`REST_GET(config)`) with a real `Request`, so it
 * exercises the whole REST path: header authentication, Payload's access composition, our
 * access factories, and serialisation. What it does not exercise is the socket and Next's
 * router — those carry no tenancy logic, and the proxy layer that does was measured
 * separately in spike S9.
 *
 * The token matters. An unauthenticated REST call is refused before access control is ever
 * consulted, so a harness without real credentials would assert 403-for-everyone and prove
 * nothing at all about tenancy.
 */
const restCall = async (collection: string, authHeader: Record<string, string>) => {
  const config = await configPromise
  const handler = REST_GET(config)
  const request = new Request(`http://org-a.localhost/api/${collection}?depth=0&limit=100`, {
    headers: new Headers(authHeader),
  })
  const response = await handler(request, { params: Promise.resolve({ slug: [collection] }) })
  if (response.status === 403) return [] // "zero rows OR 403" — SC-002 accepts both
  const body = (await response.json()) as { docs?: Record<string, unknown>[] }
  return body.docs ?? []
}

const tokenFor = (as: Record<string, unknown>): string => {
  const email = as.email as string
  if (email === 'a@example.com') return world.tokens.userA
  if (email === 'b@example.com') return world.tokens.userB
  return world.tokens.master
}

/** Bearer authentication — how an API client reaches the REST surface. */
const restApi: Surface = async ({ as, collection }) =>
  restCall(collection, { Authorization: `JWT ${tokenFor(as)}` })

/**
 * Cookie authentication — how the **admin panel** reaches the very same REST endpoints.
 *
 * Worth its own surface rather than folding into `restApi`: the two differ in how identity
 * is established, and an access rule that held for a bearer token but not for a session
 * cookie would leak through the panel while every API test stayed green.
 */
const adminRest: Surface = async ({ as, collection }) =>
  restCall(collection, { Cookie: `payload-token=${tokenFor(as)}` })

const SURFACES: [string, Surface][] = [
  ['chokePoint', chokePoint],
  ['localApiAsRsc', localApiAsRsc],
  ['customEndpoint', customEndpoint],
  ['restApi', restApi],
  ['adminRest', adminRest],
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

  it('drives every surface the architecture document names', () => {
    // Not a count — a NAMED set. A count passes if someone deletes restApi and adds a
    // duplicate of an easy surface; this does not.
    const names = SURFACES.map(([n]) => n)
    for (const required of ['chokePoint', 'localApiAsRsc', 'customEndpoint', 'restApi', 'adminRest']) {
      expect(names, `surface '${required}' is missing — SC-002 is not being met`).toContain(required)
    }
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
