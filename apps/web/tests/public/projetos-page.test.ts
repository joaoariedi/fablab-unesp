import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CardProjeto, EmptyState, ListingGrid, SearchInput, Tabs } from '@fablab/ui'

import { ALL_CATEGORIES } from '../../lib/public/params'
import type { FindArgs } from '../../lib/tenancy/client'
import { TenantUnresolvedError } from '../../lib/tenancy/errors'

/**
 * T012 / FR-004, FR-010, FR-021, FR-029, US1, US2 — the Projetos listing.
 *
 * `spec.md` FR-004: *"Projetos: hero, category tabs, search, 3/2/1-column grid of
 * `CardProjeto`"*; `projetos.md` § *Hero*, § *Barra de filtros e busca*, § *Grid de projetos*
 * and § *Estados e interações* fix every part of it, and `plan.md` § "Implementation approach"
 * fixes how: *"Every listing is a React Server Component reading through
 * `getPublicScopedPayloadForRSC`. Filters, tabs, pagination and the calendar's view switch are
 * **links**, so they need no client boundary."*
 *
 * ── Why this suite calls the page instead of rendering it ───────────────────────────────────
 *
 * The same instrument `frontend-layout.test.ts` uses, and for the same reason: the stack has no
 * DOM, so a React function component is a plain function returning a plain object. Awaiting the
 * page and walking the returned tree asserts the markup it actually builds — which components
 * it composes and with which props — and calling it at all is the FR-024 assertion, because a
 * page that grew a hook would throw outside a renderer.
 *
 * What it cannot prove is that a browser paints three columns at 1440. `ListingGrid` owns that
 * decision as data (`LISTING_GRID_COLUMNS`) and `listing-chrome.test.ts` pins it against the
 * cascade; this file asserts the page *uses* that grid rather than restating its media queries.
 *
 * ── Why the listing reader is mocked and the choke point is not driven ──────────────────────
 *
 * `listPublic` has its own suite (T008) and needs a real Postgres to do anything. The claim
 * here is narrower and is the one nothing else covers: *what the page asks for, and what it
 * builds from the answer*. So the reader is recorded and the category vocabulary is served by a
 * fake client behind the anonymous choke point — the only read this page issues directly, and
 * the one T004 declared `publicList` for.
 */

const PAGE_SOURCE = join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'projetos', 'page.tsx')

/** The two categories this organization names. Deliberately not CITe's full five: the page must
 *  render the vocabulary it was handed, not one it knows. */
const CATEGORIAS = [
  { id: 1, nome: 'Impressão 3D', slug: 'impressao-3d' },
  { id: 2, nome: 'Corte a Laser', slug: 'corte-a-laser' },
]

/** One published project, populated at `depth: 1` exactly as `listPublic` returns it. */
const PROJETO = {
  id: 10,
  titulo: 'Luminária paramétrica',
  slug: 'luminaria-parametrica',
  descricaoCurta: 'Luminária decorativa impressa em 3D com design paramétrico.',
  categoria: CATEGORIAS[0],
  imagemCapa: { id: 3, url: '/media/luminaria.png', sizes: { card: { url: '/media/luminaria-card.png' } } },
  curtidas: 32,
}

/**
 * The anonymous client, recorded rather than stubbed inline: §1 reads its `calls` to prove the
 * category vocabulary is read through the choke point and not from a constant in the page.
 */
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

