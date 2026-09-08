import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'

import { getPublicScopedPayload } from '../../lib/tenancy/public-payload'
import { PublicReadDeniedError, TenantUnresolvedError } from '../../lib/tenancy/errors'
import type { HostLookup } from '../../lib/tenancy/resolve'
import { buildWorld, type Fixture } from './fixtures'

/**
 * The anonymous read path (T009, FR-010, FR-015, SC-002).
 *
 * This is the second module permitted to run with `overrideAccess: true` and the **first**
 * that serves anonymous traffic, so its scoping is the only thing between a logged-out
 * visitor and every organization's data. The properties asserted here are the four the plan
 * names: the tenant comes from the **host** and cannot be widened by the caller, access
 * control is genuinely bypassed (an anonymous reader gets rows where `scopedAccess()` would
 * return `false`), a publishable collection is filtered to `publicado`, and the client
 * offers **no writers at all**.
 */

let world: Fixture

beforeAll(async () => {
  world = await buildWorld()
}, 120_000)

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * `tenantCanaries` carries no `status`, and the anonymous path refuses a collection it cannot
 * filter to published rows. These cases are about the *tenant* constraint, so the canary is
 * lent a publishable declaration through the same seam `lookup` uses — otherwise every one of
 * them would fail on the allow-list before reaching the assertion it exists to make.
 */
const AS_PUBLISHABLE = { publishable: new Set(['tenantCanaries']) }

describe('the tenant is fixed by the host (SC-002)', () => {
  it('reads organization A on organization A\'s host, and nothing else', async () => {
    // Read against the real database through the one public read that exists today — the
    // organization record behind feature 001's accent colour. The canary cannot stand in for
    // it any more: it declares no `status`, the client now refuses what it cannot filter, and
    // lending it a publishable declaration makes Payload reject the query instead ("The
    // following path cannot be queried: status"). Content-collection rows arrive at T024/T035.
    const db = await getPublicScopedPayload(world.orgA.host)
    const record = await db.findByID<{ id: unknown }>({
      collection: 'organizations',
      id: db.tenantId,
    })

    expect(record, 'the public client returned nothing — access was not bypassed').not.toBeNull()
    expect(String(record?.id), 'the public client served another organization').toBe(world.orgA.id)
  })

  it('cannot be widened by a caller-supplied where', async () => {
    // Asserted on the query the client issued, because the point is that the caller's clause
    // is **AND-ed** with the tenant constraint rather than replacing it. A row count cannot
    // tell those two apart: both give zero rows here.
    const spy = vi.spyOn(world.payload, 'find').mockResolvedValue({
      docs: [],
      totalDocs: 0,
    } as never)

    const db = await getPublicScopedPayload(world.orgA.host, {
      ...AS_PUBLISHABLE,
      lookup: stubHostLookup(world.orgA.id),
    })
    await db.find({ collection: 'tenantCanaries', where: { tenant: { equals: world.orgB.id } } })

    const where = JSON.stringify(spy.mock.calls.at(-1)?.[0]?.where ?? {})
    expect(where, 'the tenant constraint was replaced by the caller\'s where').toContain(
      world.orgA.id,
    )
    expect(where, 'the published-only filter was dropped when a where was supplied').toContain(
      'publicado',
    )
  })

  it('cannot reach organization B\'s record by id', async () => {
    const db = await getPublicScopedPayload(world.orgA.host)
    await expect(
      db.findByID({ collection: 'organizations', id: world.orgB.id }),
      'the public client reached a record from organization B',
    ).rejects.toBeInstanceOf(PublicReadDeniedError)
  })

  it('refuses an unresolvable host rather than serving every tenant', async () => {
    await expect(getPublicScopedPayload('nowhere.example.com')).rejects.toBeInstanceOf(
      TenantUnresolvedError,
    )
  })
})

/** Named fake: resolves every host to organization A without touching the database. */
const stubHostLookup = (orgId: string): HostLookup => async () => ({
  organization: { id: orgId, slug: 'org-a', name: 'Organiza\u00e7\u00e3o A', status: 'active' },
  cacheable: false,
})

