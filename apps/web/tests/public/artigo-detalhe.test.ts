import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { RichText } from '@payloadcms/richtext-lexical/react'
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FindArgs } from '../../lib/tenancy/client'
import { TenantUnresolvedError } from '../../lib/tenancy/errors'

/**
 * T019 / FR-030, FR-012, US10 — the `artigo` detail page.
 *
 * `spec.md` FR-030: *"`projeto`, `modelo3d` and `artigo` each have a detail page rendering the
 * long text, gallery and attachments feature 002 stores (CLR-001)"*. For an article those are
 * `corpo` (the Lexical body) and **`anexos`** — the field name is the whole reason this page is
 * not a copy of the project one, since `Artigo.ts` registers
 * `downloadEndpoint('artigo', 'anexos')` where `Projeto.ts` registers `arquivos`. A page that
 * linked `/download/` against the wrong field name would 404 every attachment while looking
 * entirely correct.
 *
 * `artigos.md` fixes the access rule this page must not re-litigate: *"download **aberto**, sem
 * conta; downloads anônimos são contados"* (PO, 2026-08-24). The counting lives behind the
 * endpoint; this page contributes an anchor and nothing else.
 *
 * ── The instrument, and its one deliberate limit ────────────────────────────────────────────
 *
 * Same as `projeto-detalhe.test.ts`: no DOM at `node`, so the page is a plain async function
 * returning a plain object and awaiting it asserts the markup it actually builds. What it
 * cannot prove is the byte-identity of the three 404s across a *live* request — that is what
 * `detalhe.test.ts` does against a real database. The claim here is the one that lives in this
 * module: one slug query through the anonymous choke point, and no branch anywhere that could
 * tell a draft from a stranger.
 */

const PAGE_SOURCE = join(
  import.meta.dirname,
  '..',
  '..',
  'app',
  '(frontend)',
  'artigos',
  '[slug]',
  'page.tsx',
)

/** The smallest Lexical document Payload stores for a `richText` field, written out rather than
 *  built through the editor — importing the editor to make one paragraph would drag the whole
 *  package into this file. */
const lexicalParagraph = (text: string) => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr' as const,
        textFormat: 0,
        children: [
          { type: 'text', text, format: 0, style: '', mode: 'normal', detail: 0, version: 1 },
        ],
      },
    ],
  },
})

const CORPO = lexicalParagraph('Como a rede de fab labs trabalha em conjunto.')

/** One published article as the public read returns it, populated one level: the category and
 *  the author are objects, and the polymorphic attachments arrive in Payload's
 *  `{ relationTo, value }` envelope — `anexos` spans `midiaModelo3d` and `midiaDocumento`. */
const ARTIGO = {
  id: 20,
  titulo: 'Práticas colaborativas em Fab Lab',
  slug: 'praticas-colaborativas',
  resumo: 'Volume 1 da coleção Primeiros Passos.',
  categoria: { id: 1, nome: 'Publicação', slug: 'publicacao' },
  capa: { id: 5, url: '/media/praticas.png', sizes: { card: { url: '/media/praticas-card.png' } } },
  autor: { id: 9, nome: 'Maria Silva', handle: 'mariasilva' },
  dataPublicacao: '2024-05-12T00:00:00.000Z',
  corpo: CORPO,
  anexos: [
    { relationTo: 'midiaDocumento', value: { id: 7, filename: 'primeiros-passos.pdf', filesize: 2_400_000 } },
    { relationTo: 'midiaModelo3d', value: { id: 8, filename: 'bancada.stl', filesize: 512_000 } },
  ],
  curtidas: 24,
}

/** The anonymous client, recorded rather than stubbed inline: §1 reads its `calls` to prove
 *  which query the page issued, and that it issued exactly one. */
class FakePublicClient {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'

  constructor(private readonly docs: readonly Record<string, unknown>[]) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    return { docs: this.docs as T[], totalDocs: this.docs.length }
  }

  findByID = async <T>(): Promise<T | null> => null
}

