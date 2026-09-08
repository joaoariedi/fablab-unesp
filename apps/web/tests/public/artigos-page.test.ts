import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CardProjeto, EmptyState, ListingGrid, Pagination, SearchInput, Tabs } from '@fablab/ui'

import { ALL_CATEGORIES } from '../../lib/public/params'
import type { FindArgs } from '../../lib/tenancy/client'
import { TenantUnresolvedError } from '../../lib/tenancy/errors'

/**
 * T019 / FR-005, FR-010, FR-021, FR-029, US1, US2 — the Artigos listing.
 *
 * `spec.md` FR-005: *"Artigos: same listing shape, its own categories, cover with category chip
 * and date"*. `artigos.md` § *Hero* fixes the band (*"Título display navy: `ARTIGOS`"* and the
 * two-line paragraph), § *Barra de filtros e busca* the tabs and the `Buscar artigos...` field,
 * § *Grid de artigos* the three columns and the card — whose one addition over the Projetos
 * card is the **date beside the chip**: *"faixa de metadados sobre a base da capa: chip de
 * categoria rosa … + data de publicação em caps ao lado"* (`12 MAI 2024`).
 *
 * ── Why this is `projetos-page.test.ts`'s shape and not its copy ────────────────────────────
 *
 * The instrument is the same one and for the same reason (no DOM at `node`, so the page is a
 * plain async function returning a plain object). What differs is what it proves, and only the
 * differences are asserted at length: the collection this page reads (`artigo`, not `projeto`),
 * the vocabulary it lists (`categoriaArtigo`, ordered by the collection's own `ordem` field
 * rather than alphabetically — the tab order `artigos.md` fixes), the author it credits (a
 * populated `perfilMaker`, which `projeto` does not have at all yet) and the **date**, which no
 * other listing draws.
 */

const PAGE_SOURCE = join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'artigos', 'page.tsx')

/** This organization's vocabulary, deliberately out of alphabetical order: `ordem` is what
 *  `artigos.md` fixes the tab order with, and a page sorting by name would silently reverse
 *  these two. */
/**
 * The vocabulary, INCLUDING the row CLR-009 is about.
 *
 * The first draft of this file seeded only the two ordinary categories, so every assertion
 * about the tab set was true of a page that lists every row it is handed — which is what
 * shipped. `PUBLICAÇÃO` is a real `categoria_artigo` row (it has to be: that is how the card
 * chip gets its text), and it is the one row the tabs must not show, so a fixture without it
 * makes the rule unfalsifiable.
 */
const CATEGORIAS = [
  { id: 1, nome: 'Cultura Maker', slug: 'cultura-maker', ordem: 1 },
  { id: 2, nome: 'Educação', slug: 'educacao', ordem: 2 },
  { id: 3, nome: 'Publicação', slug: 'publicacao', ordem: 3 },
]

/** One published article, populated at `depth: 1` exactly as `listPublic` returns it. */
const ARTIGO = {
  id: 20,
  titulo: 'Práticas colaborativas em Fab Lab',
  slug: 'praticas-colaborativas',
  resumo: 'Volume 1 da coleção Primeiros Passos, uma parceria entre a Rede Fab Lab Brasil e a UNESP.',
  categoria: CATEGORIAS[0],
  capa: { id: 5, url: '/media/praticas.png', sizes: { card: { url: '/media/praticas-card.png' } } },
  autor: { id: 9, nome: 'Maria Silva', handle: 'mariasilva' },
  dataPublicacao: '2024-05-12T00:00:00.000Z',
  curtidas: 24,
}

/** The anonymous client, recorded rather than stubbed inline: §1 reads its `calls` to prove the
 *  category vocabulary is read through the choke point and not from a constant in the page. */
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
    listPublic: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))

vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/public-payload')>()),
  getPublicScopedPayloadForRSC: mocks.getPublicScopedPayloadForRSC,
}))

vi.mock('../../lib/public/listing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/public/listing')>()),
  listPublic: mocks.listPublic,
}))

const { default: ArtigosPage, metadata } = await import('../../app/(frontend)/artigos/page')

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly style?: Record<string, unknown>
  readonly [key: string]: unknown
}>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

/** Every element in the tree whose `type` matches, depth-first. Takes an intrinsic tag name or
 *  a component function — the page imports the same module instance this file does, so identity
 *  comparison is what proves it composed `CardProjeto` and not a look-alike. */
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

