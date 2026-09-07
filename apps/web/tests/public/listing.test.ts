import type { Payload } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ALL_CATEGORIES, type ListingParams } from '../../lib/public/params.js'
import { buildTenantClient, type FindArgs } from '../../lib/tenancy/client.js'

/**
 * The one listing reader (T008 — FR-002, FR-011, FR-029).
 *
 * `plan.md` § "Implementation approach": *"One listing reader, not six. Every listing does the
 * same four things — filter by category, match a search term, order by publication date, take
 * a page of twelve. Written once in `lib/public/listing.ts`, so a page that forgets the
 * tenant-resolved host cannot exist."*
 *
 * ── Why this suite mocks the choke point instead of injecting one ───────────────────────────
 *
 * `listPublic` takes **no client parameter**, and the absence is the feature. Run 1 rejected
 * T002 for adding a `registry` seam to `PublicPayloadOptions`: that bag flows through
 * `getPublicScopedPayloadForRSC` to any page module, so the seam a test wanted was a
 * deny→allow override an RSC could reach. A `db` argument here would be the same shape one
 * level up — a page could hand this reader an unscoped client and every assertion below would
 * still pass. So the seam is `vi.mock`, which exists only inside the test process.
 *
 * ── What is actually asserted ───────────────────────────────────────────────────────────────
 *
 * Not arithmetic. The subject is the **arguments handed to the anonymous client**, because
 * that argument list is the whole of FR-002's promise: the caller names a collection and a
 * page of URL state, and never a tenant, a status or a limit. Every one of those is something
 * a per-page reader would have had to remember, and the reason this module exists is that five
 * pages will not.
 *
 * The last block drives `buildTenantClient` directly. `sort` and `page` are new on `FindArgs`
 * and are added *for* this reader; a client that accepted them and dropped them on the floor
 * would leave every assertion above green while FR-011 and FR-029 silently failed in
 * production — the listing would be page 1, in insertion order, for ever.
 */

/** A page of state as `params.ts` hands it over: already validated, nothing to re-check. */
const unfiltered: ListingParams = { categoria: ALL_CATEGORIES, busca: '', page: 1 }

/**
 * The anonymous client, recorded rather than stubbed inline.
 *
 * Named because the whole suite reads its `calls`: an inline `vi.fn()` would make the
 * clamping assertion — which is about the *second* call — read as an index into an anonymous
 * mock rather than as "it went back for the last page".
 */
class FakePublicClient {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'

  constructor(
    private readonly totalDocs: number,
    private readonly docsFor: (page: number) => Record<string, unknown>[] = () => [],
  ) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    return { docs: this.docsFor(args.page ?? 1) as T[], totalDocs: this.totalDocs }
  }

  findByID = async <T>(): Promise<T | null> => null

  /** The single call this suite expects, or a failure that names how many there were. */
  get onlyCall(): FindArgs {
    expect(this.calls).toHaveLength(1)
    return this.calls[0] as FindArgs
  }
}

const mocks = vi.hoisted(() => ({ getPublicScopedPayloadForRSC: vi.fn() }))

vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/public-payload')>()),
  getPublicScopedPayloadForRSC: mocks.getPublicScopedPayloadForRSC,
}))

const { listPublic, PAGE_SIZE } = await import('../../lib/public/listing.js')

/** Arms the mocked choke point with a fake client and returns it for inspection. */
const serving = (totalDocs: number, docsFor?: (page: number) => Record<string, unknown>[]) => {
  const client = new FakePublicClient(totalDocs, docsFor)
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(client)
  return client
}

/**
 * True when `where` mentions `key` anywhere — as a plain key, as the tail of a dotted path,
 * or nested inside an `and`/`or`.
 *
 * A shallow `Object.keys` check would pass on `{ and: [{ status: … }] }`, which is precisely
 * the shape a well-meaning "just be safe, filter published here too" edit produces.
 */
const mentions = (value: unknown, key: string): boolean => {
  if (Array.isArray(value)) return value.some((entry) => mentions(entry, key))
  if (typeof value !== 'object' || value === null) return false
  return Object.entries(value).some(
    ([name, nested]) => name === key || name.endsWith(`.${key}`) || mentions(nested, key),
  )
}

