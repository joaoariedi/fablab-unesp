import { renderToStaticMarkup } from 'react-dom/server'

import * as React from 'react'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CardProjeto, LikeButton } from '@fablab/ui'

import type { FindArgs } from '../../lib/tenancy/client'

/**
 * T004 / FR-025, SC-012 — the count a visitor is sent, and the count a visitor is left with.
 *
 * US7: *"a visitor with no account, on any card that shows a heart … **the count they saw does
 * not change**"*. T001 proved that of the component and T003 proved the three listings hand it
 * the number their reader returned. Neither of those is the claim this file owns, and the gap
 * between them is where the requirement actually lives:
 *
 *  1. **The number reaches the HTML.** T003 asserts `props.curtidas`; a prop is not a pixel.
 *     Between the prop and the screen sit the island's own branch and the card slot it was put
 *     in, and `biblioteca-3d-page.test.ts` § 5 already recorded the moment that gap bit — the
 *     count moved inside a component boundary and a tree walk stopped being able to see it,
 *     while the requirement ("shown to everyone, as text") was unchanged.
 *  2. **The press does not move it.** T001 proves it against a hand-built props object. Here
 *     the props are the ones the *page* built from the *reader's* document, the handler that
 *     runs is the one the emitted tree carries, and the number compared is read back out of
 *     rendered HTML on both sides of the press.
 *  3. **No listing that draws a heart was left behind.** US7 scopes itself to *"any card that
 *     shows a heart"*, and the thing that scoping guards against is not a component defect —
 *     it is a page being forgotten. T003's first pass rewired three listings and left three:
 *     the Home carousel, the Aulas list and the Calendário agenda each kept a hand-written ♥
 *     that answered a press with nothing, which is the half-shipped control 003 § CLR-010
 *     moved here, relocated rather than closed. Every one of those pages was internally
 *     consistent, so no per-page suite could have failed. Only an enumeration fails, and §3 is
 *     that enumeration.
 *
 *     An earlier draft of this file asserted the opposite — that the Home and Aulas carry *no*
 *     island — and cited each page's own comment as the authority. That is a gate written
 *     around the gap instead of across it: it would have gone red on the fix and green on the
 *     omission. The comments it cited were 003's, written before CLR-010 moved the click, and
 *     they are gone from both pages now.
 *
 *  4. **A card given no island still prints its own count.** That claim survives any page
 *     decision, so it is made against the component (§4) rather than against a page that
 *     happens not to supply one today.
 *
 * ── Why this suite renders to markup instead of walking the tree ────────────────────────────
 *
 * Every other page suite walks the returned tree, and for a good reason: identity comparison
 * proves which component was composed. That instrument is blind to exactly this file's subject.
 * A walk stops at a component boundary, so it cannot see a number that is printed *inside*
 * `LikeButton` or *inside* `CardProjeto` — and "the visitor sees 32" is a claim about the HTML
 * the server sends, which is also the whole of what a visitor with no JavaScript ever gets.
 *
 * ── Why the press is driven through a hook store rather than a DOM ──────────────────────────
 *
 * There is no DOM in this suite (`vitest.config.ts` leaves the environment at `node`) and no
 * test renderer in the tree, so a click cannot be dispatched and a re-render cannot be awaited.
 * `FakeHookStore` is the smallest thing that makes the press real rather than described: it
 * holds state across two renders by call order, so the sequence below is *render → read the
 * handler the tree carries → call it → render again*, and the second render sees precisely
 * what the component wrote and nothing a test decided for it. A store that answered by guessing
 * at values would be a test asserting its own fixture.
 *
 * What it cannot prove: that a browser repaints, or that the panel is visible above the card.
 * Those are Playwright's, and feature 003 left that harness in place.
 */

/** Where React 19 keeps the hook dispatcher `FakeHookStore` stands in for. Read defensively: an
 *  upgrade that moves it fails with this sentence rather than with a null dereference. */
const INTERNALS_KEY = '__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE'

/** Copied from `docs/product/pages/projetos.md` § *Deslogado* — never from the component, which
 *  would make the assertion "a constant equals itself". */
const MICROCOPY = 'Crie sua conta para curtir e evoluir como maker'

/** Step 1 of signup, as the invitation's CTA must point at it. */
const CRIAR_CONTA = '/criar-conta'

