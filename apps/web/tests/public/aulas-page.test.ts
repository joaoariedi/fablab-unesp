import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EmptyState, Pagination, SearchInput } from '@fablab/ui'

import type { FindArgs } from '../../lib/tenancy/client'
import { TenantUnresolvedError } from '../../lib/tenancy/errors'

/**
 * T022 / FR-006, FR-013, FR-028, US4 — the Aulas listing.
 *
 * `spec.md` FR-006: *"Aulas: light background, navy text, numbered two-column list, duration
 * and `ASSISTIR`"*; FR-013: *"Classes play without an account; no progress, badge or resume is
 * shown to a visitor"*. `aulas.md` fixes the bands: the **teal hero** that survives the white
 * page (*"a faixa teal permanece"*), the section bar (`TODAS AS AULAS` + *"campo de busca …
 * placeholder `Buscar aulas...`"*), the **numbered two-column list** (*"lista numerada em 2
 * colunas … 01–04 na coluna esquerda, 05–08 na direita"*, one column below desktop) and the
 * card, whose right-hand action is `ASSISTIR`.
 *
 * ── What this file proves that `projetos-page.test.ts` does not ─────────────────────────────
 *
 * The instrument is the same one and for the same reason (no DOM at `node`, so the page is a
 * plain async function returning a plain object). Four things are genuinely this page's own
 * and only those are asserted at length:
 *
 *   1. **The page is light.** `--surface-page` is re-declared to `--surface-inverted` on the
 *      page's own element and the ink is `--text-on-light`, which is the mechanism the token
 *      layer was built for. §2 also asserts the *negative* FR-028 states — no pink ink anywhere
 *      on this page — because "navy text" is not provable by finding navy somewhere.
 *   2. **The list is numbered and two-column.** An `<ol>`, not a `<ul>`: the number is content
 *      here, not decoration. The column count lives in a media query, so it is asserted on the
 *      emitted stylesheet rather than on a style object.
 *   3. **`ASSISTIR` plays without an account** (US4, PO 2026-08-24) — a link straight to the
 *      class's own video, with no login destination and no account wording anywhere near it.
 *   4. **Nothing personal is rendered.** §5 hands the page a document carrying progress,
 *      completion and resume position and requires that none of it reaches the markup: for a
 *      visitor their absence *is* the correct rendering (US4 edge).
 */

const PAGE_SOURCE = join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'aulas', 'page.tsx')

/** One published class, populated at `depth: 1` exactly as `listPublic` returns it. */
const AULA = {
  id: 30,
  titulo: 'Primeiros passos impressão 3D',
  slug: 'primeiros-passos-impressao-3d',
  descricao:
    'Aprenda os conceitos básicos da impressão 3D e faça sua primeira impressão com segurança.',
  thumbnail: {
    id: 7,
    url: '/media/aula-01.png',
    sizes: { card: { url: '/media/aula-01-card.png' } },
  },
  videoUrl: 'https://www.youtube.com/watch?v=aula-01',
  duracaoMin: 25,
  autor: { id: 9, nome: 'Maria Silva', handle: 'mariasilva' },
  curtidas: 42,
  dataPublicacao: '2024-05-12T00:00:00.000Z',
}

/** `n` classes, each distinguishable in an assertion. */
const aulas = (quantidade: number): Record<string, unknown>[] =>
  Array.from({ length: quantidade }, (_, i) => ({
    ...AULA,
    id: i + 1,
    slug: `aula-${String(i + 1)}`,
    titulo: `Aula ${String(i + 1)}`,
    videoUrl: `https://videos.test/aula-${String(i + 1)}`,
  }))

/** The anonymous client, recorded rather than stubbed inline: §1 reads its `calls` to prove
 *  this page issues NO read of its own — `aula` declares no category vocabulary. */
class FakePublicClient {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    return { docs: [] as T[], totalDocs: 0 }
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

const { PAGE_SIZE } = await import('../../lib/public/listing')
const { default: AulasPage, metadata, AULAS_CSS } = await import('../../app/(frontend)/aulas/page')

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly style?: Record<string, unknown>
  readonly [key: string]: unknown
}>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

/** Every element in the tree whose `type` matches, depth-first. Takes an intrinsic tag name or
 *  a component function — the page imports the same module instance this file does, so identity
 *  comparison is what proves it composed the shared control and not a look-alike. */
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