beforeEach(() => {
  mocks.getPublicScopedPayloadForRSC.mockReset()
})

describe('listPublic — the read path', () => {
  it('reads through the anonymous choke point, with no host and no options', async () => {
    const client = serving(0)

    await listPublic({ collection: 'projeto', params: unfiltered })

    // No argument at all: the host is `getPublicScopedPayloadForRSC`'s to read from the
    // request, and an options bag here is the seam run 1 removed from the client itself.
    expect(mocks.getPublicScopedPayloadForRSC).toHaveBeenCalledTimes(1)
    expect(mocks.getPublicScopedPayloadForRSC).toHaveBeenCalledWith()
    expect(client.calls).toHaveLength(1)
  })

  it('populates one level, so a card gets its cover, author and category', async () => {
    const client = serving(0)

    await listPublic({ collection: 'projeto', params: unfiltered })

    // plan § Sketch 1: "`depth: 1` is what makes the populate-through rule work — the card's
    // author, category and cover arrive without any of those collections being publicly
    // listable." `depth: 0` would render cards with bare ids; `depth: 2` would walk further
    // than any card reads.
    expect(client.onlyCall.depth).toBe(1)
  })

  it('takes twelve per page, and the caller cannot ask for more', async () => {
    const client = serving(0)

    await listPublic({ collection: 'projeto', params: unfiltered })

    expect(PAGE_SIZE).toBe(12)
    expect(client.onlyCall.limit).toBe(PAGE_SIZE)
  })

  it.each(['projeto', 'artigo', 'aula', 'modelo3d', 'evento'] as const)(
    'names neither a tenant nor a status on %s',
    async (collection) => {
      const client = serving(0)

      await listPublic({
        collection,
        params: { categoria: ALL_CATEGORIES, busca: 'luminaria', page: 1 },
      })

      // FR-002, and the sentence T008 is written against: "The caller never names a tenant or
      // a status." The tenant clause is `buildTenantClient`'s and the published-only clause is
      // `getPublicScopedPayload`'s; restating either here is how a page ends up with a filter
      // that disagrees with the choke point's.
      const { where } = client.onlyCall
      expect(mentions(where, 'tenant')).toBe(false)
      expect(mentions(where, 'status')).toBe(false)
    },
  )
})

describe('listPublic — ordering (FR-011, CLR-007)', () => {
  it('orders projects most-recent-first by publication date', async () => {
    const client = serving(0)

    await listPublic({ collection: 'projeto', params: unfiltered })

    expect(client.onlyCall.sort).toBe('-dataPublicacao')
  })

  it('orders the agenda by its own date, because evento carries no dataPublicacao', async () => {
    const client = serving(0)

    await listPublic({ collection: 'evento', params: unfiltered })

    // `Evento.ts`: "The agenda's sort key, which is why this collection carries no
    // `dataPublicacao`". Sorting it on a column it does not have is a query error, not an
    // ordering bug, so the shape has to be per collection rather than one constant.
    expect(client.onlyCall.sort).toBe('-inicioEm')
  })
})

describe('listPublic — the category filter (US2, FR-010)', () => {
  it('adds no category clause for the unfiltered state', async () => {
    const client = serving(0)

    await listPublic({ collection: 'projeto', params: unfiltered })

    // `TODOS` is a UI state and not a row (params.ts), so it must never reach a `where`.
    expect(mentions(client.onlyCall.where, 'categoria')).toBe(false)
    expect(JSON.stringify(client.onlyCall.where ?? {})).not.toContain(ALL_CATEGORIES)
  })

  it('filters by the category slug, through the relationship', async () => {
    const client = serving(0)

    await listPublic({
      collection: 'modelo3d',
      params: { categoria: 'corte-a-laser', busca: '', page: 1 },
    })

    expect(client.onlyCall.where).toEqual({ 'categoria.slug': { equals: 'corte-a-laser' } })
  })

  it('ignores a category on a collection that has none', async () => {
    const client = serving(0)

    // `aula` declares no `categoria` field at all. A slug arriving here is a URL from another
    // listing, and a clause on a missing field is a query error rather than an empty grid.
    await listPublic({
      collection: 'aula',
      params: { categoria: 'corte-a-laser', busca: '', page: 1 },
    })

    expect(client.onlyCall.where).toBeUndefined()
  })
})

