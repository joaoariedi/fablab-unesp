import type { PayloadRequest } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { serveDownload, type ObjectSource, type StoredObject } from '../../lib/content/downloads'
import { PublicWriteDeniedError, TenantUnresolvedError } from '../../lib/tenancy/errors'
import { getPublicCounterStore } from '../../lib/tenancy/public-payload'
import { buildWorld, type Fixture } from '../tenancy/fixtures'

/**
 * T036 / FR-015, FR-016, SC-009, SC-010 — **the anonymous download**.
 *
 * US4 is the only place in this feature where a visitor with no account causes a **write**,
 * and that is the whole difficulty. Everything else anonymous is a read that
 * `getPublicScopedPayload` confines; this one has to increment a column, which means an
 * anonymous request reaching an `overrideAccess: true` client with `update` on it. Two
 * properties have to hold at once and they pull in opposite directions:
 *
 *   - **It must be served and counted with no session at all** (FR-015, SC-009). Requiring a
 *     login, or counting only signed-in downloads, is the PO decision of 2026-08-24 reversed
 *     by omission.
 *   - **It must resolve its organization from the host and pass through the tenancy choke
 *     point** (FR-016, SC-010). A download names a document id, and an id is the one thing an
 *     anonymous caller fully controls — so A's file requested on B's host must be a 404 and
 *     not the bytes.
 *
 * ## Why this file drives a real database rather than a fake
 *
 * The subject is not "does `syncCounter` compute N+1" — `counter-strategy.test.ts` already
 * pins that against a named fake, and a fake cannot demonstrate the thing SC-009 asks about:
 * that the number *landed on the row*. Nor can it demonstrate SC-010, whose whole content is
 * that a real query, against real rows, in two real organizations, returns nothing. So the
 * organizations, the projects and the counter column are all real here.
 *
 * **The bytes are the one injected part**, and deliberately: the object store is a named fake
 * (`FakeObjectStore`), exactly as `presign.ts` and `verify.ts` take theirs. The policy this
 * module owns is *who may be served and what gets counted*, not the AWS SDK, and a policy
 * that can only be exercised against a live bucket is a policy CI never runs. The fake also
 * buys an assertion no live bucket could: that on a cross-organization request the store is
 * **never asked for the key at all**, so the 404 happens before anything reads an object.
 */

/** The bytes an anonymous visitor is here for. Distinct per organization, so a mix-up shows. */
const BYTES_A = new Uint8Array([0x73, 0x6f, 0x6c, 0x69, 0x64, 0x41]) // "solidA"
const BYTES_B = new Uint8Array([0x73, 0x6f, 0x6c, 0x69, 0x64, 0x42]) // "solidB"

/** Generated keys (FR-013): the filename never shapes them, so a UUID is the realistic shape. */
/**
 * Filenames, not storage keys. `projeto.arquivos` is a relationship to the media collections
 * now (decision D3 revised), so the caller names a media DOCUMENT and the filename is read from
 * the row the database says the project owns — the visitor never supplies a key at all.
 */
const KEY_A = '11111111-1111-4111-8111-111111111111.stl'
const KEY_B = '22222222-2222-4222-8222-222222222222.stl'
/** Stored on A, but never listed in `arquivos` — the key nobody may ask for. */
const KEY_UNLISTED = '33333333-3333-4333-8333-333333333333.stl'

/**
 * A named fake for object storage (`.claude/rules/code-quality.md` — named classes, not
 * inline stubs). It records every key it was asked for, which is what makes "the 404 happened
 * before any object was read" assertable rather than merely plausible.
 */
class FakeObjectStore {
  readonly reads: string[] = []

  constructor(private readonly objects: Map<string, Uint8Array>) {}

  get: ObjectSource = async (key: string): Promise<StoredObject | null> => {
    this.reads.push(key)
    const bytes = this.objects.get(key)
    return bytes ? { body: bytes, contentType: 'model/stl' } : null
  }
}

const newStore = (): FakeObjectStore =>
  new FakeObjectStore(
    new Map([
      [KEY_A, BYTES_A],
      [KEY_B, BYTES_B],
      [KEY_UNLISTED, BYTES_A],
    ]),
  )

