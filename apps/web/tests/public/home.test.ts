import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isValidElement, type ReactElement, type ReactNode } from 'react'
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

import type { FindArgs } from '../../lib/tenancy/client'
import { TenantUnresolvedError } from '../../lib/tenancy/errors'

/**
 * T026, T028 / FR-009, FR-011, FR-024, FR-027, FR-028, US1, US10 — the Home, as a whole page.
 *
 * T026's task, in full: *"Home v1: hero, `ÚLTIMOS PROJETOS` carousel island, footer. **No
 * gamified panels** — they read data only feature 005 creates (CLR-004)"*. T025 landed the hero
 * and its byte counts (`home-hero.test.ts`, which still owns the picture and the preload); this
 * file owns everything the same page had to grow around it.
 *
 * ── § 3 says the opposite of what it used to, and that is the point (T028, FR-027) ──────────
 *
 * CLR-004 was a *decision*: `home.md` describes `MISSÕES EM DESTAQUE`, `NÍVEL DO LAB` and
 * `RANKING MAKERS` in as much detail as it describes the carousel, and every one of them read a
 * table feature 005 had not created — the page would not have failed loudly, it would have
 * rendered zeroes, which looks like the product working. So the omission got a test, the way
 * `PUBLICAÇÃO`'s absence from the Artigos tab set did (tasks.md § Run 5, T019).
 *
 * 005 created the tables, feature 006 renders the panels, and § 3 was inverted **in the same
 * change** — it now asserts the three sections are present, that the lab card mounts the real
 * `ProgressBar`, and that the page's own docblock no longer records the panels as deliberately
 * missing (FR-028). An assertion kept past its reason is not a test any more: it is the
 * instruction the next agent follows, which is exactly how 005's `AUTORIA_PENDENTE`
 * placeholders were read.
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

/**
 * The page's leading docblock — everything up to the end of the file's first block comment,
 * which is its own record of what the Home is and is not. FR-028 rewrites that record, and § 3
 * below binds the rewrite to the code instead of to a promise.
 */
function docblockDoPage(): string {
  const source = readFileSync(PAGE_SOURCE, 'utf8')
  return source.slice(0, source.indexOf('*/'))
}

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

/**
 * The panels' fixtures, for a § 3 that has to see the sections *populated*.
 *
 * What each panel draws from them is `home-paineis.test.ts`'s, `home-nivel-lab.test.ts`'s and
 * `home-ranking.test.ts`'s subject, asserted field by field there. Here they exist for one
 * reason: with no data the three blocks render their error states, and a § 3 asserting the
 * panels are present would be satisfied by three headings over three failures.
 */
const MISSOES_EM_DESTAQUE = [
  {
    id: 1,
    titulo: 'Desafio Corte Laser',
    descricao: 'Crie um chaveiro personalizado com corte a laser.',
    icone: { id: 90, url: '/media/laser.svg' },
    ordemDestaque: 1,
    destaqueHome: true,
  },
  {
    id: 2,
    titulo: 'Impressão 3D',
    descricao: 'Modele e imprima um suporte para celular.',
    icone: { id: 91, url: '/media/impressao.svg' },
    ordemDestaque: 2,
    destaqueHome: true,
  },
]

/** Two places on the board, as `readPublicRanking` projects them — name, handle, XP and level,
 *  and nothing a visitor may not read (plan § D2). */
const RANKING = [
  { id: 7, nome: 'Ana', handle: '@ana', avatarRender: null, xpTotal: 240, nivel: 5 },
  { id: 8, nome: 'Bruno', handle: '@bruno', avatarRender: null, xpTotal: 180, nivel: 4 },
]

/** The lab's level as `nivelDoLab` computes it: a total, a level on this lab's curve, and the
 *  XP earned inside the current level over that level's width — the bar's value/max (FR-013). */
const NIVEL_DO_LAB = { xp: 340, nivel: 7, progresso: { atual: 40, de: 100 } }

/**
 * The anonymous door's client, answering the band's read and nothing else.
 *
 * A named fake rather than an inline stub (`.claude/rules/code-quality.md`), and deliberately
 * narrow: a read aimed at another collection comes back empty, so a panel that started reading
 * something else through this door shows up as an empty section here instead of as this
 * fixture served to whoever asked.
 */
class FakePublicDoor {
  readonly tenantId = 'org-fake'

  constructor(private readonly missoes: readonly unknown[] = MISSOES_EM_DESTAQUE) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    const docs = (args.collection === 'missao' ? this.missoes : []) as T[]
    return { docs, totalDocs: docs.length }
  }

  findByID = async <T>(): Promise<T | null> => null
}

/**
 * The session store {@link NIVEL_DO_LAB}'s reader is handed and never reads.
 *
 * `lerNivelDoLab` resolves the tenant-scoped client *before* calling `nivelDoLab`, and the real
 * one calls `next/headers`, which throws outside a request scope. With `nivelDoLab` itself
 * mocked below, nothing ever touches this object — it exists so the door it stands in for
 * cannot be what fails.
 */