/** This organization's vocabulary, for the tabs the listings read through the choke point. */
const CATEGORIAS = [{ id: 1, nome: 'Impressão 3D', slug: 'impressao-3d' }]

/** One published project, populated at `depth: 1` exactly as `listPublic` returns it. */
const PROJETO = {
  id: 10,
  titulo: 'Luminária paramétrica',
  slug: 'luminaria-parametrica',
  descricaoCurta: 'Luminária decorativa impressa em 3D com design paramétrico.',
  categoria: CATEGORIAS[0],
  imagemCapa: { id: 3, url: '/media/lum.png', sizes: { card: { url: '/media/lum-card.png' } } },
  curtidas: 32,
}

/** One published class, as `aulas-page.test.ts` fixes its shape. */
const AULA = {
  id: 30,
  titulo: 'Primeiros passos impressão 3D',
  slug: 'primeiros-passos-impressao-3d',
  descricao: 'Conceitos básicos da impressão 3D.',
  thumbnail: { id: 7, url: '/media/aula.png', sizes: { card: { url: '/media/aula-card.png' } } },
  videoUrl: 'https://www.youtube.com/watch?v=aula-01',
  duracaoMin: 25,
  autor: { id: 9, nome: 'Maria Silva', handle: 'mariasilva' },
  curtidas: 42,
  dataPublicacao: '2024-05-12T00:00:00.000Z',
}

/** One published article, as `artigos-page.test.ts` fixes its shape. */
const ARTIGO = {
  id: 20,
  titulo: 'Práticas colaborativas em Fab Lab',
  slug: 'praticas-colaborativas',
  resumo: 'Volume 1 da coleção Primeiros Passos.',
  categoria: CATEGORIAS[0],
  capa: { id: 5, url: '/media/praticas.png', sizes: { card: { url: '/media/praticas-card.png' } } },
  autor: { id: 9, nome: 'Maria Silva', handle: 'mariasilva' },
  dataPublicacao: '2024-05-12T00:00:00.000Z',
  curtidas: 24,
}

/** One published model, as `biblioteca-3d-page.test.ts` fixes its shape. */
const MODELO = {
  id: 10,
  titulo: 'Bolsa vazada',
  slug: 'bolsa-vazada',
  descricaoCurta: 'Bolsa decorativa com estrutura vazada.',
  categoria: CATEGORIAS[0],
  thumbnail: { id: 3, url: '/media/bolsa.png', sizes: { card: { url: '/media/bolsa-card.png' } } },
  autor: { id: 5, nome: 'Maria Silva', handle: 'mariasilva' },
  arquivosModelo: [{ relationTo: 'midiaModelo3d', value: { id: 7, filename: 'bolsa.stl' } }],
  curtidas: 42,
}

/** One published event, in UTC, as `calendario-page.test.ts` fixes its shape. All three clones
 *  share `inicioEm`, so the list view groups them under one day and the counts stay in order. */
const EVENTO = {
  id: 20,
  titulo: 'Oficina de corte a laser',
  slug: 'oficina-de-corte-a-laser',
  tipo: 'oficina',
  descricaoCurta: 'Aprenda a operar a cortadora.',
  inicioEm: '2026-08-22T17:00:00.000Z',
  fimEm: '2026-08-22T20:00:00.000Z',
  local: { id: 1, nome: 'Fab Lab CITe — Sala 2' },
  maquinas: [{ id: 3, nome: 'Corte a Laser' }],
  responsavel: { id: 9, nome: 'Maria Silva', handle: 'mariasilva' },
  vagasTotal: 20,
  status: 'publicado',
  curtidas: 7,
}

/** N documents carrying N different counts — distinct numbers, so a page that printed one
 *  document's count on every card cannot pass by coincidence. */
const comContagens = <T extends { id: number; slug: string }>(
  modelo: T,
  contagens: readonly number[],
): T[] =>
  contagens.map((curtidas, n) => ({ ...modelo, id: n + 1, slug: `${modelo.slug}-${n + 1}`, curtidas }))

/**
 * The anonymous client behind the public choke point, answering **per collection**.
 *
 * Per collection and not one list for every read, because §3 drives the Calendário, whose page
 * makes two reads through this client — `evento` and `maquina`. A fake answering both with the
 * same documents would put activities in the machine filter and the page would render a select
 * of oficinas: a fixture that lies quietly is worse than one that throws. An undeclared
 * collection answers empty, which is what "this lab has none of those" looks like.
 */
