import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { contrastRatio } from '../../../../packages/ui/src/tokens/contrast'
import type { FindArgs } from '../../lib/tenancy/client'
import {
  allCss,
  attributeCss,
  caixaDe,
  changedBetween,
  declarations,
  ehLinkEmTexto,
  emVigor,
  focusCoverage,
  inlineCss,
  INTERACTIVE_TAGS,
  interactiveTargets,
  resolveColour,
  resolvedAt,
  rulesOf,
  stripComments,
  textoDe,
} from './css-cascade'

/**
 * T028 / FR-021, FR-023, SC-009, SC-010 — the six public pages at the three design targets,
 * and the focus ring every interactive target on them must show.
 *
 * `spec.md` SC-010: *"Each page renders correctly at 390 / 834 / 1440"*, validated by
 * *"breakpoint tests per page, as feature 001 did for the shell"*. SC-009: *"Every interactive
 * target meets WCAG AA contrast and shows a visible focus ring"*, validated by *"the contrast
 * gate from 001 plus a focus assertion per interactive component"*. The page specs say the same
 * thing in the designer's words — `artigos.md` § *Hover / foco*: *"Foco visível obrigatório em
 * todos os alvos interativos (WCAG AA)"*; `aulas.md`: *"Foco de teclado com anel visível de 2px
 * (contraste AA) em card, busca e botões"*.
 *
 * ── Why this suite renders the pages instead of reading their source ────────────────────────
 *
 * A grep for `:focus-visible` across `app/` and `packages/ui/src/` is the check that stays green
 * when the rule behind it is wrong: it cannot tell a ring declared for `.fl-card-projeto__seta`
 * apart from a ring declared for a class no element carries, and it says nothing at all about
 * the eleven anchors, three selects and the search field the Biblioteca actually puts on the
 * page. So each page is rendered the way the server emits it, and the assertion runs the other
 * way round: **enumerate the interactive targets in the markup, then require the CSS shipped
 * with that page to select each one**. A target nobody styled fails by existing.
 *
 * ── Where the CSS the browser sees actually comes from ──────────────────────────────────────
 *
 * Two places, and this file reads both. Component and page rules travel *in the markup*, as the
 * `<style href precedence>` blocks React 19 hoists into `<head>`. The token layer and the one
 * global rule travel as a stylesheet: `app/(frontend)/layout.tsx` imports `@fablab/ui/styles.css`
 * for every public page, and that entry `@import`s the files under `packages/ui/src/tokens/`.
 * The import chain is verified here (§2 *the delivery chain*) rather than assumed, because a
 * dangling `@import` is silent in CSS — the defect `styles-entry.test.ts` was written for.
 *
 * ── What it cannot prove ────────────────────────────────────────────────────────────────────
 *
 * There is no DOM (feature 001, CLR-003), so nothing here is painted and no viewport is 390px
 * wide. This suite asserts what the page *declares* for each target — which is where the
 * decisions live — not what a browser draws. `scripts/lcp-budget.sh` drives a real Chrome, and
 * the workbench route (feature 001, FR-016) is where the three widths are looked at by a human.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..')
const UI_SRC = join(REPO_ROOT, 'packages', 'ui', 'src')
const STYLES_ENTRY = join(UI_SRC, 'styles.css')
const LAYOUT_SOURCE = join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'layout.tsx')

/** The three widths the mockups are drawn at (`tokens/layout.css`), and the only ones a public
 *  page may name. `layout-tokens.test.ts` holds this rule over `packages/ui/src`; the app tree
 *  it does not scan is what this file adds. */
const DESIGN_TARGETS = [390, 834, 1440] as const

/** WCAG 2.x 1.4.11: a focus indicator is a non-text graphic, so its threshold is 3:1 — not the
 *  4.5:1 the contrast gate applies to body text. */
const NON_TEXT_MINIMUM = 3

class FakePublicClient {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'

  constructor(private readonly byCollection: Record<string, Record<string, unknown>[]>) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    const docs = (this.byCollection[args.collection] ?? []) as T[]
    return { docs, totalDocs: docs.length }
  }

  findByID = async <T>(): Promise<T | null> => null
}

const mocks = vi.hoisted(() => {
  /** `notFound()` throws and never returns; a mock that returns lets a page fall through to a
   *  render the runtime would never reach. */
  const NOT_FOUND = new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  return {
    NOT_FOUND,
    notFound: vi.fn((): never => {
      throw NOT_FOUND
    }),
    // Step 2 imports `redirect` at module scope for its server action. A factory that omitted it
    // would fail the IMPORT, not an assertion — the page would never render and § 5 would score
    // nothing at all. Like `notFound`, the real one throws.
    redirect: vi.fn((): never => {
      throw new Error('NEXT_REDIRECT')
    }),
    getPublicScopedPayloadForRSC: vi.fn(),
    getTenantScopedPayloadForRSC: vi.fn(),
    currentUser: vi.fn(),
    listPublic: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({ notFound: mocks.notFound, redirect: mocks.redirect }))

vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/public-payload')>()),
  getPublicScopedPayloadForRSC: mocks.getPublicScopedPayloadForRSC,
}))

vi.mock('../../lib/public/listing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/public/listing')>()),
  listPublic: mocks.listPublic,
}))

// The avatar editor is signed-in, so it reads through the request-scoped client and the session
// rather than the anonymous one. Mocked at the same seams the other two signup routes are.
vi.mock('../../lib/tenancy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy')>()),
  getTenantScopedPayloadForRSC: mocks.getTenantScopedPayloadForRSC,
}))