describe('published-only (FR-010)', () => {
  /**
   * No scoped collection carries `status` yet — the first arrives with `projeto` (T024) —
   * so the publishable set is injected here the same way `lookup` is elsewhere, and the
   * assertion is made on the query the client actually issued. `payload.find` is spied on
   * the fixture's Payload instance, which is the same singleton the module resolves.
   */
  it('AND-s a publicado filter onto a publishable collection', async () => {
    const spy = vi.spyOn(world.payload, 'find').mockResolvedValue({
      docs: [],
      totalDocs: 0,
    } as never)

    const db = await getPublicScopedPayload(world.orgA.host, {
      publishable: new Set(['tenantCanaries']),
      lookup: stubHostLookup(world.orgA.id),
    })
    await db.find({ collection: 'tenantCanaries' })

    const where = JSON.stringify(spy.mock.calls.at(-1)?.[0]?.where ?? {})
    expect(where, 'the published filter never reached the query').toContain('publicado')
    expect(where, 'the tenant constraint was dropped when the status filter was added')
      .toContain(world.orgA.id)
  })

  /**
   * ── `evento` is not on the three-state queue, and the calendar depends on that ────────────
   *
   * spec.md § Notes for planning: *"`evento` uses a different status set (`rascunho ·
   * publicado · cancelado · concluido`), so 'published only' is not the same predicate on the
   * calendar as elsewhere. A cancelled event that was public must keep showing as cancelled
   * rather than vanishing."*
   *
   * The calendar page's own tests could not see this. They drive the page through a fake client
   * that returns whatever fixture array it is handed, so `{ status: 'cancelado' }` arrived at
   * the renderer in a test and could never arrive in production — the gate that removes it sits
   * one layer BELOW the page, and every one of those tests replaced that layer. The assertions
   * here are on the gate itself, which is the only place the behaviour is decided.
   */
  it('shows a cancelled or concluded event, which was public and has only moved on', async () => {
    const spy = vi.spyOn(world.payload, 'find').mockResolvedValue({
      docs: [],
      totalDocs: 0,
    } as never)

    const db = await getPublicScopedPayload(world.orgA.host, {
      lookup: stubHostLookup(world.orgA.id),
    })
    await db.find({ collection: 'evento' })

    const where = JSON.stringify(spy.mock.calls.at(-1)?.[0]?.where ?? {})
    for (const status of ['publicado', 'cancelado', 'concluido']) {
      expect(
        where,
        `an ${status} event is filtered out of the anonymous agenda. A cancellation that ` +
          'vanishes is worse than one that is shown: a visitor who saw the event yesterday ' +
          'concludes it is still on.',
      ).toContain(status)
    }
    expect(where, 'the tenant constraint was dropped when the status set widened').toContain(
      world.orgA.id,
    )
  })

  it('still hides a draft event, the one status that was never public', () => {
    // The direction that matters. `rascunho` is the only `evento` status this widening could
    // leak, so it is asserted separately from the three above rather than inferred from them.
    const spy = vi.spyOn(world.payload, 'find').mockResolvedValue({
      docs: [],
      totalDocs: 0,
    } as never)

    return (async () => {
      const db = await getPublicScopedPayload(world.orgA.host, {
        lookup: stubHostLookup(world.orgA.id),
      })
      await db.find({ collection: 'evento' })
      expect(
        JSON.stringify(spy.mock.calls.at(-1)?.[0]?.where ?? {}),
        'a draft event is reachable anonymously',
      ).not.toContain('rascunho')
    })()
  })

  it('widens nothing for a collection that did not ask, keeping publicado exact', async () => {
    // The default stays strict: a collection absent from the map gets `equals: publicado`, so
    // a review-queue collection cannot inherit the calendar's exception by accident.
    const spy = vi.spyOn(world.payload, 'find').mockResolvedValue({
      docs: [],
      totalDocs: 0,
    } as never)

    const db = await getPublicScopedPayload(world.orgA.host, {
      lookup: stubHostLookup(world.orgA.id),
    })
    await db.find({ collection: 'projeto' })

    expect(spy.mock.calls.at(-1)?.[0]?.where).toMatchObject({
      and: expect.arrayContaining([{ status: { equals: 'publicado' } }]),
    })
  })

  /**
   * This case used to assert the opposite — "leaves a collection without a status field
   * unfiltered" — and that is the defect, pinned as a requirement. Unfiltered on this client
   * does not mean "no status filter"; it means **no constraint the caller can see the absence
   * of**, served with `overrideAccess: true` to somebody with no session. The two cases below
   * are not hypothetical: both were measured against the live module.
   */
  it('refuses a scoped collection it cannot filter, rather than serving it whole', async () => {
    const db = await getPublicScopedPayload(world.orgA.host, {
      publishable: new Set(),
      lookup: stubHostLookup(world.orgA.id),
    })

    await expect(
      db.find({ collection: 'tenantCanaries' }),
      'a scoped collection with no status field was served with no published-only filter',
    ).rejects.toBeInstanceOf(PublicReadDeniedError)
  })

  it('refuses pendingInvites — scoped, no status, and full of e-mail addresses', async () => {
    // The measured instance. `pendingInvites` is scoped, so it drops out of the publishable
    // set for want of a `status` field; under the old rule the anonymous path served every
    // invite e-mail and role belonging to the host's organization.
    const db = await getPublicScopedPayload(world.orgA.host)
    await expect(db.find({ collection: 'pendingInvites' })).rejects.toBeInstanceOf(
      PublicReadDeniedError,
    )
  })

  it('refuses a global collection, which gets no tenant constraint either', async () => {
    // Worse than the above: `buildTenantClient` applies no tenant constraint to a `global`
    // collection ([CF-8]), so `users` had neither filter — every account on the platform,
    // across every organization, to a visitor with no session.
    const db = await getPublicScopedPayload(world.orgA.host)
    await expect(db.find({ collection: 'users' })).rejects.toBeInstanceOf(PublicReadDeniedError)
  })

  it('still serves the host organization to the anonymous theme read', async () => {
    // The one global exemption, and it must survive the rule above: feature 001's accent
    // colour is read by a logged-out visitor, by the id the *host* resolved to.
    const db = await getPublicScopedPayload(world.orgA.host)
    await expect(
      db.findByID({ collection: 'organizations', id: db.tenantId }),
      'the fail-closed rule swallowed the anonymous theme read it was not aimed at',
    ).resolves.not.toBeNull()
  })

  it('does not let that exemption become a list of every organization', async () => {
    const db = await getPublicScopedPayload(world.orgA.host)
    await expect(
      db.find({ collection: 'organizations' }),
      'find on organizations would hand out every organization on the platform',
    ).rejects.toBeInstanceOf(PublicReadDeniedError)
    await expect(
      db.findByID({ collection: 'organizations', id: world.orgB.id }),
      'the exemption must be the resolved tenant, never an id the caller chose',
    ).rejects.toBeInstanceOf(PublicReadDeniedError)
  })

  it('applies the same filter to findByID, not only to find', async () => {
    const spy = vi.spyOn(world.payload, 'find').mockResolvedValue({
      docs: [],
      totalDocs: 0,
    } as never)

    const db = await getPublicScopedPayload(world.orgA.host, {
      publishable: new Set(['tenantCanaries']),
      lookup: stubHostLookup(world.orgA.id),
    })
    await db.findByID({ collection: 'tenantCanaries', id: world.rows.tenantCanaries!.A })

    const where = JSON.stringify(spy.mock.calls.at(-1)?.[0]?.where ?? {})
    expect(where, 'findByID could fetch an unpublished document by guessing its id')
      .toContain('publicado')
  })
})

