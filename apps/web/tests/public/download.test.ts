import type { PayloadRequest } from 'payload'
import type { ReactElement, ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { MEDIA_SLUGS } from '../../collections/Media'
import { Artigo } from '../../collections/content/Artigo'
import { buildWorld, type Fixture } from '../tenancy/fixtures'

/**
 * T024 / FR-012, US3, SC-004 — **the anonymous download, driven end to end on a second
 * collection**.
 *
 * `downloads.ts` takes the attachment field as a parameter because it used to be hardcoded to
 * `arquivos`, which is `projeto`'s name for it: `artigo` calls it `anexos`, `aula` calls it
 * `materiais`, `modelo3d` calls it `arquivosModelo`. Three collections registered a route that
 * resolved `undefined ?? []` and answered 404 for every attachment they carry, while their
 * `downloads` counters stayed permanently 0.
 *
 * Everything that already exists tests one *link* of that chain and stops:
 *
 *   - `content/downloads.test.ts` calls `serveDownload` with `field: 'anexos'` **typed out in
 *     the test**. It proves the policy honours a field it is handed; it cannot prove any
 *     collection hands it the right one.
 *   - `content/artigo.test.ts` asserts an endpoint with the path `/:id/download/:midiaId`
 *     exists on `Artigo`. A route registered with `projeto`'s field name satisfies that
 *     assertion exactly as well as the correct one does.
 *   - `public/artigo-detalhe.test.ts` asserts the page renders `/api/artigo/20/download/7` —
 *     a **string literal**, against a **fake** client. It agrees with the registered path by
 *     coincidence, not by construction.
 *   - `content/projeto-download-endpoint.test.ts` drives the wiring for real, on `projeto` —
 *     the one collection whose field name is the old hardcoded default, so it is the single
 *     collection that would have passed while the parameter did nothing.
 *
 * This file closes the loop the four leave open, on the second collection. It takes the href
 * the **real page** renders from **real rows**, resolves it against the route the collection
 * **actually declares**, drives that handler as an anonymous visitor, and reads the counter
 * **back off the row**. Nothing in the chain is retyped by the test: if any one of the page,
 * the registration and the field name disagrees, the bytes do not arrive.
 *
 * ## What is faked, and what is emphatically not
 *
 * The organizations, the article, the media rows, the tenant resolution, the published-only
 * filter and the `downloads` column are all real — SC-004 is "counted exactly once", and only
 * the stored value can answer that.
 *
 * The **bytes** come from a named fake occupying `upload.handlers`, the slot
 * `@payloadcms/storage-s3` fills, exactly as `projeto-download-endpoint.test.ts` does it: CI
 * has no MinIO. One assertion below reads the real built config and requires a handler to be
 * registered there, so the fake never stands in for a seam production leaves empty.
 *
 * `getPublicScopedPayloadForRSC` is redirected to `getPublicScopedPayload(host)` — the same
 * function it wraps — because the only thing the RSC variant adds is reading the host out of
 * `next/headers`, and Vitest has no request for it to read. The tenant constraint and the
 * `publicado` filter are the real ones.
 */

/** The bytes an anonymous visitor is here for, distinct per organization so a mix-up shows. */
const BYTES_A = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x41]) // "%PDFA"
const BYTES_B = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x42]) // "%PDFB"

/** Filenames as `lib/uploads/keys.ts` generates them: a UUID and a lowercased extension. */
const ANEXO_A = 'a1a1a1a1-1111-4111-8111-a1a1a1a1a1a1.pdf'
const ANEXO_B = 'b2b2b2b2-2222-4222-8222-b2b2b2b2b2b2.pdf'
/** Belongs to organization A, listed by no article — the media nobody may ask for. */
const ANEXO_SOLTO = 'c3c3c3c3-3333-4333-8333-c3c3c3c3c3c3.pdf'

/**
 * A named fake for the media collections' registered static handler
 * (`.claude/rules/code-quality.md` — named classes, not inline stubs). It records every
 * `(collection, filename)` pair it is asked for, which is what makes "storage was never
 * consulted" assertable rather than merely plausible.
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
      headers: { 'content-type': 'application/pdf' },
    })
  }
}

const newHandler = (): FakeStaticHandler =>
  new FakeStaticHandler(
    new Map([
      [ANEXO_A, BYTES_A],
      [ANEXO_B, BYTES_B],
      [ANEXO_SOLTO, BYTES_A],
    ]),
  )

const mocks = vi.hoisted(() => ({
  /** The host the page reads as. Set per render; the download route reads its own header. */
  host: { atual: '' },
  /** `notFound()` throws and never returns — a mock that returned would let a render the
   *  runtime never reaches continue past it. */
  notFound: vi.fn((): never => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  }),
}))

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))

vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/tenancy/public-payload')>()
  return {
    ...original,
    // Only the host lookup is replaced. `getPublicScopedPayload` — the tenant constraint and
    // the published-only filter — is the production one, and so is everything `serveDownload`
    // imports from this module.
    getPublicScopedPayloadForRSC: async () => original.getPublicScopedPayload(mocks.host.atual),
  }
})