const LOJA_NUNCA_LIDA = {} as never

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
    /** The panels' four doors (feature 006). Every one of them reaches `next/headers` in the
     *  real thing, which throws outside a request scope — the reason every page suite here
     *  mocks its doors rather than driving them. */
    getPublicScopedPayloadForRSC: vi.fn(),
    getTenantScopedPayloadForRSC: vi.fn(),
    getPublicLabLevelStoreForRSC: vi.fn(),
    readPublicRanking: vi.fn(),
    /** 005's pure rule, mocked rather than fed a ledger: *how* the level is computed is
     *  `xp-nivel-do-lab.test.ts`'s assertion and *that the card draws what it returns* is
     *  `home-nivel-lab.test.ts`'s. This file asserts only that the page composes the section. */
    nivelDoLab: vi.fn(),
    /** A visitor with no session — the state this file renders every case in. The personal
     *  overlay is `home-paineis.test.ts` § 3's subject. */
    estadoPessoal: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))

vi.mock('../../lib/public/listing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/public/listing')>()),
  listPublic: mocks.listPublic,
}))

vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/public-payload')>()),
  getPublicScopedPayloadForRSC: mocks.getPublicScopedPayloadForRSC,
  readPublicRanking: mocks.readPublicRanking,
  // The lab level's door since T023 — `nivelDoLab` itself is faked below, so this only has to
  // resolve: what this file measures is the page's composition, not the store's bound.
  getPublicLabLevelStoreForRSC: mocks.getPublicLabLevelStoreForRSC,
}))

vi.mock('../../lib/tenancy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy')>()),
  getTenantScopedPayloadForRSC: mocks.getTenantScopedPayloadForRSC,
}))

vi.mock('../../lib/content/xp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/content/xp')>()),
  nivelDoLab: mocks.nivelDoLab,
}))

vi.mock('../../lib/public/missoes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/public/missoes')>()),
  estadoPessoal: mocks.estadoPessoal,
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

/**
 * One `<section>`, found by the id of the heading it is labelled with.
 *
 * Scoping matters since feature 006: the Home draws four sections, and three of them render an
 * `EmptyState` of their own. A page-wide `findAll(tree, EmptyState)[0]` answers about whichever
 * block happens to come first in the tree — which is the band, not the carousel — so an
 * assertion written about `ÚLTIMOS PROJETOS` would silently start reporting on `MISSÕES EM
 * DESTAQUE`. The `aria-labelledby` is the page's own name for each block.
 */
const secao = (tree: ReactNode, rotulo: string): AnyElement | null =>
  everyElement(tree).find((element) => element.props['aria-labelledby'] === rotulo) ?? null

/** Every anchor in the tree, as `[href, text]`. */
const anchors = (tree: ReactNode): [string, string][] =>
  findAll(tree, 'a').map((a) => [String(a.props.href ?? ''), textOf(a)])