/**
 * The request an anonymous visitor arrives with: a host header and **no user**.
 *
 * `user` is deliberately absent rather than `null`-and-forgotten: if a later change starts
 * reading a session here, every assertion in this file would still pass while FR-015 quietly
 * stopped being true, so the absence is the fixture.
 */
const anonymousRequest = (host: string): PayloadRequest =>
  ({ headers: new Headers({ host }) }) as unknown as PayloadRequest

let world: Fixture
let publishedA: string
let publishedB: string
let draftA: string

type Marker = 'A' | 'B'

/**
 * A fileless media document carrying an explicit `filename`.
 *
 * `upload.filesRequiredOnCreate` is false on the media collections precisely so a row can exist
 * with no object behind it, which is what lets these tests run without MinIO — CI has no object
 * store. The filename is the only part `serveDownload` reads, and the bytes are the injected
 * fake, so nothing here pretends a file was uploaded.
 */
const seedMedia = async (
  collection: 'midiaImagem' | 'midiaModelo3d',
  marker: Marker,
  filename: string,
): Promise<number> => {
  const org = marker === 'A' ? world.orgA : world.orgB
  const created = await world.payload.create({
    collection,
    // `mimeType` travels with `filename`: Payload validates the pair, and a document with a
    // name and no type is not a state a real upload can produce.
    data: {
      tenant: org.id,
      filename,
      mimeType: filename.endsWith('.png') ? 'image/png' : 'model/stl',
      filesize: 1,
    } as never,
    overrideAccess: true,
  })
  return (created as { id: number }).id
}

const seedProject = async (
  marker: Marker,
  slug: string,
  status: 'rascunho' | 'publicado',
  midiaId: number,
  capaId: number,
): Promise<string> => {
  const org = marker === 'A' ? world.orgA : world.orgB
  const ids = world.rows.categoriaProjeto
  if (!ids) {
    throw new Error(
      'fixtures seeded no `categoriaProjeto` row — a projeto cannot be created without a ' +
        'category from its own tenant (sameTenant, T026)',
    )
  }
  const created = await world.payload.create({
    collection: 'projeto',
    // `overrideAccess: true` for the reason `fixtures.ts` gives: building the world is not the
    // subject, and it side-steps `canPublishField`, which belongs to T033.
    overrideAccess: true,
    data: {
      titulo: `Projeto ${slug} (${marker})`,
      slug,
      descricaoCurta: `Conteúdo de ${marker} para o T036.`,
      imagemCapa: capaId,
      categoria: ids[marker],
      tenant: org.id,
      arquivos: [{ relationTo: 'midiaModelo3d', value: midiaId }],
      downloads: 0,
      curtidas: 0,
      status,
    } as never,
  })
  return String((created as { id: string | number }).id)
}