const { default: ArtigoDetalhe } = await import('../../app/(frontend)/artigos/[slug]/page')

type AnyElement = ReactElement<{ readonly children?: ReactNode; readonly [key: string]: unknown }>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

function findAll(node: ReactNode, type: unknown): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type))
  if (!isElement(node)) return []
  const here = node.type === type ? [node] : []
  return [...here, ...findAll((node.props.children ?? null) as ReactNode, type)]
}

/** Every href the rendered page offers that points at a download route. */
const downloadHrefs = async (slug: string, host: string): Promise<string[]> => {
  mocks.host.atual = host
  const tree = (await ArtigoDetalhe({ params: Promise.resolve({ slug }) })) as unknown as ReactNode
  return findAll(tree, 'a')
    .map((node) => String(node.props.href ?? ''))
    .filter((href) => href.includes('/download/'))
}

type DownloadRoute = {
  path?: string
  method?: string
  handler?: (req: PayloadRequest) => Promise<Response> | Response
}

/**
 * The route `Artigo` declares, located by shape rather than imported by name: the subject is
 * the registration, so reading it off the collection is the only honest way to reach it.
 */
const downloadRoute = (): DownloadRoute => {
  const route = ((Artigo.endpoints ?? []) as DownloadRoute[]).find(
    (endpoint) => endpoint.method === 'get' && String(endpoint.path ?? '').includes('download'),
  )
  expect(
    route,
    'the `artigo` collection declares no GET download endpoint, so its `anexos` are ' +
      'unreachable and FR-012 holds for `projeto` alone',
  ).toBeDefined()
  return route as DownloadRoute
}

/**
 * The route params a href yields **when matched against the declared path** — the join the
 * four existing files leave to coincidence.
 *
 * `path-to-regexp` captures every segment as a string, so these are the params the real router
 * would hand the handler, not a hand-built object.
 */
const paramsFromHref = (href: string): Record<string, string> => {
  const declared = String(downloadRoute().path ?? '')
  const names = [...declared.matchAll(/:([A-Za-z]+)/g)].map((match) => match[1] as string)
  const mount = `/api/${String(Artigo.slug)}`
  const pattern = new RegExp(`^${declared.replace(/:[A-Za-z]+/g, '([^/]+)')}$`)

  expect(
    href.startsWith(mount),
    `the page links "${href}", which is not under this collection's REST mount "${mount}" — ` +
      'the anchor and the endpoint would then be two unrelated strings that merely look alike',
  ).toBe(true)

  const match = pattern.exec(href.slice(mount.length))
  expect(
    match,
    `the page links "${href}", which the route "${declared}" does not match. The anchor and ` +
      'the registration disagree, so every attachment 404s while both halves look correct.',
  ).not.toBeNull()

  return Object.fromEntries(names.map((name, index) => [name, (match as RegExpExecArray)[index + 1] as string]))
}

/** A Payload stand-in carrying nothing but the media collections' handler slot. The absence of
 *  `find` is the fixture: a reader that started querying here would throw rather than pass. */
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
 * reading a session here, every assertion in this file would still pass while FR-012's
 * "served to anonymous visitors" quietly stopped being true.
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

/** Follow a rendered href on a host, exactly as an anonymous browser would. */
const seguir = (href: string, host: string, fake: FakeStaticHandler): Promise<Response> =>
  downloadRoute().handler!(
    anonymousRequest(host, paramsFromHref(href), fake),
  ) as Promise<Response>

let world: Fixture
let midiaA: number
let midiaB: number
let midiaSolta: number

type Marker = 'A' | 'B'

/** A fileless media row: `filesRequiredOnCreate` is false, which is what lets CI run with no
 *  bucket. The filename is the only part the download path reads. */
const seedMedia = async (marker: Marker, filename: string): Promise<number> => {
  const org = marker === 'A' ? world.orgA : world.orgB
  const created = await world.payload.create({
    collection: MEDIA_SLUGS.document as never,
    data: { tenant: org.id, filename, mimeType: 'application/pdf', filesize: 1 } as never,
    overrideAccess: true,
  })
  return (created as { id: number }).id
}

/** Publishes the fixture's own article and hangs one attachment off `anexos`. Rebuilding the
 *  document here would restate `artigos.md`'s required set and rot the day it changes. */
const publishWithAnexo = async (marker: Marker, midiaId: number): Promise<void> => {
  const id = world.rows.artigo?.[marker]
  expect(id, `the fixture seeded no artigo for organization ${marker}`).toBeDefined()
  await world.payload.update({
    collection: 'artigo',
    id: id as never,
    data: { anexos: [{ relationTo: MEDIA_SLUGS.document, value: midiaId }], status: 'publicado' } as never,
    overrideAccess: true,
  })
}

/** The stored counter, read straight from the row — the only thing SC-004 accepts as proof. */
const downloadsOf = async (marker: Marker): Promise<number> => {
  const doc = (await world.payload.findByID({
    collection: 'artigo',
    id: world.rows.artigo?.[marker] as never,
    depth: 0,
    overrideAccess: true,
  })) as unknown as { downloads?: unknown }
  return Number((doc as { downloads?: unknown }).downloads ?? 0)
}