const mocks = vi.hoisted(() => {
  /** What the real `notFound()` does: it throws and never returns. Modelling that is
   *  load-bearing — a mock that returns lets execution fall through to a render the runtime
   *  would never reach. */
  const NOT_FOUND = new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  return {
    NOT_FOUND,
    notFound: vi.fn((): never => {
      throw NOT_FOUND
    }),
    getPublicScopedPayloadForRSC: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))

vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/public-payload')>()),
  getPublicScopedPayloadForRSC: mocks.getPublicScopedPayloadForRSC,
}))

const { default: ArtigoDetalhe } = await import('../../app/(frontend)/artigos/[slug]/page')

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly style?: Record<string, unknown>
  readonly [key: string]: unknown
}>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

function findAll(node: ReactNode, type: unknown): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type))
  if (!isElement(node)) return []
  const here = node.type === type ? [node] : []
  return [...here, ...findAll((node.props.children ?? null) as ReactNode, type)]
}

const findOne = (node: ReactNode, type: unknown): AnyElement | undefined => findAll(node, type)[0]

/** Every string in the tree, joined — what a reader would see, ignoring the markup around it. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (!isElement(node)) return ''
  return textOf((node.props.children ?? null) as ReactNode)
}

type Rendered = { tree: ReactNode; client: FakePublicClient }

/** Renders the detail page for a slug, with the document the read should find. `null` is the
 *  answer the public client gives for a draft, a foreign row and an unknown slug alike. */
async function render(
  slug = ARTIGO.slug,
  doc: Record<string, unknown> | null = ARTIGO,
): Promise<Rendered> {
  const client = new FakePublicClient(doc === null ? [] : [doc])
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(client)
  const tree = (await ArtigoDetalhe({ params: Promise.resolve({ slug }) })) as unknown as ReactNode
  return { tree, client }
}