/** The stored counter, read straight from the row — the only thing SC-009 accepts as proof. */
const downloadsOf = async (id: string): Promise<number> => {
  const doc = (await world.payload.findByID({
    collection: 'projeto',
    id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as { downloads?: unknown }
  return typeof doc.downloads === 'number' ? doc.downloads : Number(doc.downloads ?? 0)
}

let midiaA: number
let midiaB: number
let midiaUnlisted: number

beforeAll(async () => {
  world = await buildWorld()
  const capaA = await seedMedia('midiaImagem', 'A', 'capa-a.png')
  const capaB = await seedMedia('midiaImagem', 'B', 'capa-b.png')
  midiaA = await seedMedia('midiaModelo3d', 'A', KEY_A)
  midiaB = await seedMedia('midiaModelo3d', 'B', KEY_B)
  // Belongs to organization A but is listed by no project — the "key the document does not
  // carry" case, now expressed as a media document the project does not relate to.
  midiaUnlisted = await seedMedia('midiaModelo3d', 'A', KEY_UNLISTED)

  publishedA = await seedProject('A', 't036-publicado-a', 'publicado', midiaA, capaA)
  publishedB = await seedProject('B', 't036-publicado-b', 'publicado', midiaB, capaB)
  draftA = await seedProject('A', 't036-rascunho-a', 'rascunho', midiaA, capaA)
}, 120_000)

describe('an anonymous download is served and counted (T036, FR-015, SC-009)', () => {
  it('serves the bytes to a visitor with no session', async () => {
    const store = newStore()
    const response = await serveDownload(
      anonymousRequest(world.orgA.host),
      { collection: 'projeto', id: publishedA, midiaId: midiaA },
      { objects: store.get },
    )

    expect(
      response.status,
      'an anonymous visitor was not served a published project file — FR-015 says downloads ' +
        'are open, no account required (PO, 2026-08-24)',
    ).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES_A)
    expect(store.reads).toEqual([KEY_A])
  })

  it('increments the counter on the row it served, by exactly one', async () => {
    const before = await downloadsOf(publishedA)
    const store = newStore()

    await serveDownload(
      anonymousRequest(world.orgA.host),
      { collection: 'projeto', id: publishedA, midiaId: midiaA },
      { objects: store.get },
    )

    expect(
      await downloadsOf(publishedA),
      'the file was served and the stored counter did not move — SC-009 is "served AND ' +
        'counted", and an uncounted download is the metric silently reading zero forever',
    ).toBe(before + 1)
  })

  it('counts the same visitor twice, because this is a usage metric', async () => {
    // spec.md US4 § Edge, in as many words: "the same visitor downloading twice is counted
    // twice; this is a usage metric, not a unique-visitor metric".
    const before = await downloadsOf(publishedA)
    const store = newStore()
    const twice = async () =>
      serveDownload(
        anonymousRequest(world.orgA.host),
        { collection: 'projeto', id: publishedA, midiaId: midiaA },
        { objects: store.get },
      )

    expect((await twice()).status).toBe(200)
    expect((await twice()).status).toBe(200)

    expect(
      await downloadsOf(publishedA),
      'two downloads were collapsed into one count — deduplicating here would turn the ' +
        'usage metric into a unique-visitor metric nobody asked for',
    ).toBe(before + 2)
  })

  it('offers the file as an attachment named by the generated key', async () => {
    const store = newStore()
    const response = await serveDownload(
      anonymousRequest(world.orgA.host),
      { collection: 'projeto', id: publishedA, midiaId: midiaA },
      { objects: store.get },
    )

    expect(response.headers.get('content-type')).toBe('model/stl')
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="11111111-1111-4111-8111-111111111111.stl"',
    )
  })
})

describe('a cross-organization download is a 404, not the bytes (T036, SC-010)', () => {
  it("refuses organization A's file on organization B's host", async () => {
    const before = await downloadsOf(publishedA)
    const store = newStore()

    const response = await serveDownload(
      // The id is A's and the host is B's: an id is the one thing an anonymous caller fully
      // controls, so this is the request FR-016 exists for.
      anonymousRequest(world.orgB.host),
      { collection: 'projeto', id: publishedA, midiaId: midiaA },
      { objects: store.get },
    )

    expect(
      response.status,
      "organization A's file was reachable through organization B's host — SC-010 requires a " +
        '404, and the bytes are a cross-tenant leak served to anyone who guesses an id',
    ).toBe(404)
    expect(
      store.reads,
      'the object store was asked for the key before the tenant check refused the request — ' +
        'the refusal must happen before anything reads an object',
    ).toEqual([])
    expect(
      await downloadsOf(publishedA),
      "a refused cross-organization request still moved organization A's counter",
    ).toBe(before)
  })

  it("refuses organization B's file on organization A's host", async () => {
    // The mirror image, so the assertion above cannot pass merely because one direction of
    // the comparison happens to be constrained.
    const store = newStore()
    const response = await serveDownload(
      anonymousRequest(world.orgA.host),
      { collection: 'projeto', id: publishedB, midiaId: midiaB },
      { objects: store.get },
    )

    expect(response.status).toBe(404)
    expect(store.reads).toEqual([])
  })

  it('serves that same file on its own host, so the 404 is a refusal and not a miss', async () => {
    // Non-vacuity for the two assertions above: without this, a `serveDownload` that 404s
    // unconditionally would pass every cross-organization test in this file.
    const store = newStore()
    const response = await serveDownload(
      anonymousRequest(world.orgB.host),
      { collection: 'projeto', id: publishedB, midiaId: midiaB },
      { objects: store.get },
    )

    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES_B)
  })

  it('refuses a host that resolves to no organization', async () => {
    const store = newStore()
    const response = await serveDownload(
      anonymousRequest('nowhere.example.com'),
      { collection: 'projeto', id: publishedA, midiaId: midiaA },
      { objects: store.get },
    )

    // "No organization here" is a 404 for the same reason `scopedListEndpoint` gives: an
    // unresolved host must never degrade into "every tenant", and it must not tell a prober
    // which hosts exist either.
    expect(response.status).toBe(404)
    expect(store.reads).toEqual([])
  })
})