describe('no writers (FR-010)', () => {
  it('offers no create, update or delete', async () => {
    const db = (await getPublicScopedPayload(world.orgA.host)) as Record<string, unknown>

    // A public reader writes nothing. The download counter (FR-016) goes through its own
    // narrow endpoint rather than widening this client, so the absence is the contract.
    expect(db.create, 'the public client exposed create').toBeUndefined()
    expect(db.update, 'the public client exposed update').toBeUndefined()
    expect(db.delete, 'the public client exposed delete').toBeUndefined()
  })
})

/**
 * The public-list admission (T002, FR-002, SC-003).
 *
 * `publicList` is the second and last way past the allow-list: a collection an anonymous page
 * **enumerates** rather than reads through a published document — the filter vocabularies the
 * listing tabs and selects are drawn from. Its rows carry no `status` at all, so the question
 * the publishable set answers ("which rows are published?") has no answer for them, and the
 * old gate could only refuse.
 *
 * Two properties, and the second is the one that keeps this from being a hole:
 *   - the tenant constraint still applies, so the widening is *what* may be listed and never
 *     *whose* rows come back;
 *   - **no status filter is added**, because these collections have no such column and
 *     Payload rejects the query outright ("The following path cannot be queried: status")
 *     rather than returning nothing — which would look like an empty vocabulary.
 *
 * **Asserted against the SHIPPED registry, not an injected one.** An earlier draft added a
 * `registry` option to `PublicPayloadOptions` so this gate could be observed before T004
 * declared a real collection. That option flowed straight through `getPublicScopedPayloadForRSC`
 * to any page module, which made it a caller-reachable deny→allow override on the anonymous
 * security gate: passing `{ pendingInvites: { scope: 'scoped', publicList: 'x' } }` would have
 * served every invite row of the host tenant, e-mail addresses included — the exact collection
 * this gate's docstring names as the measured 002 leak. It was NOT the equivalent of the
 * `publishable` seam, which is self-limiting because it forces a `status` clause Payload rejects
 * on a statusless collection. T004 landed the real declarations, so the seam was removed and
 * these cases now read `categoriaProjeto`, which genuinely declares one.
 */
