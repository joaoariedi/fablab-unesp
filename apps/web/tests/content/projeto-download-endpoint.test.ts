import type { PayloadRequest } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { MEDIA_SLUGS } from '../../collections/Media'
import { Projeto } from '../../collections/content/Projeto'
import { buildWorld, type Fixture } from '../tenancy/fixtures'

/**
 * T036b / FR-015, FR-016, SC-009 — **the download route**, and the object reader it injects.
 *
 * `lib/content/downloads.ts` decides *who may be served and what gets counted*, and
 * `downloads.test.ts` drives that policy against real rows. What neither of them could show is
 * the thing run 6 recorded and this task exists to fix: **`serveDownload` had no production
 * caller**. A policy nothing calls makes FR-015 ("downloads are open, and anonymous ones are
 * counted") true inside the test harness and false in the product — the exact shape of the
 * defect this feature has hit twice already, where a green test defends a claim the app cannot
 * make. So the subject here is the wiring, and every assertion is about a seam:
 *
 *   - the endpoint is **declared on the collection**, so Payload's REST router serves it;
 *   - it takes the media id from the **route**, not from a body or a query the caller shapes;
 *   - its `ObjectSource` reads through the media collection's **registered static handler** —
 *     the slot `@payloadcms/storage-s3` fills — asking for the filename the *database* says
 *     the project owns;
 *   - the host still decides the organization, so B's host cannot fetch A's file.
 *
 * ## Why the bytes come from a fake handler and the rows do not
 *
 * CI has no MinIO, and the static handler's real body is an S3 `getObject`. The fake occupies
 * the same slot the plugin fills (`upload.handlers`) and records what it was asked for, which
 * is what makes "the filename came from the row, not from the caller" assertable. To keep that
 * from being a test against a slot production never fills, one assertion below reads the
 * **real** built config and requires a handler to actually be registered there.
 */

/** The bytes an anonymous visitor is here for. Distinct per organization, so a mix-up shows. */
const BYTES_A = new Uint8Array([0x73, 0x6f, 0x6c, 0x69, 0x64, 0x41]) // "solidA"

/** Generated keys (FR-013): a filename on a media row, never anything the caller supplies. */
const KEY_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.stl'
const KEY_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb.stl'
/** Belongs to A, listed by no project — the media document nobody may ask for. */
const KEY_UNLISTED = 'cccccccc-3333-4333-8333-cccccccccccc.stl'

/**
 * A named fake for the collection's registered static handler (`.claude/rules/code-quality.md`
 * — named classes, not inline stubs). It records every `(collection, filename)` pair it was
 * asked for, which is what makes "storage was never consulted" assertable rather than merely
 * plausible.
 */
class FakeStaticHandler {
  readonly calls: { collection: string; filename: string }[] = []

  constructor(private readonly objects: Map<string, Uint8Array>) {}

  handle = async (
    _req: PayloadRequest,
    args: { params: { collection: string; filename: string } },
  ): Promise<Response> => {
    this.calls.push({ collection: args.params.collection, filename: args.params.filename })
    const bytes = this.objects.get(args.params.filename)
    if (!bytes) return new Response(null, { status: 404 })
    return new Response(bytes as unknown as BodyInit, {
      status: 200,
      headers: { 'content-type': 'model/stl' },
    })
  }
}

const newHandler = (): FakeStaticHandler =>
  new FakeStaticHandler(
    new Map([
      [KEY_A, BYTES_A],
      [KEY_UNLISTED, BYTES_A],
    ]),
  )

/**
 * A Payload stand-in carrying nothing but the media collections' handler slot.
 *
 * **The absence of `find` is the fixture, not an omission.** FR-024 puts every query behind
 * `lib/tenancy`, and the T036b decision is that the route needs no read of the media
 * collections at all — so a reader that started looking a media row up here would throw on a
 * method this object deliberately does not have, rather than pass quietly.
 */
const payloadWithHandler = (fake: FakeStaticHandler): unknown => ({
  collections: Object.fromEntries(
    Object.values(MEDIA_SLUGS).map((slug) => [
      slug,
      { config: { slug, upload: { handlers: [fake.handle] } } },
    ]),
  ),
})