/** Renders the page for a query string, with the listing page it should see. */
async function render(
  query: Record<string, string | string[] | undefined> = {},
  listing: { docs?: unknown[]; page?: number; totalPages?: number; totalDocs?: number } | Error = {},
): Promise<Rendered> {
  const client = new FakePublicClient()
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(client)
  if (listing instanceof Error) mocks.listPublic.mockRejectedValue(listing)
  else
    mocks.listPublic.mockResolvedValue({
      docs: listing.docs ?? [AULA],
      page: listing.page ?? 1,
      totalPages: listing.totalPages ?? 1,
      totalDocs: listing.totalDocs ?? (listing.docs ?? [AULA]).length,
    })

  const tree = (await AulasPage({ searchParams: Promise.resolve(query) })) as unknown as ReactNode
  return { tree, client }
}

/** The cards, in the order the list draws them. */
const cardsDe = (tree: ReactNode): AnyElement[] => findAll(tree, 'li')

/** The `ASSISTIR` control of one card, whatever element the page chose for it. */
const assistirDe = (card: ReactNode): AnyElement | undefined =>
  findAll(card, 'a').find((node) => textOf(node).toUpperCase().includes('ASSISTIR'))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('§1 — the read path (FR-002, FR-011, FR-029)', () => {
  it('asks the one listing reader for classes, and asks nothing else for rows', async () => {
    const { client } = await render({ busca: 'laser', pagina: '2' })

    expect(mocks.listPublic).toHaveBeenCalledTimes(1)
    expect(mocks.listPublic.mock.calls[0]?.[0]).toEqual({
      collection: 'aula',
      // Parsed by `params.ts` and handed over whole: the page names no tenant, no status and
      // no page size, which is the entire argument for the reader existing (plan § Sketch 1).
      params: { categoria: 'TODOS', busca: 'laser', page: 2 },
    })
    // `aula` declares no `categoria` at all (`listing.ts` § LISTING_SHAPES says so and gives
    // the reason), so this page has no vocabulary to read and no tabs to draw. A `find` here
    // would be a category clause naming a column that does not exist.
    expect(client.calls).toHaveLength(0)
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
      "a 'use client' on the listing turns the whole page — hero, list and twelve cards — into " +
        'a client bundle. FR-024 allows islands, not client pages.',
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
    expect(metadata.title).toContain('AULAS')
  })
})

