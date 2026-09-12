import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderToStaticMarkup } from 'react-dom/server'

import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EmptyState, LikeButton, Pagination, SearchInput } from '@fablab/ui'

import { ALL_CATEGORIES } from '../../lib/public/params'
import type { FindArgs } from '../../lib/tenancy/client'
import { TenantUnresolvedError } from '../../lib/tenancy/errors'

/**
 * T020 / FR-007, FR-010, FR-021, FR-028, FR-029, US1, US2, US3 — the Biblioteca 3D listing.
 *
 * `spec.md` FR-007: *"Biblioteca 3D: light background, teal sidebar whose category items filter
 * the list, search plus the three filter selects, numbered cards, pagination"*, and
 * `biblioteca-3d.md` fixes every part of it: the sidebar (*"faixa teal … título display navy em
 * duas linhas `BIBLIOTECA` / `3D`"*, whose `CATEGORIAS` items are *"tags de tema que filtram o
 * conteúdo"*), the filter bar (*"placeholder `Buscar modelos 3D...`"*, *"`FILTRAR POR:` seguido
 * de três dropdowns"*), the numbered cards (*"numerados `01`–`10` em caixa com contorno"*) and
 * the light treatment decided on 2026-08-23 (*"fundo branco … todo texto sobre branco usa azul
 * navy escuro"* — FR-028, and the reason nothing small here may be pink).
 *
 * ── Why this suite calls the page instead of rendering it ───────────────────────────────────
 *
 * The instrument `projetos-page.test.ts` established, for the same reason: the stack runs at
 * `node` with no DOM, so a React function component is a plain function returning a plain
 * object. Awaiting the page and walking the tree asserts the markup it actually builds, and
 * calling it at all is the FR-024 assertion — a page that grew a hook would throw outside a
 * renderer.
 *
 * ── Why the listing reader is mocked and the choke point is not driven ──────────────────────
 *
 * `listPublic` has its own suite (T008) and needs a real Postgres. The claim here is the one
 * nothing else covers: *what this page asks for, and what it builds from the answer*. So the
 * reader is recorded, and the category vocabulary is served by a fake client behind the
 * anonymous choke point — the read T004 declared `publicList` on `categoriaModelo` for.
 */

const PAGE_SOURCE = join(
  import.meta.dirname,
  '..',
  '..',
  'app',
  '(frontend)',
  'biblioteca-3d',
  'page.tsx',
)

/** This organization's two categories. Deliberately not the mockup's six: the sidebar must
 *  render the vocabulary it was handed, never one it knows. */
const CATEGORIAS = [
  { id: 1, nome: 'Animais', slug: 'animais', totalModelos: 184, ordem: 1 },
  { id: 2, nome: 'Veículos', slug: 'veiculos', totalModelos: 142, ordem: 2 },
]

/** One published model, populated at `depth: 1` exactly as `listPublic` returns it. */
const MODELO = {
  id: 10,
  titulo: 'Bolsa vazada',
  slug: 'bolsa-vazada',
  descricaoCurta: 'Bolsa decorativa com estrutura vazada e design paramétrico.',
  categoria: CATEGORIAS[0],
  thumbnail: { id: 3, url: '/media/bolsa.png', sizes: { card: { url: '/media/bolsa-card.png' } } },
  autor: { id: 5, nome: 'Maria Silva', handle: 'mariasilva' },
  arquivosModelo: [{ relationTo: 'midiaModelo3d', value: { id: 7, filename: 'bolsa.stl' } }],
  curtidas: 42,
}

/** The anonymous client, recorded rather than stubbed inline: §1 reads its `calls` to prove the
 *  sidebar vocabulary is read through the choke point and not from a constant in the page. */
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
  /** What the real `notFound()` does: it throws and never returns. A mock that returns lets
   *  execution fall through to a render the runtime would never reach. */
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

const { default: BibliotecaPage, metadata } = await import('../../app/(frontend)/biblioteca-3d/page')

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly style?: Record<string, unknown>
  readonly [key: string]: unknown
}>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

/** Every element in the tree whose `type` matches, depth-first. */
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

type Listagem = {
  docs?: unknown[]
  page?: number
  totalPages?: number
  totalDocs?: number
}