beforeEach(() => {
  vi.clearAllMocks()
  // The panels, succeeding. Every case here is about the page's composition, so the default is
  // the state in which all four blocks have something to draw; the failed and empty outcomes
  // are `home-paineis.test.ts`'s, block by block.
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakePublicDoor())
  mocks.getPublicLabLevelStoreForRSC.mockResolvedValue(LOJA_NUNCA_LIDA)
  mocks.readPublicRanking.mockResolvedValue(RANKING)
  mocks.nivelDoLab.mockResolvedValue(NIVEL_DO_LAB)
  mocks.estadoPessoal.mockResolvedValue({ tipo: 'anonimo' })
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
    const vazio = findAll(secao(tree, 'ultimos-projetos'), EmptyState)[0]
    expect(
      vazio?.props.variant,
      'a lab whose first project is not published yet gets a Home with a silent gap where the ' +
        'only content section should be.',
    ).toBe('vazio')
  })

  it('keeps the page up when the read fails, and offers a retry (FR-018)', async () => {
    const tree = await render(new Error('connection refused'))

    const erro = findAll(secao(tree, 'ultimos-projetos'), EmptyState)[0]
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

describe('§3 — the gamified panels (CLR-004 satisfied, FR-027, FR-028)', () => {
  /**
   * **This section asserted the exact opposite until feature 006, and the inversion lands in the
   * same change that renders the panels (FR-027).**
   *
   * CLR-004 refused `MISSÕES EM DESTAQUE`, `NÍVEL DO LAB` and `RANKING MAKERS` while the tables
   * behind them did not exist — a panel with no ledger renders zeroes, which reads as a lab
   * nobody uses rather than as a section not shipped yet. Feature 005 created `missao`,
   * `xpLedger`/`regrasXp` and `perfilMaker`, so the reason expired; an assertion that outlives
   * its reason stops being a test and becomes an instruction, which is precisely how 005's four
   * `AUTORIA_PENDENTE` placeholders were read by the next agent (spec § US10).
   *
   * Leaving the old § 3 standing was never an option either: it is a guaranteed red that the run
   * can only read as a regression in the panels it was written to forbid.
   */
  it('renders the three sections feature 005 created the data for', async () => {
    const text = textOf(await render())

    for (const painel of ['MISSÕES EM DESTAQUE', 'NÍVEL DO LAB', 'RANKING MAKERS']) {
      expect(
        text,
        `the Home renders no ${painel}. home.md draws it beside the carousel, and 005 shipped ` +
          'the data CLR-004 was waiting for — this is the section that used to assert its ' +
          'absence, inverted (FR-027).',
      ).toContain(painel)
    }
  })

  it('mounts the ProgressBar the lab level bar is made of (FR-013)', async () => {
    const cartao = secao(await render(), 'nivel-do-lab')

    // Scoped to the lab card on purpose: the band mounts a bar of its own for a signed-in maker
    // (FR-009), and a page-wide count would let either one satisfy an assertion written about
    // the other. `ProgressBar` by *identity* — the library's, the same module instance the page
    // imports — so a hand-rolled div that merely looks like a bar cannot pass.
    expect(
      findAll(cartao, ProgressBar),
      'the NÍVEL DO LAB card drew no ProgressBar. FR-013: the bar is `nivelDoLab`\'s own ' +
        '`progresso` — the XP earned inside the current level over that level\'s width — and ' +
        'the card renders it rather than a percentage computed on the page.',
    ).toHaveLength(1)
  })

  it('still draws no skills, so SkillPips stays at zero', async () => {
    // The one half of the old § 3 that survives the inversion: `home.md` gives the Home no skill
    // strip, and `SkillPips` exists in the library (feature 001 built it for the workbench), so
    // composing one here is a panel arriving by accident rather than by a requirement.
    expect(findAll(await render(), SkillPips)).toEqual([])
  })

  it('no longer records the panels as deliberately missing (FR-028)', () => {
    const docbloco = docblockDoPage()

    // The comment that explains an absence IS the instruction the next reader follows — US10's
    // own words. So the page's record is asserted, not just its markup.
    expect(
      docbloco,
      'the Home\'s docblock still carries its § "What Home v1 does NOT have". The panels are ' +
        'rendered now; a record that says otherwise is the next reader\'s reason to delete them.',
    ).not.toContain('does NOT have')
    expect(
      docbloco,
      'the docblock still says `home.test.ts` § 3 asserts the panels\' absence. It asserts ' +
        'their presence — this very section.',
    ).not.toContain('asserts their absence')
    expect(
      docbloco,
      'the docblock does not record CLR-004 as satisfied. FR-028: the decision is closed, not ' +
        'pending, and the page is the place that has to say so.',
    ).toContain('CLR-004 is satisfied')
    for (const painel of ['MISSÕES EM DESTAQUE', 'NÍVEL DO LAB', 'RANKING MAKERS']) {
      expect(docbloco, `the docblock no longer names ${painel} at all`).toContain(painel)
    }
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

  /**
   * The budget, restated after feature 004 added the second island.
   *
   * 003 wrote this as *"exactly one"*, and the one was `ProjectCarousel`. 004's US7 scopes the
   * heart to *"any card that shows a heart"*, and these cards show one — so the Home now mounts
   * a `LikeButton` per card as well. That is a deliberate, measured change and not a drift: the
   * carousel holds three cards, the island is two hooks with no data of its own, and `/` is the
   * first page `scripts/lcp-budget.sh` measures, so the cost has a gate that answers in numbers.
   *
   * The bound itself is unchanged and is still the point: the two islands are named, every
   * other island is still refused, and the page is still a server component. An island that
   * arrives without a row here is the failure FR-024 exists to prevent.
   */
  it('is a server component that mounts only the islands it names (FR-024, SC-012)', async () => {
    const source = readFileSync(PAGE_SOURCE, 'utf8')

    expect(
      source.trimStart().startsWith("'use client'") || source.trimStart().startsWith('"use client"'),
      "a 'use client' on the Home turns the hero — the LCP element — into markup that cannot " +
        'be painted until a bundle arrives (FR-024).',
    ).toBe(false)
    for (const outra of ['ModelViewer', 'SearchInput', 'CalendarDayPanel']) {
      expect(source, `the Home imports the ${outra} island, which Home v1 has no use for`).not.toContain(
        outra,
      )
    }

    const tree = await render()
    expect(findAll(tree, ProjectCarousel)).toHaveLength(1)
    // One per card, in the slot `CardProjeto` already offers — so the island count follows the
    // number of cards and not a hand-written number that would rot the day the carousel grows.
    const cartoes = findAll(tree, CardProjeto)
    expect(cartoes.length, 'the carousel rendered no cards, so the count below proves nothing')
      .toBeGreaterThan(0)
    expect(
      cartoes.filter((card) => isValidElement(card.props.curtir)),
      'a card on the Home draws a heart with no island behind it — a press that answers with ' +
        'nothing, which is the half-shipped control 003 § CLR-010 moved into feature 004',
    ).toHaveLength(cartoes.length)
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