/** The document with one optional part removed — US10's "renders without them" edge. */
const semParte = (parte: 'corpo' | 'anexos' | 'capa' | 'dataPublicacao') => {
  const doc: Record<string, unknown> = { ...ARTIGO }
  delete doc[parte]
  return doc
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('§1 — the read path (FR-002, FR-003)', () => {
  it('asks the anonymous choke point for the one article named by the slug', async () => {
    const { client } = await render()

    expect(mocks.getPublicScopedPayloadForRSC).toHaveBeenCalledTimes(1)
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0]).toEqual({
      collection: 'artigo',
      where: { slug: { equals: 'praticas-colaborativas' } },
      // The cover, the category, the author and the attachments all arrive populated at one
      // level — a detail page reads media *through* a published document, so none of those
      // collections needs to be publicly listable (plan § Sketch 1).
      depth: 1,
      limit: 1,
    })
  })

  it('names no status and no tenant in the query it sends', async () => {
    const { client } = await render()
    const where = JSON.stringify(client.calls[0]?.where ?? {})

    // Both belong to the public client: the status filter is `getPublicScopedPayload`'s and the
    // tenant constraint is `buildTenantClient`'s. Restating either here is a second opinion,
    // and the day the two disagree is the day drafts render.
    expect(where).not.toContain('status')
    expect(where).not.toContain('tenant')
  })

  it('never reaches Payload directly (FR-002, SC-003)', () => {
    const source = readFileSync(PAGE_SOURCE, 'utf8')

    expect(source).not.toMatch(/from ['"]payload['"]/)
    expect(source).not.toMatch(/req\.payload/)
    expect(source).not.toMatch(/getPayload\b/)
  })

  it('is a server component (FR-024)', () => {
    const source = readFileSync(PAGE_SOURCE, 'utf8')

    expect(
      source.trimStart().startsWith("'use client'") || source.trimStart().startsWith('"use client"'),
      'the detail page is text, images and links; nothing on it is interactive yet.',
    ).toBe(false)
  })
})

describe('§2 — the 404 that tells nothing (US10, FR-003)', () => {
  it('404s a slug the public read does not match', async () => {
    await expect(render('nao-existe', null)).rejects.toThrow(mocks.NOT_FOUND)
    expect(mocks.notFound).toHaveBeenCalledTimes(1)
  })

  it('answers a draft, a foreign slug and an unknown one identically', async () => {
    // The published-only filter and the tenant constraint both live inside the public client,
    // so all three arrive here as the same empty result. That is the point: there is no state
    // for the page to distinguish, and therefore no way for it to leak the difference.
    const respostas = []
    for (const slug of ['rascunho-desta-org', 'artigo-de-outra-org', 'nao-existe']) {
      respostas.push(await render(slug, null).then(() => 'renderizou').catch((erro) => erro))
    }

    expect(respostas).toEqual([mocks.NOT_FOUND, mocks.NOT_FOUND, mocks.NOT_FOUND])
  })

  it('holds no branch that could tell a draft from a stranger', () => {
    const source = readFileSync(PAGE_SOURCE, 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

    for (const estado of ['rascunho', 'em_revisao', 'publicado']) {
      expect(
        code,
        `the page names the review state \`${estado}\`; that vocabulary belongs to the client`,
      ).not.toContain(estado)
    }
    expect(code, 'the page reads `.status` off the document').not.toMatch(/\.status\b/)
    expect(
      code,
      'the page puts a `status` key in an object — a query clause, most likely',
    ).not.toMatch(/\bstatus\s*:/)
  })

  it('404s an unresolved host rather than guessing an organization (US1)', async () => {
    mocks.getPublicScopedPayloadForRSC.mockRejectedValue(new TenantUnresolvedError('nowhere.test'))

    await expect(ArtigoDetalhe({ params: Promise.resolve({ slug: ARTIGO.slug }) })).rejects.toThrow(
      mocks.NOT_FOUND,
    )
    expect(mocks.notFound).toHaveBeenCalledTimes(1)
  })

  it('lets a genuine read failure fail, instead of dressing it as a missing article', async () => {
    const queda = new Error('postgres is down')
    mocks.getPublicScopedPayloadForRSC.mockRejectedValue(queda)

    // A 404 for an outage tells the visitor the article does not exist, tells search engines to
    // drop the URL, and tells the team nothing. Only `TenantUnresolvedError` is a 404 here.
    await expect(ArtigoDetalhe({ params: Promise.resolve({ slug: ARTIGO.slug }) })).rejects.toThrow(
      queda,
    )
    expect(mocks.notFound).not.toHaveBeenCalled()
  })
})

describe('§3 — the header (artigos.md, FR-030)', () => {
  it('offers the way back to the listing', async () => {
    const { tree } = await render()
    const voltar = findAll(tree, 'a').find((node) => String(node.props.href) === '/artigos')

    expect(
      voltar,
      'a visitor who arrived on a shared URL has no way back to the listing — the header link ' +
        'is the only one this page carries.',
    ).toBeDefined()
  })

  it('names the article, its category, its author and its date', async () => {
    const text = textOf((await render()).tree)

    expect(text).toContain('Práticas colaborativas em Fab Lab')
    // `PUBLICAÇÃO` is a category record and not a content type (CLR-009), so it reaches this
    // page as any other category does — through the chip.
    expect(text).toContain('Publicação')
    expect(text).toContain('Maria Silva')
    // The same form the card prints, for the same reason: `12 MAI 2024` (artigos.md § Grid).
    expect(text).toContain('12 MAI 2024')
  })

  it('reads the calendar date in UTC, not in the server\'s timezone', async () => {
    // Payload stores midnight UTC for a date-only field. Formatted with the LOCAL getters on a
    // server in São Paulo (UTC-3), `2024-05-12T00:00:00.000Z` prints as **11 MAI**.
    const tz = process.env.TZ
    process.env.TZ = 'America/Sao_Paulo'
    try {
      expect(
        new Date(ARTIGO.dataPublicacao).getDate(),
        'this runtime ignored a change of process.env.TZ, so the assertion below proves nothing',
      ).toBe(11)
      expect(textOf((await render()).tree)).toContain('12 MAI 2024')
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  })

  it('renders the cover eagerly — it is the page\'s LCP candidate (SC-006)', async () => {
    const capa = findAll((await render()).tree, 'img').find(
      (img) => String(img.props.src) === '/media/praticas.png',
    )

    // The full-size original, not the card derivative: this is the one place the whole image is
    // the content rather than a thumbnail.
    expect(capa, 'the detail page dropped the cover').toBeDefined()
    expect(capa?.props.loading).toBe('eager')
    // The collection stores no alt text and the title sits directly above.
    expect(capa?.props.alt).toBe('')
  })

  it('renders without the parts an article does not have (US10 edge)', async () => {
    for (const parte of ['capa', 'dataPublicacao'] as const) {
      const { tree } = await render(ARTIGO.slug, semParte(parte))
      // No empty heading, no broken image, no stray separator: the section is simply absent.
      expect(textOf(tree)).toContain('Práticas colaborativas em Fab Lab')
    }
    const semCapa = await render(ARTIGO.slug, semParte('capa'))
    expect(findAll(semCapa.tree, 'img')).toHaveLength(0)
    const semData = await render(ARTIGO.slug, semParte('dataPublicacao'))
    expect(findAll(semData.tree, 'time')).toHaveLength(0)
  })
})

describe('§4 — the long text (FR-030)', () => {
  it('renders `corpo` through the Lexical converter, unmodified', async () => {
    const corpo = findOne((await render()).tree, RichText)

    expect(
      corpo,
      'the article body never rendered. `corpo` is a Lexical document and this page is the ' +
        'only surface it has (FR-030).',
    ).toBeDefined()
    // Handed over whole: a page that walked the tree itself would be a second renderer for a
    // format we do not control.
    expect(corpo?.props.data).toBe(CORPO)
  })

  it('renders no body section for an article that has none', async () => {
    const { tree } = await render(ARTIGO.slug, semParte('corpo'))

    expect(findAll(tree, RichText)).toHaveLength(0)
  })
})

describe('§5 — the attachments (FR-030, FR-012, US3)', () => {
  /** Every anchor pointing at the collection's download route. */
  const downloads = (tree: ReactNode): AnyElement[] =>
    findAll(tree, 'a').filter((node) => String(node.props.href).includes('/download/'))

  it('links every attachment at `anexos`\' own download route', async () => {
    const links = downloads((await render()).tree)

    expect(
      links,
      'the article\'s attachments are not linked. `Artigo.ts` registers ' +
        "`downloadEndpoint('artigo', 'anexos')` and this page is the only surface those files " +
        'have (FR-030).',
    ).toHaveLength(2)
    // `/api/artigo/:id/download/:midiaId` — the route the collection registers. Both ids come
    // from the document just read, so a visitor can name neither.
    expect(links.map((link) => link.props.href)).toEqual([
      '/api/artigo/20/download/7',
      '/api/artigo/20/download/8',
    ])
  })

  it('names each file, so a visitor can judge the link before clicking it', async () => {
    const text = textOf((await render()).tree)

    expect(text).toContain('primeiros-passos.pdf')
    expect(text).toContain('bancada.stl')
    // `2,3 MB` — binary megabytes, the unit `projetos/[slug]` already prints and the one every
    // file manager the visitor will compare against reports. 2 400 000 B is 2.3 MiB, and the
    // comma is the decimal separator this site writes in.
    expect(text).toContain('2,3 MB')
  })

  it('re-implements no part of the download — the endpoint owns the counter', () => {
    const source = readFileSync(PAGE_SOURCE, 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

    // FR-012's counted, open download lives behind the endpoint (`plan.md` § API contracts:
    // *"Detail pages link to it; they do not re-implement it."*). A page that touched the
    // counter would double-count every visit that never downloaded anything.
    expect(code, 'the page writes to the download counter').not.toMatch(/\bdownloads\b/)
    expect(code, 'the page issues its own update').not.toMatch(/\bupdate\s*\(/)
  })

  it('skips an attachment that arrived as a bare id', async () => {
    // The id alone names no file, so the link would be one a visitor cannot judge before
    // clicking and there is nothing to recover from. Two named files beside one nameless row
    // is worse than two named files.
    const parcial = { ...ARTIGO, anexos: [...ARTIGO.anexos, 99] }
    const links = downloads((await render(ARTIGO.slug, parcial)).tree)

    expect(links).toHaveLength(2)
  })

  it('renders no attachments section for an article with none (US10 edge)', async () => {
    const { tree } = await render(ARTIGO.slug, semParte('anexos'))

    expect(downloads(tree)).toHaveLength(0)
    // An empty heading is the failure US10's edge names: "renders without them rather than
    // showing empty headings".
    expect(textOf(tree)).not.toContain('ANEXOS')
  })
})