const { default: ProjetosPage, metadata } = await import('../../app/(frontend)/projetos/page')

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
      docs: listing.docs ?? [PROJETO],
      page: listing.page ?? 1,
      totalPages: listing.totalPages ?? 1,
      totalDocs: listing.totalDocs ?? (listing.docs ?? [PROJETO]).length,
    })

  const tree = (await ProjetosPage({ searchParams: Promise.resolve(query) })) as unknown as ReactNode
  return { tree, client }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('§1 — the read path (FR-002, FR-011, FR-029)', () => {
  it('asks the one listing reader for projects, and asks nothing else for rows', async () => {
    await render({ categoria: 'impressao-3d', busca: 'luminária', pagina: '2' })

    expect(mocks.listPublic).toHaveBeenCalledTimes(1)
    expect(mocks.listPublic.mock.calls[0]?.[0]).toEqual({
      collection: 'projeto',
      // Parsed by `params.ts` and handed over whole: the page names no tenant, no status and
      // no page size, which is the entire argument for the reader existing (plan § Sketch 1).
      params: { categoria: 'impressao-3d', busca: 'luminária', page: 2 },
    })
  })

  it('reads the category vocabulary through the anonymous choke point', async () => {
    const { client } = await render()

    expect(mocks.getPublicScopedPayloadForRSC).toHaveBeenCalled()
    const read = client.calls.find((call) => call.collection === 'categoriaProjeto')
    expect(
      read,
      'the page never read `categoriaProjeto`. The tabs are this organization\'s vocabulary — ' +
        'T004 declared `publicList` on that collection precisely so a page could list it — and ' +
        'a hard-coded tab set would show CITe\'s five categories on every host (US2).',
    ).toBeDefined()
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

  it('titles the document', () => {
    expect(metadata.title).toContain('PROJETOS')
  })
})

describe('§2 — the hero (projetos.md § Hero)', () => {
  it('renders the teal band with navy ink', async () => {
    const { tree } = await render()
    const band = findAll(tree, 'section').find(
      (node) => node.props.style?.background === 'var(--surface-band)',
    )

    expect(
      band,
      'the hero is a faixa teal (projetos.md § Hero). `--surface-band` is the token that must ' +
        'not derive from `--surface-page`, so it is the one to paint it with.',
    ).toBeDefined()
    // "Título display navy", "parágrafo navy" — the light-on-dark default would be invisible.
    expect(band?.props.style?.color).toBe('var(--text-on-light)')
  })

  it('carries the two title lines and the invitation the page spec fixes', async () => {
    const text = textOf(findAll(await render().then((r) => r.tree), 'section')[0] ?? null)

    expect(text).toContain('PROJETOS')
    expect(text).toContain('DO LAB')
    expect(text).toContain('Conheça projetos incríveis desenvolvidos por nossos makers')
  })
})

describe('§3 — the category tabs are links (FR-010, US2)', () => {
  it('offers TODOS plus this organization\'s own categories, in that order', async () => {
    const tabs = findOne((await render()).tree, Tabs)

    expect(tabs, 'the page rendered no <Tabs>').toBeDefined()
    const items = tabs?.props.items as { label: string; href: string }[]
    expect(items.map((item) => item.label)).toEqual(['Todos', 'Impressão 3D', 'Corte a Laser'])
    expect(items.map((item) => item.href)).toEqual([
      '/projetos',
      '/projetos?categoria=impressao-3d',
      '/projetos?categoria=corte-a-laser',
    ])
  })

  it('marks the chosen category active by pointing at its own href', async () => {
    const tabs = findOne((await render({ categoria: 'corte-a-laser' })).tree, Tabs)

    // `Tabs` derives activeness by comparing `activeHref` to each item's href, so the page's
    // job is to build the SAME string — a near-miss (a trailing `&pagina=1`) renders a bar
    // with nothing selected and no error anywhere.
    expect(tabs?.props.activeHref).toBe('/projetos?categoria=corte-a-laser')
  })

  it('drops the page number when switching category, and keeps the search term', async () => {
    const tabs = findOne((await render({ busca: 'cartaz', pagina: '3' })).tree, Tabs)
    const items = tabs?.props.items as { label: string; href: string }[]

    // Page 3 of "Todos" is not page 3 of "Serigrafia": carrying the number across a filter
    // change lands the visitor on a page that may not exist. The term survives because the
    // visitor did not clear it.
    expect(items[1]?.href).toBe('/projetos?categoria=impressao-3d&busca=cartaz')
    expect(tabs?.props.activeHref).toBe('/projetos?busca=cartaz')
  })

  it('falls back to TODOS for a category this organization does not have (US2 error case)', async () => {
    const { tree } = await render({ categoria: 'marcenaria' })

    expect(findOne(tree, Tabs)?.props.activeHref).toBe('/projetos')
    expect(mocks.listPublic.mock.calls[0]?.[0]?.params?.categoria).toBe(ALL_CATEGORIES)
  })
})

describe('§4 — the search field (FR-010, FR-020)', () => {
  it('submits as a GET form to the listing\'s own path', async () => {
    const form = findOne((await render()).tree, 'form')

    expect(form, 'the page rendered no search form').toBeDefined()
    // GET, so the term lands in the URL and the result is linkable and reloadable (FR-010).
    expect(form?.props.method).toBe('get')
    expect(form?.props.action).toBe('/projetos')
  })

  it('names the field the parser reads, with the placeholder the page spec fixes', async () => {
    const field = findOne((await render()).tree, SearchInput)

    expect(field?.props.name).toBe('busca')
    expect(field?.props.placeholder).toBe('Buscar projetos...')
  })

  it('carries the current category through the search, so a filtered search stays filtered', async () => {
    const { tree } = await render({ categoria: 'corte-a-laser' })
    const hidden = findAll(tree, 'input').find((node) => node.props.type === 'hidden')

    expect(
      hidden,
      'a GET form submits only its own fields, so searching inside a category without a hidden ' +
        'input silently drops the filter the tab bar still shows as active.',
    ).toBeDefined()
    expect(hidden?.props.name).toBe('categoria')
    expect(hidden?.props.value).toBe('corte-a-laser')
  })

  it('carries no category input when nothing is filtered', async () => {
    const hidden = findAll((await render()).tree, 'input').find((n) => n.props.type === 'hidden')

    // `TODOS` is a UI state and not a row: submitting it would put `?categoria=TODOS` in the
    // URL, which `params.ts` narrows back to the same state through a longer link.
    expect(hidden).toBeUndefined()
  })
})

describe('§5 — the 3/2/1 grid of cards (FR-004, FR-021)', () => {
  it('places the cards in the shared listing grid', async () => {
    const grid = findOne((await render()).tree, ListingGrid)

    expect(
      grid,
      'the page built its own grid instead of using ListingGrid. The 3/2/1 columns are that ' +
        'component\'s decision (LISTING_GRID_COLUMNS) and four listings share it (FR-004).',
    ).toBeDefined()
    expect(grid?.props.label).toBe('Projetos')
  })

  it('renders one CardProjeto per project, mapped from the populated document', async () => {
    const cards = findAll((await render()).tree, CardProjeto)

    expect(cards).toHaveLength(1)
    const card = cards[0]?.props as Record<string, unknown>
    // See `maps EVERY document, not just the first` below for why one card is not enough.
    expect(card.titulo).toBe('Luminária paramétrica')
    expect(card.descricao).toBe('Luminária decorativa impressa em 3D com design paramétrico.')
    // The chip reads the populated category's name, which is why the reader asks for depth 1.
    expect(card.categoria).toBe('Impressão 3D')
    // The arrow's destination, `/projetos/{slug}` — the detail route T013 creates.
    expect(card.href).toBe('/projetos/luminaria-parametrica')
    expect(card.curtidas).toBe(32)
  })

  it('maps EVERY document, not just the first', async () => {
    // The case above renders a single-document fixture, so `toHaveLength(1)` is true of a page
    // that maps the list AND of one that renders `docs[0]` and discards the rest. Measured:
    // mutating the page to `listagem.docs.slice(0, 1).map(...)` — a listing showing one of the
    // twelve projects on every page, the most visible defect this feature could ship — passed
    // all 27 tests. A fixture that never has a second document cannot detect a page that never
    // renders one.
    const tres = [1, 2, 3].map((n) => ({
      ...PROJETO,
      id: n,
      slug: `projeto-${n}`,
      titulo: `Projeto ${n}`,
    }))
    const cards = findAll((await render({}, { docs: tres, totalDocs: 3 })).tree, CardProjeto)

    expect(cards).toHaveLength(3)
    // In order, and each from its OWN document: a page that rendered the first three times
    // would satisfy the length assertion on its own.
    expect(cards.map((c) => (c.props as Record<string, unknown>).titulo)).toEqual([
      'Projeto 1',
      'Projeto 2',
      'Projeto 3',
    ])
  })

  it('loads the first row eagerly and the rest lazily (SC-006)', async () => {
    // The rule T015's LCP budget depends on. Replacing it with a flat `'lazy'` also passed all
    // 27 tests — the budget would then be measuring a page whose first-row rule nothing pins.
    const muitos = Array.from({ length: 6 }, (_, i) => ({
      ...PROJETO,
      id: i + 1,
      slug: `projeto-${i + 1}`,
    }))
    const cards = findAll((await render({}, { docs: muitos, totalDocs: 6 })).tree, CardProjeto)
    const loadingOf = (i: number) =>
      ((cards[i]?.props as Record<string, unknown>).capa as AnyElement).props.loading

    expect(loadingOf(0), 'the LCP candidate was lazy-loaded').toBe('eager')
    expect(loadingOf(5), 'a below-the-fold cover was eager-loaded').toBe('lazy')
  })

  it('draws the cover from the stored card size, with no invented alt text', async () => {
    const card = findAll((await render()).tree, CardProjeto)[0]
    const capa = card?.props.capa as AnyElement

    expect(capa.type).toBe('img')
    // `midiaImagem` generates a `card` size; serving the original on a 3-column grid is bytes
    // spent against the LCP budget this feature exists to measure (SC-006).
    expect(capa.props.src).toBe('/media/luminaria-card.png')
    // The collection stores no alt text, and the title sits beside the image: an alt built
    // from the title makes a screen reader say the same words twice.
    expect(capa.props.alt).toBe('')
  })

  it('falls back to the original file when no card size was generated', async () => {
    const semSizes = { ...PROJETO, imagemCapa: { id: 3, url: '/media/luminaria.png' } }
    const card = findAll((await render({}, { docs: [semSizes] })).tree, CardProjeto)[0]

    expect((card?.props.capa as AnyElement).props.src).toBe('/media/luminaria.png')
  })
})

describe('§6 — numbered pagination (FR-029, CLR-003)', () => {
  it('emits the ellipsis, and only where pages are actually hidden', async () => {
    // §6 otherwise renders only totalPages 2 and 3, where `janela`'s candidates collapse to a
    // contiguous run and the gap branch is unreachable. Measured: deleting the
    // `saida.push(RETICENCIAS)` line passed all 27 tests. This page carries the pagination that
    // stands in for T010 — whose task line names "window with ellipsis" — so the one part of
    // that contract it reproduced was the one part nothing checked.
    const { tree } = await render({ pagina: '5' }, { page: 5, totalPages: 10, totalDocs: 120 })
    // Scoped to the pagination landmark: a bare scan of the document also picks up a card's
    // like count, which would make this assert on numbers that are not pages at all.
    const nav = /<nav[^>]*aria-label="[^"]*[Pp]agina[^"]*"[\s\S]*?<\/nav>/.exec(
      renderToStaticMarkup(tree as never),
    )?.[0]
    expect(nav, 'the page rendered no pagination landmark').toBeDefined()
    const slots = [...(nav ?? '').matchAll(/>(\d+|…)</g)].map((m) => m[1])

    // 1 … 4 5 6 … 10 — an ellipsis on each side, standing for a real gap.
    expect(slots).toEqual(['1', '…', '4', '5', '6', '…', '10'])
  })

  it('draws no ellipsis when nothing is hidden', async () => {
    // The pair: an ellipsis that replaces a single page hides a reachable page behind an
    // unclickable glyph, and looks correct in any screenshot.
    const { tree } = await render({ pagina: '2' }, { page: 2, totalPages: 3, totalDocs: 30 })
    const nav = /<nav[^>]*aria-label="[^"]*[Pp]agina[^"]*"[\s\S]*?<\/nav>/.exec(
      renderToStaticMarkup(tree as never),
    )?.[0]
    expect(nav).toBeDefined()
    expect(nav).not.toContain('…')
  })

  it('links every page, and marks the current one', async () => {
    const { tree } = await render({ pagina: '2' }, { page: 2, totalPages: 3, totalDocs: 30 })
    const nav = findAll(tree, 'nav').find((node) => node.props['aria-label'] === 'Paginação')

    expect(nav, 'a listing of 30 projects rendered no pagination (FR-029)').toBeDefined()
    const links = findAll(nav ?? null, 'a')
    expect(links.map((link) => textOf(link))).toEqual(['1', '2', '3'])
    // Anchors, not buttons: every page has a URL that can be linked, shared and indexed, and
    // the control needs no client boundary (CLR-003, plan § Sketch 4).
    expect(links.map((link) => link.props.href)).toEqual([
      '/projetos',
      '/projetos?pagina=2',
      '/projetos?pagina=3',
    ])
    expect(links.map((link) => link.props['aria-current'])).toEqual([undefined, 'page', undefined])
  })

  it('keeps the filter and the term in every page link', async () => {
    const { tree } = await render(
      { categoria: 'impressao-3d', busca: 'cartaz' },
      { page: 1, totalPages: 2, totalDocs: 20 },
    )
    const nav = findAll(tree, 'nav').find((node) => node.props['aria-label'] === 'Paginação')

    expect(findAll(nav ?? null, 'a').map((link) => link.props.href)).toEqual([
      '/projetos?categoria=impressao-3d&busca=cartaz',
      '/projetos?categoria=impressao-3d&busca=cartaz&pagina=2',
    ])
  })

  it('renders nothing at all for a listing that fits on one page', async () => {
    const { tree } = await render({}, { page: 1, totalPages: 1 })

    expect(findAll(tree, 'nav').find((n) => n.props['aria-label'] === 'Paginação')).toBeUndefined()
  })
})

describe('§7 — the empty state (FR-017, US2)', () => {
  it('explains the empty result and offers the action that clears it', async () => {
    const { tree } = await render({ categoria: 'corte-a-laser', busca: 'nada' }, { docs: [] })
    const empty = findOne(tree, EmptyState)

    expect(
      empty,
      'a filter with no matches rendered an empty grid with no explanation — the exact case ' +
        'US2 says the empty state exists for.',
    ).toBeDefined()
    expect(empty?.props.variant).toBe('vazio')
    expect(empty?.props.titulo).toBe('Nenhum projeto encontrado.')
    expect(empty?.props.descricao).toBe('Tente outra categoria ou limpe a busca.')
    // The clearing action IS the unfiltered URL — no handler, no client boundary.
    expect(empty?.props.acao).toEqual({ label: 'Limpar filtros', href: '/projetos' })
  })

  it('renders no grid beside the empty body', async () => {
    const { tree } = await render({}, { docs: [] })

    expect(findAll(tree, CardProjeto)).toHaveLength(0)
  })
})

describe('§8 — the error state (FR-018, US1)', () => {
  it('reports a failed read in place, with a retry that reloads the same URL', async () => {
    const { tree } = await render({ categoria: 'impressao-3d' }, new Error('postgres is down'))
    const erro = findOne(tree, EmptyState)

    expect(erro?.props.variant).toBe('erro')
    expect(erro?.props.titulo).toBe('Não foi possível carregar os projetos.')
    // Retrying is the URL that just failed, filter included — a retry that silently drops the
    // filter reports success for a different page than the one that broke.
    expect(erro?.props.acao).toEqual({
      label: 'Tentar novamente',
      href: '/projetos?categoria=impressao-3d',
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
    await expect(ProjetosPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      mocks.NOT_FOUND,
    )
    expect(mocks.notFound).toHaveBeenCalledTimes(1)
  })
})