describe('only published rows, and only their own files (T036, FR-010, FR-013)', () => {
  it('does not serve a project still in rascunho, and does not count it', async () => {
    const before = await downloadsOf(draftA)
    const store = newStore()

    const response = await serveDownload(
      anonymousRequest(world.orgA.host),
      { collection: 'projeto', id: draftA, midiaId: midiaA },
      { objects: store.get },
    )

    expect(
      response.status,
      'an unpublished project served its attachment — FR-010 makes only `publicado` public, ' +
        'and the review queue would be readable by anyone holding an id',
    ).toBe(404)
    expect(store.reads).toEqual([])
    expect(await downloadsOf(draftA)).toBe(before)
  })

  it('refuses a key the document does not list, even though the object exists', async () => {
    const before = await downloadsOf(publishedA)
    const store = newStore()

    const response = await serveDownload(
      anonymousRequest(world.orgA.host),
      // The object is really in the store, and it is really in this organization. What it is
      // not is one of *this document's* `arquivos` — so serving it would make the key, not the
      // document, the unit of authorisation, and every stored object reachable by guessing.
      { collection: 'projeto', id: publishedA, midiaId: midiaUnlisted },
      { objects: store.get },
    )

    expect(response.status).toBe(404)
    expect(
      store.reads,
      'a caller-supplied key was fetched from storage before anything checked the document ' +
        'carries it',
    ).toEqual([])
    expect(await downloadsOf(publishedA)).toBe(before)
  })

  it('404s when the document lists a key the store does not have', async () => {
    const before = await downloadsOf(publishedA)
    // An empty store: the row still points at KEY_A, so this is the "object went missing"
    // path — it must not be counted as a download, because nothing was downloaded.
    const store = new FakeObjectStore(new Map())

    const response = await serveDownload(
      anonymousRequest(world.orgA.host),
      { collection: 'projeto', id: publishedA, midiaId: midiaA },
      { objects: store.get },
    )

    expect(response.status).toBe(404)
    expect(store.reads).toEqual([KEY_A])
    expect(
      await downloadsOf(publishedA),
      'a download that served no bytes was counted anyway',
    ).toBe(before)
  })
})