describe('public-list admission (FR-002, SC-003)', () => {
  /** A really-declared collection (T004), so the admission is observed on the shipped rule. */
  const DECLARED = 'categoriaProjeto'

  const asPublicList = { publishable: new Set<string>() }

  it('lists a declared collection with the tenant constraint and no status filter', async () => {
    const spy = vi.spyOn(world.payload, 'find').mockResolvedValue({
      docs: [],
      totalDocs: 0,
    } as never)

    const db = await getPublicScopedPayload(world.orgA.host, {
      ...asPublicList,
      lookup: stubHostLookup(world.orgA.id),
    })
    await db.find({ collection: DECLARED })

    const where = JSON.stringify(spy.mock.calls.at(-1)?.[0]?.where ?? {})
    expect(where, 'the tenant constraint was dropped for a publicList collection').toContain(
      world.orgA.id,
    )
    // A `status` clause here is not a harmless extra: the collection has no such column, so
    // Payload refuses the whole query and the vocabulary the tabs are drawn from disappears.
    expect(where, 'a status filter was built for a collection that has no status column')
      .not.toContain('publicado')
  })

  it('applies the same admission to findByID, still without a status filter', async () => {
    const spy = vi.spyOn(world.payload, 'find').mockResolvedValue({
      docs: [],
      totalDocs: 0,
    } as never)

    const db = await getPublicScopedPayload(world.orgA.host, {
      ...asPublicList,
      lookup: stubHostLookup(world.orgA.id),
    })
    await db.findByID({ collection: DECLARED, id: world.rows.categoriaProjeto!.A })

    const where = JSON.stringify(spy.mock.calls.at(-1)?.[0]?.where ?? {})
    expect(where, 'findByID lost the tenant constraint for a publicList collection').toContain(
      world.orgA.id,
    )
    expect(where, 'findByID filtered a statusless collection on publicado').not.toContain(
      'publicado',
    )
  })

  it('refuses a scoped collection that declared nothing — deny is still the default', async () => {
    // The direction the 002 leak taught us to fail in: admitting one collection must not
    // admit the rest of the registry with it. `pendingInvites` is scoped, has no `status`
    // and declares no `publicList`, and it is full of e-mail addresses.
    const db = await getPublicScopedPayload(world.orgA.host, {
      ...asPublicList,
      lookup: stubHostLookup(world.orgA.id),
    })

    await expect(db.find({ collection: 'pendingInvites' })).rejects.toBeInstanceOf(
      PublicReadDeniedError,
    )
  })

  it('refuses a global collection even when it declares one', async () => {
    // A declaration says an anonymous visitor may enumerate the collection; it cannot
    // manufacture the tenant column that would confine the enumeration to this host.
    // `buildTenantClient` applies no tenant constraint to a `global` collection, so admitting
    // `users` here would serve every account on the platform.
    const db = await getPublicScopedPayload(world.orgA.host, {
      ...asPublicList,
      lookup: stubHostLookup(world.orgA.id),
    })

    await expect(
      db.find({ collection: 'users' }),
      'a publicList declaration was allowed to stand in for a tenant column',
    ).rejects.toBeInstanceOf(PublicReadDeniedError)
  })
})