vi.mock('../../lib/tenancy/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/session')>()),
  currentUser: mocks.currentUser,
}))

const { default: HomePage } = await import('../../app/(frontend)/page')
const { default: ProjetosPage } = await import('../../app/(frontend)/projetos/page')
const { default: ArtigosPage } = await import('../../app/(frontend)/artigos/page')
const { default: AulasPage } = await import('../../app/(frontend)/aulas/page')
const { default: BibliotecaPage } = await import('../../app/(frontend)/biblioteca-3d/page')
const { default: CalendarioPage } = await import('../../app/(frontend)/calendario/page')
// The two routes CLR-009 brings under this gate: step 1 with the builder mounted on it, and
// step 2's form.
const { default: CriarContaPage } = await import('../../app/(frontend)/criar-conta/page')
const { default: DadosPage } = await import('../../app/(frontend)/criar-conta/dados/page')
const { default: AvatarPage } = await import('../../app/(frontend)/minha-conta/avatar/page')

const CATEGORIA = { id: 1, nome: 'Impressão 3D', slug: 'impressao-3d', ordem: 1 }
const AUTOR = { id: 9, nome: 'Maria Silva', handle: 'mariasilva', nivel: 7 }
const MIDIA = {
  id: 3,
  url: '/media/peca.png',
  filename: 'peca.stl',
  sizes: { card: { url: '/media/peca-card.png' } },
}

/**
 * One published document carrying the union of the fields the five listings read.
 *
 * A single fixture rather than one per collection: this suite asserts nothing about *which*
 * field a card prints — every other file in this directory does that — only that a fully
 * populated page draws its interactive targets, which is when the ring assertion has something
 * to bite on. An empty listing would render the empty state and prove nothing about the cards.
 */
const DOC = {
  id: 10,
  titulo: 'Luminária paramétrica',
  slug: 'luminaria-parametrica',
  descricaoCurta: 'Luminária decorativa impressa em 3D.',
  resumo: 'Resumo do artigo.',
  categoria: CATEGORIA,
  imagemCapa: MIDIA,
  // `artigo` names its cover `capa`, `projeto` names it `imagemCapa` and `modelo3d`
  // `thumbnail`; all three are present so no listing renders an image with an empty `src`.
  capa: MIDIA,
  thumbnail: MIDIA,
  arquivosModelo: [{ value: MIDIA, relationTo: 'midia' }],
  autor: AUTOR,
  curtidas: 32,
  downloads: 4,
  duracaoMinutos: 25,
  videoUrl: 'https://videos.test/aula-1',
  nivelDificuldade: 'iniciante',
  dataPublicacao: '2026-05-12T00:00:00.000Z',
  dataInicio: '2026-05-12T13:00:00.000Z',
  dataFim: '2026-05-12T15:00:00.000Z',
  tipo: 'workshop',
  status: 'publicado',
  local: { id: 2, nome: 'Sala 1' },
  maquina: { id: 4, nome: 'Impressora' },
}

interface PublicPage {
  /** The route, as it is written in the tab bar and in this file's failure messages. */
  readonly path: string
  /**
   * The surface the page paints, as the spec decides it (§ *Inherited constraints* 5: Biblioteca
   * 3D and Aulas are the two light pages). It is the expectation, not a reading of the page —
   * the page's own `--surface-page` is resolved from the markup and compared against it.
   */
  readonly surface: 'navy' | 'light'
  readonly render: () => Promise<ReactNode>
}

const query = { searchParams: Promise.resolve({}) }

/**
 * The catalogue step 1 draws its ninety-odd pickers from, and a draft that fills every required
 * slot.
 *
 * Both halves earn their place. Without rows in all three collections the builder renders empty
 * panels and the 44x44 case scores two buttons instead of the panel of them FR-032b is about —
 * the vacuity the listings' own `DOC` fixture exists to avoid. Without a COMPLETE draft
 * `SALVAR E CONTINUAR` renders `tabindex="-1"` (the FR-005 gate), and § 3's tab-order case would
 * read a deliberately shut control as a target out of the tab order.
 */
const TONS_DE_PELE = [
  { id: 1, nome: 'Pele Amanhecer', hex: '#F7D9C4', ordem: 1 },
  { id: 2, nome: 'Pele Jatobá', hex: '#6B3F2A', ordem: 2 },
]
const TONS_DE_CABELO = [{ id: 11, nome: 'Cabelo Grafite', hex: '#1C1C1C', ordem: 1 }]
const ITENS_DO_AVATAR = [
  { id: 21, categoria: 'cabelo', nome: 'Moicano curto', camadaZ: 40 },
  { id: 22, categoria: 'olhos', nome: 'Olhos amendoados', camadaZ: 50 },
  { id: 23, categoria: 'nariz', nome: 'Nariz arredondado', camadaZ: 50 },
  { id: 24, categoria: 'boca', nome: 'Sorriso', camadaZ: 50 },
  { id: 25, categoria: 'roupaCima', nome: 'Moletom', compativelBase: 'f', camadaZ: 30 },
  { id: 26, categoria: 'roupaBaixo', nome: 'Calça cargo', camadaZ: 20 },
  { id: 27, categoria: 'sapatos', nome: 'Tênis', camadaZ: 10 },
  { id: 28, categoria: 'chapeu', nome: 'Bucket navy', camadaZ: 70 },
]

