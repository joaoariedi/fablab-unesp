import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CardProjeto,
  EmptyState,
  Footer,
  LOGIN_HREF,
  PRIMARY_BUTTON_STYLE,
  ProgressBar,
  ProjectCarousel,
  SkillPips,
} from '@fablab/ui'

import { TenantUnresolvedError } from '../../lib/tenancy/errors'

/**
 * T026 / FR-009, FR-011, FR-024, US1, CLR-004 — Home v1.
 *
 * The task, in full: *"Home v1: hero, `ÚLTIMOS PROJETOS` carousel island, footer. **No gamified
 * panels** — they read data only feature 005 creates (CLR-004)"*. T025 landed the hero and its
 * byte counts (`home-hero.test.ts`, which still owns the picture and the preload); this file
 * owns everything the same page still had to grow, and the one thing it must never grow.
 *
 * ── Why the absence of the panels is asserted, not just left undone ─────────────────────────
 *
 * CLR-004 is a *decision*, and `home.md` describes `MISSÕES EM DESTAQUE`, `NÍVEL DO LAB` and
 * `RANKING MAKERS` in as much detail as it describes the carousel. A reader of that document
 * with no knowledge of the roadmap would add them, and every one of them reads a table feature
 * 005 has not created: the page would not fail loudly, it would render zeroes — a lab at level
 * 0, an empty ranking, three missions at 0% — which is worse than not shipping them, because it
 * looks like the product working. So the omission gets a test, the way `PUBLICAÇÃO`'s absence
 * from the Artigos tab set did (tasks.md § Run 5, T019) after shipping the opposite of CLR-009.
 *
 * ── Why the tree is walked rather than rendered to markup ───────────────────────────────────
 *
 * The instrument every other page suite here uses: no DOM at `node`, so the page is a plain
 * async function returning a plain object. Walking it is what lets a case name `ProjectCarousel`
 * and `CardProjeto` by *identity* — the page imports the same module instance this file does, so
 * a look-alike section built out of divs cannot pass. `home-hero.test.ts` renders to markup
 * instead, because a hoisted `<link>` is only observable after React has hoisted it.
 */

const PAGE_SOURCE = join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'page.tsx')
const LAYOUT_SOURCE = join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'layout.tsx')

/** Three published projects, populated at `depth: 1` exactly as `listPublic` returns them, and
 *  in the order it returns them: most recent first (FR-011, CLR-007). */
const PROJETOS = [
  {
    titulo: 'Luminária paramétrica',
    slug: 'luminaria-parametrica',
    descricaoCurta: 'Luminária decorativa impressa em 3D.',
    categoria: { nome: 'Impressão 3D', slug: 'impressao-3d' },
    imagemCapa: { url: '/media/lum.png', sizes: { card: { url: '/media/lum-card.png' } } },
    curtidas: 32,
  },
  {
    titulo: 'Cadeira encaixe',
    slug: 'cadeira-encaixe',
    descricaoCurta: 'Cadeira em MDF cortado a laser.',
    categoria: { nome: 'Móveis', slug: 'moveis' },
    imagemCapa: { url: '/media/cadeira.png' },
    curtidas: 28,
  },
  {
    titulo: 'Vaso serigrafado',
    slug: 'vaso-serigrafado',
    descricaoCurta: 'Vaso com padrão geométrico.',
    categoria: { nome: 'Serigrafia', slug: 'serigrafia' },
    imagemCapa: null,
    curtidas: 11,
  },
]

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
    listPublic: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))

vi.mock('../../lib/public/listing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/public/listing')>()),
  listPublic: mocks.listPublic,
}))

const { default: HomePage } = await import('../../app/(frontend)/page')

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly style?: Record<string, unknown>
  readonly [key: string]: unknown
}>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

/** Every element in the tree whose `type` matches, depth-first. Takes an intrinsic tag name or a
 *  component function — identity is what proves the page composed the real component. */
function findAll(node: ReactNode, type: unknown): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type))
  if (!isElement(node)) return []
  const here = node.type === type ? [node] : []
  return [...here, ...findAll((node.props.children ?? null) as ReactNode, type)]
}

/** Every element in the tree, depth-first. */
function everyElement(node: ReactNode, found: AnyElement[] = []): AnyElement[] {
  if (Array.isArray(node)) {
    for (const child of node) everyElement(child, found)
    return found
  }
  if (!isElement(node)) return found
  found.push(node)
  return everyElement((node.props.children ?? null) as ReactNode, found)
}

/** Every string in the tree, joined — what a reader would see, ignoring the markup around it. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (!isElement(node)) return ''
  return textOf((node.props.children ?? null) as ReactNode)
}

/** Renders the Home with the listing it should see — or with the failure it must survive. */
async function render(
  listing: { docs?: unknown[] } | Error = {},
): Promise<ReactNode> {
  if (listing instanceof Error) mocks.listPublic.mockRejectedValue(listing)
  else {
    const docs = listing.docs ?? PROJETOS
    mocks.listPublic.mockResolvedValue({
      docs,
      page: 1,
      totalPages: 1,
      totalDocs: docs.length,
    })
  }
  return (await HomePage()) as unknown as ReactNode
}

