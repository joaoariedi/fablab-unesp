import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { PublicReadDeniedError, TenantUnresolvedError } from '../../lib/tenancy/errors'
import { getPublicScopedPayload } from '../../lib/tenancy/public-payload'
import type { HostLookup } from '../../lib/tenancy/resolve'
import { buildWorld, type Fixture } from './fixtures'

/**
 * The public-read harness: **four vantage points** (T012, SC-002, FR-010).
 *
 * Written before any content collection exists, deliberately. The subject is the anonymous
 * read path itself — `getPublicScopedPayload` — not the documents it will one day serve, and
 * the whole point of writing it now is that the twelve collections of 002b arrive against a
 * gate rather than in front of one.
 *
 * ## The four vantage points, and why these four
 *
 *   1. **anonymous** — no session at all. The obvious case.
 *   2. **member of this organization** — signed in, belongs to the host's lab.
 *   3. **member of another organization** — signed in, belongs to a *different* lab.
 *   4. **signed-in with no membership** — authenticated, belongs to nothing.
 *
 * The last two are what review round 1 **measured** as broken, and they are the reason the
 * public path is a client rather than an access function:
 *
 *   - The multi-tenant plugin AND-s `{ tenant: { in: userTenantIDs } }` onto whatever
 *     collection access returns whenever `req.user` exists and is not a master
 *     (`withTenantAccess.js`). For vantage 3 that reduces any "public" branch to
 *     `tenant IN [their own lab]` — so the host's published content becomes invisible to the
 *     one visitor most likely to be looking at it.
 *   - For vantage 4 the same wrapper returns `false` outright, before our access function is
 *     consulted at all. A freshly registered account — feature 004's entire output — would
 *     therefore see **less than a logged-out visitor**.
 *
 * So the property under test is not "anonymous visitors can read". It is that **the public
 * answer does not depend on the session**: all four vantage points get exactly the rows a
 * logged-out visitor gets, confined to the host's organization.
 *
 * The second `describe` asserts the inverse, and it is the half with teeth: collection access
 * must **never** serve an anonymous reader. Any future attempt to solve public reads by
 * widening `scopedAccess()` — the round-1 design — turns that assertion red rather than
 * shipping a leak.
 */

/** The only scoped collection that exists before 002b. `projeto` joins it at T024/T035. */
const COLLECTION = 'tenantCanaries'

/** Matches `fixtures.ts`; the fourth vantage point needs a user the shared world has no use for. */
const PASSWORD = 'fixture-password-123'

type Row = { id: string | number; tenant?: unknown }

let world: Fixture
let noMembership: Record<string, unknown>

beforeAll(async () => {
  world = await buildWorld()

  // `master` also carries `orgs: []`, but it reads across every organization — it proves the
  // opposite thing. Vantage 4 is an ordinary user who simply belongs to nothing yet.
  const created = await world.payload.create({
    collection: 'users',
    data: { email: 'nobody@example.com', password: PASSWORD, role: 'user', orgs: [] },
    overrideAccess: true,
  })
  noMembership = { ...created, collection: 'users' }
}, 120_000)

afterEach(() => {
  vi.restoreAllMocks()
})

const VANTAGES = [
  'anonymous',
  'member of this organization',
  'member of another organization',
  'signed-in with no membership',
] as const

type Vantage = (typeof VANTAGES)[number]

const sessionOf = (vantage: Vantage): Record<string, unknown> | null => {
  if (vantage === 'member of this organization') return world.userA
  if (vantage === 'member of another organization') return world.userB
  if (vantage === 'signed-in with no membership') return noMembership
  return null
}

const tenantIdOf = (row: Row): string => {
  const ref = row.tenant
  return String(ref && typeof ref === 'object' && 'id' in ref ? (ref as { id: unknown }).id : ref)
}

/**
 * The public surface, read as this vantage point.
 *
 * The session is resolved and checked here and then deliberately **not** handed to
 * `getPublicScopedPayload`: it takes a host and nothing else, which is the mechanism by which
 * vantages 3 and 4 stop being special cases. The `expect` is what keeps that from making this
 * harness four copies of the anonymous case — a fixture that quietly produced `null` for the
 * signed-in vantages would otherwise prove nothing three times over.
 */