class FakePublicClient {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'

  constructor(
    private readonly porColecao: Readonly<Record<string, readonly Record<string, unknown>[]>>,
  ) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    const docs = (this.porColecao[String(args.collection)] ?? []) as T[]
    return { docs, totalDocs: docs.length }
  }

  findByID = async <T>(): Promise<T | null> => null
}

/** Each listing reads its own category collection through the choke point; one map serves all
 *  of them, so a page added to §3's table needs no new plumbing to render its tabs. */
const VOCABULARIO: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  categoriaProjeto: CATEGORIAS,
  categoriaArtigo: CATEGORIAS,
  categoriaModelo: CATEGORIAS,
}

const mocks = vi.hoisted(() => {
  /** What the real `notFound()` does: it throws and never returns. A mock that returned would
   *  let execution fall through to a render the runtime never reaches. */
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

const { default: ProjetosPage } = await import('../../app/(frontend)/projetos/page')
const { default: ArtigosPage } = await import('../../app/(frontend)/artigos/page')
const { default: AulasPage } = await import('../../app/(frontend)/aulas/page')
const { default: BibliotecaPage } = await import('../../app/(frontend)/biblioteca-3d/page')
const { default: CalendarioPage } = await import('../../app/(frontend)/calendario/page')
const { default: HomePage } = await import('../../app/(frontend)/page')

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly [key: string]: unknown
}>

/** A listing page, as the router calls one. */
type PaginaDeListagem = (props: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}) => Promise<unknown>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

/** Every element in the tree whose `type` matches, depth-first. Identity, so a look-alike built
 *  out of spans cannot pass for the island. */
function findAll(node: ReactNode, type: unknown): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child as ReactNode, type))
  if (!isElement(node)) return []
  const here = node.type === type ? [node] : []
  return [...here, ...findAll((node.props.children ?? null) as ReactNode, type)]
}

/**
 * The same search, but through **every** prop rather than only `children`.
 *
 * `CardProjeto` takes the island as `curtir`, which is a slot and not a child, so `findAll`
 * walks straight past it — and that is not a detail: it is the difference between "this page
 * supplies an island" and "this page renders one inline". Three of the six listings use the
 * slot and three render the element directly, so a finder that saw only one shape would report
 * the other three as missing and the enumeration in §3 would be an enumeration of nothing.
 *
 * `children` is itself a prop, so this subsumes `findAll`; both are kept because §2 wants the
 * narrow one when it asks *which card* carried the slot.
 */
function findAllDeep(node: unknown, type: unknown): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAllDeep(child, type))
  if (!isElement(node)) return []
  const here = node.type === type ? [node] : []
  return [...here, ...Object.values(node.props).flatMap((valor) => findAllDeep(valor, type))]
}

/** Serves the reader's answer and the category vocabulary, then calls the page. */
async function renderListagem(pagina: PaginaDeListagem, docs: readonly unknown[]): Promise<ReactNode> {
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakePublicClient(VOCABULARIO))
  mocks.listPublic.mockResolvedValue({ docs, page: 1, totalPages: 1, totalDocs: docs.length })
  return (await pagina({ searchParams: Promise.resolve({}) })) as ReactNode
}

/** The Home takes no search params: it is one carousel of the most recent projects. */
async function renderHome(docs: readonly unknown[]): Promise<ReactNode> {
  mocks.listPublic.mockResolvedValue({ docs, page: 1, totalPages: 1, totalDocs: docs.length })
  return (await HomePage()) as unknown as ReactNode
}

/**
 * The Calendário, in the one view that draws cards.
 *
 * `visao=lista` is not a convenience: the month grid renders **pills**, and a pill carries no
 * heart. The agenda's card — the thing US7 is about — exists in the list view and in the day
 * drawer, which share `cardEvento` precisely so the two cannot drift. `mes` is pinned to the
 * fixtures' month so the grouping is deterministic on any day this suite runs.
 *
 * It also reads through the client rather than through `listPublic`, which is why the fake
 * above answers per collection.
 */