describe('§2 — the light page, with the teal band kept (FR-006, FR-028)', () => {
  it('re-declares the surface ROLE rather than painting a colour', async () => {
    const { tree } = await render()
    const pagina = findOne(tree, 'main')

    expect(pagina, 'the page rendered no <main>').toBeDefined()
    // `--surface-inverted` is the white of Biblioteca 3D and Aulas, re-declared for this
    // region so everything derived from the role follows into the light treatment.
    expect(pagina?.props.style?.['--surface-page']).toBe('var(--surface-inverted)')
    // Beside it, and not redundant: `var()` in a custom property is substituted where the
    // property is DECLARED, so `--surface-card: var(--surface-page)` at `:root` has already
    // computed to navy and the cards would stay dark however this region redefines the page.
    expect(pagina?.props.style?.['--surface-card']).toBe('var(--surface-inverted)')
    expect(pagina?.props.style?.background).toBe('var(--surface-page)')
    expect(pagina?.props.style?.color).toBe('var(--text-on-light)')
  })

  it('keeps the teal hero, with navy ink on it', async () => {
    const { tree } = await render()
    const band = findAll(tree, 'section').find(
      (node) => node.props.style?.background === 'var(--surface-band)',
    )

    expect(
      band,
      'the hero band is gone. "a faixa teal permanece" (aulas.md, round 2, 2026-08-23) — the ' +
        'white content area is not a reason to drop it, and `--surface-band` is the one ' +
        'surface that must not derive from `--surface-page`.',
    ).toBeDefined()
    expect(band?.props.style?.color).toBe('var(--text-on-light)')
  })

  it('carries the hero title and the invitation the page spec fixes', async () => {
    const { tree } = await render()
    const text = textOf(tree)

    expect(text).toContain('AULAS')
    expect(text).toContain('Aprenda com tutoriais práticos e conteúdos feitos para makers')
    // "Título de seção à esquerda, caps display: TODAS AS AULAS" — in navy over the white area.
    expect(text).toContain('TODAS AS AULAS')
  })

  /**
   * Every colour this page can paint with — inline `style.color` AND the class rules any
   * component hoists into a `<style>` element.
   *
   * The stylesheet half is the half that mattered. `EmptyState` declares
   * `.fl-empty-state { color: var(--color-claro) }` in `EMPTY_STATE_CSS`, and a class rule
   * beats the `color: var(--text-on-light)` this page sets on its `<main>` — so the empty and
   * error bodies rendered #DCE7E3 on #FFFFFF, **1.27:1**, while an inline-only scan saw
   * nothing at all. A scan structurally incapable of seeing a whole class of declaration is
   * not a colour gate; it is a colour gate for the declarations that happened to be inline.
   */
  const inksIn = (tree: ReactNode): string[] => {
    // RENDERED, not walked. Measured while writing this: a tree walk sees only what the page
    // itself declares, and `<EmptyState />` in that tree is an unrendered element — its
    // `<style>{EMPTY_STATE_CSS}</style>` is inside the value the component would RETURN, which
    // the walk never reaches. The first draft of this gate collected `<style>` children from
    // the walk and passed with the defect restored: the exact same blindness it was written to
    // close, one level up. Rendering to markup is what makes the scan see every declaration
    // the browser will.
    const markup = renderToStaticMarkup(tree as never)
    return [...markup.matchAll(/(?:^|[^-\w])color:\s*([^;}"]+)/g)].map((m) => m[1]!.trim())
  }

  it('uses no pink ink anywhere on the white page (FR-028)', async () => {
    const { tree } = await render({}, { docs: aulas(3), totalDocs: 3 })
    const inks = inksIn(tree)

    expect(inks.length, 'no element declared a colour — this assertion would prove nothing').
      toBeGreaterThan(0)
    // "não usar rosa em texto pequeno sobre branco" is what resolved the WCAG risk on the two
    // light pages. `--color-primary` is the accent, and on this page it may frame a target —
    // never write one.
    expect(inks).not.toContain('var(--color-primary)')
    expect(inks).not.toContain('var(--color-rosa-raw)')
  })

  it('asks every surface-aware component for its light variant, in all three states (FR-006)', async () => {
    // ── What this can and cannot prove, stated rather than implied ─────────────────────────
    //
    // The scan above reads rendered CSS text, so it cannot tell an overridden declaration from
    // an applied one: `EMPTY_STATE_CSS` still carries `.fl-empty-state { color: claro }` for
    // the navy pages, and must. Scoring the pair that actually wins needs a cascade, which
    // CLR-003's DOM-less stack does not have.
    //
    // What this page IS responsible for is the prop. `EmptyState`, `SearchInput` and
    // `Pagination` each declare their ink in a class or a style object keyed by `surface`, and
    // each defaults to `'navy'` — so on a white page the default is the bug. `EmptyState` was
    // the one that shipped without it, and the cost was 1.27:1 (#DCE7E3 on #FFFFFF) across the
    // whole message of both non-list states, while the pink action button beside it kept its
    // navy label and the state still looked like a state.
    //
    // All three states, because the two that were wrong are exactly the two a scan over a
    // populated listing never renders. `packages/ui/tests/listing-chrome.test.ts` owns the
    // other half — what `surface="light"` is worth once asked for.
    const casos: [string, Parameters<typeof render>[1]][] = [
      ['the list', { docs: aulas(3), totalDocs: 3 }],
      ['the empty state', { docs: [], totalDocs: 0 }],
      ['the error state', new Error('a leitura falhou')],
    ]
    for (const [name, listing] of casos) {
      const { tree } = await render({}, listing)
      for (const [label, component] of [
        ['EmptyState', EmptyState],
        ['SearchInput', SearchInput],
        ['Pagination', Pagination],
      ] as const) {
        for (const element of findAll(tree, component)) {
          expect(
            element.props.surface,
            `${name} renders <${label}> with no surface, so it falls back to 'navy' on a white ` +
              'page. FR-006 makes this a light page with navy text; the navy default paints ' +
              '--color-claro (#DCE7E3) on --surface-inverted (#FFFFFF), which is 1.27:1 ' +
              'against the 16.63:1 the requirement asks for.',
          ).toBe('light')
        }
      }
    }
  })
})

describe('§3 — the numbered two-column list (FR-006, FR-021)', () => {
  it('draws an ordered list, because the numbering is content', async () => {
    const { tree } = await render({}, { docs: aulas(2), totalDocs: 2 })
    const lista = findOne(tree, 'ol')

    expect(
      lista,
      'the classes are in a <ul>. The visible `01`–`08` is the catalogue\'s own sequence, so ' +
        'the numbering is content a screen reader must hear, not a decoration drawn beside it.',
    ).toBeDefined()
    expect(lista?.props['aria-label']).toBe('Aulas')
  })

  it('numbers every card with two digits, in reading order', async () => {
    const { tree } = await render({}, { docs: aulas(3), totalDocs: 3 })

    expect(cardsDe(tree).map((card) => textOf(card).trim().slice(0, 2))).toEqual(['01', '02', '03'])
  })

  it('continues the numbering across pages instead of restarting at 01', async () => {
    const { tree } = await render(
      { pagina: '2' },
      { docs: aulas(2), page: 2, totalPages: 3, totalDocs: 30 },
    )

    // A trail numbered `01 02` on every page tells a visitor nothing about where they are, and
    // two different classes would carry the same number in the same catalogue.
    const primeiro = String(PAGE_SIZE + 1).padStart(2, '0')
    expect(textOf(cardsDe(tree)[0] ?? null).trim().slice(0, 2)).toBe(primeiro)
  })

  it('lays the list out in two columns at desktop and one below it', () => {
    expect(AULAS_CSS, 'the page emitted no stylesheet, so it has no column count').toBeDefined()
    const css = AULAS_CSS ?? ''
    const base = css.slice(0, css.indexOf('@media'))
    const desktop = css.slice(css.indexOf('@media (min-width: 1440px)'))

    // "lista numerada em 2 colunas" at desktop; "2 → 1 coluna" at tablet, and one at mobile.
    expect(base).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(base).not.toContain('repeat(2')
    expect(desktop).toContain('repeat(2, minmax(0, 1fr))')
    // Feature 001 froze the three design targets; a media query at any other width is a
    // breakpoint nobody drew.
    expect([...css.matchAll(/min-width:\s*(\d+)px/g)].map((m) => m[1])).toEqual(['1440'])
  })

  it('maps EVERY class, not just the first', async () => {
    // A single-document fixture cannot tell a page that maps the list from one that renders
    // `docs[0]` and discards the rest — the most visible defect this listing could ship.
    const { tree } = await render({}, { docs: aulas(3), totalDocs: 3 })

    expect(cardsDe(tree)).toHaveLength(3)
    expect(cardsDe(tree).map((card) => textOf(card))).toEqual([
      expect.stringContaining('Aula 1'),
      expect.stringContaining('Aula 2'),
      expect.stringContaining('Aula 3'),
    ])
  })

  it('loads the first row eagerly and the rest lazily (SC-006)', async () => {
    const { tree } = await render({}, { docs: aulas(6), totalDocs: 6 })
    const thumbOf = (i: number) => findAll(cardsDe(tree)[i] ?? null, 'img')[0]

    expect(thumbOf(0)?.props.loading, 'the LCP candidate was lazy-loaded').toBe('eager')
    expect(thumbOf(5)?.props.loading, 'a below-the-fold thumbnail was eager-loaded').toBe('lazy')
  })

  it('draws the thumbnail from the stored card size, with no invented alt text', async () => {
    const { tree } = await render()
    const thumb = findAll(cardsDe(tree)[0] ?? null, 'img')[0]

    // `midiaImagem` generates a `card` size; serving the original is bytes spent against the
    // LCP budget this feature exists to measure (SC-006).
    expect(thumb?.props.src).toBe('/media/aula-01-card.png')
    expect(thumb?.props.alt).toBe('')
  })

  it('shows the class body: title, description, author and duration', async () => {
    const { tree } = await render()
    const card = textOf(cardsDe(tree)[0] ?? null)

    expect(card).toContain('Primeiros passos impressão 3D')
    expect(card).toContain('Aprenda os conceitos básicos da impressão 3D')
    expect(card).toContain('Maria Silva')
    expect(card).toContain('@mariasilva')
    // "ícone de relógio outline + duração: 25 min" — FR-006 names the duration explicitly.
    expect(card).toContain('25 min')
    // FR-015: the count is shown to everyone. The clicking half is an island and not this page.
    expect(card).toContain('42')
  })
})

describe('§4 — the search field (FR-010, FR-020)', () => {
  it('submits as a GET form to the listing\'s own path, with the class placeholder', async () => {
    const { tree } = await render()
    const form = findOne(tree, 'form')

    expect(form, 'the page rendered no search form').toBeDefined()
    // GET, so the term lands in the URL and the result is linkable and reloadable (FR-010).
    expect(form?.props.method).toBe('get')
    expect(form?.props.action).toBe('/aulas')

    const field = findOne(tree, SearchInput)
    expect(field?.props.name).toBe('busca')
    expect(field?.props.placeholder).toBe('Buscar aulas...')
    // The field sits on the white content area, not on the navy base — the surface decides
    // both the fill and the ink, and the default would be claro-on-navy over white.
    expect(field?.props.surface).toBe('light')
  })

  it('carries no category input at all — this collection has no categories', async () => {
    const { tree } = await render()

    expect(findAll(tree, 'input').filter((node) => node.props.type === 'hidden')).toHaveLength(0)
  })
})

describe('§5 — ASSISTIR, without an account (FR-013, US4)', () => {
  it('links straight to the class video, with no account between', async () => {
    const { tree } = await render()
    const assistir = assistirDe(cardsDe(tree)[0] ?? null)

    expect(
      assistir,
      'the card offers no ASSISTIR. FR-006 names it and US4 is the scenario it serves.',
    ).toBeDefined()
    // "ASSISTIR não pede login — o botão reproduz o vídeo também para o visitante" (PO,
    // 2026-08-24). The href IS the decision: anything pointing at /login is the modal this
    // requirement forbids, wearing a different shape.
    expect(assistir?.props.href).toBe(AULA.videoUrl)
    expect(String(assistir?.props.href)).not.toContain('/login')
    expect(assistir?.props['aria-label']).toContain('Primeiros passos impressão 3D')
  })

  it('invites nobody to create an account in order to watch', async () => {
    const { tree } = await render({}, { docs: aulas(3), totalDocs: 3 })
    const markup = renderToStaticMarkup(tree as never).toLowerCase()

    for (const convite of ['criar conta', 'crie sua conta', 'entrar para assistir', 'fazer login'])
      expect(markup, `the listing asks a visitor to ${convite} — US4 says it must not`).not.toContain(
        convite,
      )
    expect(markup).not.toContain('href="/login"')
  })

  it('meets the 44px touch target on the compact breakpoints (FR-022)', async () => {
    const { tree } = await render()

    expect(assistirDe(cardsDe(tree)[0] ?? null)?.props.style?.minHeight).toBe('44px')
  })

  it('shows no progress, badge or resume position to a visitor (FR-013, US4 edge)', async () => {
    // The document carries every personal field the signed-in page will one day render. For a
    // visitor their ABSENCE is the correct rendering, so the page must ignore data it was
    // handed rather than merely fail to ask for it.
    const comProgresso = {
      ...AULA,
      progresso: { percentualAssistido: 62, posicaoReproducao: '12:30', concluidaEm: '2024-06-01' },
      xpRecompensa: 1,
    }
    const { tree } = await render({}, { docs: [comProgresso] })
    const markup = renderToStaticMarkup(tree as never)

    for (const vestigio of ['62', '12:30', 'Concluíd', 'concluíd', 'Retomar', 'Continuar', 'XP'])
      expect(markup, `the visitor's card shows "${vestigio}" — FR-013 says it shows none of it`).
        not.toContain(vestigio)
  })

  it('reports a missing video on that card and leaves the rest of the list intact', async () => {
    // US4 error: "a class whose video source is missing shows the error state for that card and
    // does not break the rest of the list."
    const docs = aulas(3)
    docs[1] = { ...docs[1], videoUrl: '' }
    const { tree } = await render({}, { docs, totalDocs: 3 })
    const cards = cardsDe(tree)

    expect(cards).toHaveLength(3)
    expect(assistirDe(cards[1] ?? null), 'a class with no video still offered ASSISTIR — the ' +
      'link would take the visitor nowhere').toBeUndefined()
    expect(textOf(cards[1] ?? null)).toContain('Vídeo indisponível')
    // The neighbours are untouched: one broken row is not an outage of the catalogue.
    expect(assistirDe(cards[0] ?? null)?.props.href).toBe('https://videos.test/aula-1')
    expect(assistirDe(cards[2] ?? null)?.props.href).toBe('https://videos.test/aula-3')
  })
})

describe('§6 — numbered pagination (FR-029, CLR-003)', () => {
  /** The pagination landmark's markup, rendered rather than walked: the bar is `<Pagination>`
   *  from `@fablab/ui`, so the tree holds an unrendered element and a walk for `nav` finds
   *  nothing. */
  const paginationMarkup = (tree: ReactNode): string | undefined =>
    /<nav[^>]*aria-label="[^"]*[Pp]agina[^"]*"[\s\S]*?<\/nav>/.exec(
      renderToStaticMarkup(tree as never),
    )?.[0]

  const hrefsIn = (nav: string): string[] =>
    [...nav.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!.replaceAll('&amp;', '&'))

  it('draws the shared control on its light surface, not a second copy of the window', async () => {
    const { tree } = await render({ pagina: '2' }, { page: 2, totalPages: 3, totalDocs: 30 })
    const bar = findOne(tree, Pagination)

    expect(
      bar,
      'the listing renders no <Pagination> from @fablab/ui. Identity, not shape: this file ' +
        'imports the same module instance the page does, so a local look-alike fails here.',
    ).toBeDefined()
    expect(bar?.props.page).toBe(2)
    expect(bar?.props.totalPages).toBe(3)
    // Its own ink decision, for the same reason the search field has one.
    expect(bar?.props.surface).toBe('light')
  })

  it('keeps the search term in every page link', async () => {
    const { tree } = await render({ busca: 'laser' }, { page: 1, totalPages: 2, totalDocs: 20 })
    const nav = paginationMarkup(tree)

    expect(nav, 'the page rendered no pagination landmark').toBeDefined()
    // No `‹` on page 1: the control omits the step at the ends rather than disabling it.
    expect(hrefsIn(nav ?? '')).toEqual([
      '/aulas?busca=laser',
      '/aulas?busca=laser&pagina=2',
      '/aulas?busca=laser&pagina=2',
    ])
  })

  it('renders nothing at all for a catalogue that fits on one page', async () => {
    const { tree } = await render({}, { page: 1, totalPages: 1 })

    expect(paginationMarkup(tree)).toBeUndefined()
  })
})

describe('§7 — the empty and error states (FR-017, FR-018, US1)', () => {
  it('explains the empty result and offers the action that clears it', async () => {
    const { tree } = await render({ busca: 'nada' }, { docs: [] })
    const vazio = findOne(tree, EmptyState)

    expect(
      vazio,
      'a search with no matches rendered an empty list with no explanation — the exact case ' +
        'FR-017 says the empty state exists for.',
    ).toBeDefined()
    expect(vazio?.props.variant).toBe('vazio')
    // aulas.md § Estados: the page's primary buttons are CARREGAR MAIS, **LIMPAR BUSCA**,
    // TENTAR NOVAMENTE — there are no filters here to clear, only the term.
    expect(vazio?.props.titulo).toBe('Nenhuma aula encontrada.')
    expect(vazio?.props.acao).toEqual({ label: 'Limpar busca', href: '/aulas' })
    expect(cardsDe(tree)).toHaveLength(0)
  })

  it('reports a failed read in place, with a retry that reloads the same URL', async () => {
    const { tree } = await render({ busca: 'laser' }, new Error('postgres is down'))
    const erro = findOne(tree, EmptyState)

    expect(erro?.props.variant).toBe('erro')
    expect(erro?.props.titulo).toBe('Não foi possível carregar as aulas.')
    // Retrying is the URL that just failed, term included — a retry that silently drops the
    // search reports success for a different page than the one that broke.
    expect(erro?.props.acao).toEqual({ label: 'Tentar novamente', href: '/aulas?busca=laser' })
  })

  it('keeps the hero and the search field usable while the list is broken', async () => {
    const { tree } = await render({}, new Error('postgres is down'))

    expect(findOne(tree, SearchInput), 'the error state took the whole page down with it').
      toBeDefined()
    expect(textOf(tree)).toContain('TODAS AS AULAS')
  })

  it('404s an unresolved host instead of rendering an error state (US1)', async () => {
    mocks.listPublic.mockRejectedValue(new TenantUnresolvedError('nowhere.test'))

    // The same answer the layout gives: a host no organization claims is "no such site", not
    // "this site is broken" — and never a page rendered from a guessed tenant.
    await expect(AulasPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(mocks.NOT_FOUND)
    expect(mocks.notFound).toHaveBeenCalledTimes(1)
  })
})