/** Every required slot answered, so step 1's submit is the enabled control a person would press. */
const RASCUNHO = JSON.stringify({
  base: 'f',
  pele: '1',
  cabeloTom: '11',
  itens: {
    cabelo: '21',
    olhos: '22',
    nariz: '23',
    boca: '24',
    roupaCima: '25',
    roupaBaixo: '26',
    sapatos: '27',
  },
  direcao: 'frente',
})

const rascunhoQuery = { searchParams: Promise.resolve({ avatar: RASCUNHO }) }

/** The six of feature 003 — the pages § 3's region-by-region ring case is modelled on. */
const PUBLICAS: readonly PublicPage[] = [
  { path: '/', surface: 'navy', render: async () => (await HomePage()) as ReactNode },
  {
    path: '/projetos',
    surface: 'navy',
    render: async () => (await ProjetosPage(query as never)) as ReactNode,
  },
  {
    path: '/artigos',
    surface: 'navy',
    render: async () => (await ArtigosPage(query as never)) as ReactNode,
  },
  {
    path: '/aulas',
    surface: 'light',
    render: async () => (await AulasPage(query as never)) as ReactNode,
  },
  {
    path: '/biblioteca-3d',
    surface: 'light',
    render: async () => (await BibliotecaPage(query as never)) as ReactNode,
  },
  {
    path: '/calendario',
    surface: 'navy',
    render: async () => (await CalendarioPage(query as never)) as ReactNode,
  },
]

/**
 * The signup flow (T035c / FR-032b, SC-016).
 *
 * CLR-009: *"the signup flow and the avatar builder are held to the **same** standard as the six
 * public pages"*, and the standard is these assertions — so the two routes join `PAGES` and are
 * scored by every case § 1 to § 4 already run, rather than by a second gate written beside them.
 * What they add is § 5: the 44x44 axis (003's FR-022), which no shared case held before, because
 * the six pages each assert it in their own suite on one control at a time.
 */
const CADASTRO: readonly PublicPage[] = [
  {
    path: '/criar-conta',
    // `onboarding.md`: *"fundo geral claro … com texto navy"*. Both steps paint light, which is
    // why the ring on them cannot be the accent `:root` hands out.
    surface: 'light',
    render: async () => (await CriarContaPage(rascunhoQuery as never)) as ReactNode,
  },
  {
    path: '/criar-conta/dados',
    surface: 'light',
    render: async () => (await DadosPage(rascunhoQuery as never)) as ReactNode,
  },
  {
    // FR-023 mounts **the same builder** here, after signup. It was left out of this gate's
    // list, and the list is hard-coded — so the builder's second mount went unmeasured while
    // the first was measured twice. CLR-009 says "the signup flow **and the builder**", and the
    // builder is wherever it is mounted, not wherever the first task happened to mount it.
    path: '/minha-conta/avatar',
    surface: 'light',
    render: async () => (await AvatarPage()) as ReactNode,
  },
]

const PAGES: readonly PublicPage[] = [...PUBLICAS, ...CADASTRO]

/** The stylesheet the layout imports, as the browser assembles it: the entry plus every file it
 *  `@import`s, in cascade order. */
function packageStylesheet(): { readonly imports: string[]; readonly css: string } {
  const entry = readFileSync(STYLES_ENTRY, 'utf8')
  const imports = [...entry.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)].map((m) => m[1]!)
  const css = imports
    .map((path) => readFileSync(resolve(dirname(STYLES_ENTRY), path), 'utf8'))
    .join('\n')
  return { imports, css }
}

const PACKAGE = packageStylesheet()

/** Renders one page as the server emits it, with a full listing behind it. */
async function markupOf(page: PublicPage): Promise<string> {
  const client = new FakePublicClient({
    categoriaProjeto: [CATEGORIA],
    categoriaArtigo: [CATEGORIA],
    categoriaModelo: [CATEGORIA],
    evento: [DOC],
    local: [DOC.local],
    maquina: [DOC.maquina],
    // Step 1's three catalogue collections, read through the same anonymous choke point the
    // listings use — one client serves every route this suite renders.
    tomDePele: TONS_DE_PELE,
    tomDeCabelo: TONS_DE_CABELO,
    avatarItem: ITENS_DO_AVATAR,
  })
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(client)
  mocks.listPublic.mockResolvedValue({ docs: [DOC], page: 1, totalPages: 3, totalDocs: 30 })

  // The signed-in seam, for `/minha-conta/avatar`. It redirects a visitor with no session or no
  // profile, and a redirect renders no markup at all — so without these the route would
  // contribute an empty string and every target and ring assertion would pass over nothing.
  mocks.currentUser.mockResolvedValue({ id: 7 })
  mocks.getTenantScopedPayloadForRSC.mockResolvedValue({
    tenantId: 'org-fake',
    find: async () => ({
      docs: [{ id: 42, handle: 'mariasilva', nome: 'Maria Silva', avatarConfig: null }],
      totalDocs: 1,
    }),
    findByID: async () => null,
  })

  return renderToStaticMarkup((await page.render()) as never)
}

/** Each page rendered once: six server renders, reused by every case below. */
const RENDERED = new Map<string, string>(
  await Promise.all(PAGES.map(async (page) => [page.path, await markupOf(page)] as const)),
)

const markupFor = (page: PublicPage): string => RENDERED.get(page.path)!