/** Every anchor in the tree, as `[href, text]`. */
const anchors = (tree: ReactNode): [string, string][] =>
  findAll(tree, 'a').map((a) => [String(a.props.href ?? ''), textOf(a)])

beforeEach(() => {
  vi.clearAllMocks()
})

describe('§1 — the hero CTA (home.md § Hero v2)', () => {
  it('invites the visitor to create, in the words the mockup fixes', async () => {
    const [href, label] = anchors(await render()).find(([, text]) =>
      text.includes('COMECE A CRIAR'),
    ) ?? ['', '']

    expect(
      label,
      'the hero has no `COMECE A CRIAR` control. home.md § Hero v2 draws it as the page\'s ' +
        'primary call to action, and it is the whole conversion path of Home v1 — the panels ' +
        'CLR-004 removes were the other half of what this page had to say.',
    ).toContain('COMECE A CRIAR')
    // An anchor, not a <button>: it navigates, and a button would be inert without JavaScript
    // on the one page whose LCP budget this feature measures.
    expect(
      href,
      'the CTA points somewhere other than the account entry point. Sign-up itself is feature ' +
        "004's; `LOGIN_HREF` is the route that exists, and it is the shell's own constant so " +
        'the destination moves in one edit.',
    ).toBe(LOGIN_HREF)
  })

  it('wears the canonical primary identity, not a second pink button', async () => {
    const cta = findAll(await render(), 'a').find((a) => textOf(a).includes('COMECE A CRIAR'))
    const style = (cta?.props.style ?? {}) as Record<string, unknown>

    // `visual-identity.md`, decided 2026-08-23: pink fill, navy label, hard offset shadow.
    // Reusing PRIMARY_BUTTON_STYLE rather than restating it is what keeps the CTA following a
    // change to the button, and what keeps a hex literal from ever being typed here (FR-027).
    expect(style.background).toBe(PRIMARY_BUTTON_STYLE.background)
    expect(style.color).toBe(PRIMARY_BUTTON_STYLE.color)
    expect(style.boxShadow).toBe(PRIMARY_BUTTON_STYLE.boxShadow)
  })
})

describe('§2 — ÚLTIMOS PROJETOS (FR-009, FR-011)', () => {
  it('reads the projects through the one listing reader, most-recent-first', async () => {
    await render()

    expect(
      mocks.listPublic,
      'the Home read no listing at all, or read it some other way. FR-002: every page reads ' +
        'through the choke point, and `listPublic` is the only thing that supplies the ' +
        'published-only filter and the tenant the visitor resolved to.',
    ).toHaveBeenCalledTimes(1)
    expect(mocks.listPublic.mock.calls[0]?.[0]).toEqual({
      collection: 'projeto',
      // The first page of the default ordering — `-dataPublicacao` (FR-011, CLR-007) — with no
      // filter and no search: "latest" is not a query the Home gets to invent.
      params: { categoria: 'TODOS', busca: '', page: 1 },
    })
  })

  it('names the section and links on to the full listing', async () => {
    const tree = await render()

    expect(textOf(tree)).toContain('ÚLTIMOS PROJETOS')
    const [href, label] = anchors(tree).find(([, text]) => text.includes('VER MAIS')) ?? ['', '']
    expect(href, 'the section footer link does not reach /projetos').toBe('/projetos')
    // `home.md`: *"`VER MAIS PROPLETOS` (**typo no mockup** — decidido em 2026-08-23: o site
    // usa `VER MAIS PROJETOS`)"*. Asserted because copying the mockup is the obvious mistake.
    expect(label).toContain('VER MAIS PROJETOS')
    expect(textOf(tree)).not.toContain('PROPLETOS')
  })

  it('puts every project in the carousel island, in the order the reader returned them', async () => {
    const tree = await render()
    const carousels = findAll(tree, ProjectCarousel)

    expect(
      carousels,
      'the Home renders no ProjectCarousel. home.md § Card ÚLTIMOS PROJETOS, decided ' +
        '2026-08-23: *"o card é um carrossel de vários projetos; o mockup mostra apenas um ' +
        'slide"* — and plan § Sketch 6 lists that island as one of the four this feature buys.',
    ).toHaveLength(1)

    const cards = findAll(carousels[0] ?? null, CardProjeto)
    expect(cards.map((card) => card.props.titulo)).toEqual(PROJETOS.map((p) => p.titulo))
    expect(cards.map((card) => card.props.href)).toEqual([
      '/projetos/luminaria-parametrica',
      '/projetos/cadeira-encaixe',
      '/projetos/vaso-serigrafado',
    ])
    // The generated card derivative when there is one, the original when there is not — the
    // same resolution the listing does, so the Home does not pay for a full-size cover.
    const capa = cards[0]?.props.capa as AnyElement
    expect(capa.props.src).toBe('/media/lum-card.png')
  })

  it('says so when there is nothing to show yet, instead of an empty rail (FR-017)', async () => {
    const tree = await render({ docs: [] })

    expect(findAll(tree, ProjectCarousel), 'an empty carousel is a row of arrows over nothing').toHaveLength(0)
    const vazio = findAll(tree, EmptyState)[0]
    expect(
      vazio?.props.variant,
      'a lab whose first project is not published yet gets a Home with a silent gap where the ' +
        'only content section should be.',
    ).toBe('vazio')
  })

  it('keeps the page up when the read fails, and offers a retry (FR-018)', async () => {
    const tree = await render(new Error('connection refused'))

    const erro = findAll(tree, EmptyState)[0]
    expect(erro?.props.variant).toBe('erro')
    // The hero is the LCP element and owes nothing to this read; a failed listing that took the
    // whole Home down would turn one broken query into a site that looks dead.
    expect(findAll(tree, 'picture'), 'the hero went down with the listing').toHaveLength(1)
  })

  it('is a 404 for a host no organization claims, not a Home with no projects', async () => {
    await expect(render(new TenantUnresolvedError('desconhecido.example'))).rejects.toBe(
      mocks.NOT_FOUND,
    )
    expect(mocks.notFound).toHaveBeenCalled()
  })
})