/** Renders the page for a query string, with the vocabulary and the listing page it should see. */
async function render(
  query: Record<string, string | string[] | undefined> = {},
  listing: Listagem | Error = {},
): Promise<Rendered> {
  const client = new FakePublicClient(CATEGORIAS)
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(client)
  if (listing instanceof Error) mocks.listPublic.mockRejectedValue(listing)
  else
    mocks.listPublic.mockResolvedValue({
      docs: listing.docs ?? [MODELO],
      page: listing.page ?? 1,
      totalPages: listing.totalPages ?? 1,
      totalDocs: listing.totalDocs ?? (listing.docs ?? [MODELO]).length,
    })

  const tree = (await BibliotecaPage({ searchParams: Promise.resolve(query) })) as unknown as ReactNode
  return { tree, client }
}

/** The anchors of the sidebar's category list, in document order. */
function categoriaLinks(tree: ReactNode): AnyElement[] {
  const nav = findAll(tree, 'nav').find((node) =>
    String(node.props['aria-label'] ?? '').toLowerCase().includes('categoria'),
  )
  return nav === undefined ? [] : findAll(nav, 'a')
}

const selectNamed = (tree: ReactNode, name: string): AnyElement | undefined =>
  findAll(tree, 'select').find((node) => node.props.name === name)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('§1 — the read path (FR-002, FR-011, FR-024, FR-029)', () => {
  it('asks the one listing reader for models, and asks nothing else for rows', async () => {
    await render({ categoria: 'animais', busca: 'bolsa', pagina: '2' })

    expect(mocks.listPublic).toHaveBeenCalledTimes(1)
    expect(mocks.listPublic.mock.calls[0]?.[0]).toEqual({
      collection: 'modelo3d',
      // Parsed by `params.ts` and handed over whole: the page names no tenant, no status and no
      // page size — the entire argument for the reader existing (plan § Sketch 1).
      params: { categoria: 'animais', busca: 'bolsa', page: 2 },
      // The two content selects, by the URL keys the reader's allowlist declares. Present even
      // when unchosen, because `''` is what "no choice" looks like and the reader is what
      // decides that narrows nothing — a page that omitted the key when empty would be making
      // that decision twice, in two files.
      filtros: { nivel: '', formato: '' },
    })
  })

  it('narrows the query by every select, not only by the ones in the links (FR-007, CLR-006)', async () => {
    // ── The case this file did not have ─────────────────────────────────────────────────────
    //
    // §4 asserts that each select renders, is labelled, opens on the URL's value and survives
    // every link — all true of the shipped first draft, and all true of a control that filters
    // nothing. `nivel` and `formato` were parsed, validated, threaded through every href and
    // set as `defaultValue`, and never reached `listPublic`: a visitor chose "Avançado",
    // pressed APLICAR, and got the identical catalogue with the select showing a filter that
    // had never been applied. 47 tests were green over two controls that lie.
    //
    // Asserted on the READER's arguments rather than on the rendered markup, because markup is
    // exactly what was already right.
    for (const [chave, valor] of [
      ['nivel', 'avancado'],
      ['formato', '.stl'],
    ] as const) {
      vi.clearAllMocks()
      await render({ [chave]: valor })
      expect(
        mocks.listPublic.mock.calls[0]?.[0]?.filtros?.[chave],
        `the ${chave} select does not reach the query. A control that renders its choice and ` +
          'does not narrow by it is worse than a missing feature: the page presents itself as ' +
          'filtered while serving the unfiltered catalogue.',
      ).toBe(valor)
    }
  })

  it('narrows by both selects at once, rather than letting the later one win', async () => {
    await render({ nivel: 'iniciante', formato: '.obj' })
    expect(mocks.listPublic.mock.calls[0]?.[0]?.filtros).toEqual({
      nivel: 'iniciante',
      formato: '.obj',
    })
  })

  it('reads the category vocabulary through the anonymous choke point', async () => {
    const { client } = await render()

    expect(mocks.getPublicScopedPayloadForRSC).toHaveBeenCalled()
    const read = client.calls.find((call) => call.collection === 'categoriaModelo')
    expect(
      read,
      'the page never read `categoriaModelo`. The teal sidebar is this organization\'s ' +
        'vocabulary — T004 declared `publicList` on that collection precisely so a page could ' +
        'list it — and a hard-coded list would show CITe\'s six categories on every host (US2).',
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

  it('is a server component — the listing ships no client bundle (FR-024, CLR-002)', () => {
    const source = readFileSync(PAGE_SOURCE, 'utf8')

    expect(
      source.trimStart().startsWith("'use client'") || source.trimStart().startsWith('"use client"'),
      'CLR-002 keeps the 3D viewer on the detail page precisely so this listing stays server-' +
        'rendered; a `use client` here turns the sidebar, the filters and twelve cards into a ' +
        'client bundle on the page that carries the most cards in the product.',
    ).toBe(false)
  })

  it('still renders no PageStub (FR-001)', () => {
    expect(readFileSync(PAGE_SOURCE, 'utf8')).not.toContain('PageStub')
  })

  it('titles the document', () => {
    expect(metadata.title).toContain('BIBLIOTECA 3D')
  })
})

describe('§2 — the light page and the teal sidebar (FR-007, FR-027, FR-028)', () => {
  it('re-declares the page surface as the white one rather than painting a colour', async () => {
    const { tree } = await render()
    const main = findOne(tree, 'main')

    expect(main, 'the page rendered no <main>').toBeDefined()
    // `--surface-inverted` is the white of Biblioteca 3D and Aulas, and it is re-declared
    // through `--surface-page` so everything derived from it — `--surface-card` above all —
    // follows into the light treatment instead of each component being told twice.
    expect(main?.props.style?.['--surface-page']).toBe('var(--surface-inverted)')
    expect(main?.props.style?.background).toBe('var(--surface-page)')
    // "todo texto sobre branco usa azul navy escuro" (round 2, 2026-08-23) — the light-on-dark
    // default would be white text on white.
    expect(main?.props.style?.color).toBe('var(--text-on-light)')
  })

  it('keeps the teal band teal, which is why it is not derived from the page surface', async () => {
    const { tree } = await render()
    const aside = findOne(tree, 'aside')

    expect(aside, 'the page rendered no <aside> — the teal sidebar is decided, not optional').toBeDefined()
    expect(aside?.props.style?.background).toBe('var(--surface-band)')
    expect(aside?.props.style?.color).toBe('var(--text-on-light)')
  })

  it('carries the two title lines and the description the page spec fixes', async () => {
    const text = textOf(findOne((await render()).tree, 'aside') ?? null)

    expect(text).toContain('BIBLIOTECA')
    expect(text).toContain('3D')
    expect(text).toContain('Explore, baixe e imprima modelos 3D criados pela comunidade maker.')
  })

  it('paints no small text with the accent (FR-028)', () => {
    const source = readFileSync(PAGE_SOURCE, 'utf8')

    // "nada de rosa em texto pequeno sobre branco" is what resolved this page's WCAG risk, and
    // `--color-primary` IS that pink for the default organization. It may tint an icon; it may
    // never be a `color:` on this page.
    expect(/color:\s*'var\(--color-primary\)'/.test(source)).toBe(false)
  })

  it('writes no hexadecimal colour anywhere (FR-027, SC-008)', () => {
    expect(readFileSync(PAGE_SOURCE, 'utf8')).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})

describe('§3 — the sidebar categories filter the list (FR-007, FR-010, US2)', () => {
  it('offers TODOS plus this organization\'s own categories, in that order', async () => {
    const links = categoriaLinks((await render()).tree)

    expect(links.length, 'the sidebar rendered no category list').toBe(3)
    expect(links.map((link) => textOf(link).replace(/\s+/g, ' ').trim())).toEqual([
      'TODOS 326',
      'Animais 184',
      'Veículos 142',
    ])
    expect(links.map((link) => link.props.href)).toEqual([
      '/biblioteca-3d',
      '/biblioteca-3d?categoria=animais',
      '/biblioteca-3d?categoria=veiculos',
    ])
  })

  it('counts TODOS as the sum of the vocabulary, not as a number of its own', async () => {
    const { tree } = await render()

    // `TODOS` is an aggregate and not a row (`CategoriaModelo.ts`: nothing seeds it), and each
    // model carries exactly one required category — so the sum IS the total, and a hard-coded
    // `1234` from the mockup would be another organization's number on every host.
    expect(textOf(categoriaLinks(tree)[0] ?? null)).toContain('326')
  })

  it('marks the chosen category as the current page', async () => {
    const links = categoriaLinks((await render({ categoria: 'veiculos' })).tree)

    expect(links.map((link) => link.props['aria-current'])).toEqual([
      undefined,
      undefined,
      'page',
    ])
  })

  it('marks TODOS current when nothing is filtered', async () => {
    const links = categoriaLinks((await render()).tree)

    expect(links[0]?.props['aria-current']).toBe('page')
  })

  it('drops the page number when switching category, and keeps the search term', async () => {
    const links = categoriaLinks((await render({ busca: 'lobo', pagina: '3' })).tree)

    // Page 3 of TODOS is not page 3 of ANIMAIS: carrying the number across a filter change
    // lands the visitor on a page that may not exist. The term survives because the visitor
    // did not clear it.
    expect(links[1]?.props.href).toBe('/biblioteca-3d?categoria=animais&busca=lobo')
    expect(links[0]?.props.href).toBe('/biblioteca-3d?busca=lobo')
  })

  it('falls back to TODOS for a category this organization does not have (US2 error case)', async () => {
    const { tree } = await render({ categoria: 'marcenaria' })

    expect(categoriaLinks(tree)[0]?.props['aria-current']).toBe('page')
    expect(mocks.listPublic.mock.calls[0]?.[0]?.params?.categoria).toBe(ALL_CATEGORIES)
  })
})

describe('§4 — the search field and the three selects (FR-007, FR-010)', () => {
  it('submits as a GET form to the listing\'s own path', async () => {
    const form = findOne((await render()).tree, 'form')

    expect(form, 'the page rendered no filter form').toBeDefined()
    expect(form?.props.method).toBe('get')
    expect(form?.props.action).toBe('/biblioteca-3d')
  })

  it('names the field the parser reads, on the light surface, with the fixed placeholder', async () => {
    const field = findOne((await render()).tree, SearchInput)

    expect(field?.props.name).toBe('busca')
    expect(field?.props.placeholder).toBe('Buscar modelos 3D...')
    // The navy default would draw a dark field on the white content area.
    expect(field?.props.surface).toBe('light')
  })

  it('renders the three selects the page spec draws', async () => {
    const { tree } = await render()

    // "FILTRAR POR: seguido de três dropdowns" — ordering, difficulty (CLR-006: the model's,
    // not the maker's) and file format.
    expect(findAll(tree, 'select')).toHaveLength(3)
    for (const name of ['ordem', 'nivel', 'formato']) {
      expect(selectNamed(tree, name), `no <select name="${name}">`).toBeDefined()
    }
  })

  it('labels each select rather than leaving it to the option text', async () => {
    const { tree } = await render()

    for (const name of ['ordem', 'nivel', 'formato']) {
      const rotulo = selectNamed(tree, name)?.props['aria-label']
      expect(typeof rotulo === 'string' && rotulo.length > 0, `<select name="${name}"> has no accessible name`).toBe(true)
    }
  })

  it('opens on the value the URL carries, so a filtered link renders as filtered', async () => {
    const { tree } = await render({ nivel: 'avancado', formato: '.stl' })

    // FR-010: the state is in the URL and survives a reload. A select that always opened on
    // its first option would show "Todos os níveis" over a list the URL says is narrowed.
    expect(selectNamed(tree, 'nivel')?.props.defaultValue).toBe('avancado')
    expect(selectNamed(tree, 'formato')?.props.defaultValue).toBe('.stl')
  })

  it('opens on the default when the URL names a value the vocabulary does not have', async () => {
    const { tree } = await render({ nivel: 'lendario', formato: '.exe' })

    // Same rule the category filter follows (US2): an unknown value narrows to the unfiltered
    // state rather than rendering a select whose shown option does not exist.
    expect(selectNamed(tree, 'nivel')?.props.defaultValue).toBe('')
    expect(selectNamed(tree, 'formato')?.props.defaultValue).toBe('')
  })

  it('submits without JavaScript', async () => {
    const submit = findAll((await render()).tree, 'button').find(
      (node) => node.props.type === 'submit',
    )

    // A <select> fires no navigation on its own, and this page has no client boundary to give
    // it one (FR-024). Without a submit control the three dropdowns are decoration.
    expect(submit, 'the filter form has no submit control, so the selects apply nothing').toBeDefined()
  })

  it('carries the current category through the form, so a filtered search stays filtered', async () => {
    const { tree } = await render({ categoria: 'veiculos' })
    const hidden = findAll(tree, 'input').find((node) => node.props.type === 'hidden')

    expect(
      hidden,
      'a GET form submits only its own fields, so searching inside a category without a hidden ' +
        'input silently drops the filter the sidebar still shows as active.',
    ).toBeDefined()
    expect(hidden?.props.name).toBe('categoria')
    expect(hidden?.props.value).toBe('veiculos')
  })

  it('carries no category input when nothing is filtered', async () => {
    const hidden = findAll((await render()).tree, 'input').find((n) => n.props.type === 'hidden')

    // `TODOS` is a UI state and not a row: submitting it would write `?categoria=TODOS`, a
    // longer URL for the state the bare path already names.
    expect(hidden).toBeUndefined()
  })

  it('keeps the select state on every category link', async () => {
    const links = categoriaLinks((await render({ nivel: 'iniciante', formato: '.glb' })).tree)

    // Narrowing by category is not abandoning the other two filters, and they live in the URL:
    // a link that dropped them would silently widen the result the visitor just narrowed.
    expect(links[1]?.props.href).toBe('/biblioteca-3d?categoria=animais&nivel=iniciante&formato=.glb')
  })
})

describe('§5 — the numbered cards (FR-007, FR-021, US3)', () => {
  const cardsDe = (tree: ReactNode): AnyElement[] => {
    const lista = findAll(tree, 'ul').find((node) =>
      String(node.props['aria-label'] ?? '').toLowerCase().includes('modelos'),
    )
    return lista === undefined ? [] : findAll(lista, 'li')
  }

  it('renders one card per model, numbered from 01 in the order the reader returned them', async () => {
    const tres = [1, 2, 3].map((n) => ({
      ...MODELO,
      id: n,
      slug: `modelo-${n}`,
      titulo: `Modelo ${n}`,
    }))
    const cards = cardsDe((await render({}, { docs: tres, totalDocs: 3 })).tree)

    expect(cards).toHaveLength(3)
    // In order, and each from its OWN document: a page that rendered the first three times
    // would satisfy the length assertion on its own — the defect measured on the projetos
    // listing, where `docs.slice(0, 1).map(...)` passed a full suite.
    expect(cards.map((card) => textOf(card))).toEqual([
      expect.stringContaining('Modelo 1'),
      expect.stringContaining('Modelo 2'),
      expect.stringContaining('Modelo 3'),
    ])
    // "numerados 01–10 em caixa com contorno" — two digits, zero-padded, so the box never
    // changes width between 9 and 10.
    expect(cards.map((card) => textOf(card))).toEqual([
      expect.stringContaining('01'),
      expect.stringContaining('02'),
      expect.stringContaining('03'),
    ])
  })

  it('numbers by position on the page, not by position in the whole listing', async () => {
    const { tree } = await render({ pagina: '2' }, { docs: [MODELO], page: 2, totalPages: 3, totalDocs: 30 })

    // The number is the card's slot in the 2-column grid — `01`–`06` down the left column and
    // `07`–`12` down the right. A running index would print `13` in the first slot on page 2
    // and outgrow the two-digit box the design draws.
    expect(textOf(cardsDe(tree)[0] ?? null)).toContain('01')
  })

  it('draws the thumbnail from the stored card size, with no invented alt text', async () => {
    const img = findAll((await render()).tree, 'img')[0]

    expect(img, 'the card rendered no thumbnail').toBeDefined()
    // `midiaImagem` generates a `card` size; serving the original is bytes spent against the
    // LCP budget this feature exists to measure (SC-006).
    expect(img?.props.src).toBe('/media/bolsa-card.png')
    // The collection stores no alt text and the title sits beside the image: an alt built from
    // the title makes a screen reader read the same words twice.
    expect(img?.props.alt).toBe('')
  })

  it('falls back to the original file when no card size was generated', async () => {
    const semSizes = { ...MODELO, thumbnail: { id: 3, url: '/media/bolsa.png' } }
    const img = findAll((await render({}, { docs: [semSizes] })).tree, 'img')[0]

    expect(img?.props.src).toBe('/media/bolsa.png')
  })

  it('loads the first row eagerly and the rest lazily (SC-006)', async () => {
    const muitos = Array.from({ length: 6 }, (_, i) => ({
      ...MODELO,
      id: i + 1,
      slug: `modelo-${i + 1}`,
    }))
    const imgs = findAll((await render({}, { docs: muitos, totalDocs: 6 })).tree, 'img')

    // Two columns, so the first row is two cards — not the three the projetos grid draws.
    expect(imgs[0]?.props.loading, 'the LCP candidate was lazy-loaded').toBe('eager')
    expect(imgs[1]?.props.loading).toBe('eager')
    expect(imgs[2]?.props.loading, 'a below-the-fold thumbnail was eager-loaded').toBe('lazy')
  })

  it('credits the maker by name and handle, and invents no level', async () => {
    const texto = textOf(cardsDe((await render()).tree)[0] ?? null)

    // Round 4, 2026-08-24: the card shows the person's NAME and the `@nomesobrenome`
    // identifier; the mockups' handles are illustrative.
    expect(texto).toContain('Maria Silva')
    expect(texto).toContain('@mariasilva')
    // `perfilMaker` carries no level — XP is feature 005 — so a `NÍVEL n` here would be a
    // number nobody earned, printed on a public page.
    expect(texto).not.toContain('NÍVEL')
  })

  it('shows the like count to everyone, as text (FR-015)', async () => {
    // Read from the EMITTED MARKUP rather than by walking the tree, because T003 put the count
    // inside `LikeButton` (§9): `textOf` walks `props.children` and stops at any component
    // boundary, so it stopped being able to see a number that is still there. The requirement
    // is unchanged and this instrument holds it harder — it proves the count reaches the HTML
    // the server sends, which is what "shown to everyone" means for a visitor with no
    // JavaScript at all.
    const markup = renderToStaticMarkup((cardsDe((await render()).tree)[0] ?? null) as never)

    expect(markup).toContain('42')
    expect(markup).toContain('♥')
  })

  it('links the card to its detail page', async () => {
    const { tree } = await render()
    const links = findAll(cardsDe(tree)[0] ?? null, 'a').map((a) => a.props.href)

    expect(links).toContain('/biblioteca-3d/bolsa-vazada')
  })

  it('offers the anonymous download straight from the card when there is one file (US3)', async () => {
    const { tree } = await render()
    const links = findAll(cardsDe(tree)[0] ?? null, 'a').map((a) => a.props.href)

    // `GET /api/modelo3d/:id/download/:midiaId` — the route `Modelo3d.ts` registers, linked
    // rather than re-implemented. Open access is the decided product rule (PO, 2026-08-24),
    // and both ids come from the document just read, so a visitor can name neither.
    expect(links).toContain('/api/modelo3d/10/download/7')
  })

  it('sends a multi-file model to its detail page instead of guessing a file', async () => {
    const varios = {
      ...MODELO,
      arquivosModelo: [
        { relationTo: 'midiaModelo3d', value: { id: 7, filename: 'bolsa.stl' } },
        { relationTo: 'midiaModelo3d', value: { id: 8, filename: 'bolsa.3mf' } },
      ],
    }
    const { tree } = await render({}, { docs: [varios] })
    const hrefs = findAll(cardsDe(tree)[0] ?? null, 'a').map((a) => a.props.href)

    // US3's edge case: *"a model with several files offers all of them"* — which the detail
    // page does. A card that linked the first file would download an `.stl` to a visitor who
    // wanted the `.3mf` and count it as the download they asked for.
    expect(hrefs).not.toContain('/api/modelo3d/10/download/7')
    expect(hrefs.filter((href) => href === '/biblioteca-3d/bolsa-vazada')).not.toHaveLength(0)
  })

  it('lays the cards out in two columns whose numbering runs down each column', async () => {
    const doze = Array.from({ length: 12 }, (_, i) => ({
      ...MODELO,
      id: i + 1,
      slug: `modelo-${i + 1}`,
    }))
    const { tree } = await render({}, { docs: doze, totalDocs: 12 })
    const lista = findAll(tree, 'ul').find((node) =>
      String(node.props['aria-label'] ?? '').toLowerCase().includes('modelos'),
    )

    // "A numeração corre na vertical: 01–05 na coluna esquerda, 06–10 na coluna direita", at
    // CLR-003's twelve per page — six rows rather than the mockup's five. The row count is
    // data because CSS cannot compute it: a fixed `repeat(6, …)` would leave six empty rows
    // under a page holding three models.
    expect(lista?.props.style?.['--fl-modelos-linhas']).toBe(6)
  })

  it('shrinks the row count with the last page, rather than leaving empty rows', async () => {
    const tres = [1, 2, 3].map((n) => ({ ...MODELO, id: n, slug: `modelo-${n}` }))
    const { tree } = await render({}, { docs: tres, totalDocs: 3 })
    const lista = findAll(tree, 'ul').find((node) =>
      String(node.props['aria-label'] ?? '').toLowerCase().includes('modelos'),
    )

    expect(lista?.props.style?.['--fl-modelos-linhas']).toBe(2)
  })
})

describe('§6 — numbered pagination (FR-029, CLR-003)', () => {
  const paginationMarkup = (tree: ReactNode): string | undefined =>
    /<nav[^>]*aria-label="[^"]*[Pp]agina[^"]*"[\s\S]*?<\/nav>/.exec(
      renderToStaticMarkup(tree as never),
    )?.[0]

  const hrefsIn = (nav: string): string[] =>
    [...nav.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!.replaceAll('&amp;', '&'))

  it('draws the shared control on the light surface, not a second copy of the window', async () => {
    const { tree } = await render({ pagina: '2' }, { page: 2, totalPages: 3, totalDocs: 30 })
    const bar = findOne(tree, Pagination)

    expect(
      bar,
      'the listing renders no <Pagination> from @fablab/ui. Identity, not shape: this file ' +
        'imports the same module instance the page does, so a local look-alike fails here.',
    ).toBeDefined()
    expect(bar?.props.page).toBe(2)
    expect(bar?.props.totalPages).toBe(3)
    // The navy default draws light ink on the white content area.
    expect(bar?.props.surface).toBe('light')
  })

  it('keeps every filter in every page link', async () => {
    const { tree } = await render(
      { categoria: 'animais', busca: 'lobo', nivel: 'iniciante' },
      { page: 1, totalPages: 2, totalDocs: 20 },
    )
    const nav = paginationMarkup(tree)
    expect(nav, 'the page rendered no pagination landmark').toBeDefined()

    // No `‹` on page 1: the control omits the step at the ends rather than disabling it.
    expect(hrefsIn(nav ?? '')).toEqual([
      '/biblioteca-3d?categoria=animais&busca=lobo&nivel=iniciante',
      '/biblioteca-3d?categoria=animais&busca=lobo&pagina=2&nivel=iniciante',
      '/biblioteca-3d?categoria=animais&busca=lobo&pagina=2&nivel=iniciante',
    ])
  })

  it('renders nothing at all for a listing that fits on one page', async () => {
    const { tree } = await render({}, { page: 1, totalPages: 1 })

    expect(paginationMarkup(tree)).toBeUndefined()
  })
})

describe('§7 — the empty state (FR-017, US2)', () => {
  it('explains the empty result and offers the action that clears it', async () => {
    const { tree } = await render({ categoria: 'animais', busca: 'nada' }, { docs: [] })
    const empty = findOne(tree, EmptyState)

    expect(
      empty,
      'a filter with no matches rendered an empty grid with no explanation — the exact case ' +
        'US2 says the empty state exists for.',
    ).toBeDefined()
    expect(empty?.props.variant).toBe('vazio')
    expect(empty?.props.titulo).toBe('Nenhum modelo encontrado.')
    expect(empty?.props.descricao).toBe('Tente outra busca ou limpe os filtros.')
    // The clearing action IS the unfiltered URL — no handler, no client boundary.
    expect(empty?.props.acao).toEqual({ label: 'Limpar filtros', href: '/biblioteca-3d' })
  })

  it('keeps the sidebar categories reachable from the empty state', async () => {
    const { tree } = await render({ categoria: 'animais' }, { docs: [] })

    // The reason `categoriaModelo` is `publicList` in the first place: *"an empty page of
    // results must still render every category so the visitor can leave it"*.
    expect(categoriaLinks(tree)).toHaveLength(3)
  })
})

describe('§8 — the error state (FR-018, US1)', () => {
  it('reports a failed read in place, with a retry that reloads the same URL', async () => {
    const { tree } = await render({ categoria: 'animais' }, new Error('postgres is down'))
    const erro = findOne(tree, EmptyState)

    expect(erro?.props.variant).toBe('erro')
    expect(erro?.props.titulo).toBe('Não foi possível carregar os modelos.')
    // Retrying is the URL that just failed, filter included — a retry that silently drops the
    // filter reports success for a different page than the one that broke.
    expect(erro?.props.acao).toEqual({
      label: 'Tentar novamente',
      href: '/biblioteca-3d?categoria=animais',
    })
  })

  it('keeps the sidebar and the filters usable while the list is broken', async () => {
    const { tree } = await render({}, new Error('postgres is down'))

    expect(findOne(tree, 'aside'), 'the error state took the whole page down with it').toBeDefined()
    expect(findOne(tree, SearchInput)).toBeDefined()
  })

  it('404s an unresolved host instead of rendering an error state (US1)', async () => {
    mocks.getPublicScopedPayloadForRSC.mockRejectedValue(new TenantUnresolvedError('nowhere.test'))

    // The same answer the layout gives: a host no organization claims is "no such site", not
    // "this site is broken" — and never a page rendered from a guessed tenant.
    await expect(BibliotecaPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      mocks.NOT_FOUND,
    )
    expect(mocks.notFound).toHaveBeenCalledTimes(1)
  })
})

describe('§9 — the heart is the island, and the count is the server\'s (FR-025, US7)', () => {
  const cardsDe = (tree: ReactNode): AnyElement[] => {
    const lista = findAll(tree, 'ul').find((node) =>
      String(node.props['aria-label'] ?? '').toLowerCase().includes('modelos'),
    )
    return lista === undefined ? [] : findAll(lista, 'li')
  }

  it('draws the count with `LikeButton` rather than the static span the card shipped with', async () => {
    const card = cardsDe((await render()).tree)[0]

    const hearts = findAll(card ?? null, LikeButton)
    expect(
      hearts,
      'the card still prints its own ♥ and number. This listing draws a heart, so US7 applies ' +
        'to it exactly as it does to the Projetos grid: a visitor who clicks must get the ' +
        'invitation, which only the island can give them.',
    ).toHaveLength(1)
    // The count is the SERVER's, from this document.
    expect(hearts[0]?.props.curtidas).toBe(42)
  })

  it('supplies the visitor\'s branch only — the signed-in half is T028b, not this page', async () => {
    const props = findAll(cardsDe((await render()).tree)[0] ?? null, LikeButton)[0]?.props

    // Asserted before the two below, which an absent island would otherwise satisfy by reading
    // `undefined` off nothing — the shape of a test that stays green after the island is taken
    // away again.
    expect(props, 'the card rendered no island at all').toBeDefined()
    // `onCurtir` is a plain function across the server/client boundary: not serialisable, and
    // Next refuses it at render rather than at review.
    expect(props?.isSignedIn).not.toBe(true)
    expect(props?.onCurtir).toBeUndefined()
  })

  it('gives every card its own heart with its own count', async () => {
    const tres = [42, 5, 77].map((curtidas, n) => ({
      ...MODELO,
      id: n + 1,
      slug: `modelo-${n + 1}`,
      curtidas,
    }))
    const cards = cardsDe((await render({}, { docs: tres, totalDocs: 3 })).tree)

    // Each from its OWN document: reading `docs[0].curtidas` for every card would satisfy the
    // first assertion in this section and print one number on ten different models.
    expect(cards.map((card) => findAll(card, LikeButton)[0]?.props.curtidas)).toEqual([42, 5, 77])
  })
})
