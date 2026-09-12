import { beforeAll, describe, expect, it } from 'vitest'

import { GRAPHQL_POST, REST_GET } from '@payloadcms/next/routes'
import { formatNames } from 'payload'

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
 * ## The seven surfaces
 *
 *   - `chokePoint`     — `getTenantScopedPayload`, the sanctioned path all app code uses
 *   - `localApiAsRsc`  — Payload's Local API called the way a server component calls it:
 *                        `overrideAccess: false` with a user. **Not** a rendered RSC; the
 *                        name says what it is so nobody mistakes this for UI coverage.
 *   - `customEndpoint` — the collection's own `/mine` endpoint, invoked as Payload invokes it
 *   - `restApi`        — Payload's generated REST API via the real route handler, bearer auth
 *   - `adminRest`      — the same REST endpoints via a session cookie, as the admin panel uses
 *   - `graphql`        — Payload's generated GraphQL API through the real route handler
 *   - `relationshipPicker` — what the admin's relationship field lists (T046, FR-021)
 *
 * `docs/tech-stack.md` names four surfaces; this covers all of them, and splits REST into
 * its two authentication paths because an access rule can hold for a bearer token and not
 * for a session cookie — which would leak through the panel while every API test stayed
 * green.
 *
 * **Why GraphQL is its own surface rather than "REST, in another shape".** It is a second
 * generated API over the same collections, reachable by any account that can reach the
 * admin, and it resolves its own documents — a `find` composed correctly for REST tells us
 * nothing about the resolver GraphQL builds from the same config. SC-002 names it by hand
 * for that reason.
 *
 * **Why a relationship picker is its own surface.** SC-002's own words: a scoped list view
 * does not cover it. The picker reads the *target* collection, not the one being edited,
 * with a **client-supplied `where`** that Payload merges into the query — so a user of A
 * editing an artigo asks `categoriaArtigo` for its rows directly, and the search box is a
 * query parameter under their control. `pickerLeak` below drives the hostile version of it.
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
const restCall = async (
  collection: string,
  authHeader: Record<string, string>,
  /**
   * The query string, because the picker surface sends a different one from a list view —
   * its own `sort`, and a `where` the *client* supplies. Defaulted so the existing REST
   * surfaces read exactly as they did before.
   */
  query = 'depth=0&limit=100',
) => {
  const config = await configPromise
  const handler = REST_GET(config)
  const request = new Request(`http://org-a.localhost/api/${collection}?${query}`, {
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

/**
 * The name GraphQL exposes a collection's list query under.
 *
 * Computed with **Payload's own `formatNames`**, which is the function the schema builder
 * calls (`@payloadcms/graphql/schema/initCollections`), including its collision rule: when a
 * slug pluralises to itself the query is prefixed with `all`. Not read from the config —
 * `collection.graphQL` is `null` there until the schema is built, measured on this config —
 * and not spelled by hand, because a hand-written list rots into a query field that does not
 * exist, which comes back as an error the harness would have to interpret rather than as an
 * answer about tenancy.
 */
const graphqlPluralName = (collection: string): string => {
  const { plural, singular } = formatNames(collection)
  return plural === singular ? `all${singular}` : plural
}

/**
 * Payload's generated **GraphQL** API, through the real route handler (`GRAPHQL_POST`).
 *
 * A second generated API over the same collections, reachable by anyone who can reach the
 * admin. It builds its own resolvers from the config, so REST being composed correctly says
 * nothing about it — SC-002 names it separately for that reason.
 *
 * The tenant of each row is read back through the **fixture**, not through the selection
 * set. `organizations` is master-only (feature 000, US9), so a `tenant { id }` sub-selection
 * comes back `null` for an organization admin — and a harness that read the tenant from the
 * answer would then compare `null` against B's id, find no match, and pass while the surface
 * had disclosed a foreign row. The ids are the disclosure; whose they are is a question the
 * fixture already knows the answer to.
 */
const graphql: Surface = async ({ as, collection }) => {
  const config = await configPromise
  const plural = graphqlPluralName(collection)
  const handler = GRAPHQL_POST(config)

  const request = new Request('http://org-a.localhost/api/graphql', {
    method: 'POST',
    headers: new Headers({
      'Content-Type': 'application/json',
      Authorization: `JWT ${tokenFor(as)}`,
    }),
    body: JSON.stringify({ query: `query { ${plural}(limit: 100) { docs { id } } }` }),
  })

  const response = await handler(request)
  const body = (await response.json()) as {
    data?: Record<string, { docs?: { id: string | number }[] } | null>
    errors?: { message?: string }[]
  }

  const errors = body.errors ?? []
  // A refusal is "zero rows", which SC-002 accepts. **Any other error is not**: an unknown
  // query field or a malformed selection would otherwise be silently read as "this user saw
  // nothing", and the surface would report isolation it never measured.
  if (errors.length > 0) {
    const refusal = errors.every((e) => /forbidden|not allowed/i.test(String(e.message)))
    if (refusal) return []
    throw new Error(
      `${collection}: the GraphQL query failed rather than answering — ` +
        errors.map((e) => e.message).join('; '),
    )
  }

  const docs = body.data?.[plural]?.docs ?? []
  return docs.map((doc) => ({ id: doc.id, tenant: tenantOfSeededRow(collection, doc.id) }))
}

/**
 * The **relationship picker** (FR-021, T046) — the admin surface a scoped list view does not
 * cover, because it lists the *target* collection rather than the one being edited.
 *
 * The panel loads a picker's options with a cookie-authenticated REST list on the target,
 * ordered by the field that collection titles its rows with. That is what is reproduced
 * here: same handler, same authentication, the picker's own query. The hostile half — the
 * `where` the search box puts under the client's control — is `pickerLeak` below.
 */
const relationshipPicker: Surface = async ({ as, collection }) => {
  const config = await configPromise
  const target = config.collections.find((c) => c.slug === collection)
  // What the picker sorts by, and what it renders as each option's label. `id` for the
  // collections that title a row by its relationships (`curtida`, `progressoAula`).
  const sort = (target?.admin?.useAsTitle as string | undefined) ?? 'id'
  return restCall(
    collection,
    { Cookie: `payload-token=${tokenFor(as)}` },
    `depth=0&limit=100&sort=${sort}`,
  )
}

/**
 * A picker whose client-supplied `where` names the OTHER organization.
 *
 * The search box is a query parameter, and Payload merges it with the access constraint. If
 * access ever returned a boolean instead of a constraint (FR-006), this is the request that
 * would come back with B's rows in it — a list view never sends a `where` a user wrote.
 */
const pickerLeak = async (collection: string, as: Record<string, unknown>, tenant: string) =>
  restCall(
    collection,
    { Cookie: `payload-token=${tokenFor(as)}` },
    `depth=0&limit=100&where[tenant][equals]=${tenant}`,
  )

const SURFACES: [string, Surface][] = [
  ['chokePoint', chokePoint],
  ['localApiAsRsc', localApiAsRsc],
  ['customEndpoint', customEndpoint],
  ['restApi', restApi],
  ['adminRest', adminRest],
  ['graphql', graphql],
  ['relationshipPicker', relationshipPicker],
]

const tenantOf = (row: Record<string, unknown>): string => {
  const t = row.tenant
  return String(t && typeof t === 'object' && 'id' in t ? (t as { id: unknown }).id : t)
}

/**
 * Whose row is this id? Answered from the fixture, for the surfaces that disclose an id
 * without disclosing its tenant.
 *
 * It **throws** on an id the fixture did not create rather than returning "unknown": an
 * unrecognised id is either a leftover row `resetWorld` failed to remove or a document from
 * somewhere else entirely, and a surface returning one must stop the run — not be counted as
 * "not organization B's" and pass.
 */
const tenantOfSeededRow = (collection: string, id: string | number): string => {
  const seeded = world.rows[collection]
  if (String(seeded?.A) === String(id)) return world.orgA.id
  if (String(seeded?.B) === String(id)) return world.orgB.id
  throw new Error(
    `${collection}: a surface disclosed row ${String(id)}, which this fixture did not seed ` +
      `(it seeded ${String(seeded?.A)} for A and ${String(seeded?.B)} for B).`,
  )
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
    for (const required of [
      'chokePoint',
      'localApiAsRsc',
      'customEndpoint',
      'restApi',
      'adminRest',
      // SC-002 names four surfaces and the last two are this feature's (T046, FR-021):
      // GraphQL is generated from the same collections and is reachable by any signed-in
      // account, and a relationship picker is the admin surface a scoped LIST view does not
      // cover — it reads the *target* collection, with a client-supplied `where`.
      'graphql',
      'relationshipPicker',
    ]) {
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

/**
 * The picker half of FR-021: "the admin surface shows a team member only their own
 * organization's rows, **including in relationship pickers**".
 *
 * The matrix above already drives `relationshipPicker` over every scoped collection. These
 * two add what a per-collection surface cannot say: that the query the *client* writes
 * cannot widen the result, and that every picker in the product points at a collection the
 * matrix actually drives.
 */
describe('relationship pickers (FR-021)', () => {
  for (const collection of scopedCollections()) {
    it(`${collection}: a picker cannot be steered at another organization's rows`, async () => {
      const docs = await pickerLeak(collection, world.userA, world.orgB.id)
      expect(
        docs,
        `${collection}: a picker asking for organization B's rows returned ${docs.length} of ` +
          `them — the access constraint was replaced by the client's where, not intersected.`,
      ).toHaveLength(0)
    })
  }

  it('every picker in the product offers rows from a collection this matrix drives', async () => {
    const config = await configPromise
    const driven = new Set<string>(scopedCollections())
    // The global collections, named one at a time and each with the reason a picker may
    // point at it. A hand-kept set rather than `globalCollections()` on purpose: deriving it
    // would make every future global collection allowlist itself silently, and the whole
    // value of this gate is that adding one stops somebody and makes them write the sentence
    // below. `organizations` is master-only and `users` is one row per requester — both
    // measured in `admin-visibility.test.ts`, which is where their coverage lives.
    //
    // The three feature-004 catalogues (T008) reach this list through
    // `payload-locked-documents`, whose `document` field is polymorphic over every lockable
    // collection. They are global reference data (CLR-001): they carry no `tenant` column at
    // all, so there is no cross-tenant question for an isolation surface to ask of them —
    // read is open to everyone as a boolean, because step 1 of `/criar-conta` is the avatar
    // builder and it runs before the person exists, and writing is the master's alone.
    const globals = new Set([
      'organizations',
      'users',
      'tomDePele',
      'tomDeCabelo',
      'avatarItem',
    ])

    for (const [collection, target] of await pickerTargets(config)) {
      expect(
        driven.has(target) || globals.has(target),
        `${collection} offers a picker over "${target}", which no isolation surface drives ` +
          `— a scoped collection reached only through a picker would be tested nowhere.`,
      ).toBe(true)
    }
  })
})

/**
 * Every `(collection, relationTo)` pair in the config, including polymorphic targets and
 * fields nested inside tabs, rows, groups, arrays and blocks.
 *
 * Derived from the config rather than hand-listed: a hand-kept list is exactly the artefact
 * that goes stale the first time somebody adds a relationship, and the staleness shows up as
 * a picker nobody tested rather than as a failure.
 */
const pickerTargets = async (
  config: Awaited<typeof configPromise>,
): Promise<[string, string][]> => {
  const pairs: [string, string][] = []

  const walk = (collection: string, fields: unknown[]): void => {
    for (const raw of fields) {
      const field = raw as {
        type?: string
        relationTo?: string | string[]
        fields?: unknown[]
        tabs?: { fields?: unknown[] }[]
        blocks?: { fields?: unknown[] }[]
      }
      if (field.type === 'relationship' || field.type === 'upload') {
        for (const target of [field.relationTo ?? []].flat()) pairs.push([collection, target])
      }
      if (field.fields) walk(collection, field.fields)
      for (const tab of field.tabs ?? []) walk(collection, tab.fields ?? [])
      for (const block of field.blocks ?? []) walk(collection, block.fields ?? [])
    }
  }

  for (const collection of config.collections) walk(collection.slug, collection.fields)
  return pairs
}
