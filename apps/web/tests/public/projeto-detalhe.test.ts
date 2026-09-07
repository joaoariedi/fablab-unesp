import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { RichText } from '@payloadcms/richtext-lexical/react'
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FindArgs } from '../../lib/tenancy/client'
import { TenantUnresolvedError } from '../../lib/tenancy/errors'

/**
 * T013 / FR-030, US10 — the `projeto` detail page.
 *
 * `spec.md` FR-030: *"`projeto`, `modelo3d` and `artigo` each have a detail page rendering the
 * long text, gallery and attachments feature 002 stores (CLR-001)"*, and US10 fixes both edges:
 * *"a document whose optional parts are empty renders without them rather than showing empty
 * headings"*, and *"an unpublished or foreign slug is a 404, the same answer as an unknown
 * one … it must not distinguish 'exists but is a draft' from 'does not exist'"*.
 *
 * ── The instrument, and its one deliberate limit ────────────────────────────────────────────
 *
 * Same as `projetos-page.test.ts`: the stack runs at `node` with no DOM, so the page is a plain
 * async function returning a plain object, and awaiting it lets this file assert the markup it
 * actually builds. Calling it at all is the FR-024 assertion — a page that grew a hook would
 * throw outside a renderer.
 *
 * What it cannot prove is the byte-identity of the three 404s across a *live* request; that is
 * T014's job, against a real database and a real response. The claim here is the one that lives
 * in this module: the page issues **one** slug query through the anonymous choke point, and has
 * no branch anywhere that could tell a draft from a stranger.
 */

const PAGE_SOURCE = join(
  import.meta.dirname,
  '..',
  '..',
  'app',
  '(frontend)',
  'projetos',
  '[slug]',
  'page.tsx',
)

/** The smallest Lexical document Payload stores for a `richText` field — the same shape
 *  `tests/tenancy/fixtures.ts` seeds, written out for the same reason it is there: building one
 *  through the editor would drag the whole editor package into this file. */
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

const CORPO = lexicalParagraph('Como a luminária foi modelada e impressa.')

/** One published project as `listPublic`'s sibling read returns it, populated one level:
 *  the category is an object, the images are media documents, and the polymorphic attachments
 *  arrive in Payload's `{ relationTo, value }` envelope. */
const PROJETO = {
  id: 10,
  titulo: 'Luminária paramétrica',
  slug: 'luminaria-parametrica',
  descricaoCurta: 'Luminária decorativa impressa em 3D com design paramétrico.',
  categoria: { id: 1, nome: 'Impressão 3D', slug: 'impressao-3d' },
  imagemCapa: {
    id: 3,
    url: '/media/luminaria.png',
    sizes: { card: { url: '/media/luminaria-card.png' } },
  },
  descricaoCompleta: CORPO,
  galeria: [
    { id: 4, url: '/media/passo-1.png', sizes: { card: { url: '/media/passo-1-card.png' } } },
    { id: 5, url: '/media/passo-2.png' },
  ],
  arquivos: [
    { relationTo: 'midiaModelo3d', value: { id: 7, filename: 'luminaria.stl', filesize: 2_400_000 } },
    { relationTo: 'midiaDocumento', value: { id: 8, filename: 'montagem.pdf', filesize: 512_000 } },
  ],
  curtidas: 32,
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

const { default: ProjetoDetalhe } = await import('../../app/(frontend)/projetos/[slug]/page')

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
  slug = PROJETO.slug,
  doc: Record<string, unknown> | null = PROJETO,
): Promise<Rendered> {
  const client = new FakePublicClient(doc === null ? [] : [doc])
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(client)
  const tree = (await ProjetoDetalhe({ params: Promise.resolve({ slug }) })) as unknown as ReactNode
  return { tree, client }
}