const cases = PAGES.map((page) => [page.path, page] as const)
const casosPublicos = PUBLICAS.map((page) => [page.path, page] as const)
const casosDeCadastro = CADASTRO.map((page) => [page.path, page] as const)

describe('§1 the six public pages are drawn at the three design targets (FR-021, SC-010)', () => {
  it.each(cases)('%s ships CSS of its own', (_path, page) => {
    // The floor for everything below: a page whose rules never reached the markup has no
    // breakpoints to check and no ring to select its targets.
    expect(inlineCss(markupFor(page)).trim().length).toBeGreaterThan(0)
  })

  it.each(cases)('%s names only the three design targets in its media queries', (_path, page) => {
    const widths = [...stripComments(inlineCss(markupFor(page))).matchAll(/@media[^{]*?(\d+)px/g)]
      .map((match) => Number(match[1]))
    // `layout-tokens.test.ts` holds this over `packages/ui/src`. Nothing held it over the app
    // tree, which is where four of the six pages write their own queries.
    for (const width of widths) {
      expect(DESIGN_TARGETS, `${page.path} queries an undesigned width`).toContain(width)
    }
  })

  it.each(cases)('%s adapts above the 390 base rather than shipping one fixed layout', (_path, page) => {
    const queries = [...stripComments(inlineCss(markupFor(page))).matchAll(/@media[^{]+/g)].map(
      (match) => match[0],
    )
    const widthQueries = queries.filter((media) => /\d+px/.test(media))
    expect(widthQueries.length, `${page.path} has no responsive rule at all`).toBeGreaterThan(0)
    // Mobile-first is the direction `tokens/layout.css` fixes: 390 is the unconditioned base and
    // the larger targets are additive. A `max-width` query inverts that and makes the base the
    // desktop layout, which is the shape that breaks on the phone nobody tested on.
    for (const media of widthQueries) {
      expect(media, `${page.path} writes a max-width query`).not.toMatch(/max-width/)
    }
  })

  it.each(cases)('%s resolves to a different layout at 1440 than at 390', (_path, page) => {
    // The assertion the first version of this section did not make: the cascade is RESOLVED at
    // each target and the outcome compared, so an empty `@media` block, a query whose rules a
    // later base rule overrides, and a query that sets the property it was meant to change back
    // to its base value are all red — none of which a `toContain('@media …')` can see.
    const css = inlineCss(markupFor(page))
    const changed = changedBetween(css, DESIGN_TARGETS[0], DESIGN_TARGETS[2])

    expect(
      changed,
      `${page.path} draws identically at 390 and 1440. FR-021 is "every page is usable at ` +
        '390 / 834 / 1440"; a page that resolves to one layout across the whole range has ' +
        'either no responsive rule that survives the cascade, or one that changes nothing.',
    ).not.toEqual([])
  })

  it.each(cases)('%s writes no media rule that changes nothing (SC-010)', (_path, page) => {
    // ── The unit is the RULE, and getting there took three tries ──────────────────────────
    //
    // Feature 001 records what a `toContain('@media …')` cannot see: a block that is empty, one
    // a later base rule overrides, and one that sets the property to what it already was. This
    // case has to see all three, and each coarser unit missed the third:
    //
    //   * per PAGE — measured: making `LISTING_GRID_CSS`'s 834 query restate the mobile column
    //     count left all 67 cases green, because CardProjeto's live 834 rules changed something
    //     else in the same page;
    //   * per STYLESHEET — no better, and for a reason worth writing down: React 19 hoists
    //     every `<style href precedence>` and the six pages each render exactly ONE, so "per
    //     sheet" and "per page" are the same partition. Probed, not assumed.
    //
    // A rule is dead when every declaration it makes is already in force at the target below
    // it. That is checkable without a browser and it is the thing SC-010 actually promises.
    const css = inlineCss(markupFor(page))
    const dead: string[] = []
    let seen = 0

    for (const rule of rulesOf(css)) {
      if (rule.minWidth === 0 || !Number.isFinite(rule.minWidth)) continue
      seen += 1
      const below = [0, ...DESIGN_TARGETS].filter((target) => target < rule.minWidth).pop() ?? 0
      for (const selector of rule.selectors) {
        const before = resolvedAt(css, below)
        const changes = [...rule.declarations].some(
          ([property, value]) => before.get(`${selector}{${property}}`) !== value,
        )
        if (!changes) dead.push(`@media (min-width: ${rule.minWidth}px) ${selector}`)
      }
    }

    expect(seen, `${page.path} evaluated no media rule at all`).toBeGreaterThan(0)
    expect(
      dead,
      `${page.path} carries ${dead.length} media rule(s) that resolve to exactly what was ` +
        'already in force below them. Each is either empty, overridden by a later base rule, ' +
        'or restating a value — and each reads, in the source, like a page that adapts.',
    ).toEqual([])
  })

  it('records which page switches where, so a silent loss is visible in the diff', () => {
    // Not an assertion about the design — a snapshot of the fact, in one place, so that a page
    // quietly losing its 834 rule shows up as a changed line rather than as nothing at all.
    const switches = PAGES.map((page) => {
      const widths = [...new Set(rulesOf(inlineCss(markupFor(page))).map((rule) => rule.minWidth))]
        .filter((width) => width > 0 && Number.isFinite(width))
        .sort((left, right) => left - right)
      return `${page.path}: ${widths.length === 0 ? 'no query' : widths.join(', ')}`
    })

    expect(switches).toEqual([
      '/: 834, 1440',
      '/projetos: 834, 1440',
      '/artigos: 834, 1440',
      '/aulas: 1440',
      '/biblioteca-3d: 834, 1440',
      '/calendario: 1440',
      '/criar-conta: 834',
      '/criar-conta/dados: 834',
      // The builder's second mount (FR-023). It switches at 834 like step 1 does, because it
      // renders the same island — which is the point of holding both to one gate rather than
      // letting the editor grow a standard of its own.
      '/minha-conta/avatar: 834',
    ])
  })
})

describe('§2 the delivery chain that puts the focus ring on every page (SC-009)', () => {
  it('the public layout imports the design system stylesheet', () => {
    // The one import that makes the token layer and the global rule reach all six pages. Without
    // it every assertion in this section would be scoring a file the browser never fetches.
    expect(readFileSync(LAYOUT_SOURCE, 'utf8')).toContain("import '@fablab/ui/styles.css'")
  })

  it('the stylesheet entry imports a file carrying the global focus rule', () => {
    expect(PACKAGE.imports.length).toBeGreaterThan(0)
    expect(PACKAGE.css, 'no :focus-visible rule is shipped by @fablab/ui/styles.css').toContain(
      ':focus-visible',
    )
  })

  it('draws the ring at 2px or more, offset from the element, in a token colour', () => {
    const rule = /:focus-visible[^{]*\{([^}]*)\}/.exec(stripComments(PACKAGE.css))
    expect(rule, 'the shipped stylesheet declares no :focus-visible rule').not.toBeNull()
    const body = rule![1]!
    const props = declarations(PACKAGE.css)
    const outline = /(?<!-)outline:\s*([^;]+)/.exec(body)?.[1] ?? ''
    // A colour written as a literal here would be an eighth identity colour with no token and no
    // contrast entry — FR-027, and the reason `tokens/` is the only place a literal may appear.
    expect(outline, 'the ring must resolve its colour through a token').toMatch(/var\(--/)
    const width = Number(/(\d+)px/.exec(resolveColour(outline.split(/\s+/)[0]!, props))?.[1] ?? '0')
    // "anel visível de 2px" (aulas.md § Estados; artigos.md § Hover / foco). A 1px ring is the
    // width the design rejected, and it is what a browser default would already have given.
    expect(width, `the ring is ${String(width)}px`).toBeGreaterThanOrEqual(2)
    const offset = /outline-offset:\s*([^;]+)/.exec(body)?.[1] ?? ''
    // Without an offset the ring is drawn on the element's own fill, where a filled control
    // swallows it — the trap `EmptyState`'s ring records for the pink button.
    expect(Number(/(\d+)px/.exec(resolveColour(offset, props))?.[1] ?? '0')).toBeGreaterThan(0)
  })

  it('covers every kind of element that can hold keyboard focus', () => {
    const { tags } = focusCoverage(PACKAGE.css)
    for (const tag of INTERACTIVE_TAGS) {
      expect(tags, `the global rule does not select <${tag}>`).toContain(tag)
    }
    // An element made focusable by hand is a target like any other; the carousel rail is one.
    expect(tags).toContain('[tabindex="0"]')
  })

  it('suppresses the outline nowhere — in the stylesheet or in any page', () => {
    const everything = [PACKAGE.css, ...[...RENDERED.values()].map(inlineCss)].join('\n')
    // `outline: none` has no symptom for a mouse user and removes the only signal a keyboard
    // visitor gets. It is the single most common way FR-023 is lost, and it is lost silently.
    expect(stripComments(everything)).not.toMatch(/outline:\s*(none|0)\b/)
  })
})

describe('§4 nothing switches the ring back off (FR-023, SC-009)', () => {
  it.each(cases)('%s declares no outline:none anywhere it renders', (_path, page) => {
    const markup = markupFor(page)
    const css = stripComments(allCss(markup))
    const offenders = [...css.matchAll(/outline\s*:\s*(none|0)\b/gi)].map((m) => m[0])

    expect(
      offenders,
      `${page.path} turns the outline off in ${offenders.length} declaration(s). The global ` +
        'rule is `:where(…)`, which contributes zero specificity on purpose — so ANY inline ' +
        '`outline: none` beats it, and the ring is gone for a keyboard visitor while looking ' +
        'perfect to a mouse. If a control genuinely needs a different ring it must draw one, ' +
        'not remove this one.',
    ).toEqual([])
  })

  it('reads the medium the pages write in, or the case above proves nothing', () => {
    // The vacuity guard, and it is not ceremonial: the first version of this suite scanned
    // `<style>` blocks only and could not see a single page's ESTILO record. If this assertion
    // ever fails, the scan has stopped reaching the declarations it is meant to police.
    const markup = markupFor(PAGES[0]!)
    expect(
      attributeCss(markup).length,
      'no style attribute was read out of the rendered markup at all',
    ).toBeGreaterThan(200)
    expect(attributeCss(markup)).toMatch(/outline|color|padding|display/)
  })

  it.each(cases)('%s forces no box wider than the 390 base, inline or otherwise', (_path, page) => {
    // Moved here from § 1, where it read `<style>` blocks and was therefore vacuous on four of
    // the six pages: a planted `width: '900px'` in a page's ESTILO record passed.
    //
    // BASE rules only. A `@media (min-width: 834px)` prelude contains the string
    // `min-width: 834px`, so a scan that does not strip the queries reports every breakpoint
    // as an oversized box — which it did on the first run of this case, on all six pages. A
    // style attribute carries no query, so it is scanned whole.
    const markup = markupFor(page)
    const sheets = stripComments(inlineCss(markup)).replace(/@media[^{]+\{[\s\S]*?\}\s*\}/g, '')
    const css = [sheets, stripComments(attributeCss(markup))].join('\n')
    const wide = [...css.matchAll(/(?:^|[^-\w])(?:min-)?width\s*:\s*(\d{3,})px/g)]
      .map((m) => Number(m[1]))
      .filter((px) => px > 390)

    expect(
      wide,
      `${page.path} declares a fixed box of ${wide.join(', ')}px. At the 390 target that is a ` +
        'horizontal scrollbar on the whole document, which FR-021 forbids and which no ' +
        'breakpoint below can undo.',
    ).toEqual([])
  })
})

describe('§3 every interactive target on every page shows the ring (FR-023, SC-009)', () => {
  it.each(cases)('%s leaves no target unstyled', (_path, page) => {
    const markup = markupFor(page)
    const coverage = focusCoverage([PACKAGE.css, allCss(markup)].join('\n'))
    const targets = interactiveTargets(markup)
    // A page whose fixture rendered nothing interactive would pass the loop below vacuously.
    expect(targets.length, `${page.path} rendered no interactive target`).toBeGreaterThan(3)
    for (const target of targets) {
      const covered =
        coverage.tags.has(target.tag) ||
        target.classes.some((name) => coverage.classes.has(name)) ||
        (target.html.includes('tabindex="0"') && coverage.tags.has('[tabindex="0"]'))
      expect(covered, `${page.path}: no :focus-visible rule selects ${target.html.slice(0, 120)}`)
        .toBe(true)
    }
  })

  it.each(cases)('%s keeps every target in the tab order', (_path, page) => {
    for (const target of interactiveTargets(markupFor(page))) {
      // FR-023's other half: "cards are reachable by Tab". A negative tabindex on a control is
      // how a target keeps its ring in CSS and still cannot be reached to show it.
      expect(target.html, `${page.path}: ${target.html.slice(0, 80)} is out of the tab order`)
        .not.toMatch(/tabindex="-\d/)
    }
  })

  it.each(casosPublicos)('%s draws a ring that clears 3:1 on every surface it lands on', (_path, page) => {
    // ── Why the signup routes are scored by § 5 instead, and not by this case ─────────────
    //
    // This case models a page as its painted REGIONS, which is right for six pages whose fills
    // are the designer's bands and cards. Step 1's fills are not: `painelDeTons` paints one
    // `background` per catalogue row — *"the colour is the row's own hex — data from the
    // database (CLR-005)"* — so every skin tone and hair colour reads here as a region hosting
    // a ring. Measured, not feared: the routes failed this case at
    // `region painting #1C1C1C: ring #191C37 on #1C1C1C scores 1.02:1` — a 20px swatch inside
    // a 44px button, which hosts no ring at all and never will.
    //
    // § 5 scores the same threshold against the surface each CONTROL is drawn on, which is the
    // question WCAG 1.4.11 asks. Same rule, same 3:1, different unit — CLR-009's *"not a second
    // standard"* is about the standard, and a model that reports a false failure on 1/3 of the
    // pickers is not the same standard applied, it is a different one.
    //
    // ── Why this scores pairs and not one flattened pair ──────────────────────────────────
    //
    // The first version built ONE map of every custom property in the document and scored the
    // last `--focus-ring-color` against the last `--surface-page`. That models a page as a
    // single surface, and this product's pages are not: each carries a teal `--surface-band`
    // hero or sidebar with its own interactive targets — the back link, the CTA, the sidebar's
    // category links. The accent on that teal scores **1.13:1** against WCAG 1.4.11's 3:1, and
    // the flattened map could not see it, because the band declares no `--surface-page`.
    //
    // It was worse than blind: when the bands were given their own `--focus-ring-color`, the
    // flattened map took THAT as the page's ring and scored navy-on-navy — a correct fix
    // reported as a failure. A model that misreports in both directions is not a gate.
    const markup = markupFor(page)
    // Two maps, and the split is the whole correction. `props` exists ONLY to resolve a var()
    // chain down to a hex — `var(--text-on-light)` → `#191C37` — so it may flatten. The ring
    // and the surface of a given pair must come from a SPECIFIC declaration, never from the
    // flattened map: with every style attribute merged, the last `--focus-ring-color` in the
    // document becomes "the page's ring", which reported navy-on-navy for five pages the
    // moment the bands were correctly given their own.
    const props = declarations([PACKAGE.css, allCss(markup)].join('\n'))
    const root = declarations(PACKAGE.css)

    /** The style attribute that declares the page's own surface — the light pages' `<main>`. */
    const pageStyle =
      [...markup.matchAll(/\sstyle="([^"]*)"/g)]
        .map((m) => m[1]!)
        .find((style) => style.includes('--surface-page')) ?? ''
    const declared = (style: string, property: string): string | undefined =>
      new RegExp(`${property}\\s*:\\s*([^;"]+)`).exec(style)?.[1]?.trim()

    /** What a region with no ring of its own inherits: the page's override, else `:root`'s. */
    const inheritedRing =
      declared(pageStyle, '--focus-ring-color') ?? root.get('--focus-ring-color') ?? ''

    /** Every (ring, surface) that actually co-occurs: one per region that paints, plus the
     *  page's own default for everything outside them. */
    const pairs: { where: string; ring: string; surface: string }[] = [
      {
        where: `${page.path} (page surface)`,
        ring: inheritedRing,
        surface:
          declared(pageStyle, '--surface-page') ?? root.get('--surface-page') ?? '',
      },
    ]
    for (const [, style] of markup.matchAll(/\sstyle="([^"]*)"/g)) {
      const background = declared(style!, '(?:^|;)\\s*background')
      if (background === undefined) continue
      pairs.push({
        where: `${page.path} (region painting ${background})`,
        // A region that declares no ring inherits one — which is the case that was invisible on
        // the teal bands, so it is scored rather than skipped.
        ring: declared(style!, '--focus-ring-color') ?? inheritedRing,
        surface: background,
      })
    }

    // The spec's own division (§ Inherited constraints 5), checked rather than trusted: a page
    // that quietly stopped re-declaring its surface would otherwise score against the wrong one.
    const pageSurface = resolveColour(pairs[0]!.surface, props)
    expect(pageSurface === '#FFFFFF' ? 'light' : 'navy', `${page.path} paints an unexpected surface`)
      .toBe(page.surface)
    expect(pairs.length, `${page.path} declares no painted region at all`).toBeGreaterThan(1)

    for (const pair of pairs) {
      const ring = resolveColour(pair.ring, props)
      const surface = resolveColour(pair.surface, props)
      // Only opaque, named colours can be scored. A `color-mix` or a gradient is a surface this
      // arithmetic cannot evaluate, and guessing at one would be worse than saying so.
      if (!/^#[0-9a-fA-F]{6}$/.test(ring) || !/^#[0-9a-fA-F]{6}$/.test(surface)) continue
      const ratio = contrastRatio(ring, surface)
      // WCAG 1.4.11: a focus indicator is a non-text graphic. The accent scores 2.05:1 on the
      // white content area and 1.13:1 on the teal band — visible to nobody on either.
      expect(ratio, `${pair.where}: ring ${ring} on ${surface} scores ${ratio.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
    }
  })
})

/**
 * T035c / FR-032b, SC-016, CLR-009 — the third axis of 003's standard, on the signup flow.
 *
 * The two routes are already in `PAGES`, so §§ 1–4 hold them to FR-021 (the three targets) and
 * FR-023 (a ring that nothing switches off, selecting every target) exactly as they hold the six.
 * This section adds what those cases never carried: **FR-022's 44x44**, which the six pages each
 * assert in their own suite on one control at a time (`aulas-page.test.ts`: *"meets the 44px
 * touch target on the compact breakpoints"*), and which therefore had no shared gate at all — on
 * the screen CLR-009 calls *"the densest interactive screen in the product"*, one control is not
 * a sample.
 *
 * ── How a box is measured with no DOM ───────────────────────────────────────────────────────
 *
 * The same way §§ 1–4 measure everything else: by resolving the cascade over what the route
 * ships. For each target the class and tag rules that apply at 390 and at 834 are collected, the
 * element's own `style` attribute is laid over them (it wins, as it does in a browser), and the
 * `min-height` / `height` / `min-width` / `width` it finally declares are resolved through the
 * token chain — `var(--space-6)` → `24px` — and compared against 44.
 *
 * So this gate reads a **declared** minimum, not a painted box, and that is deliberate: a control
 * whose height is left to its padding and its line box is one whose conformance depends on a font
 * the test cannot measure and a browser it cannot run. `PRIMARY_BUTTON_STYLE` is the case that
 * settles it — 12px of padding either side of a 16px line box is 43.2px, under the bar by less
 * than a pixel, and invisible to anybody reading the source.
 *
 * ── The three exceptions, each with its reason ──────────────────────────────────────────────
 *
 * 1. **A link inside a sentence is not scored.** WCAG 2.5.8 exempts a target *"in a sentence or
 *    block of text"*, and both steps have one — `Fazer login`, and the terms link inside the
 *    consent label. They are anchors that declare no `display`, so they are inline by definition;
 *    a 44px box on them would break the line they sit in.
 * 2. **A control inside its own `<label>` is scored on the larger of the two boxes**, because
 *    clicking the label activates the control: the consent checkbox's target is the row, not the
 *    24px square inside it. The fix may therefore land on either — which is what the checkbox's
 *    own comment in `dados/page.tsx` already assumed, and what nothing was checking.
 * 3. **The inline axis is required only where no text fills it** — the rotation's `⟳` is the one
 *    control on either route that qualifies. For anything carrying words the inline size is the
 *    text's, and this suite cannot measure text; demanding a `min-width` there would be asserting
 *    a number nobody can justify. A checkbox counts the words of the label that activates it, by
 *    exception 2: the row is the target, and a row of prose is wider than 44px in every layout
 *    either step has.
 */

/** FR-032b, and 003's FR-022 before it: *"at least 44×44px on the compact breakpoints"*. */
const ALVO_MINIMO = 44

/** The compact breakpoints the requirement names — 1440 is excluded by the requirement itself,
 *  though every box here is declared unconditionally and so holds at all three. */
const COMPACTOS = [390, 834] as const

describe("§5 the signup flow and the builder meet 003's own 44x44 (FR-032b, SC-016, CLR-009)", () => {
  it.each(casosDeCadastro)('%s declares the light surface it actually paints', (_path, page) => {
    // The ring case below scores every control that paints no fill of its own against the PAGE's
    // surface and the PAGE's ring, so a route that paints light while declaring `:root`'s navy is
    // one where both numbers are fiction. `onboarding.md` draws both steps on *"fundo geral
    // claro"*: the roles have to be re-declared for the region, not merely painted over.
    const markup = markupFor(page)
    const props = declarations([PACKAGE.css, allCss(markup)].join('\n'))
    const estilo =
      [...markup.matchAll(/\sstyle="([^"]*)"/g)]
        .map((achado) => achado[1]!)
        .find((um) => um.includes('--surface-page')) ?? ''

    expect(
      estilo,
      `${page.path} re-declares no --surface-page. It paints a light page over the navy the ` +
        'token layer hands out, so every component inside it — EmptyState, Button, the retry — ' +
        'follows the surface role into the wrong treatment, and the focus ring stays the accent ' +
        'that scores 2.05:1 on white.',
    ).not.toBe('')

    const pintado = resolveColour(/(?:^|;)\s*background\s*:\s*([^;]+)/.exec(estilo)?.[1] ?? '', props)
    const papel = resolveColour(/--surface-page\s*:\s*([^;]+)/.exec(estilo)![1]!, props)
    expect(papel, `${page.path} declares a surface role it does not paint`).toBe(pintado)
  })

  it.each(casosDeCadastro)('%s rings every control in a colour that clears 3:1', (_path, page) => {
    // Per CONTROL, not per painted region — see § 3's note on why the catalogue swatches make the
    // region model wrong here. A control that paints its own fill is scored on it; one that does
    // not is scored on the page surface, with the page's own ring. An intermediate region (step
    // 2's card) is deliberately NOT modelled: with no DOM there is no ancestry to walk, so the
    // rule this enforces is that the page-level declaration must be correct on its own.
    const markup = markupFor(page)
    const css = [PACKAGE.css, allCss(markup)].join('\n')
    const props = declarations(css)
    const root = declarations(PACKAGE.css)
    const estiloDaPagina =
      [...markup.matchAll(/\sstyle="([^"]*)"/g)]
        .map((achado) => achado[1]!)
        .find((um) => um.includes('--surface-page')) ?? ''
    const daPagina = (propriedade: string): string =>
      new RegExp(`${propriedade}\\s*:\\s*([^;"]+)`).exec(estiloDaPagina)?.[1]?.trim() ??
      root.get(propriedade) ??
      ''

    const superficieDaPagina = resolveColour(daPagina('--surface-page'), props)
    const anelDaPagina = daPagina('--focus-ring-color')
    const alvos = interactiveTargets(markup)
    expect(alvos.length, `${page.path} rendered nothing to ring`).toBeGreaterThan(8)

    for (const alvo of alvos) {
      const declarado = emVigor(alvo, css, COMPACTOS[0])
      const anel = resolveColour(declarado.get('--focus-ring-color') ?? anelDaPagina, props)
      const proprio = resolveColour(declarado.get('background') ?? '', props)
      // `transparent`, a gradient, a catalogue hex on a child — none of them is a fill this
      // control is drawn on, so the surface underneath it is the page's.
      const fundo = /^#[0-9a-fA-F]{6}$/.test(proprio) ? proprio : superficieDaPagina
      if (!/^#[0-9a-fA-F]{6}$/.test(anel) || !/^#[0-9a-fA-F]{6}$/.test(fundo)) continue
      const ratio = contrastRatio(anel, fundo)
      expect(
        ratio,
        `${page.path}: the ring ${anel} on ${alvo.html.slice(0, 90)} (fill ${fundo}) scores ` +
          `${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
    }
  })

  it.each(casosDeCadastro)('%s gives every target at least 44x44 (FR-032b)', (_path, page) => {
    const markup = markupFor(page)
    const css = [PACKAGE.css, allCss(markup)].join('\n')
    const props = declarations(css)
    const pequenos: string[] = []
    let medidos = 0

    for (const alvo of interactiveTargets(markup)) {
      if (ehLinkEmTexto(alvo, css, COMPACTOS[0])) continue
      medidos += 1
      // No words to fill the inline axis: the rotation's `⟳`, or a checkbox with no label around
      // it. A checkbox that HAS one counts the label's words, because the label is the target.
      const semTexto = textoDe(alvo, markup).length <= 1
      for (const largura of COMPACTOS) {
        const caixa = caixaDe(alvo, markup, css, props, largura)
        const falhou = caixa.altura < ALVO_MINIMO || (semTexto && caixa.largura < ALVO_MINIMO)
        if (!falhou) continue
        pequenos.push(
          `@${String(largura)} ${alvo.html.slice(0, 90)} declares ` +
            `${String(caixa.largura)}x${String(caixa.altura)}`,
        )
      }
    }

    expect(medidos, `${page.path} measured no target at all`).toBeGreaterThan(8)
    expect(
      pequenos,
      `${page.path} carries ${pequenos.length} target(s) under ${String(ALVO_MINIMO)}px. ` +
        "FR-032b holds this flow to 003's own FR-022, and a box left to its padding and its line " +
        'height is not one this suite — or a reviewer — can check: the canonical primary comes ' +
        'to 43.2px that way. Declare the minimum on the control, or on the label that activates ' +
        'it.',
    ).toEqual([])
  })
})