const publicClientAs = async (vantage: Vantage, host: string) => {
  const session = sessionOf(vantage)
  expect(
    session === null,
    `the "${vantage}" vantage point carried no session — the harness would be testing the ` +
      `anonymous case a second time under a different name`,
  ).toBe(vantage === 'anonymous')

  return getPublicScopedPayload(host)
}

/**
 * The same read through **collection access** instead — what the round-1 design proposed.
 *
 * A refusal and an empty page are the same answer for SC-002's purposes, so `false` from
 * `scopedAccess()` (which Payload raises as Forbidden) is normalised to zero rows rather than
 * failing the test for the wrong reason.
 */
const accessRead = async (vantage: Vantage): Promise<Row[]> => {
  const session = sessionOf(vantage)
  try {
    const result = await world.payload.find({
      collection: COLLECTION,
      depth: 0,
      limit: 100,
      overrideAccess: false,
      ...(session ? { user: session as never } : {}),
    })
    return result.docs as Row[]
  } catch {
    return []
  }
}

/** Named fake: resolves every host to the given organization, without touching the database. */
const stubHostLookup = (orgId: string): HostLookup => async () => ({
  organization: { id: orgId, slug: 'org-a', name: 'Organização A', status: 'active' },
  cacheable: false,
})

/**
 * ## Why this block reads `organizations` rather than the canary
 *
 * It used to read `tenantCanaries` and assert rows came back. That could only ever pass
 * because the client served a collection it could not filter — `tenantCanaries` declares no
 * `status`, so no published-only filter exists for it, and the old rule responded by applying
 * *none*. The harness was therefore green **on the leak**: the same code path served
 * `pendingInvites`, invite e-mails included, to anyone with no session.
 *
 * The client now refuses what it cannot constrain, so lending the canary a publishable
 * declaration does not rescue the old shape either — Payload rejects the query outright
 * ("The following path cannot be queried: status"), because the field genuinely is not there.
 *
 * So the row-level half of SC-002 is asserted against the one public read that is real today:
 * the organization record behind feature 001's accent colour. It is the only production caller
 * of this module, it is confined by the id the *host* resolved to, and — the property this
 * block exists for — it must answer identically from all four vantage points. The same
 * assertions over content collections arrive with `projeto` (T024/T035), which is the first
 * scoped collection that will actually carry `status`.
 */
describe('the public answer does not depend on the session (SC-002)', () => {
  for (const vantage of VANTAGES) {
    it(`serves the host organization's own record to a visitor who is ${vantage}`, async () => {
      const db = await publicClientAs(vantage, world.orgA.host)
      const record = await db.findByID<{ id: unknown }>({
        collection: 'organizations',
        id: db.tenantId,
      })

      expect(
        record,
        `a visitor who is ${vantage} received nothing on organization A's host`,
      ).not.toBeNull()
      expect(
        String(record?.id),
        `a visitor who is ${vantage} was served another organization's record`,
      ).toBe(world.orgA.id)
    })

    it(`refuses an unresolvable host for a visitor who is ${vantage}`, async () => {
      sessionOf(vantage)
      await expect(getPublicScopedPayload('nowhere.example.com')).rejects.toBeInstanceOf(
        TenantUnresolvedError,
      )
    })

    it(`cannot reach organization B by id as ${vantage}`, async () => {
      // Refused rather than answered "not found": the exemption is *the tenant the host
      // resolved to*, so an id the caller chose never reaches a query at all. That is a
      // stronger answer than null, and it is the one the allow-list gives.
      const db = await publicClientAs(vantage, world.orgA.host)
      await expect(
        db.findByID({ collection: 'organizations', id: world.orgB.id }),
        `a visitor who is ${vantage} reached a record belonging to organization B`,
      ).rejects.toBeInstanceOf(PublicReadDeniedError)
    })

    it(`is refused a collection that cannot be filtered, as ${vantage}`, async () => {
      // Fail-closed parity. The refusal must not depend on the session either: a rule that
      // denied anonymous visitors and served signed-in ones would be the round-1 bug wearing
      // the opposite mask.
      const db = await publicClientAs(vantage, world.orgA.host)
      await expect(
        db.find({ collection: COLLECTION, limit: 100 }),
        `a visitor who is ${vantage} was served a collection with no published-only filter`,
      ).rejects.toBeInstanceOf(PublicReadDeniedError)
    })
  }

  it('gives every vantage point exactly the answer a logged-out visitor gets', async () => {
    const answerFor = async (vantage: Vantage): Promise<string> => {
      const db = await publicClientAs(vantage, world.orgA.host)
      const own = await db.findByID<{ id: unknown }>({
        collection: 'organizations',
        id: db.tenantId,
      })
      const foreign = await db
        .findByID({ collection: 'organizations', id: world.orgB.id })
        .then(() => 'served')
        .catch((err: unknown) => (err instanceof PublicReadDeniedError ? 'refused' : 'other'))
      const refused = await db
        .find({ collection: COLLECTION })
        .then(() => 'served')
        .catch((err: unknown) => (err instanceof PublicReadDeniedError ? 'refused' : 'other'))
      return JSON.stringify({ own: String(own?.id), foreign, refused })
    }

    const loggedOut = await answerFor('anonymous')
    for (const vantage of VANTAGES) {
      expect(
        await answerFor(vantage),
        `a visitor who is ${vantage} got a different answer than a logged-out visitor — ` +
          `the public read consulted the session`,
      ).toBe(loggedOut)
    }
  })
})