describe('the anonymous write reaches exactly one column of one row (T036, FR-016)', () => {
  const targetOf = (id: string) => ({ collection: 'projeto', id, field: 'downloads' })

  it('writes the counter it was opened for', async () => {
    // Non-vacuity for the four refusals below: a store that refused everything would satisfy
    // them all and serve no download at all.
    const store = await getPublicCounterStore(world.orgA.host, targetOf(publishedA))
    const before = await downloadsOf(publishedA)

    const written = await store.update({
      collection: 'projeto',
      id: publishedA,
      data: { downloads: before + 1 },
    })

    expect(written).not.toBeNull()
    expect(await downloadsOf(publishedA)).toBe(before + 1)
  })

  it('refuses any column other than the one it was opened for', async () => {
    const store = await getPublicCounterStore(world.orgA.host, targetOf(publishedA))

    await expect(
      store.update({
        collection: 'projeto',
        id: publishedA,
        // The whole reason this client is narrow: it runs with `overrideAccess: true` on
        // behalf of a visitor with no session, so anything it can write, an anonymous
        // request can write. Publishing a draft is the write that must never be reachable.
        data: { status: 'publicado' },
      }),
      'the anonymous counter client wrote a field that is not the counter',
    ).rejects.toBeInstanceOf(PublicWriteDeniedError)
  })

  it('refuses a document other than the one it was opened for', async () => {
    const store = await getPublicCounterStore(world.orgA.host, targetOf(publishedA))

    await expect(
      store.update({ collection: 'projeto', id: draftA, data: { downloads: 99 } }),
      'the anonymous counter client wrote a row the caller had not resolved publicly',
    ).rejects.toBeInstanceOf(PublicWriteDeniedError)
  })

  it('refuses to list anything at all', async () => {
    const store = await getPublicCounterStore(world.orgA.host, targetOf(publishedA))

    await expect(
      store.find({ collection: 'projeto' }),
      'the anonymous counter client can list rows — `downloads` is a delta derivation with ' +
        'no source rows to count (counters.ts), so nothing here has any use for a listing',
    ).rejects.toBeInstanceOf(PublicWriteDeniedError)
  })

  it('cannot be opened for a host that resolves to no organization', async () => {
    await expect(
      getPublicCounterStore('nowhere.example.com', targetOf(publishedA)),
      'an unresolved host produced a write client — a missing tenant must be an error, ' +
        'never a silent "every tenant"',
    ).rejects.toBeInstanceOf(TenantUnresolvedError)
  })

  it('cannot reach another organization even for its own column', async () => {
    // The tenant constraint is `buildTenantClient`'s and is AND-ed onto the update, so a
    // store opened on A's host matches no row for B's document. `null` rather than a throw:
    // the caller (`syncCounter`) turns an unmatched update into `CrossTenantError`.
    const store = await getPublicCounterStore(world.orgA.host, targetOf(publishedB))
    const before = await downloadsOf(publishedB)

    expect(
      await store.update({ collection: 'projeto', id: publishedB, data: { downloads: 42 } }),
      "a store opened on organization A's host updated organization B's row",
    ).toBeNull()
    expect(await downloadsOf(publishedB)).toBe(before)
  })
})

describe('the refusal is uniform across COLLECTIONS too (T036, SC-010)', () => {
  /**
   * The gap this block closes. `serveDownload`'s docstring makes uniformity a security
   * property — "any difference between them is an oracle an anonymous prober can use to
   * enumerate ids, hosts or keys" — and the suite above varies host, id, key and status while
   * passing `collection: 'projeto'` in every single call.
   *
   * For any other collection the function did not return 404: the anonymous client denies by
   * default, so `findByID` threw `PublicReadDeniedError` and nothing caught it. On the natural
   * route shape (`/:collection/:id/download/:chave`) the collection is caller-supplied, so that
   * was an unhandled rejection on anonymous input — a 500-vs-404 discriminator telling a prober
   * exactly which collections are publicly readable, which is the oracle the uniform refusal
   * exists to deny.
   */
  it.each(['users', 'pendingInvites', 'naoexiste'])(
    'answers 404, not a rejection, for collection "%s"',
    async (collection) => {
      const store = newStore()
      const response = await serveDownload(
        anonymousRequest(world.orgA.host),
        { collection, id: publishedA, midiaId: midiaA },
        { objects: store.get },
      )

      expect(
        response.status,
        `collection "${collection}" produced a different answer than "projeto" does. That ` +
          'difference is the enumeration oracle the uniform 404 exists to close.',
      ).toBe(404)
      expect(store.reads, 'a refused collection still reached storage').toEqual([])
    },
  )

  it('still serves the allow-listed collection, so the guard did not refuse everything', async () => {
    // Non-vacuity: all three cases above would pass on a function that returned 404 always.
    const store = newStore()
    const response = await serveDownload(
      anonymousRequest(world.orgA.host),
      { collection: 'projeto', id: publishedA, midiaId: midiaA },
      { objects: store.get },
    )
    expect(response.status).toBe(200)
  })
})