beforeAll(async () => {
  world = await buildWorld()
  midiaA = await seedMedia('A', ANEXO_A)
  midiaB = await seedMedia('B', ANEXO_B)
  midiaSolta = await seedMedia('A', ANEXO_SOLTO)
  await publishWithAnexo('A', midiaA)
  await publishWithAnexo('B', midiaB)
}, 120_000)

describe('the page, the route and the field name are the same chain (T024, FR-012)', () => {
  it('renders an attachment anchor that the declared route actually matches', async () => {
    const [href, ...rest] = await downloadHrefs('artigo-A', world.orgA.host)

    expect(
      href,
      'the published article carries one anexo and the detail page linked none of them — ' +
        'FR-030 puts the attachments on this page and FR-012 makes them downloadable',
    ).toBeDefined()
    expect(rest, 'one anexo was seeded and more than one link was rendered').toEqual([])
    expect(paramsFromHref(href as string)).toEqual({
      id: String(world.rows.artigo?.A),
      midiaId: String(midiaA),
    })
  })

  it('reads through the handler slot the storage plugin actually fills', () => {
    // Without this the fake could occupy a slot nothing registers in production, and the whole
    // file would assert against a seam that exists only in the test.
    const media = world.payload.collections[MEDIA_SLUGS.document as never] as unknown as {
      config?: { upload?: { handlers?: unknown[] } }
    }
    expect(
      media?.config?.upload?.handlers?.length ?? 0,
      `no static handler is registered on ${MEDIA_SLUGS.document}, so the object reader reads ` +
        'a slot that is empty in production and every download 404s with the bytes present',
    ).toBeGreaterThan(0)
  })
})

describe('an anonymous visitor follows that link and is served (T024, FR-012, US3)', () => {
  it('serves the bytes of the row the article lists, with no session at all', async () => {
    const [href] = await downloadHrefs('artigo-A', world.orgA.host)
    const fake = newHandler()

    const response = await seguir(href as string, world.orgA.host, fake)

    expect(
      response.status,
      "the article's own attachment was refused. `anexos` is the field `artigos.md` names, " +
        "and a route registered against `projeto`'s `arquivos` finds nothing here while " +
        'looking entirely correct.',
    ).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES_A)
    expect(
      fake.calls.map((call) => call.filename),
      'storage was asked for something other than the filename the row carries, exactly once',
    ).toEqual([ANEXO_A])
    expect(response.headers.get('content-disposition')).toBe(`attachment; filename="${ANEXO_A}"`)
  })

  it('counts that download exactly once, on the article row (SC-004)', async () => {
    const before = await downloadsOf('A')
    const [href] = await downloadHrefs('artigo-A', world.orgA.host)

    const response = await seguir(href as string, world.orgA.host, newHandler())

    expect(response.status).toBe(200)
    expect(
      await downloadsOf('A'),
      "the file was served and `artigo.downloads` did not move — counting happens only after " +
        'the media is found, so a counter frozen at its old value is how a dead route looks ' +
        'from the outside',
    ).toBe(before + 1)
  })
})

describe('the refusals hold on this collection too (T024, US3 § Error)', () => {
  it("refuses organization A's attachment on organization B's host", async () => {
    const before = await downloadsOf('A')
    const [href] = await downloadHrefs('artigo-A', world.orgA.host)
    const fake = newHandler()

    // The ids are A's and the host is B's: an id is the one thing an anonymous caller fully
    // controls, so this is the request US3's error case exists for.
    const response = await seguir(href as string, world.orgB.host, fake)

    expect(
      response.status,
      "organization A's attachment was reachable through organization B's host — the bytes " +
        'leak to anyone who can guess an id',
    ).toBe(404)
    expect(fake.calls, 'storage was consulted before the tenant check refused').toEqual([])
    expect(await downloadsOf('A')).toBe(before)
  })

  it("serves organization B's own attachment, so the 404 is a refusal and not a miss", async () => {
    // Non-vacuity: a route that 404s unconditionally would satisfy every refusal in this file.
    const [href] = await downloadHrefs('artigo-B', world.orgB.host)
    const fake = newHandler()

    const response = await seguir(href as string, world.orgB.host, fake)

    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES_B)
  })

  it('refuses a media row the article does not list, even in its own organization', async () => {
    const before = await downloadsOf('A')
    const fake = newHandler()

    const response = await downloadRoute().handler!(
      anonymousRequest(
        world.orgA.host,
        // The object is really in the store and really in this organization. What it is not is
        // one of *this article's* `anexos` — serving it would make the media id, not the
        // document, the unit of authorisation.
        { id: String(world.rows.artigo?.A), midiaId: String(midiaSolta) },
        fake,
      ),
    )

    expect((response as Response).status).toBe(404)
    expect(fake.calls).toEqual([])
    expect(await downloadsOf('A')).toBe(before)
  })
})