describe('collection access is not the public read path, and must not become it', () => {
  it('serves an anonymous reader nothing at all through collection access', async () => {
    // The round-1 design put a public branch in `scopedAccess()`. If anyone tries it again,
    // this is the assertion that goes red — before the leak ships rather than after.
    expect(
      await accessRead('anonymous'),
      'collection access served rows to an anonymous reader',
    ).toHaveLength(0)
  })

  it('still serves a member of the organization through collection access', async () => {
    // Non-vacuity: without this, every assertion in this block would also pass against a
    // collection nobody can read at all, or an empty database.
    expect(
      await accessRead('member of this organization'),
      'the access path returned nothing even for its own member — the surrounding ' +
        'zero-row assertions would prove nothing',
    ).not.toHaveLength(0)
  })

  it('hides this host\'s rows from a member of another organization (round 1)', async () => {
    const docs = await accessRead('member of another organization')
    const fromHostOrg = docs.filter((row) => tenantIdOf(row) === world.orgA.id)
    expect(
      fromHostOrg,
      'collection access served organization A\'s rows to a member of organization B',
    ).toHaveLength(0)
  })

  it('serves a signed-in user with no membership nothing at all (round 1)', async () => {
    // Measured: the plugin's wrapper refuses this user before our access function runs, so
    // through access alone they see *less* than a logged-out visitor. The first `describe`
    // is what proves the public path repairs that.
    expect(
      await accessRead('signed-in with no membership'),
      'the no-membership vantage point read rows through collection access',
    ).toHaveLength(0)
  })
})

describe('the published-only filter survives a session (FR-010)', () => {
  /**
   * No scoped collection carries `status` until `projeto` (T024), so the publishable set is
   * injected through the seam the module exposes for exactly this, and the assertion is made
   * on the query that reached Payload. Asserted per vantage point because "drafts leak to
   * signed-in visitors only" is precisely the shape of bug this harness exists to catch.
   */
  for (const vantage of VANTAGES) {
    it(`filters to publicado, and keeps the tenant clause, for ${vantage}`, async () => {
      sessionOf(vantage)
      const spy = vi.spyOn(world.payload, 'find').mockResolvedValue({
        docs: [],
        totalDocs: 0,
      } as never)

      const db = await getPublicScopedPayload(world.orgA.host, {
        publishable: new Set([COLLECTION]),
        lookup: stubHostLookup(world.orgA.id),
      })
      await db.find({ collection: COLLECTION })

      const where = JSON.stringify(spy.mock.calls.at(-1)?.[0]?.where ?? {})
      expect(where, `unpublished rows were served to ${vantage}`).toContain('publicado')
      expect(where, `the tenant constraint was dropped for ${vantage}`).toContain(world.orgA.id)
    })
  }
})