async function renderCalendario(docs: readonly unknown[]): Promise<ReactNode> {
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(
    new FakePublicClient({ evento: docs as readonly Record<string, unknown>[], maquina: [] }),
  )
  return (await CalendarioPage({
    searchParams: Promise.resolve({ visao: 'lista', mes: '2026-08' }),
  })) as unknown as ReactNode
}

/** The HTML the server sends — the whole of what a visitor with no JavaScript ever receives. */
const markupOf = (node: ReactNode): string => renderToStaticMarkup(node as ReactElement)

/** Markup with every tag removed: what a reader sees, with `aria-label` and every other
 *  attribute deliberately excluded. Announcing the microcopy is not showing the invitation, and
 *  a walk that counted attributes could not tell the closed panel from the open one. */
const textoDe = (markup: string): string => markup.replace(/<[^>]*>/g, ' ')

/**
 * Every like count printed on screen, in document order.
 *
 * Anchored on the glyph rather than on any class name: `CardProjeto`'s static counter and the
 * island print different markup around the same two things — a ♥ and a number — and this file's
 * subject is precisely that a visitor gets the number either way.
 */
function contagensDe(markup: string): number[] {
  return [...textoDe(markup).matchAll(/♥\s*(\d+)/g)].map(([, numero]) => Number(numero))
}

/**
 * The two `useState` slots this island holds, kept across renders by call order.
 *
 * A named fake and not an inline stub because it is a tiny renderer, not a stub: the setter
 * writes where the component told it to, and the next render reads it back. That is what makes
 * "press, then look again" an executed sequence rather than a described one.
 */
class FakeHookStore {
  private readonly estados: unknown[] = []
  private cursor = 0

  readonly useState = (inicial: unknown): [unknown, (proximo: unknown) => void] => {
    const posicao = this.cursor
    this.cursor += 1
    if (posicao >= this.estados.length) this.estados.push(inicial)
    const valor = this.estados[posicao]
    return [
      valor,
      (proximo: unknown): void => {
        this.estados[posicao] =
          typeof proximo === 'function' ? (proximo as (anterior: unknown) => unknown)(valor) : proximo
      },
    ]
  }

  /**
   * Recorded, never run.
   *
   * The island registers an Escape listener while the panel is open, and this file has no
   * `document` to register it against — the environment is `node`. Running the effect here
   * would fail on a global that does not exist, and stubbing one in would make this suite
   * assert the keyboard path a second time. `packages/ui/tests/like-button.test.ts` owns that
   * claim, with a `FakeDocument` and the cleanup asserted; here the effect is collected so the
   * fake stays honest about what it swallowed, and `efeitos` is readable if anything ever
   * needs to prove one was even scheduled.
   *
   * It is NOT a silent no-op: without this method React 19 throws
   * `resolveDispatcher(...).useEffect is not a function`, which is how the omission announced
   * itself the first time.
   */
  readonly useEffect = (efeito: () => void): void => {
    this.efeitos.push(efeito)
  }

  readonly efeitos: (() => void)[] = []

  /** Called before every render: hooks are read from the top again, values kept. */
  rewind(): void {
    this.cursor = 0
  }
}

/** One render of the element the page built, with `store` answering its hooks. The dispatcher is
 *  restored even on failure — a leaked fake would break every later file in the run. */
function renderIlha(elemento: AnyElement, store: FakeHookStore): AnyElement {
  const internals = (React as unknown as Record<string, { H: unknown } | undefined>)[INTERNALS_KEY]
  expect(internals, `React no longer exposes ${INTERNALS_KEY}; this fake needs it`).toBeTypeOf('object')
  const shared = internals as { H: unknown }
  const anterior = shared.H
  store.rewind()
  shared.H = store
  try {
    return (elemento.type as (props: unknown) => AnyElement)(elemento.props)
  } finally {
    shared.H = anterior
  }
}

/**
 * The heart — the island's first `<button>`, in document order.
 *
 * Not "the only one". An open invitation carries its own close control, which is deliberate:
 * the panel's first draft had no way back, so every press left `aria-expanded="true"` for the
 * rest of the page's life. The heart is rendered before the panel it opens, so position is a
 * property of the component's own structure rather than a convenience — and `aria-expanded`,
 * asserted below, is what tells the two apart if that ever stops being true.
 */