describe('listPublic — the search term (FR-020)', () => {
  it('matches the title, the description and the author', async () => {
    const client = serving(0)

    await listPublic({ collection: 'artigo', params: { ...unfiltered, busca: 'luminaria' } })

    expect(client.onlyCall.where).toEqual({
      or: [
        { titulo: { like: 'luminaria' } },
        { resumo: { like: 'luminaria' } },
        { 'autor.nome': { like: 'luminaria' } },
      ],
    })
  })

  it('ANDs the category and the search rather than replacing one with the other', async () => {
    const client = serving(0)

    await listPublic({
      collection: 'projeto',
      params: { categoria: 'serigrafia', busca: 'cartaz', page: 1 },
    })

    // Two filters are two constraints. An `or` at the top would widen the result past the
    // category the visitor picked, which is the tab staying active over rows it excludes.
    expect(client.onlyCall.where).toEqual({
      and: [
        { 'categoria.slug': { equals: 'serigrafia' } },
        { or: [{ titulo: { like: 'cartaz' } }, { descricaoCurta: { like: 'cartaz' } }] },
      ],
    })
  })
})

describe('listPublic — pagination (FR-029, CLR-003)', () => {
  it('asks for the page the URL named and reports the total', async () => {
    const client = serving(40)

    const result = await listPublic({ collection: 'projeto', params: { ...unfiltered, page: 2 } })

    expect(client.onlyCall.page).toBe(2)
    expect(result.page).toBe(2)
    expect(result.totalPages).toBe(4) // ceil(40 / 12)
    expect(result.totalDocs).toBe(40)
  })

  it('reports one page for an empty listing, so the empty state renders on page 1', async () => {
    serving(0)

    const result = await listPublic({ collection: 'projeto', params: unfiltered })

    expect(result).toMatchObject({ docs: [], page: 1, totalPages: 1, totalDocs: 0 })
  })

  it('clamps a page past the end and goes back for the last one', async () => {
    // Two projects on page 2; page 999 is a crawler or a stale link, and Payload answers it
    // with an empty array rather than an error — so an unclamped reader renders an empty grid
    // on a listing that has rows. US2 calls that the case the empty state must NOT cover.
    const client = serving(14, (page) => (page === 2 ? [{ id: 'p13' }, { id: 'p14' }] : []))

    const result = await listPublic({ collection: 'projeto', params: { ...unfiltered, page: 999 } })

    expect(client.calls.map((call) => call.page)).toEqual([999, 2])
    expect(result.page).toBe(2)
    expect(result.totalPages).toBe(2)
    expect(result.docs).toEqual([{ id: 'p13' }, { id: 'p14' }])
  })

  it('does not re-read when the requested page exists', async () => {
    const client = serving(40, () => [{ id: 'p1' }])

    const result = await listPublic({ collection: 'projeto', params: { ...unfiltered, page: 4 } })

    expect(client.calls).toHaveLength(1)
    expect(result.docs).toEqual([{ id: 'p1' }])
  })
})

/**
 * The half of the contract that lives one module down.
 *
 * `sort` and `page` are added to `FindArgs` **for this reader** — no earlier caller needed
 * either. A client that accepts them and forwards neither compiles, type-checks and leaves
 * every assertion above green, while every public listing serves page 1 in insertion order.
 */
describe('the tenant client forwards what the listing asks for', () => {
  class FakePayload {
    readonly calls: Record<string, unknown>[] = []
    find = async (args: Record<string, unknown>) => {
      this.calls.push(args)
      return { docs: [], totalDocs: 0 }
    }
  }

  it('passes sort and page through to the query', async () => {
    const fake = new FakePayload()
    const client = buildTenantClient({
      payload: fake as unknown as Payload,
      tenantId: 'org-a',
      overrideAccess: true,
    })

    await client.find({ collection: 'projeto', depth: 1, limit: 12, page: 3, sort: '-dataPublicacao' })

    expect(fake.calls[0]).toMatchObject({ page: 3, sort: '-dataPublicacao', limit: 12, depth: 1 })
  })
})