/**
 * The request an anonymous visitor arrives with: a host header, route params, and **no user**.
 *
 * `user` is deliberately absent rather than `null`-and-forgotten: if a later change starts
 * reading a session here, every assertion in this file would still pass while FR-015 quietly
 * stopped being true, so the absence is the fixture.
 */
const anonymousRequest = (
  host: string,
  routeParams: Record<string, string>,
  fake: FakeStaticHandler,
): PayloadRequest =>
  ({
    headers: new Headers({ host }),
    routeParams,
    payload: payloadWithHandler(fake),
  }) as unknown as PayloadRequest

let world: Fixture
let publishedA: string
let publishedB: string
let draftA: string
let midiaA: number
let midiaB: number
let midiaUnlisted: number

type Marker = 'A' | 'B'

/** A fileless media row: `filesRequiredOnCreate` is false, which is what lets CI run with no bucket. */
const seedMedia = async (
  collection: 'midiaImagem' | 'midiaModelo3d',
  marker: Marker,
  filename: string,
): Promise<number> => {
  const org = marker === 'A' ? world.orgA : world.orgB
  const created = await world.payload.create({
    collection,
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
      descricaoCurta: `Conteúdo de ${marker} para o T036b.`,
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

/**
 * The route under test, located by shape rather than imported by name: the failure this task
 * fixes is a handler that exists and is *not registered*, so the registration is the subject
 * and looking it up through `Projeto.endpoints` is the only way to assert it.
 */
const downloadRoute = () => {
  const endpoints = (Projeto.endpoints ?? []) as {
    path?: string
    method?: string
    handler?: (req: PayloadRequest) => Promise<Response> | Response
  }[]
  const route = endpoints.find(
    (endpoint) => endpoint.method === 'get' && String(endpoint.path ?? '').includes('download'),
  )
  expect(
    route,
    'the `projeto` collection declares no GET download endpoint, so `serveDownload` still has ' +
      'no production caller — FR-015 ("downloads are open, and anonymous ones are counted") ' +
      'is then true only inside the test harness (T036b)',
  ).toBeDefined()
  return route!
}

/**
 * `path-to-regexp` captures every segment as a **string** (`handleEndpoints.js:172` assigns
 * `matchResult.params` straight to `req.routeParams`), so the params are stringified here.
 * Handing the handler a number would test a request the router cannot produce.
 */
const get = async (
  host: string,
  routeParams: Record<string, string | number>,
  fake: FakeStaticHandler,
): Promise<Response> => {
  const route = downloadRoute()
  const params = Object.fromEntries(
    Object.entries(routeParams).map(([key, value]) => [key, String(value)]),
  )
  return route.handler!(anonymousRequest(host, params, fake)) as Promise<Response>
}

beforeAll(async () => {
  world = await buildWorld()
  const capaA = await seedMedia('midiaImagem', 'A', 't036b-capa-a.png')
  const capaB = await seedMedia('midiaImagem', 'B', 't036b-capa-b.png')
  midiaA = await seedMedia('midiaModelo3d', 'A', KEY_A)
  midiaB = await seedMedia('midiaModelo3d', 'B', KEY_B)
  midiaUnlisted = await seedMedia('midiaModelo3d', 'A', KEY_UNLISTED)

  publishedA = await seedProject('A', 't036b-publicado-a', 'publicado', midiaA, capaA)
  publishedB = await seedProject('B', 't036b-publicado-b', 'publicado', midiaB, capaB)
  draftA = await seedProject('A', 't036b-rascunho-a', 'rascunho', midiaA, capaA)
}, 120_000)

describe('the download route is registered on the collection (T036b, FR-015)', () => {
  it('declares a GET endpoint that takes the document and the media from the path', () => {
    const route = downloadRoute()

    expect(
      route.path,
      'the download path does not name both the document and the media document — a media id ' +
        'read from a body or a query is a shape the REST router cannot cache or link to',
    ).toBe('/:id/download/:midiaId')
  })

  it('reads through the handler slot the storage plugin actually fills', () => {
    // Without this the fake below could occupy a slot nothing ever registers in production,
    // and the whole file would assert against a seam that does not exist outside the test.
    const media = world.payload.collections[MEDIA_SLUGS.model3d as never] as unknown as {
      config?: { upload?: { handlers?: unknown[] } }
    }

    expect(
      media?.config?.upload?.handlers?.length ?? 0,
      `no static handler is registered on ${MEDIA_SLUGS.model3d}, so the object reader reads a ` +
        'slot that is empty in production and every download would 404 with the bytes present',
    ).toBeGreaterThan(0)
  })
})

describe('an anonymous request to the route is served and counted (T036b, SC-009)', () => {
  it('serves the bytes of a published project file to a visitor with no session', async () => {
    const fake = newHandler()
    const response = await get(world.orgA.host, { id: publishedA, midiaId: midiaA }, fake)

    expect(
      response.status,
      'the route refused an anonymous visitor a published project file — FR-015 says downloads ' +
        'are open, no account required (PO, 2026-08-24)',
    ).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES_A)
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="${KEY_A}"`,
    )
  })

  it('asks storage for the filename the row carries, never for anything the caller named', async () => {
    const fake = newHandler()
    await get(world.orgA.host, { id: publishedA, midiaId: midiaA }, fake)

    // The media **id** is what the visitor named; the **filename** is what the database says
    // this project owns. Reading the second from the first is the whole point of the field
    // being a relationship — a caller-supplied key would make the key the unit of
    // authorisation instead of the document (FR-013, decision D3 revised).
    expect(
      fake.calls.map((call) => call.filename),
      'the object reader asked storage for something other than the row filename, exactly once',
    ).toEqual([KEY_A])
    expect(
      Object.values(MEDIA_SLUGS),
      'the object was not read through a media collection handler — the S3 client belongs to ' +
        'the storage plugin, and reading around it is the dependency option (ii) avoided',
    ).toContain(fake.calls[0]?.collection)
  })

  it('increments the counter on the row it served, by exactly one', async () => {
    const before = await downloadsOf(publishedA)

    await get(world.orgA.host, { id: publishedA, midiaId: midiaA }, newHandler())

    expect(
      await downloadsOf(publishedA),
      'the route served the file and the stored counter did not move — SC-009 is "served AND ' +
        'counted", and an uncounted download is the metric silently reading zero forever',
    ).toBe(before + 1)
  })
})

describe('the route refuses with one answer, and before it reads an object (T036b, FR-016)', () => {
  it("refuses organization A's file on organization B's host", async () => {
    const before = await downloadsOf(publishedA)
    const fake = newHandler()

    // The id is A's and the host is B's: an id is the one thing an anonymous caller fully
    // controls, so this is the request FR-016 exists for.
    const response = await get(world.orgB.host, { id: publishedA, midiaId: midiaA }, fake)

    expect(
      response.status,
      "organization A's file was reachable through organization B's host — the route dropped " +
        'the host-resolved tenant, and the bytes leak to anyone who guesses an id',
    ).toBe(404)
    expect(
      fake.calls,
      'storage was consulted before the tenant check refused the request',
    ).toEqual([])
    expect(await downloadsOf(publishedA)).toBe(before)
  })

  it('refuses a project still in the review queue', async () => {
    const fake = newHandler()
    const response = await get(world.orgA.host, { id: draftA, midiaId: midiaA }, fake)

    expect(
      response.status,
      'an unpublished project served its file — FR-010 keeps the review queue out of the ' +
        'public path, and the download route is part of that path',
    ).toBe(404)
    expect(fake.calls).toEqual([])
  })

  it('refuses a media document the project does not list, even in its own organization', async () => {
    const fake = newHandler()
    const response = await get(world.orgA.host, { id: publishedA, midiaId: midiaUnlisted }, fake)

    expect(
      response.status,
      'a media document this project does not relate to was served — the document, not the ' +
        'media id, is the unit of authorisation',
    ).toBe(404)
    expect(fake.calls).toEqual([])
  })

  it('refuses a request with no media id rather than throwing', async () => {
    const fake = newHandler()
    const response = await get(world.orgA.host, { id: publishedB }, fake)

    expect(
      response.status,
      'a missing route param produced something other than the single 404 — any answer that ' +
        'differs is an oracle an anonymous prober can use',
    ).toBe(404)
    expect(fake.calls).toEqual([])
  })
})