function botaoDe(tree: ReactNode): AnyElement {
  const botoes = findAll(tree, 'button')
  expect(
    botoes.length,
    'the island rendered no <button> at all — the heart is not a control, which is the state ' +
      '003 § CLR-010 recorded and this feature exists to leave behind',
  ).toBeGreaterThanOrEqual(1)
  const coracao = botoes[0] as AnyElement
  expect(
    'aria-expanded' in coracao.props,
    'the first <button> is not the heart: it carries no `aria-expanded`, so either the panel ' +
      'now renders before the control that opens it, or the press below is about to be made ' +
      'against the close button and would prove nothing',
  ).toBe(true)
  return coracao
}

/** The island the first card of a listing was given, as the page built it. */
function ilhaDe(tree: ReactNode): AnyElement {
  const curtir = findAll(tree, CardProjeto)[0]?.props.curtir
  expect(
    isValidElement(curtir) && (curtir as AnyElement).type === LikeButton,
    'the first card carries no `LikeButton` in its `curtir` slot, so there is no press to make ' +
      'and every assertion about the count after one would pass vacuously (T003, FR-025)',
  ).toBe(true)
  return curtir as AnyElement
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('§1 — the count reaches the HTML a visitor is sent (FR-025, US7)', () => {
  it('prints each card’s own count, from the reader’s own document', async () => {
    const tree = await renderListagem(ProjetosPage, comContagens(PROJETO, [32, 7, 108]))

    // Read out of rendered HTML, not off props: between `props.curtidas` and the screen sit the
    // island's branch and the card slot, and a tree walk cannot see through either.
    expect(
      contagensDe(markupOf(tree)),
      'the counts a visitor is actually sent. An empty array means no ♥ reached the markup at ' +
        'all — the card lost its counter to the island — and a repeated number means one ' +
        'document’s count was printed on every card.',
    ).toEqual([32, 7, 108])
  })

  it('sends no invitation until the visitor asks for one', async () => {
    const markup = markupOf(await renderListagem(ProjetosPage, [PROJETO]))

    expect(
      textoDe(markup),
      'rendered up front, the invitation is an advert on every card of every listing — and it ' +
        'is the answer to a press, which the server has not seen yet',
    ).not.toContain(MICROCOPY)
    expect(markup).toContain('aria-expanded="false"')
  })
})

describe('§2 — the press opens the invitation and leaves the number alone (FR-025, US7)', () => {
  it('shows the same count before and after the visitor presses the heart', async () => {
    const ilha = ilhaDe(await renderListagem(ProjetosPage, [PROJETO]))
    const store = new FakeHookStore()

    const antes = markupOf(renderIlha(ilha, store))
    const primeiro = renderIlha(ilha, store)
    // The handler the emitted tree carries — not one this test built.
    ;(botaoDe(primeiro).props.onClick as () => void)()
    const depois = markupOf(renderIlha(ilha, store))

    expect(contagensDe(antes), 'the heart printed no number before the press').toEqual([32])
    expect(
      contagensDe(depois),
      'the count moved under a visitor who has no account to record a like against, and no way ' +
        'to undo the impression that one happened (US7: “the count they saw does not change”)',
    ).toEqual([32])
    expect(
      textoDe(depois),
      'the press must answer with the invitation `projetos.md` § Deslogado fixes; a press that ' +
        'changes nothing on screen is the state feature 003 shipped and CLR-010 deferred here',
    ).toContain(MICROCOPY)
    expect(depois).toContain(CRIAR_CONTA)
  })

  it('leaves the accessible name naming the server’s count, once opened', async () => {
    const ilha = ilhaDe(await renderListagem(ProjetosPage, [PROJETO]))
    const store = new FakeHookStore()

    ;(botaoDe(renderIlha(ilha, store)).props.onClick as () => void)()
    const rotulo = String(botaoDe(renderIlha(ilha, store)).props['aria-label'])

    // "♥ 32" announced alone is "black heart suit, 32": a number with no noun. The name is the
    // only place a screen-reader user is told the count, so it must not drift from the screen.
    expect(rotulo).toContain('32')
    expect(rotulo).toContain(MICROCOPY)
  })
})


/**
 * Every public listing that draws a heart, with the documents its own reader returns.
 *
 * This table **is** the requirement. `scripts/lcp-budget.sh` § PAGES is the canonical list of
 * public pages — `/ /projetos /artigos /aulas /biblioteca-3d /calendario` — and all six draw a
 * card with a count on it. A seventh listing means a seventh row here; that is the point of
 * writing it as data rather than as six hand-written cases.
 *
 * The counts differ per row and differ within a row, so a page that printed one document's
 * number on every card, or that printed another page's fixture, cannot pass by coincidence.
 */
const LISTAGENS: readonly {
  readonly rota: string
  readonly contagens: readonly number[]
  readonly render: (contagens: readonly number[]) => Promise<ReactNode>
}[] = [
  {
    rota: '/',
    contagens: [32, 28, 11],
    render: (c) => renderHome(comContagens(PROJETO, c)),
  },
  {
    rota: '/projetos',
    contagens: [32, 7, 108],
    render: (c) => renderListagem(ProjetosPage, comContagens(PROJETO, c)),
  },
  {
    rota: '/artigos',
    contagens: [24, 3, 91],
    render: (c) => renderListagem(ArtigosPage, comContagens(ARTIGO, c)),
  },
  {
    rota: '/aulas',
    contagens: [42, 5, 77],
    render: (c) => renderListagem(AulasPage, comContagens(AULA, c)),
  },
  {
    rota: '/biblioteca-3d',
    contagens: [42, 16, 4],
    render: (c) => renderListagem(BibliotecaPage, comContagens(MODELO, c)),
  },
  {
    rota: '/calendario',
    contagens: [7, 19, 2],
    render: (c) => renderCalendario(comContagens(EVENTO, c)),
  },
]

describe('§3 — every listing that draws a heart hands it the island (FR-025, US7)', () => {
  it.each(LISTAGENS)('$rota gives one island per card', async ({ rota, contagens, render }) => {
    const tree = await render(contagens)

    expect(
      findAllDeep(tree, LikeButton),
      `${rota} draws a heart on every card and supplied an island for ${String(
        findAllDeep(tree, LikeButton).length,
      )} of ${String(contagens.length)} of them. US7 is scoped to "any card that shows a heart": ` +
        'a press that opens the invitation on one listing and does nothing on this one is the ' +
        'half-shipped control 003 § CLR-010 moved into this feature, not a per-page decision. ' +
        'If this listing is now meant to keep a static heart, that belongs in tasks.md as a ' +
        'recorded decision and this row comes out — silence here reads as an omission because ' +
        'the last three times, it was one.',
    ).toHaveLength(contagens.length)
  })

  it.each(LISTAGENS)('$rota prints each card’s own count', async ({ rota, contagens, render }) => {
    const markup = markupOf(await render(contagens))

    expect(
      contagensDe(markup),
      `the counts ${rota} actually sends a visitor. An empty array means no ♥ reached the ` +
        'markup at all — the count was lost moving into the island — and a repeated number ' +
        'means one document’s count was printed on every card.',
    ).toEqual([...contagens])
  })

  it.each(LISTAGENS)('$rota sends no invitation up front', async ({ contagens, render }) => {
    const markup = markupOf(await render(contagens))

    expect(
      textoDe(markup),
      'rendered up front, the invitation is an advert on every card of every listing — and it ' +
        'is the answer to a press, which the server has not seen yet',
    ).not.toContain(MICROCOPY)
  })
})

describe('§4 — a card given no island still prints its own count (SC-012)', () => {
  it('renders the ♥ and the number when the `curtir` slot is empty', () => {
    const markup = markupOf(
      CardProjeto({
        titulo: PROJETO.titulo,
        descricao: PROJETO.descricaoCurta,
        categoria: 'Impressão 3D',
        href: '/projetos/luminaria-parametrica',
        capa: null,
        autor: { nome: 'Fab Lab', handle: 'fablab', nivel: 1 },
        curtidas: 32,
      }),
    )

    // Against the component, not against a page that happens to supply no island today. The
    // static counter is what every future surface falls back to — a ranking table, an e-mail
    // digest, a card in a feature nobody has written yet — and its correctness must not depend
    // on which listings §3 currently enumerates.
    expect(
      contagensDe(markup),
      '`CardProjeto` lost its own counter to the island. Every consumer that supplies no ' +
        '`curtir` would silently stop showing the count, and FR-015’s first clause — "the ' +
        'count is shown to everyone" — would hold only where an island happens to be passed.',
    ).toEqual([32])
  })
})