/** The document with one optional part removed — US10's "renders without them" edge. */
const semParte = (parte: 'descricaoCompleta' | 'galeria' | 'arquivos') => {
  const doc: Record<string, unknown> = { ...PROJETO }
  delete doc[parte]
  return doc
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('§1 — the read path (FR-002, FR-003)', () => {
  it('asks the anonymous choke point for the one project named by the slug', async () => {
    const { client } = await render()

    expect(mocks.getPublicScopedPayloadForRSC).toHaveBeenCalledTimes(1)
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0]).toEqual({
      collection: 'projeto',
      where: { slug: { equals: 'luminaria-parametrica' } },
      // The gallery, the cover and the category all arrive populated at one level — the same
      // rule `listing.ts` states: a detail page reads media *through* a published document, so
      // none of those collections needs to be publicly listable.
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
    for (const slug of ['rascunho-desta-org', 'projeto-de-outra-org', 'nao-existe']) {
      respostas.push(await render(slug, null).then(() => 'renderizou').catch((erro) => erro))
    }

    expect(respostas).toEqual([mocks.NOT_FOUND, mocks.NOT_FOUND, mocks.NOT_FOUND])
  })

  it('holds no branch that could tell a draft from a stranger', () => {
    const source = readFileSync(PAGE_SOURCE, 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

    // The three review states, by name. A page that could write one of them into a query or
    // compare one against a document is a page that can tell a draft from a stranger, which is
    // exactly what US10's error case forbids.
    for (const estado of ['rascunho', 'em_revisao', 'publicado']) {
      expect(code, `the page names the review state \`${estado}\`; that vocabulary belongs to the client`).not.toContain(
        estado,
      )
    }
    // And the field itself, in the two spellings that would matter: reading it off the document
    // and putting it in an object (a `where` clause, or a prop). Deliberately not a bare search
    // for the word — `Chip`'s `variant="status"` is the design system's filled chip and has
    // nothing to do with the review queue, and a check that cannot tell those apart is a check
    // that gets deleted the first time it cries wolf.
    expect(code, 'the page reads `.status` off the document').not.toMatch(/\.status\b/)
    expect(code, 'the page puts a `status` key in an object — a query clause, most likely').not.toMatch(
      /\bstatus\s*:/,
    )
  })

  it('404s an unresolved host rather than guessing an organization (US1)', async () => {
    mocks.getPublicScopedPayloadForRSC.mockRejectedValue(new TenantUnresolvedError('nowhere.test'))

    await expect(
      ProjetoDetalhe({ params: Promise.resolve({ slug: PROJETO.slug }) }),
    ).rejects.toThrow(mocks.NOT_FOUND)
    expect(mocks.notFound).toHaveBeenCalledTimes(1)
  })

  it('lets a genuine read failure fail, instead of dressing it as a missing project', async () => {
    const queda = new Error('postgres is down')
    mocks.getPublicScopedPayloadForRSC.mockRejectedValue(queda)

    // A 404 for an outage tells the visitor the project does not exist, tells search engines to
    // drop the URL, and tells the team nothing. Only `TenantUnresolvedError` is a 404 here.
    await expect(ProjetoDetalhe({ params: Promise.resolve({ slug: PROJETO.slug }) })).rejects.toThrow(
      queda,
    )
    expect(mocks.notFound).not.toHaveBeenCalled()
  })
})

describe('§3 — the long text (FR-030)', () => {
  it('renders `descricaoCompleta` through the Lexical converter, unmodified', async () => {
    const corpo = findOne((await render()).tree, RichText)

    expect(
      corpo,
      'the detail page exists to show `descricaoCompleta`; nothing else in the product renders ' +
        'it. Payload stores Lexical JSON, so a page that printed it as a string would show the ' +
        'serialised tree to a visitor.',
    ).toBeDefined()
    expect(corpo?.props.data).toBe(CORPO)
  })

  it('renders no body at all when the project has none (US10 edge)', async () => {
    const { tree } = await render(PROJETO.slug, semParte('descricaoCompleta'))

    expect(findAll(tree, RichText)).toHaveLength(0)
  })
})

describe('§4 — the gallery (FR-030)', () => {
  const galeriaDe = (tree: ReactNode): AnyElement | undefined =>
    findAll(tree, 'section').find((node) => node.props['aria-label'] === 'Galeria')

  it('shows every stored image, from the derivative made for a grid', async () => {
    const galeria = galeriaDe((await render()).tree)

    expect(galeria, 'the project stores a `galeria` and the page rendered none').toBeDefined()
    const imagens = findAll(galeria ?? null, 'img')
    expect(imagens.map((img) => img.props.src)).toEqual([
      // `midiaImagem` generates a `card` derivative; serving the originals in a thumbnail strip
      // is bytes spent against the LCP budget this feature exists to measure (SC-006).
      '/media/passo-1-card.png',
      // No derivative was generated for this one, so the original is the only file there is.
      '/media/passo-2.png',
    ])
    // The collection stores no alt text and the gallery is decorative beside the body copy;
    // an alt invented from the title makes a screen reader read the same words twice.
    expect(imagens.map((img) => img.props.alt)).toEqual(['', ''])
    // Below the fold by construction — the body copy sits above it.
    expect(imagens.map((img) => img.props.loading)).toEqual(['lazy', 'lazy'])
  })

  it('renders no gallery heading when there are no images (US10 edge)', async () => {
    const { tree } = await render(PROJETO.slug, semParte('galeria'))

    expect(galeriaDe(tree), 'an empty heading is what US10 says must not happen').toBeUndefined()
    expect(textOf(tree)).not.toContain('GALERIA')
  })

  it('renders the cover at full size, above the body', async () => {
    const { tree } = await render()
    const capa = findAll(tree, 'img')[0]

    // Not the `card` derivative: this is the largest image on the page and the likeliest LCP
    // element, so it is the original and it is fetched eagerly.
    expect(capa?.props.src).toBe('/media/luminaria.png')
    expect(capa?.props.loading).toBe('eager')
  })
})

describe('§5 — the attachments (FR-030, FR-012)', () => {
  const arquivosDe = (tree: ReactNode): AnyElement | undefined =>
    findAll(tree, 'section').find((node) => node.props['aria-label'] === 'Arquivos')

  it('links each file to the download route that already exists', async () => {
    const arquivos = arquivosDe((await render()).tree)

    expect(arquivos, 'the project stores `arquivos` and the page linked none').toBeDefined()
    const links = findAll(arquivos ?? null, 'a')
    // `downloadEndpoint('projeto', 'arquivos')` is registered on the collection and serves
    // `GET /api/projeto/:id/download/:midiaId`. The page links it; it does not re-implement it
    // (plan § "API contracts"), and both ids come from the document it just read.
    expect(links.map((link) => link.props.href)).toEqual([
      '/api/projeto/10/download/7',
      '/api/projeto/10/download/8',
    ])
    // The stored filename, so the visitor knows what they are about to fetch — both media
    // groups (`midiaModelo3d` and `midiaDocumento`) reach this list through one polymorphic
    // relationship, and both name the file the same way.
    expect(links.map((link) => textOf(link))).toEqual([
      expect.stringContaining('luminaria.stl'),
      expect.stringContaining('montagem.pdf'),
    ])
  })

  it('skips an attachment that arrived as a bare id rather than a document', async () => {
    const { tree } = await render(PROJETO.slug, {
      ...PROJETO,
      arquivos: [{ relationTo: 'midiaDocumento', value: 9 }, ...PROJETO.arquivos],
    })

    // A link with no filename is a link a visitor cannot judge before clicking, and there is
    // nothing to recover: the id alone names no file. Rendering the two that did populate is
    // better than one nameless row beside them.
    const links = findAll(arquivosDe(tree) ?? null, 'a')
    expect(links.map((link) => link.props.href)).toEqual([
      '/api/projeto/10/download/7',
      '/api/projeto/10/download/8',
    ])
  })

  it('renders no attachments heading when the project has none (US10 edge)', async () => {
    const { tree } = await render(PROJETO.slug, semParte('arquivos'))

    expect(arquivosDe(tree)).toBeUndefined()
    expect(textOf(tree)).not.toContain('ARQUIVOS')
  })
})

describe('§6 — the header (US10)', () => {
  it('names the project and its category', async () => {
    const texto = textOf((await render()).tree)

    expect(texto).toContain('Luminária paramétrica')
    expect(texto).toContain('Impressão 3D')
    expect(texto).toContain('Luminária decorativa impressa em 3D com design paramétrico.')
  })

  it('offers the way back to the listing', async () => {
    const { tree } = await render()
    const volta = findAll(tree, 'a').find((link) => link.props.href === '/projetos')

    expect(
      volta,
      'a detail page reached from a card is a dead end without it, and the browser back button ' +
        'is not a link a visitor arriving from a shared URL has.',
    ).toBeDefined()
  })
})