describe('§3 — no gamified panels (CLR-004)', () => {
  it('renders none of the three sections feature 005 has no data for', async () => {
    const text = textOf(await render())

    for (const painel of ['MISSÕES', 'NÍVEL DO LAB', 'RANKING']) {
      expect(
        text,
        `the Home renders ${painel}. CLR-004: *"as missões, o nível do lab e o ranking leem ` +
          'dados que a feature 005 cria"* — with no ledger behind it the panel renders zeroes, ' +
          'which reads as a lab nobody uses rather than as a section not shipped yet.',
      ).not.toContain(painel)
    }
  })

  it('mounts neither of the two components those panels are made of', async () => {
    const tree = await render()

    // ProgressBar is the mission card's bar and the lab level's; SkillPips is the maker strip.
    // Both exist in the library (feature 001 built them for the workbench), so composing one
    // here costs nothing and would be the first half of a panel arriving by accident.
    expect(findAll(tree, ProgressBar)).toEqual([])
    expect(findAll(tree, SkillPips)).toEqual([])
  })
})

describe('§4 — the footer, and the island budget', () => {
  it('takes the footer from the shared layout rather than rendering a second one', async () => {
    expect(
      readFileSync(LAYOUT_SOURCE, 'utf8'),
      'the public layout no longer renders <Footer />. It is on every page (home.md § Footer ' +
        'institucional, restated by artigos.md and aulas.md), so it belongs to the layout — ' +
        'and this assertion is what stops the Home losing it silently.',
    ).toMatch(/<Footer\s*\/>/)
    expect(
      findAll(await render(), Footer),
      'the Home renders its own Footer on top of the layout\'s: two bands, two sets of ' +
        'pillars, and the ornament drawn twice.',
    ).toEqual([])
  })

  it('is a server component that mounts exactly one island (FR-024, SC-012)', async () => {
    const source = readFileSync(PAGE_SOURCE, 'utf8')

    expect(
      source.trimStart().startsWith("'use client'") || source.trimStart().startsWith('"use client"'),
      "a 'use client' on the Home turns the hero — the LCP element — into markup that cannot " +
        'be painted until a bundle arrives (FR-024).',
    ).toBe(false)
    for (const outra of ['LikeButton', 'ModelViewer', 'SearchInput', 'CalendarDayPanel']) {
      expect(source, `the Home imports the ${outra} island, which Home v1 has no use for`).not.toContain(
        outra,
      )
    }
    expect(findAll(await render(), ProjectCarousel)).toHaveLength(1)
  })

  it('never reaches Payload directly (FR-002, SC-003)', () => {
    const source = readFileSync(PAGE_SOURCE, 'utf8')

    expect(source).not.toMatch(/from ['"]payload['"]/)
    expect(source).not.toMatch(/req\.payload/)
    expect(source).not.toMatch(/getPayload\b/)
  })
})

describe('§5 — every element the tree renders resolves its colour from a token (FR-027)', () => {
  it('writes no hex literal into a style object', async () => {
    const inks = everyElement(await render())
      .flatMap((element) => Object.values(element.props.style ?? {}))
      .filter((value): value is string => typeof value === 'string')

    expect(inks.filter((value) => /#[0-9a-fA-F]{3,8}\b/.test(value))).toEqual([])
  })
})