/** Renders the page for a query string, with the vocabulary and the listing page it should see. */
async function render(
  query: Record<string, string | string[] | undefined> = {},
  listing: { docs?: unknown[]; page?: number; totalPages?: number; totalDocs?: number } | Error = {},
): Promise<Rendered> {
  const client = new FakePublicClient(CATEGORIAS)
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(client)
  if (listing instanceof Error) mocks.listPublic.mockRejectedValue(listing)
  else
    mocks.listPublic.mockResolvedValue({
      docs: listing.docs ?? [ARTIGO],
      page: listing.page ?? 1,
      totalPages: listing.totalPages ?? 1,
      totalDocs: listing.totalDocs ?? (listing.docs ?? [ARTIGO]).length,
    })

  const tree = (await ArtigosPage({ searchParams: Promise.resolve(query) })) as unknown as ReactNode
  return { tree, client }
}

/** The first card's cover slot, where the date rides beside the chip. */
const capaDe = (tree: ReactNode): ReactNode =>
  (findAll(tree, CardProjeto)[0]?.props.capa ?? null) as ReactNode

beforeEach(() => {
  vi.clearAllMocks()
})

describe('§1 — the read path (FR-002, FR-011, FR-029)', () => {
  it('asks the one listing reader for articles, and asks nothing else for rows', async () => {
    await render({ categoria: 'educacao', busca: 'gamificação', pagina: '2' })

    expect(mocks.listPublic).toHaveBeenCalledTimes(1)
    expect(mocks.listPublic.mock.calls[0]?.[0]).toEqual({
      collection: 'artigo',
      // Parsed by `params.ts` and handed over whole: the page names no tenant, no status and
      // no page size, which is the entire argument for the reader existing (plan § Sketch 1).
      params: { categoria: 'educacao', busca: 'gamificação', page: 2 },
    })
  })

  it('reads its own vocabulary through the choke point, ordered by `ordem`', async () => {
    const { client } = await render()

    expect(mocks.getPublicScopedPayloadForRSC).toHaveBeenCalled()
    const read = client.calls.find((call) => call.collection === 'categoriaArtigo')
    expect(
      read,
      'the page never read `categoriaArtigo`. The tabs are this organization\'s vocabulary — ' +
        'the registry declares `publicList` on that collection precisely so a page could list ' +
        'it — and a hard-coded tab set would show CITe\'s five categories on every host (US2).',
    ).toBeDefined()
    // `categoriaArtigo` carries an `ordem` field and `categoriaProjeto` does not, which is why
    // this listing sorts by it rather than by name: `artigos.md` fixes the tab order as
    // CULTURA MAKER · EDUCAÇÃO · TECNOLOGIA · INOVAÇÃO SOCIAL, and alphabetical is not it.
    expect(read?.sort).toBe('ordem')
    // The tenant constraint is `buildTenantClient`'s; a `where` naming one here would be a
    // second opinion about which organization this is.
    expect(JSON.stringify(read?.where ?? {})).not.toContain('tenant')
  })

  it('never reaches Payload directly (FR-002, SC-003)', () => {
    const source = readFileSync(PAGE_SOURCE, 'utf8')

    expect(source).not.toMatch(/from ['"]payload['"]/)
    expect(source).not.toMatch(/req\.payload/)
    expect(source).not.toMatch(/getPayload\b/)
  })

  it('is a server component — the page itself ships no client bundle (FR-024)', () => {
    const source = readFileSync(PAGE_SOURCE, 'utf8')

    expect(
      source.trimStart().startsWith("'use client'") || source.trimStart().startsWith('"use client"'),
      "a 'use client' on the listing turns the whole page — hero, grid and twelve cards — " +
        'into a client bundle. FR-024 allows islands, not client pages.',
    ).toBe(false)
  })

  it('leaves no placeholder behind (FR-001)', () => {
    const source = readFileSync(PAGE_SOURCE, 'utf8')

    expect(
      source,
      'the route still imports `PageStub`. FR-001: the five placeholder routes render real ' +
        'pages and `PageStub` has no remaining importer among them.',
    ).not.toContain('PageStub')
  })

  it('titles the document', () => {
    expect(metadata.title).toContain('ARTIGOS')
  })
})

describe('§2 — the hero (artigos.md § Hero)', () => {
  it('renders the teal band with navy ink', async () => {
    const { tree } = await render()
    const band = findAll(tree, 'section').find(
      (node) => node.props.style?.background === 'var(--surface-band)',
    )

    expect(
      band,
      'the hero is a faixa teal (artigos.md § Hero). `--surface-band` is the token that must ' +
        'not derive from `--surface-page`, so it is the one to paint it with.',
    ).toBeDefined()
    // "Título display navy", "parágrafo navy" — the light-on-dark default would be invisible.
    expect(band?.props.style?.color).toBe('var(--text-on-light)')
  })

  it('carries the title and the two-line invitation the page spec fixes', async () => {
    const text = textOf(findAll((await render()).tree, 'section')[0] ?? null)

    expect(text).toContain('ARTIGOS')
    expect(text).toContain('Conteúdos, reflexões e referências')
    expect(text).toContain('para inspirar, aprender e transformar')
  })
})

describe('§3 — the category tabs are links (FR-005, FR-010, US2)', () => {
  it('offers TODOS plus this organization\'s own categories, in that order', async () => {
    const tabs = findOne((await render()).tree, Tabs)

    expect(tabs, 'the page rendered no <Tabs>').toBeDefined()
    const items = tabs?.props.items as { label: string; href: string }[]
    expect(items.map((item) => item.label)).toEqual(['Todos', 'Cultura Maker', 'Educação'])
    expect(items.map((item) => item.href)).toEqual([
      '/artigos',
      '/artigos?categoria=cultura-maker',
      '/artigos?categoria=educacao',
    ])
  })

  it('marks the chosen category active by pointing at its own href', async () => {
    const tabs = findOne((await render({ categoria: 'educacao' })).tree, Tabs)

    // `Tabs` derives activeness by comparing `activeHref` to each item's href, so the page's
    // job is to build the SAME string — a near-miss (a trailing `&pagina=1`) renders a bar
    // with nothing selected and no error anywhere.
    expect(tabs?.props.activeHref).toBe('/artigos?categoria=educacao')
  })

  it('drops the page number when switching category, and keeps the search term', async () => {
    const tabs = findOne((await render({ busca: 'maker', pagina: '3' })).tree, Tabs)
    const items = tabs?.props.items as { label: string; href: string }[]

    expect(items[1]?.href).toBe('/artigos?categoria=cultura-maker&busca=maker')
    expect(tabs?.props.activeHref).toBe('/artigos?busca=maker')
  })

  it('leaves PUBLICAÇÃO out of the tab set while the row keeps existing (CLR-009)', async () => {
    // CLR-009: "a row in categoria_artigo, shown on the card chip, absent from the tab set",
    // and artigos.md says it in the page spec too — "PUBLICAÇÃO **não** consta nas tabs de
    // categoria". Because it is a real row, the vocabulary read returns it like any other, so
    // the page has to leave it out; the first draft built the bar from every row it was handed
    // and the suite stayed green only because the fixture seeded two categories and never this
    // one — the literal test passing while the decided behaviour was missing.
    const { tree, client } = await render()
    const items = (findOne(tree, Tabs)?.props.items ?? []) as { label: string; href: string }[]

    expect(
      CATEGORIAS.map((categoria) => categoria.slug),
      'the fixture no longer seeds the row this rule is about, so nothing below can fail',
    ).toContain('publicacao')
    const read = client.calls.find((call) => call.collection === 'categoriaArtigo')
    expect(read, 'the vocabulary is not read at all').toBeDefined()

    expect(
      items.map((item) => item.label),
      'PUBLICAÇÃO is offered as a category tab. It is a chip value, not a filter the design ' +
        'offers — the mockup fixes the tab order without it.',
    ).not.toContain('Publicação')
    expect(items.map((item) => item.href)).not.toContain('/artigos?categoria=publicacao')
  })

  it('still filters by PUBLICAÇÃO for anyone who types the URL', async () => {
    // What CLR-009 removes is the OFFER, not the filter: the row is a real category and the
    // reader has no reason to refuse it. Asserting this keeps the fix from drifting into
    // "reject the slug", which would be a different decision than the one recorded.
    await render({ categoria: 'publicacao' })

    expect(mocks.listPublic.mock.calls[0]?.[0]?.params?.categoria).toBe('publicacao')
  })

  it('falls back to TODOS for a category this organization does not have (US2 error case)', async () => {
    const { tree } = await render({ categoria: 'marcenaria' })

    expect(findOne(tree, Tabs)?.props.activeHref).toBe('/artigos')
    expect(mocks.listPublic.mock.calls[0]?.[0]?.params?.categoria).toBe(ALL_CATEGORIES)
  })
})

describe('§4 — the search field (FR-010, FR-020)', () => {
  it('submits as a GET form to the listing\'s own path, with the article placeholder', async () => {
    const { tree } = await render()
    const form = findOne(tree, 'form')

    expect(form, 'the page rendered no search form').toBeDefined()
    // GET, so the term lands in the URL and the result is linkable and reloadable (FR-010).
    expect(form?.props.method).toBe('get')
    expect(form?.props.action).toBe('/artigos')

    const field = findOne(tree, SearchInput)
    expect(field?.props.name).toBe('busca')
    expect(field?.props.placeholder).toBe('Buscar artigos...')
  })

  it('carries the current category through the search, so a filtered search stays filtered', async () => {
    const { tree } = await render({ categoria: 'educacao' })
    const hidden = findAll(tree, 'input').find((node) => node.props.type === 'hidden')

    expect(
      hidden,
      'a GET form submits only its own fields, so searching inside a category without a hidden ' +
        'input silently drops the filter the tab bar still shows as active.',
    ).toBeDefined()
    expect(hidden?.props.name).toBe('categoria')
    expect(hidden?.props.value).toBe('educacao')
  })

  it('carries no category input when nothing is filtered', async () => {
    const hidden = findAll((await render()).tree, 'input').find((n) => n.props.type === 'hidden')

    // `TODOS` is a UI state and not a row: submitting it would put `?categoria=TODOS` in the
    // URL, which `params.ts` narrows back to the same state through a longer link.
    expect(hidden).toBeUndefined()
  })
})

describe('§5 — the 3/2/1 grid of cards (FR-005, FR-021)', () => {
  it('places the cards in the shared listing grid', async () => {
    const grid = findOne((await render()).tree, ListingGrid)

    expect(
      grid,
      'the page built its own grid instead of using ListingGrid. The 3/2/1 columns are that ' +
        'component\'s decision (LISTING_GRID_COLUMNS) and the listings share it (FR-005).',
    ).toBeDefined()
    expect(grid?.props.label).toBe('Artigos')
  })

  it('renders one card per article, mapped from the populated document', async () => {
    const cards = findAll((await render()).tree, CardProjeto)

    expect(cards).toHaveLength(1)
    const card = cards[0]?.props as Record<string, unknown>
    expect(card.titulo).toBe('Práticas colaborativas em Fab Lab')
    // `resumo` is the article's two-line body on the card — `descricaoCurta` is `projeto`'s
    // name for the same slot and does not exist here.
    expect(card.descricao).toBe(ARTIGO.resumo)
    // The chip reads the populated category's name, which is why the reader asks for depth 1.
    expect(card.categoria).toBe('Cultura Maker')
    // The arrow's destination, `/artigos/{slug}` — this task's detail route.
    expect(card.href).toBe('/artigos/praticas-colaborativas')
    expect(card.curtidas).toBe(24)
  })

  it('credits the populated author, not a placeholder', async () => {
    const card = findAll((await render()).tree, CardProjeto)[0]?.props as Record<string, unknown>

    // Unlike `projeto`, `artigo` HAS an author (`perfilMaker`, required), so the strip shows a
    // real person. A page crediting the lab here would be discarding data it was handed.
    expect(card.autor).toMatchObject({ nome: 'Maria Silva', handle: 'mariasilva' })
  })

  it('falls back to the lab when the author arrived unpopulated', async () => {
    const semAutor = { ...ARTIGO, autor: 9 }
    const card = findAll((await render({}, { docs: [semAutor] })).tree, CardProjeto)[0]
      ?.props as Record<string, unknown>

    // `CardProjeto.autor` is required and the strip is drawn on every card, so a relationship
    // that arrived as a bare id must still render something true — the lab, never an invented
    // maker with a name and a handle nobody has.
    expect((card.autor as { nome: string }).nome).not.toBe('')
    expect((card.autor as { handle: string }).handle).not.toContain('undefined')
  })

  it('maps EVERY document, not just the first', async () => {
    // A single-document fixture cannot tell a page that maps the list from one that renders
    // `docs[0]` and discards the rest — the most visible defect this listing could ship.
    const tres = [1, 2, 3].map((n) => ({
      ...ARTIGO,
      id: n,
      slug: `artigo-${n}`,
      titulo: `Artigo ${n}`,
    }))
    const cards = findAll((await render({}, { docs: tres, totalDocs: 3 })).tree, CardProjeto)

    expect(cards).toHaveLength(3)
    expect(cards.map((c) => (c.props as Record<string, unknown>).titulo)).toEqual([
      'Artigo 1',
      'Artigo 2',
      'Artigo 3',
    ])
  })

  it('loads the first row eagerly and the rest lazily (SC-006)', async () => {
    const muitos = Array.from({ length: 6 }, (_, i) => ({
      ...ARTIGO,
      id: i + 1,
      slug: `artigo-${i + 1}`,
    }))
    const cards = findAll((await render({}, { docs: muitos, totalDocs: 6 })).tree, CardProjeto)
    const coverOf = (i: number) =>
      findAll((cards[i]?.props as Record<string, unknown>).capa as ReactNode, 'img')[0]

    expect(coverOf(0)?.props.loading, 'the LCP candidate was lazy-loaded').toBe('eager')
    expect(coverOf(5)?.props.loading, 'a below-the-fold cover was eager-loaded').toBe('lazy')
  })

  it('draws the cover from the stored card size, with no invented alt text', async () => {
    const capa = findAll(capaDe((await render()).tree), 'img')[0]

    // `midiaImagem` generates a `card` size; serving the original on a 3-column grid is bytes
    // spent against the LCP budget this feature exists to measure (SC-006).
    expect(capa?.props.src).toBe('/media/praticas-card.png')
    expect(capa?.props.alt).toBe('')
  })

  it('falls back to the original file when no card size was generated', async () => {
    const semSizes = { ...ARTIGO, capa: { id: 5, url: '/media/praticas.png' } }
    const capa = findAll(capaDe((await render({}, { docs: [semSizes] })).tree), 'img')[0]

    expect(capa?.props.src).toBe('/media/praticas.png')
  })
})

describe('§6 — the date beside the chip (FR-005, artigos.md § Grid)', () => {
  it('prints the publication date in the mockup\'s form, over the cover', async () => {
    const data = findAll(capaDe((await render()).tree), 'time')[0]

    expect(
      data,
      'the card shows no date. FR-005 asks for a "cover with category chip and date", and the ' +
        'date is the one thing this card has that the Projetos card does not — a listing ' +
        'without it is the Projetos grid with different rows.',
    ).toBeDefined()
    // "PUBLICAÇÃO · 12 MAI 2024" — caps, three-letter month, in Portuguese.
    expect(textOf(data ?? null)).toBe('12 MAI 2024')
    // A machine-readable date beside the human one: the visible string is abbreviated and
    // localised, and nothing else on the page carries the instant.
    expect(data?.props.dateTime).toBe('2024-05-12T00:00:00.000Z')
  })

  it('reads the calendar date in UTC, not in the server\'s timezone', async () => {
    // Payload stores midnight UTC for a date-only field. Formatted with the LOCAL getters on a
    // server in São Paulo (UTC-3), `2024-05-12T00:00:00.000Z` prints as **11 MAI** — an article
    // dated a day early on every card, in a way no test in a UTC container would ever show.
    const tz = process.env.TZ
    process.env.TZ = 'America/Sao_Paulo'
    try {
      expect(
        new Date(ARTIGO.dataPublicacao).getDate(),
        'this runtime ignored a change of process.env.TZ, so the assertion below proves nothing',
      ).toBe(11)
      expect(textOf(findAll(capaDe((await render()).tree), 'time')[0] ?? null)).toBe('12 MAI 2024')
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  })

  it('draws no date at all for an article that carries none', async () => {
    // `dataPublicacao` is optional on the collection — a draft has no publication date to
    // carry. An empty `<time>` over the cover is a rendering artefact, not a date.
    const semData = { ...ARTIGO, dataPublicacao: undefined }
    const { tree } = await render({}, { docs: [semData] })

    expect(findAll(capaDe(tree), 'time')).toHaveLength(0)
  })
})

describe('§7 — numbered pagination (FR-029, CLR-003)', () => {
  /** The pagination landmark's markup, rendered rather than walked: since T010 the bar is
   *  `<Pagination>` from `@fablab/ui`, so the tree holds an unrendered element and a walk for
   *  `nav` finds nothing. */
  const paginationMarkup = (tree: ReactNode): string | undefined =>
    /<nav[^>]*aria-label="[^"]*[Pp]agina[^"]*"[\s\S]*?<\/nav>/.exec(
      renderToStaticMarkup(tree as never),
    )?.[0]

  const hrefsIn = (nav: string): string[] =>
    [...nav.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!.replaceAll('&amp;', '&'))

  it('draws the shared control, not a second copy of the window', async () => {
    const { tree } = await render({ pagina: '2' }, { page: 2, totalPages: 3, totalDocs: 30 })
    const bar = findOne(tree, Pagination)

    expect(
      bar,
      'the listing renders no <Pagination> from @fablab/ui. Identity, not shape: this file ' +
        'imports the same module instance the page does, so a local look-alike fails here.',
    ).toBeDefined()
    expect(bar?.props.page).toBe(2)
    expect(bar?.props.totalPages).toBe(3)
  })

  it('keeps the filter and the term in every page link', async () => {
    const { tree } = await render(
      { categoria: 'educacao', busca: 'jogar' },
      { page: 1, totalPages: 2, totalDocs: 20 },
    )
    const nav = paginationMarkup(tree)
    expect(nav, 'the page rendered no pagination landmark').toBeDefined()

    // No `‹` on page 1: the control omits the step at the ends rather than disabling it.
    expect(hrefsIn(nav ?? '')).toEqual([
      '/artigos?categoria=educacao&busca=jogar',
      '/artigos?categoria=educacao&busca=jogar&pagina=2',
      '/artigos?categoria=educacao&busca=jogar&pagina=2',
    ])
  })

  it('renders nothing at all for a listing that fits on one page', async () => {
    const { tree } = await render({}, { page: 1, totalPages: 1 })

    expect(paginationMarkup(tree)).toBeUndefined()
  })
})

describe('§8 — the empty and error states (FR-017, FR-018, US1, US2)', () => {
  it('explains the empty result and offers the action that clears it', async () => {
    const { tree } = await render({ categoria: 'educacao', busca: 'nada' }, { docs: [] })
    const empty = findOne(tree, EmptyState)

    expect(
      empty,
      'a filter with no matches rendered an empty grid with no explanation — the exact case ' +
        'US2 says the empty state exists for.',
    ).toBeDefined()
    expect(empty?.props.variant).toBe('vazio')
    // artigos.md § Vazio: "Nenhum artigo encontrado." + "Limpar filtros".
    expect(empty?.props.titulo).toBe('Nenhum artigo encontrado.')
    expect(empty?.props.acao).toEqual({ label: 'Limpar filtros', href: '/artigos' })
    expect(findAll(tree, CardProjeto)).toHaveLength(0)
  })

  it('reports a failed read in place, with a retry that reloads the same URL', async () => {
    const { tree } = await render({ categoria: 'cultura-maker' }, new Error('postgres is down'))
    const erro = findOne(tree, EmptyState)

    expect(erro?.props.variant).toBe('erro')
    // artigos.md § Erro: "Não foi possível carregar os artigos." + "Tentar novamente".
    expect(erro?.props.titulo).toBe('Não foi possível carregar os artigos.')
    // Retrying is the URL that just failed, filter included — a retry that silently drops the
    // filter reports success for a different page than the one that broke.
    expect(erro?.props.acao).toEqual({
      label: 'Tentar novamente',
      href: '/artigos?categoria=cultura-maker',
    })
  })

  it('keeps the hero and the filters usable while the grid is broken', async () => {
    const { tree } = await render({}, new Error('postgres is down'))

    expect(findOne(tree, Tabs), 'the error state took the whole page down with it').toBeDefined()
    expect(findOne(tree, SearchInput)).toBeDefined()
  })

  it('404s an unresolved host instead of rendering an error state (US1)', async () => {
    mocks.getPublicScopedPayloadForRSC.mockRejectedValue(new TenantUnresolvedError('nowhere.test'))

    // The same answer the layout gives: a host no organization claims is "no such site", not
    // "this site is broken" — and never a page rendered from a guessed tenant.
    await expect(ArtigosPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(mocks.NOT_FOUND)
    expect(mocks.notFound).toHaveBeenCalledTimes(1)
  })
})
