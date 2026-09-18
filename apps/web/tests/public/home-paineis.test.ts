import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CardProjeto,
  EmptyState,
  type EmptyStateProps,
  LOGIN_HREF,
  ProgressBar,
  formatHandle,
} from '@fablab/ui'

import {
  ETAPAS_DA_MISSAO,
  type EstadoPessoal,
  type SubmissaoDoc,
} from '../../lib/content/missoes'
import type { MissaoIdentificada } from '../../lib/public/missoes'
import type { FindArgs } from '../../lib/tenancy/client'
import { TenantUnresolvedError } from '../../lib/tenancy/errors'
import type { RankingRow } from '../../lib/tenancy/public-payload'

/**
 * T020 / FR-004, FR-005, FR-011 — the Home's gamified panels, starting with the band's query.
 *
 * This file is the panels' suite: § 1 owns `MISSÕES EM DESTAQUE`'s **read**, before anything
 * draws it. What the band renders is T021's, the personal percentages are T022's, and the
 * failed/empty states are T027's — each arrives as its own section here.
 *
 * ── Why the QUERY is asserted rather than the three cards ───────────────────────────────────
 *
 * Every one of this task's four decisions is invisible in the rendered tree against a fixture
 * that satisfies them all, and each of them fails *silently* in production:
 *
 *   * **`where` carrying only `destaqueHome`.** `missao` is in the publishable set, so the
 *     public door AND-s `status = publicado` onto whatever the caller passes — CLR-004's
 *     "curation does not publish" enforced by the mechanism (research.md). A band that spelled
 *     the status clause itself would render identically today and drift from the door the day
 *     the published vocabulary changes; a band that read through a session client instead would
 *     render identically for a signed-in maker and show drafts.
 *   * **`sort` as an ARRAY.** `'ordemDestaque,titulo'` is the REST-only comma form:
 *     `buildOrderBy` wraps the whole string, resolves no column, swallows the failure in a bare
 *     catch and leaves the unconditional `-createdAt` (see `FindArgs['sort']`, measured on
 *     `/ranking`). It orders by **neither** key, silently — and a fixture of three missions
 *     comes back in *some* order either way, so only the argument distinguishes them.
 *   * **`limit` at three.** FR-004's bound. A missing limit renders the page size, which on a
 *     lab with four featured missions is a fourth card and on a fixture of three is nothing.
 *
 * ── Why the tree is walked rather than rendered ─────────────────────────────────────────────
 *
 * The instrument every page suite here uses (`home.test.ts`, `missoes-page.test.ts`): no DOM at
 * `node`, so the page is an async function returning a plain object, and its reads are observed
 * through the fake client the mocked door hands it.
 */

/** Three missions the team has marked for the Home, as `depth: 1` populates them. */
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
  {
    id: 3,
    titulo: 'Bordado Digital',
    descricao: 'Personalize uma peça de tecido com bordado digital.',
    icone: { id: 92, url: '/media/bordado.svg' },
    ordemDestaque: 3,
    destaqueHome: true,
  },
]

/**
 * The anonymous door's client, recording what it was asked for.
 *
 * It answers `missao` and nothing else, so a read aimed at another collection is visible as an
 * empty result rather than as this fixture served to whoever asked.
 */
class FakePublicClient {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'

  constructor(private readonly missoes: readonly unknown[] = MISSOES_EM_DESTAQUE) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    const docs = (args.collection === 'missao' ? this.missoes : []) as T[]
    return { docs, totalDocs: docs.length }
  }

  findByID = async <T>(): Promise<T | null> => null

  paraColecao(collection: string): FindArgs[] {
    return this.calls.filter((call) => call.collection === collection)
  }
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
    listPublic: vi.fn(),
    getPublicScopedPayloadForRSC: vi.fn(),
    /** The board's reader (T024). It defaults to a FAILED read — the state §1, §2 and §3 are
     *  already written against, where the ranking card is absent — so only §4 pays for a board
     *  and no section above it changes shape by this mock existing. */
    readPublicRanking: vi.fn<(limite: number) => Promise<RankingRow[] | null>>(async () => null),
    /** The personal overlay's one reader (T022). It defaults to the state a visitor with no
     *  session is in, so §1 and §2 — neither of which is about the session — keep answering the
     *  question they were written about instead of falling through to `next/headers`. */
    estadoPessoal: vi.fn<(missoes: readonly MissaoIdentificada[]) => Promise<EstadoPessoal>>(
      async () => ({ tipo: 'anonimo' }),
    ),
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
}))

/** The RSC half of the mission model (T017). Mocked rather than driven through a fake session,
 *  because §3 is about what the BAND does with each of the four states — that the reader itself
 *  builds the `maker` constraint from the session is `missoes-reader.test.ts`'s assertion and is
 *  not re-proved here. */
vi.mock('../../lib/public/missoes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/public/missoes')>()),
  estadoPessoal: mocks.estadoPessoal,
}))

const { default: HomePage } = (await import('../../app/(frontend)/page')) as {
  default: () => Promise<ReactElement>
}

/** The Home's other read, which this section is not about: it succeeds and returns nothing, so
 *  no case here can pass or fail on the carousel. */
const semProjetos = { docs: [], totalDocs: 0, page: 1, totalPages: 1 }

describe('§1 — MISSÕES EM DESTAQUE: the band’s query (T020, FR-004, FR-005, FR-011)', () => {
  let porta: FakePublicClient

  beforeEach(() => {
    vi.clearAllMocks()
    porta = new FakePublicClient()
    mocks.listPublic.mockResolvedValue(semProjetos)
    mocks.getPublicScopedPayloadForRSC.mockResolvedValue(porta)
  })

  /** The single `missao` read the band issues — and the assertion that there is exactly one. */
  async function leituraDaBanda(): Promise<FindArgs> {
    await HomePage()
    const leituras = porta.paraColecao('missao')
    expect(
      leituras.length,
      `the Home issued ${leituras.length} read(s) of \`missao\` through the public door; the band is exactly one`,
    ).toBe(1)
    return leituras[0] as FindArgs
  }

  it('reads the band through the ANONYMOUS door, not a session client (FR-005)', async () => {
    await HomePage()

    expect(mocks.getPublicScopedPayloadForRSC).toHaveBeenCalled()
    expect(porta.paraColecao('missao')).toHaveLength(1)
  })

  it('filters on `destaqueHome` alone — the door owns the status clause (FR-005, CLR-004)', async () => {
    const leitura = await leituraDaBanda()

    // Exact, not "contains": a `status` clause spelled here is the curation deciding what is
    // published, which is the one thing CLR-004 says it must not do.
    expect(leitura.where).toEqual({ destaqueHome: { equals: true } })
  })

  it('sorts by `ordemDestaque` then `titulo`, as an ARRAY (FR-003)', async () => {
    const leitura = await leituraDaBanda()

    expect(
      Array.isArray(leitura.sort),
      `sort was ${JSON.stringify(leitura.sort)}; the comma form is REST-only and orders by neither key on the local API`,
    ).toBe(true)
    expect(leitura.sort).toEqual(['ordemDestaque', 'titulo'])
  })

  it('asks for at most three missions (FR-004)', async () => {
    const leitura = await leituraDaBanda()

    expect(leitura.limit).toBe(3)
  })
})

/**
 * ── The instrument for §2: the tree is walked, not rendered ─────────────────────────────────
 *
 * The same three helpers `home.test.ts` uses, and for the same reason: the suite runs at `node`
 * with no DOM, so `HomePage()` returns a plain React element and what it composed is read off
 * that object. `findAll` matches on `type` **identity**, which is what proves the page mounted
 * the library's real `ProgressBar` rather than something that merely looks like one.
 */
type QualquerElemento = ReactElement<{
  readonly children?: ReactNode
  readonly [key: string]: unknown
}>

const ehElemento = (node: unknown): node is QualquerElemento =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

function findAll(node: ReactNode, type: unknown): QualquerElemento[] {
  if (Array.isArray(node)) return node.flatMap((filho) => findAll(filho, type))
  if (!ehElemento(node)) return []
  const aqui = node.type === type ? [node] : []
  return [...aqui, ...findAll((node.props.children ?? null) as ReactNode, type)]
}

/** Every string in the subtree, joined — what a reader sees, ignoring the markup around it. */
function textoDe(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textoDe).join(' ')
  if (!ehElemento(node)) return ''
  return textoDe((node.props.children ?? null) as ReactNode)
}

describe('§2 — MISSÕES EM DESTAQUE: what the band draws (T021, FR-006, FR-011, US6)', () => {
  let porta: FakePublicClient

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listPublic.mockResolvedValue(semProjetos)
  })

  /** The Home, rendered against a lab with these featured missions. */
  async function home(missoes: readonly unknown[] = MISSOES_EM_DESTAQUE): Promise<ReactNode> {
    porta = new FakePublicClient(missoes)
    mocks.getPublicScopedPayloadForRSC.mockResolvedValue(porta)
    return (await HomePage()) as unknown as ReactNode
  }

  /**
   * The band's own `<section>`, found by the heading it carries.
   *
   * Scoped rather than page-wide, because every assertion below is about **this** band: the lab
   * level card (T023) mounts a `ProgressBar` of its own in the same tree, so a page-wide "no
   * bar" assertion would pass today and turn red for a reason that has nothing to do with the
   * band it was written about.
   */
  async function banda(missoes?: readonly unknown[]): Promise<QualquerElemento> {
    const arvore = await home(missoes)
    const secao = findAll(arvore, 'section').find((s) =>
      textoDe(s).includes('MISSÕES EM DESTAQUE'),
    )
    expect(
      secao,
      'the Home renders no MISSÕES EM DESTAQUE section. home.md § *Seção "MISSÕES EM DESTAQUE"* ' +
        'draws it as a grid of three cards under a heading with `VER TODAS ›` beside it, and ' +
        'CLR-004 — the reason it was left out of Home v1 — is satisfied: 005 shipped the tables.',
    ).toBeDefined()
    return secao as QualquerElemento
  }

  /** Every anchor in a subtree, as `[href, text]`. */
  const links = (node: ReactNode): [string, string][] =>
    findAll(node, 'a').map((a) => [String(a.props.href ?? ''), textoDe(a)])

  it('links `VER TODAS ›` to /missoes — the gap that page reported against itself (FR-011, US6)', async () => {
    const [href, rotulo] = links(await banda()).find(([, texto]) => texto.includes('VER TODAS')) ?? [
      '',
      '',
    ]

    expect(
      rotulo,
      'the band has no `VER TODAS ›` control. CLR-009 refuses a seventh tab and names this link ' +
        'as the way into /missoes — which, since 005, has been reachable only by typing its URL.',
    ).toContain('VER TODAS')
    expect(href).toBe('/missoes')
  })

  it('draws every featured mission’s title and description (FR-006)', async () => {
    const texto = textoDe(await banda())

    for (const missao of MISSOES_EM_DESTAQUE) {
      expect(texto).toContain(missao.titulo)
      expect(texto).toContain(missao.descricao)
    }
  })

  it('draws each mission’s icon as decorative art at its populated URL (FR-006)', async () => {
    const icones = findAll(await banda(), 'img')

    expect(icones.map((img) => String(img.props.src ?? ''))).toEqual(
      MISSOES_EM_DESTAQUE.map((missao) => missao.icone.url),
    )
    // `alt=""`: the title is real text directly beside it, so a described icon makes a screen
    // reader announce the mission twice — the rule `/missoes` already applies to the same art.
    for (const img of icones) expect(img.props.alt).toBe('')
  })

  it('shows a signed-out visitor no bar and no percentage at all (FR-009, CLR-002)', async () => {
    const secao = await banda()

    expect(
      findAll(secao, ProgressBar),
      'the band mounted a ProgressBar for a visitor with no session. CLR-002: *"a signed-out ' +
        'visitor sees the mission card with no progress bar value — not a bar at 0%"*, because ' +
        '0% is a claim about a person the page has not identified.',
    ).toEqual([])
    expect(textoDe(secao)).not.toContain('%')
  })

  it('keeps `VER TODAS ›` when the lab has nothing featured — US6’s own edge', async () => {
    const vazia = await banda([])

    expect(links(vazia).map(([href]) => href)).toContain('/missoes')
  })
})

/**
 * ── §3: the personal overlay (T022, FR-008, FR-009, FR-010, CLR-002, CLR-013, SC-023) ───────
 *
 * The band is public and the percentages are not: every bar on it is a statement about one
 * particular person, so the four states of {@link EstadoPessoal} are four different cards and
 * three of them draw no bar at all. The cases below are written against the two that are easy
 * to conflate:
 *
 *   * **`anonimo` draws no bar and no percentage** (CLR-002) — *"0% is a claim about a person
 *     the page has not identified"* — and gets the invitation in the place the percentage would
 *     have occupied (FR-009).
 *   * **`indisponivel` draws no bar either, and must NOT be silent about it** (CLR-013,
 *     SC-023). Rendered without a word it is character-for-character the signed-out card, and a
 *     signed-in maker reads that as having been logged out. It also gets no invitation: asking
 *     a signed-in person to sign in is a loop they cannot leave.
 *
 * The values are asserted in the shared model's units — `value`/`max` against
 * {@link ETAPAS_DA_MISSAO}, never a percentage — because `ProgressBar` owns the one rounding
 * and a literal `50` here would be this file re-expressing FR-007's curve.
 */
describe('§3 — MISSÕES EM DESTAQUE: the personal overlay (T022, FR-008, FR-009, FR-010)', () => {
  let porta: FakePublicClient

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listPublic.mockResolvedValue(semProjetos)
  })

  /** The band as it is drawn for one particular visitor. */
  async function bandaPara(visitante: EstadoPessoal): Promise<QualquerElemento> {
    mocks.estadoPessoal.mockResolvedValue(visitante)
    porta = new FakePublicClient()
    mocks.getPublicScopedPayloadForRSC.mockResolvedValue(porta)

    const arvore = (await HomePage()) as unknown as ReactNode
    const secao = findAll(arvore, 'section').find((s) => textoDe(s).includes('MISSÕES EM DESTAQUE'))
    expect(secao, 'the Home renders no MISSÕES EM DESTAQUE section').toBeDefined()
    return secao as QualquerElemento
  }

  /** A signed-in maker of this lab, with the submissions they actually have. */
  const maker = (submissoes: Record<string, SubmissaoDoc>): EstadoPessoal => ({
    tipo: 'maker',
    submissoes: new Map(Object.entries(submissoes)),
  })

  /** Every paragraph's text in a subtree — where a card's words live, as opposed to its bar. */
  const paragrafos = (secao: ReactNode): string[] => findAll(secao, 'p').map(textoDe)

  it('asks the personal reader about the missions ON SCREEN, and only those (FR-008)', async () => {
    await bandaPara({ tipo: 'anonimo' })

    expect(
      mocks.estadoPessoal,
      'the band drew its cards without consulting `estadoPessoal` — the one reader that knows ' +
        'who is reading. A percentage computed from anything else is a claim about somebody else.',
    ).toHaveBeenCalledTimes(1)
    const [missoes = []] = mocks.estadoPessoal.mock.calls[0] ?? []
    expect(missoes.map((missao) => missao.id)).toEqual(MISSOES_EM_DESTAQUE.map((m) => m.id))
  })

  it('draws the signed-in maker’s OWN two-step progress, in the model’s units (FR-007, FR-008)', async () => {
    const secao = await bandaPara(
      maker({
        // Mission 1 awaits review — one of the two steps. Mission 2 is approved — both. Mission
        // 3 has no row at all, which is a real state and not a missing one.
        '1': { id: 11, missao: 1, status: 'enviada' },
        '2': { id: 12, missao: 2, status: 'aprovada' },
      }),
    )

    const barras = findAll(secao, ProgressBar)
    expect(
      barras.map((barra) => barra.props.value),
      'the bars did not read the maker’s own submissions: one awaiting review, one approved, ' +
        'one never sent.',
    ).toEqual([1, ETAPAS_DA_MISSAO, 0])
    for (const barra of barras) expect(barra.props.max).toBe(ETAPAS_DA_MISSAO)
  })

  it('gives a signed-out visitor no percentage and the invitation instead (FR-009, CLR-002)', async () => {
    const secao = await bandaPara({ tipo: 'anonimo' })

    expect(findAll(secao, ProgressBar)).toEqual([])
    expect(textoDe(secao)).not.toContain('%')
    expect(
      findAll(secao, 'a').map((a) => String(a.props.href ?? '')),
      'CLR-002: the invitation to sign in takes the place the percentage would have occupied, ' +
        'and FR-009 owes a signed-out visitor exactly that.',
    ).toContain(LOGIN_HREF)
  })

  it('keeps the band when the personal read FAILED — the cards, without the bars (FR-010)', async () => {
    const secao = await bandaPara({ tipo: 'indisponivel' })

    for (const missao of MISSOES_EM_DESTAQUE) expect(textoDe(secao)).toContain(missao.titulo)
    expect(
      findAll(secao, ProgressBar),
      'a failed personal read must cost the percentages, never the band (FR-010) — and a bar ' +
        'drawn anyway would be a claim about a maker whose progress is precisely what failed to load.',
    ).toEqual([])
  })

  it('SAYS the personal progress failed, in words a signed-out visitor never sees (CLR-013, SC-023)', async () => {
    const deslogado = textoDe(await bandaPara({ tipo: 'anonimo' }))
    const falhou = await bandaPara({ tipo: 'indisponivel' })

    const aviso = paragrafos(falhou).find((texto) => texto !== '' && !deslogado.includes(texto))
    expect(
      aviso,
      'the failed personal read rendered nothing a signed-out visitor does not also see, which ' +
        'is character-for-character the signed-out card (CLR-013) — a signed-in maker reads that ' +
        'as having been logged out. SC-023 asks for wording of its own.',
    ).toBeDefined()
    expect(aviso).toMatch(/progresso/i)
    expect(
      findAll(falhou, 'a').map((a) => String(a.props.href ?? '')),
      'the failed state offered the sign-in invitation. The reader IS signed in — inviting them ' +
        'to sign in is a loop they cannot leave.',
    ).not.toContain(LOGIN_HREF)
  })

  it('shows a login with no profile in THIS lab no bar and no invitation either', async () => {
    // 002 § CLR-002 allows a login to hold a profile in one lab and none in another. There is no
    // progress of theirs here, and there is nothing to sign in to.
    const secao = await bandaPara({ tipo: 'sem-perfil' })

    expect(findAll(secao, ProgressBar)).toEqual([])
    expect(findAll(secao, 'a').map((a) => String(a.props.href ?? ''))).not.toContain(LOGIN_HREF)
  })
})

/**
 * ── §4: CLR-007 — no maker is a link, on either card (T025, FR-035, SC-019) ──────────────────
 *
 * `home.md` (PO, 2026-08-24) draws both the ranking rows and the carousel's authorship as
 * clickable, leading to the public maker profile, and marks that page *"spec futura, junto das
 * features 004/005"*. Neither 004 nor 005 shipped it, and CLR-007 decides 006 does not either:
 * **an unlinked row is a smaller product; a link to a 404 is a broken one.**
 *
 * Why the ABSENCE is worth a test. The anchors are the mockup's own reading of the design, so
 * building either card from `home.md` alone produces them — and both render identically to the
 * unlinked version until somebody presses one. There is nothing to notice in a screenshot and
 * nothing to notice in a review diff that did not open the mockup. SC-019 asks for the absence
 * asserted *"so CLR-007 cannot be half-undone"*, and half is exactly the state this product is
 * at risk of: the two bylines live in **different packages** — the row is this page's, the
 * authorship is `CardProjeto`'s — so one can grow an anchor while the other does not.
 *
 * ── Why the card is INVOKED here rather than walked out of the page ──────────────────────────
 *
 * The author strip is composed inside `CardProjeto` (`packages/ui`); the page hands it `autor`
 * as plain data. `findAll` walks `props.children`, so the page's tree stops at the
 * `CardProjeto` *element* and an anchor inside the strip is invisible from here — a test that
 * only walked the page would report FR-035's second half as satisfied no matter what the card
 * draws. So the element the page built is rendered by calling the component with the props the
 * page gave it: one assertion that stays red whichever of the two files grows the anchor.
 */

/** Five makers as `readPublicRanking` returns them — already in the board's order (FR-021). */
const BOARD: readonly RankingRow[] = [
  { id: 11, nome: 'Ana Souza', handle: 'ana.souza', xpTotal: 2450, nivel: 7, avatarRender: null },
  { id: 12, nome: 'Bruno Lima', handle: 'bruno.lima', xpTotal: 1980, nivel: 6, avatarRender: null },
  {
    id: 13,
    nome: 'Carla Dias',
    handle: 'carla.dias',
    xpTotal: 1720,
    nivel: 6,
    // A composed render, populated: `MidiaDoc` is the URL and nothing else, because that is
    // all the row is allowed to fetch (CAMPOS_DO_RANKING).
    avatarRender: { url: '/media/carla.png' },
  },
  { id: 14, nome: 'Diego Reis', handle: 'diego.reis', xpTotal: 1100, nivel: 4, avatarRender: null },
  { id: 15, nome: 'Elisa Moraes', handle: 'elisa.moraes', xpTotal: 640, nivel: 3, avatarRender: null },
]

/** One published project with a living author — the card the carousel draws, and the only
 *  shape in which an authorship exists at all (a tombstone has no identity to link). */
const PROJETO_COM_AUTOR = {
  titulo: 'Luminária paramétrica',
  slug: 'luminaria-parametrica',
  descricaoCurta: 'Luminária decorativa impressa em 3D.',
  categoria: { nome: 'Impressão 3D' },
  imagemCapa: { id: 70, url: '/media/luminaria.png' },
  autor: { nome: 'Maria Silva', handle: 'maria.silva', nivel: 7 },
  curtidas: 32,
}

describe('§4 — CLR-007: neither card links a maker (T025, FR-035, SC-019)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.estadoPessoal.mockResolvedValue({ tipo: 'anonimo' })
    mocks.listPublic.mockResolvedValue({
      docs: [PROJETO_COM_AUTOR],
      totalDocs: 1,
      page: 1,
      totalPages: 1,
    })
    mocks.readPublicRanking.mockResolvedValue([...BOARD])
    mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakePublicClient())
  })

  /** The section a heading names, out of the page the Home returns. */
  async function secaoChamada(titulo: string): Promise<QualquerElemento> {
    const arvore = (await HomePage()) as unknown as ReactNode
    const secao = findAll(arvore, 'section').find((s) => textoDe(s).includes(titulo))
    expect(secao, `the Home renders no ${titulo} section`).toBeDefined()
    return secao as QualquerElemento
  }

  it('draws every ranking row as plain text, never as an anchor (FR-035, SC-019)', async () => {
    const linhas = findAll(await secaoChamada('RANKING MAKERS'), 'li')

    expect(linhas, 'the ranking card drew no rows, so this case asserted nothing').toHaveLength(
      BOARD.length,
    )
    linhas.forEach((linha, indice) => {
      expect(
        findAll(linha, 'a').map((a) => String(a.props.href ?? '')),
        `row ${indice + 1} (${String(BOARD[indice]?.nome)}) is an anchor. CLR-007 defers the ` +
          'public maker profile to a later spec, so the destination does not exist: the href ' +
          'above is a 404 this product serves to anyone who clicks the ranking.',
      ).toEqual([])
    })
  })

  it('leaves `VER RANKING COMPLETO` the ranking card’s one and only link (FR-020, FR-035)', async () => {
    const ancoras = findAll(await secaoChamada('RANKING MAKERS'), 'a')

    // Exact, not "no anchor inside an <li>": a row linked *around* its element — the whole
    // place wrapped rather than the name — is the same broken destination and would sit
    // outside the per-row check above.
    expect(
      ancoras.map((a) => textoDe(a).trim()),
      'the ranking card carries a link that is not its footer. The card has exactly one ' +
        'destination this product serves — the board itself (FR-020).',
    ).toHaveLength(1)
    expect(textoDe(ancoras[0] as ReactElement)).toContain('VER RANKING COMPLETO')
    for (const maker of BOARD) {
      expect(textoDe(ancoras[0] as ReactElement)).not.toContain(String(maker.nome))
    }
  })

  it('draws the project card’s authorship as plain text, never as an anchor (FR-035, SC-019)', async () => {
    const cartoes = findAll(await secaoChamada('ÚLTIMOS PROJETOS'), CardProjeto)
    expect(cartoes, 'the carousel drew no CardProjeto, so this case asserted nothing').toHaveLength(
      1,
    )

    // The strip is composed inside the component; see the header note.
    const render = (cartoes[0] as QualquerElemento).type as (props: unknown) => ReactElement
    const cartao = render((cartoes[0] as QualquerElemento).props) as unknown as ReactNode

    const { nome, handle, nivel } = PROJETO_COM_AUTOR.autor
    const identidade = [nome, formatHandle(handle), `Nível ${nivel}`]
    expect(
      textoDe(cartao),
      'the card drew no authorship at all, so the absence of a link below proves nothing',
    ).toContain(nome)

    for (const ancora of findAll(cartao, 'a')) {
      for (const parte of identidade) {
        expect(
          textoDe(ancora),
          `the card links the maker’s ${parte} to ${String(ancora.props.href ?? '')}. ` +
            'CLR-007: the public maker profile is a later spec and that route is not served.',
        ).not.toContain(parte)
      }
      expect(
        String(ancora.props.href ?? ''),
        'the card carries a destination that is not the project’s own page.',
      ).toContain(PROJETO_COM_AUTOR.slug)
    }
  })
})

/**
 * ── §5: US7 — one block down, three still standing (T029, FR-023) ────────────────────────────
 *
 * `home-desfechos.test.ts` (T027) asked each block, one at a time, whether it draws the right
 * body for data, `[]` and `null`. This section asks the question that file structurally cannot:
 * **what the OTHER three blocks are doing while one of them is failing.** Every case there runs
 * with the lab card already in its error state — that file supplies no session door — so a page
 * that failed all four together would satisfy it completely.
 *
 * That is not a hypothetical shape. The four reads sit in one function, one after another, and
 * the ways they stop being independent are ordinary edits: a `Promise.all` whose members are the
 * *readers' promises* rather than the readers' caught results, a `catch` lifted out of a reader
 * into the page, a reader that stops catching. Each of those renders four error cards from one
 * broken table — which is FR-023 inverted and, on this page, CLR-004's own failure mode: a
 * visitor reads a lab that has nothing rather than a lab whose ranking is down.
 *
 * So each case below breaks exactly one block **at its own source** — the door throws, the lab
 * has no `regrasXp` row, the board reader answers `null`, the listing rejects — and then asserts
 * the whole page: the broken block carries *"Não foi possível carregar"* with `Tentar novamente`
 * (FR-023), and each of the other three carries **its own data** and no error body at all.
 * Asserting the data rather than the section's presence is the point: a heading over a silence
 * is what a block reduced to collateral damage actually looks like.
 *
 * The four cases were *checked against a mutant* before being trusted, the way `page.mutcheck.tsx`
 * checks the ranking's: with one `caiu = projetos === null || … || ranking === null` in `HomePage`
 * feeding `null` to all four renders — the collapse described above, spelled out — all four go
 * red, and all four go green again the moment it is removed.
 *
 * ── Why this section mocks `lib/tenancy` where §1–§4 do not ──────────────────────────────────
 *
 * The lab card is one of the four blocks, and its reader goes through the *session* door, which
 * calls `next/headers` and throws outside a request scope. Left alone it is permanently in its
 * error state here — fine for the sections above, which are about the band, and useless for a
 * section whose subject is a block RENDERING while another fails. The `vi.mock` and its
 * `vi.hoisted` companion sit beside this section rather than up in the preamble: phase 4 has
 * several implementers writing into this file at once, Vitest hoists both above the imports
 * wherever they are written, and a block that reads next to the only section it serves is one
 * fewer edit landing in a region someone else is rewriting.
 */

/** The session door, mocked as `home-nivel-lab.test.ts` mocks it and for the same reason. */
const portaDaSessao = vi.hoisted(() => ({ getTenantScopedPayloadForRSC: vi.fn() }))

vi.mock('../../lib/tenancy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy')>()),
  getTenantScopedPayloadForRSC: portaDaSessao.getTenantScopedPayloadForRSC,
}))

/** This lab retuned its economy: nothing here is the CITe seed `{ 1, 5, 10 }`, so a card that
 *  carried the curve in its own source could not produce the level and the bar below. */
const REGRAS_DO_LAB = { xpPorAcao: 3, xpPorNivel: 4, nivelMaximo: 3 }
const LEDGER_DO_LAB = [{ quantidade: 4 }, { quantidade: 3 }, { quantidade: 2 }]

/** Nine XP on that curve: level 2, one XP into a level four wide. */
const NIVEL_DO_LAB = 2
const PROGRESSO_DO_LAB = { atual: 1, de: 4 }

/**
 * The ledger the lab level is summed from — a named fake, as `.claude/rules/code-quality.md`
 * requires, and the same one `home-nivel-lab.test.ts` drives the card through.
 *
 * `regras: null` is this section's *failure* for the lab block: the lab has no `regrasXp` row,
 * `rulesForTenant` throws for it, and that is US4's own error line rather than an exception
 * invented to make a card go red.
 */
class FakeLedgerStore {
  readonly tenantId = 'org-fake'

  constructor(private readonly regras: typeof REGRAS_DO_LAB | null = REGRAS_DO_LAB) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    if (args.collection === 'regrasXp') {
      const docs = (this.regras === null ? [] : [this.regras]) as T[]
      return { docs, totalDocs: docs.length }
    }
    if (args.collection !== 'xpLedger') {
      throw new Error(`the lab level read ${args.collection}, which is not the ledger (FR-012)`)
    }
    const limit = args.limit ?? LEDGER_DO_LAB.length
    const page = args.page ?? 1
    return {
      docs: LEDGER_DO_LAB.slice((page - 1) * limit, page * limit) as T[],
      totalDocs: LEDGER_DO_LAB.length,
    }
  }
}

/** The anonymous door with its `missao` read broken — `null` docs are not a shape the door can
 *  return, so a failed band is a throw, which is the only way `lerMissoesEmDestaque` reaches
 *  `null`. */
class FakePortaQuebrada {
  readonly tenantId = 'org-fake'
  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    if (args.collection === 'missao') throw new Error('missao read failed')
    return { docs: [] as T[], totalDocs: 0 }
  }
  findByID = async <T>(): Promise<T | null> => null
}

/** The four blocks, by the heading each one draws. */
const BLOCOS = {
  missoes: 'MISSÕES EM DESTAQUE',
  nivel: 'NÍVEL DO LAB',
  ranking: 'RANKING MAKERS',
  projetos: 'ÚLTIMOS PROJETOS',
} as const

type Bloco = keyof typeof BLOCOS

const UM_PROJETO = { docs: [PROJETO_COM_AUTOR], totalDocs: 1, page: 1, totalPages: 1 }

describe('§5 — one block down, three still standing (T029, FR-023, US7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.estadoPessoal.mockResolvedValue({ tipo: 'anonimo' })
  })

  /** The Home with every block reading data, except this one, broken at its own source. */
  async function homeComFalhaEm(quebrado: Bloco): Promise<ReactNode> {
    mocks.getPublicScopedPayloadForRSC.mockResolvedValue(
      quebrado === 'missoes' ? new FakePortaQuebrada() : new FakePublicClient(),
    )
    portaDaSessao.getTenantScopedPayloadForRSC.mockResolvedValue(
      new FakeLedgerStore(quebrado === 'nivel' ? null : REGRAS_DO_LAB),
    )
    mocks.readPublicRanking.mockResolvedValue(quebrado === 'ranking' ? null : [...BOARD])
    if (quebrado === 'projetos') {
      mocks.listPublic.mockRejectedValue(new Error('projeto read failed'))
    } else {
      mocks.listPublic.mockResolvedValue(UM_PROJETO)
    }
    return (await HomePage()) as unknown as ReactNode
  }

  /** The `<section>` a heading names — reported as the block vanishing, which is the failure
   *  this section is about, rather than as `undefined` three lines later. */
  function secaoDoBloco(arvore: ReactNode, bloco: Bloco): QualquerElemento {
    const encontrada = findAll(arvore, 'section').find((s) => textoDe(s).includes(BLOCOS[bloco]))
    expect(
      encontrada,
      `the Home renders no ${BLOCOS[bloco]} section at all. FR-023 costs a failed read its own ` +
        'block and nothing else; a block that disappears because a neighbour failed is the ' +
        'page reading as a product that does not have it.',
    ).toBeDefined()
    return encontrada as QualquerElemento
  }

  /** Every failed body in a subtree, as the props the block handed `EmptyState` — matched on the
   *  component's identity, because at `node` its wording lives in props and not in children. */
  const errosEm = (node: ReactNode): EmptyStateProps[] =>
    findAll(node, EmptyState)
      .map((el) => el.props as unknown as EmptyStateProps)
      .filter((props) => props.variant === 'erro')

  /** What each surviving block must be showing: its OWN data, not merely its heading. */
  const PROVA_DE_DADOS: Record<Bloco, (secao: QualquerElemento) => void> = {
    missoes: (secao) => {
      for (const missao of MISSOES_EM_DESTAQUE) expect(textoDe(secao)).toContain(missao.titulo)
    },
    nivel: (secao) => {
      const barras = findAll(secao, ProgressBar)
      expect(barras).toHaveLength(1)
      expect([barras[0]?.props.value, barras[0]?.props.max]).toEqual([
        PROGRESSO_DO_LAB.atual,
        PROGRESSO_DO_LAB.de,
      ])
      expect(textoDe(secao)).toMatch(new RegExp(`NÍVEL\\s*0?${NIVEL_DO_LAB}\\b`))
    },
    ranking: (secao) => {
      for (const maker of BOARD) expect(textoDe(secao)).toContain(maker.nome)
    },
    projetos: (secao) => {
      // The card composes its own words inside `packages/ui`, so the page's tree stops at the
      // element and a text assertion here would read an empty string whatever the read
      // returned. What the carousel was handed is the props, and `titulo` is the one that came
      // out of `listPublic` — see §4's header note on the same boundary.
      const cartoes = findAll(secao, CardProjeto)
      expect(cartoes).toHaveLength(1)
      expect(cartoes[0]?.props.titulo).toBe(PROJETO_COM_AUTOR.titulo)
    },
  }

  /** The whole page, judged against the one block this case broke. */
  function apenasEsteBlocoFalhou(arvore: ReactNode, quebrado: Bloco): void {
    const erros = errosEm(secaoDoBloco(arvore, quebrado))
    expect(
      erros,
      `${BLOCOS[quebrado]} drew ${erros.length} error bodies for a read that failed; FR-023 owes ` +
        'the visitor exactly one.',
    ).toHaveLength(1)
    expect(erros[0]?.titulo).toContain('Não foi possível carregar')
    expect(erros[0]?.acao.label).toBe('Tentar novamente')

    for (const bloco of Object.keys(BLOCOS) as Bloco[]) {
      if (bloco === quebrado) continue
      const secao = secaoDoBloco(arvore, bloco)
      expect(
        errosEm(secao),
        `${BLOCOS[bloco]} is in its error state because ${BLOCOS[quebrado]} failed. The four ` +
          'reads are independent by construction (FR-026) and each reader contains its own ' +
          'failure — a second block going down with the first is one page-level catch, one ' +
          'shared promise, or one reader that stopped catching.',
      ).toEqual([])
      PROVA_DE_DADOS[bloco](secao)
    }
  }

  it('the band down leaves the level, the ranking and the carousel drawing data', async () => {
    apenasEsteBlocoFalhou(await homeComFalhaEm('missoes'), 'missoes')
  })

  it('the lab level down leaves the band, the ranking and the carousel drawing data', async () => {
    apenasEsteBlocoFalhou(await homeComFalhaEm('nivel'), 'nivel')
  })

  it('the ranking down leaves the band, the level and the carousel drawing data', async () => {
    apenasEsteBlocoFalhou(await homeComFalhaEm('ranking'), 'ranking')
  })

  it('the carousel down leaves the band, the level and the ranking drawing data', async () => {
    apenasEsteBlocoFalhou(await homeComFalhaEm('projetos'), 'projetos')
  })
})

/**
 * ── §6: FR-025 — an unresolved host is the SITE's 404, never four error cards (T030, US7) ────
 *
 * §5 proved that a block contains its own failure. This section proves the **one failure a
 * block must not contain**, and the two are each other's opposite: every case above breaks a
 * door with an ordinary `Error` and demands the card; every case below breaks the same door
 * with `TenantUnresolvedError` and demands that no card is drawn at all.
 *
 * ── Why this is a different question from "the read failed" ──────────────────────────────────
 *
 * `TenantUnresolvedError` does not mean a table is down. It means the `Host` header resolves to
 * **no organization** — there is no lab at this address, so there is no Home to render and
 * nothing on it could be true. `layout.tsx` and every listing already answer that with
 * `notFound()`, and US7's error line makes the Home answer it the same way: *"That is not a
 * block-level failure and must not be caught as one."*
 *
 * The failure this guards is one character wide and completely silent. Each of the four readers
 * ends in the same catch:
 *
 *     } catch (erro) {
 *       if (erro instanceof TenantUnresolvedError) notFound()
 *       console.warn(…); return null
 *     }
 *
 * Drop that first line from any one of them — or reorder it below the `return null`, or widen
 * the guard to a bare `catch` — and the page still compiles, every test in §1–§5 still passes,
 * and an unknown host is served **HTTP 200 with a Home on it**: a lab that does not exist,
 * rendering *"Não foi possível carregar"* four times as though its tables were merely down.
 * That page is worse than a 404 in the way that matters to this product — it tells a visitor
 * the lab exists and is broken, and it tells a crawler the address is real.
 *
 * ── Why each door is broken ALONE as well as all four together ───────────────────────────────
 *
 * All four at once is the honest shape of the fault: the host is one request-wide fact, so a
 * host belonging to nobody breaks every door. But a suite that only ever breaks all four cannot
 * tell which reader answered — the first one to throw satisfies it, and the other three may
 * have lost their guard years ago. So each door also fails on its own, against three neighbours
 * holding real data: the page must still 404, because a single door reporting an unresolved
 * host is the same fact as four reporting it, and a block that renders its error card instead
 * has caught precisely what FR-025 forbids catching.
 */

/** A host that resolves to no organization — what `getPublicScopedPayload` throws for when its
 *  `organization` lookup comes back null. */
const HOST_SEM_LAB = 'nenhum-lab.exemplo.br'

/**
 * Every door answering for a lab that exists, except the named one, whose host resolves to no
 * organization at all.
 *
 * `'todas'` is the production shape — the host is one fact and every door reads it — and a
 * single {@link Bloco} is the isolating case described in the header.
 */
function hostSemLabEm(quebrada: Bloco | 'todas'): void {
  const semLab = (bloco: Bloco): boolean => quebrada === 'todas' || quebrada === bloco
  const recusa = (): never => {
    throw new TenantUnresolvedError(HOST_SEM_LAB)
  }

  mocks.getPublicScopedPayloadForRSC.mockImplementation(async () =>
    semLab('missoes') ? recusa() : new FakePublicClient(),
  )
  portaDaSessao.getTenantScopedPayloadForRSC.mockImplementation(async () =>
    semLab('nivel') ? recusa() : new FakeLedgerStore(),
  )
  mocks.readPublicRanking.mockImplementation(async () =>
    semLab('ranking') ? recusa() : [...BOARD],
  )
  mocks.listPublic.mockImplementation(async () => (semLab('projetos') ? recusa() : UM_PROJETO))
}

/** Every failed body in a tree, as the props the block handed `EmptyState` — the error cards a
 *  visitor would have read on a page that should not have been served. */
const errosDaPagina = (node: ReactNode): EmptyStateProps[] =>
  findAll(node, EmptyState)
    .map((el) => el.props as unknown as EmptyStateProps)
    .filter((props) => props.variant === 'erro')

/**
 * The Home, asserted to have answered Next's 404 instead of returning a page.
 *
 * Written as try/catch rather than `rejects` so the failure message can carry **what was
 * rendered** — the count and the wording of the error cards served under HTTP 200 — which is
 * the whole of what FR-025 is about and is invisible in a bare "expected promise to reject".
 */
async function exigeUm404(quando: string): Promise<void> {
  let arvore: ReactNode
  try {
    arvore = (await HomePage()) as unknown as ReactNode
  } catch (erro) {
    expect(
      erro,
      `${quando}: the Home threw something other than Next's 404. A \`TenantUnresolvedError\` ` +
        'that escapes a reader is an HTTP 500 — but an unknown host is not a broken server, it ' +
        'is an address this product does not serve, and only `notFound()` says so (FR-025).',
    ).toBe(mocks.NOT_FOUND)
    expect(
      mocks.notFound,
      `${quando}: the page rejected with Next's 404 sentinel without calling \`notFound()\`.`,
    ).toHaveBeenCalled()
    return
  }

  const titulos = errosDaPagina(arvore).map((props) => String(props.titulo))
  expect.fail(
    `${quando}: the Home RENDERED a page for a host that belongs to no lab, carrying ` +
      `${titulos.length} error card(s) — ${JSON.stringify(titulos)}. FR-025: an unresolved host ` +
      'is a 404 for the whole site and must never be caught as a block failure. A Home drawn ' +
      'here tells a visitor the lab exists and is broken, and tells a crawler the address is real.',
  )
}

describe('§6 — an unresolved host 404s the page (T030, FR-025, US7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.estadoPessoal.mockResolvedValue({ tipo: 'anonimo' })
  })

  it('404s when the host belongs to no lab and every door says so (FR-025, US7)', async () => {
    hostSemLabEm('todas')

    await exigeUm404('every door on a host that belongs to no lab')
  })

  it('never reaches the fifth read — the overlay catches broadly and must not be given the chance (CLR-012)', async () => {
    hostSemLabEm('todas')

    await exigeUm404('every door on a host that belongs to no lab')
    expect(
      mocks.estadoPessoal,
      '`estadoPessoal` was consulted for a host that resolves to no organization. It answers a ' +
        'failed read with `indisponivel` — a broad catch, by design, so one outage costs the ' +
        'percentages instead of the band (FR-010) — and `TenantUnresolvedError` is the one ' +
        'error that must not become a block state (FR-025). The four reads 404 the page before ' +
        'it is reached, and that ordering is the guarantee, not an accident of where the ' +
        '`await` sits.',
    ).not.toHaveBeenCalled()
  })

  for (const [bloco, titulo] of Object.entries(BLOCOS) as [Bloco, string][]) {
    it(`404s when only the ${titulo} door reports an unresolved host (FR-025)`, async () => {
      hostSemLabEm(bloco)

      await exigeUm404(`the ${titulo} door alone on a host that belongs to no lab`)
      expect(
        mocks.notFound,
        `${titulo} reported an unresolved host and the page called \`notFound()\` ` +
          `${mocks.notFound.mock.calls.length} time(s). One reader sees the fact and answers it; ` +
          'a second call is the page re-deciding what a reader already decided.',
      ).toHaveBeenCalledTimes(1)
    })
  }
})

/**
 * ── §7: US8 — the empty states, per block, in the wording `home.md` gives each (T031, FR-024) ─
 *
 * `home-desfechos.test.ts` (T027) asked each block, one at a time, whether `[]` produces the
 * `vazio` body and `null` the failed one. Every case there empties **one** block while its
 * neighbours hold data, and the lab card is permanently in its error state in that file — it
 * supplies no session door. This section asks the two questions that shape cannot reach:
 *
 *   * **What a brand-new lab reads like.** Not one block empty: *all* of them, which is the
 *     state every lab is in on the day it is created and the only state in which the three
 *     sentences are on screen together. That is where they can be compared, and comparing them
 *     is the whole of FR-024 — *"each empty block names its OWN emptiness"*. A block wired to a
 *     neighbour's sentence, or to a shared *"Nada por aqui"*, tells a lab with no missions that
 *     it has no makers; scoped one-block-at-a-time cases each pass while the page as a whole is
 *     wrong.
 *   * **What the FOURTH block does, which is nothing.** CLR-011 gives the lab level two
 *     outcomes rather than three: `nivelDoLab` returns an object or throws, and a lab at level 0
 *     with an empty ledger is a **value**. So the card renders `NÍVEL 00` with an empty bar, and
 *     an `EmptyState` there — of either variant — is the card inventing an answer to *"is this
 *     lab empty enough?"*, a question CLR-011 says no card should be asking. The only file that
 *     can observe this is one that drives the session door, which is this one (see §5).
 *
 * ── Why the empty state's own `acao` is asserted, and not the section's hrefs ────────────────
 *
 * Every one of these blocks draws a catalogue link in its **header** — `VER TODAS ›`,
 * `VER RANKING COMPLETO`, `VER MAIS PROJETOS` — so a section-wide `hrefs(...)` check is already
 * satisfied by the header before the body renders anything at all. The distinction FR-024 turns
 * on lives one level down: an empty block offers a way **onward**, and the failed block offers
 * `Tentar novamente` back to `/`. Wired the other way round, a lab with nothing yet invites its
 * visitor to retry a read that succeeded.
 */

/** The three list blocks, and the sentence `home.md` § *Estados e interações* gives each:
 *  *"sem missões em destaque → …; ranking sem dados → …; sem projetos → …"*. Written from the
 *  document, so a case cannot quietly assert a sentence this file invented. */
const VAZIO_DO_BLOCO = {
  missoes: 'Nenhuma missão ativa no momento',
  ranking: 'Ainda sem makers no ranking',
  projetos: 'Nenhum projeto publicado ainda',
} as const

type BlocoComVazio = keyof typeof VAZIO_DO_BLOCO

/** Where each empty block sends a visitor: its own catalogue, never the retry `/` that belongs
 *  to the state where something actually broke. */
const SAIDA_DO_BLOCO: Record<BlocoComVazio, string> = {
  missoes: '/missoes',
  ranking: '/ranking',
  projetos: '/projetos',
}

/**
 * A lab created minutes ago: its economy configured, and not one XP earned on it.
 *
 * Named and kept separate from {@link FakeLedgerStore} — whose ledger is deliberately non-empty
 * — because the empty ledger is precisely this section's subject, and because §5 is another
 * task's region of this file.
 */
class FakeLabSemXp {
  readonly tenantId = 'org-fake'

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    if (args.collection === 'regrasXp') return { docs: [REGRAS_DO_LAB] as T[], totalDocs: 1 }
    if (args.collection !== 'xpLedger') {
      throw new Error(`the lab level read ${args.collection}, which is not the ledger (FR-012)`)
    }
    return { docs: [] as T[], totalDocs: 0 }
  }
}

/** `levelFor(0, …)` is a real level (CLR-005) and `progressInLevel` reports the level's full
 *  width with nothing in it — the card of a lab on its first day. */
const PROGRESSO_SEM_XP = { atual: 0, de: REGRAS_DO_LAB.xpPorNivel }

/** Every `vazio` body in a subtree, as the props the block handed `EmptyState` — props and not
 *  text, because the component renders its wording from props and `findAll` walks children. */
const vaziosEm = (node: ReactNode): EmptyStateProps[] =>
  findAll(node, EmptyState)
    .map((el) => el.props as unknown as EmptyStateProps)
    .filter((props) => props.variant === 'vazio')

/** Everything one state says, joined — so a wording assertion cannot pass on the heading above. */
const palavrasDe = (estado: EmptyStateProps): string =>
  [estado.titulo, estado.descricao ?? '', estado.acao.label].join(' ')

describe('§7 — a lab with nothing yet: each block names its own emptiness (T031, FR-024, US8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.estadoPessoal.mockResolvedValue({ tipo: 'anonimo' })
    // Every read SUCCEEDS and returns nothing. Not one of the four is in its failed state, so
    // anything this page says about a failure it is saying about a lab that is merely new.
    mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakePublicClient([]))
    portaDaSessao.getTenantScopedPayloadForRSC.mockResolvedValue(new FakeLabSemXp())
    mocks.readPublicRanking.mockResolvedValue([])
    mocks.listPublic.mockResolvedValue(semProjetos)
  })

  /** The Home of a lab where every read succeeded and returned nothing. */
  const labNovo = async (): Promise<ReactNode> => (await HomePage()) as unknown as ReactNode

  /** The `<section>` a block's heading names, reported as the block vanishing when it is gone. */
  function secaoDe(arvore: ReactNode, bloco: Bloco): QualquerElemento {
    const encontrada = findAll(arvore, 'section').find((s) => textoDe(s).includes(BLOCOS[bloco]))
    expect(
      encontrada,
      `the Home renders no ${BLOCOS[bloco]} section on a lab with nothing in it. FR-022 gives ` +
        'every block three outcomes and none of them is silence — a section that disappears ' +
        'when it has nothing to show reads as a product that does not have it (CLR-004 inverted).',
    ).toBeDefined()
    return encontrada as QualquerElemento
  }

  /** The one `vazio` body a block draws, with its absence reported as the unwired outcome. */
  function vazioUnicoDe(arvore: ReactNode, bloco: BlocoComVazio): EmptyStateProps {
    const encontrados = vaziosEm(secaoDe(arvore, bloco))
    expect(
      encontrados.length,
      `${BLOCOS[bloco]} drew ${encontrados.length} vazio bodies on a lab with nothing in it; ` +
        `FR-024 owes the visitor exactly one, reading *"${VAZIO_DO_BLOCO[bloco]}"*.`,
    ).toBe(1)
    return encontrados[0] as EmptyStateProps
  }

  for (const bloco of Object.keys(VAZIO_DO_BLOCO) as BlocoComVazio[]) {
    it(`${BLOCOS[bloco]} names its own emptiness, in home.md’s wording (FR-024, US8)`, async () => {
      const vazio = vazioUnicoDe(await labNovo(), bloco)

      expect(
        palavrasDe(vazio),
        `${BLOCOS[bloco]} drew a vazio body that never says *"${VAZIO_DO_BLOCO[bloco]}"* — the ` +
          'sentence home.md § *Estados e interações* gives this block by name. FR-024 is about ' +
          'the wording, so a generic body satisfies FR-022 and not this.',
      ).toContain(VAZIO_DO_BLOCO[bloco])
    })

    it(`${BLOCOS[bloco]} borrows neither neighbour’s sentence (FR-024)`, async () => {
      const arvore = await labNovo()
      const palavras = palavrasDe(vazioUnicoDe(arvore, bloco))

      for (const vizinho of Object.keys(VAZIO_DO_BLOCO) as BlocoComVazio[]) {
        if (vizinho === bloco) continue
        expect(
          palavras,
          `${BLOCOS[bloco]} tells a visitor *"${VAZIO_DO_BLOCO[vizinho]}"* — ${BLOCOS[vizinho]}'s ` +
            'sentence. On a lab where only one thing is missing that is a statement about ' +
            'something that is not: FR-024 gives each block its own emptiness to name.',
        ).not.toContain(VAZIO_DO_BLOCO[vizinho])
      }
    })

    it(`${BLOCOS[bloco]} sends the visitor onward, not back to a retry (FR-024, FR-023)`, async () => {
      const vazio = vazioUnicoDe(await labNovo(), bloco)

      expect(
        vazio.acao.label,
        `${BLOCOS[bloco]} offers *Tentar novamente* to a read that SUCCEEDED. That control ` +
          'belongs to the failed state (FR-023); offered here it tells a visitor that a lab ' +
          'with nothing in it is a lab that is broken.',
      ).not.toBe('Tentar novamente')
      expect(vazio.acao.href).toBe(SAIDA_DO_BLOCO[bloco])
    })
  }

  it('says nothing failed, because nothing did — no error body anywhere (FR-022, US8)', async () => {
    const erros = errosDaPagina(await labNovo()).map((props) => String(props.titulo))

    expect(
      erros,
      `a lab whose four reads all SUCCEEDED rendered ${erros.length} error card(s) — ` +
        `${JSON.stringify(erros)}. US8: an empty read and a failed read must be ` +
        'distinguishable on screen, and a new lab told *"Não foi possível carregar"* reads as ' +
        'a product that is broken on the day it was created.',
    ).toEqual([])
  })

  it('draws exactly three empty bodies — one per list block, and none for the level (CLR-011)', async () => {
    const arvore = await labNovo()

    expect(
      vaziosEm(arvore).map((props) => props.titulo),
      'the page drew a different number of vazio bodies than the three list blocks it has. A ' +
        'fourth is the lab level card answering *"is this lab empty enough?"* — the question ' +
        'CLR-011 says no card should be inventing an answer to.',
    ).toHaveLength(Object.keys(VAZIO_DO_BLOCO).length)
  })

  it('the lab level answers emptiness with a VALUE: NÍVEL 00 and an empty bar (CLR-011, SC-014)', async () => {
    const secao = secaoDe(await labNovo(), 'nivel')

    expect(
      vaziosEm(secao),
      'the lab level card drew an empty state. `nivelDoLab` returns an object or throws — two ' +
        'outcomes, never three (CLR-011) — and level 0 on an empty ledger is a real level ' +
        '(CLR-005), so a lab on its first day has a card, not an apology.',
    ).toEqual([])
    expect(textoDe(secao)).toMatch(/NÍVEL\s*00\b/)

    const barras = findAll(secao, ProgressBar)
    expect(barras, 'the level card drew no bar at all on a lab with no XP').toHaveLength(1)
    expect([barras[0]?.props.value, barras[0]?.props.max]).toEqual([
      PROGRESSO_SEM_XP.atual,
      PROGRESSO_SEM_XP.de,
    ])
  })
})

/**
 * ── §8: T032 — the two visitors, side by side (FR-008, FR-009, US1, US2) ─────────────────────
 *
 * §2 and §3 each asked the band one question at a time, about one visitor at a time. This
 * section asks the **page's** question, which neither of them can: with no session, is the
 * whole gamified faixa there — all three panels — and is there a percentage *anywhere* inside
 * the band; and with a session, are the percentages on screen this maker's and **only** this
 * maker's.
 *
 * ── Why "no percentage" is not `findAll(ProgressBar)` again ──────────────────────────────────
 *
 * §2 asserts the band mounts no `ProgressBar`. That is the bar this page draws today, and it is
 * one component name away from being a different one: `SkillPips`, a `<progress>`, a `<div>`
 * with an inline `width`, or a card that prints `0%` as text beside no bar at all. CLR-002's
 * sentence is about the **claim**, not the component — *"0% is a claim about a person the page
 * has not identified"* — so this section looks for the claim in any shape: an element carrying
 * a `value`/`max` scale whatever its type, a `\d%` in the words, or a `3 / 5`. A page that
 * swapped the component would keep §2 green and break FR-009 in the same edit.
 *
 * ── Why the mission documents carry a lab-mate's approved row ────────────────────────────────
 *
 * `missaoSubmissao.read` is `scopedAccess()` — scoped to the lab and **not** to the row, which
 * `MissaoSubmissao.ts` records as a known gap. So the lab's submissions are readable from this
 * page's own doors, and the band's `depth: 1` read is one `populate` away from arriving with
 * them attached: `missoesReader.test.ts` § 2 proves the *reader* names the maker in its `where`,
 * and nothing proves the **page** does not fetch the rows a second way and draw those instead.
 * {@link MISSOES_COM_ISCA} is that second way, planted: every mission carries a lab-mate's
 * `aprovada` row and a ready-made `progresso: 100`. A band that read either draws a finished
 * mission for a visitor who has not started it — 100% of somebody else, on this maker's card —
 * and every case in §2 and §3 stays green while it does.
 *
 * The session door is a *recording* fake here for the same reason: FR-008's guarantee is that
 * the only route to a submission on this page is `estadoPessoal`, so the assertion is over the
 * collections each door was asked for, not only over what came out the other end.
 */

/** A lab-mate: not the visitor, and the owner of every decoy below. */
const OUTRO_MAKER = { id: 99, nome: 'Joana Lab-mate' }

/**
 * The band's missions with the lab's submissions attached — the shape a `depth: 1` read grows
 * the day somebody populates the relationship, and a progress number nobody's session produced.
 *
 * Neither field is fiction: `progresso` is exactly what a card that wanted one number would ask
 * the document for, and `submissoes` is the reverse side of `missaoSubmissao.missao`.
 */
const MISSOES_COM_ISCA = MISSOES_EM_DESTAQUE.map((missao) => ({
  ...missao,
  progresso: 100,
  submissoes: [
    { id: 900 + missao.id, missao: missao.id, maker: OUTRO_MAKER.id, status: 'aprovada' },
  ],
}))

/** The session door, recording what the page asked it for before answering as the ledger. */
class FakeDoorDaSessao {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'
  private readonly ledger = new FakeLedgerStore()

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    return this.ledger.find<T>(args)
  }

  colecoes(): string[] {
    return this.calls.map((call) => call.collection)
  }
}

/**
 * Every statement of proportion in a subtree, whatever draws it.
 *
 * Three shapes, because CLR-002 forbids the claim and not one component: an element carrying a
 * `value`/`max` scale (`ProgressBar` today, anything tomorrow), a written percentage, and the
 * `1250 / 2000` counter `home.md` draws that FR-013 struck out.
 */
function proporcoesEm(node: ReactNode): string[] {
  const escalas = (atual: ReactNode): string[] => {
    if (Array.isArray(atual)) return atual.flatMap(escalas)
    if (!ehElemento(atual)) return []
    const { value, max } = atual.props as { value?: unknown; max?: unknown }
    const aqui =
      typeof value === 'number' && typeof max === 'number' ? [`escala ${value}/${max}`] : []
    return [...aqui, ...escalas((atual.props.children ?? null) as ReactNode)]
  }

  return [...escalas(node), ...(textoDe(node).match(/\d+\s*%|\d+\s*\/\s*\d+/g) ?? [])]
}

describe('§8 — signed out and signed in: whose percentage the band draws (T032, FR-008, FR-009)', () => {
  let porta: FakePublicClient
  let sessao: FakeDoorDaSessao

  beforeEach(() => {
    vi.clearAllMocks()
    porta = new FakePublicClient(MISSOES_COM_ISCA)
    sessao = new FakeDoorDaSessao()
    mocks.getPublicScopedPayloadForRSC.mockResolvedValue(porta)
    portaDaSessao.getTenantScopedPayloadForRSC.mockResolvedValue(sessao)
    mocks.readPublicRanking.mockResolvedValue([...BOARD])
    mocks.listPublic.mockResolvedValue(UM_PROJETO)
  })

  /** The Home as it is drawn for one particular visitor. */
  async function homePara(visitante: EstadoPessoal): Promise<ReactNode> {
    mocks.estadoPessoal.mockResolvedValue(visitante)
    return (await HomePage()) as unknown as ReactNode
  }

  /** A signed-in maker of this lab, with the submissions that are theirs. */
  const maker = (submissoes: Record<string, SubmissaoDoc>): EstadoPessoal => ({
    tipo: 'maker',
    submissoes: new Map(Object.entries(submissoes)),
  })

  /** One block's `<section>`, named by the heading a reader sees. */
  function secao(arvore: ReactNode, bloco: Bloco): QualquerElemento {
    const encontrada = findAll(arvore, 'section').find((s) => textoDe(s).includes(BLOCOS[bloco]))
    expect(
      encontrada,
      `the Home renders no ${BLOCOS[bloco]} section. US2 owes a visitor with no session the ` +
        'whole faixa — the panels are public and only the percentages are not.',
    ).toBeDefined()
    return encontrada as QualquerElemento
  }

  /** The bars on the band, in the order the cards are drawn. */
  const barrasDaBanda = (arvore: ReactNode): [unknown, unknown][] =>
    findAll(secao(arvore, 'missoes'), ProgressBar).map((barra) => [
      barra.props.value,
      barra.props.max,
    ])

  it('gives a visitor with no session all three panels (FR-009, FR-016, US2)', async () => {
    // The lab level's read is refused for a reader with no session — `xpLedger.read` and
    // `regrasXp.read` are both `scopedAccess()`, and page.tsx reports that as an open gap
    // against FR-016. The panel is still owed: T032 asks for three panels PRESENT, and a card
    // in its error state is present. A panel that vanished would say the lab has no level.
    portaDaSessao.getTenantScopedPayloadForRSC.mockRejectedValue(
      new Error('scopedAccess() refuses a reader with no session'),
    )

    const arvore = await homePara({ tipo: 'anonimo' })

    for (const bloco of ['missoes', 'nivel', 'ranking'] as Bloco[]) secao(arvore, bloco)
    // Present AND populated, for the two the anonymous door does serve.
    for (const missao of MISSOES_EM_DESTAQUE) {
      expect(textoDe(secao(arvore, 'missoes'))).toContain(missao.titulo)
    }
    for (const perfil of BOARD) expect(textoDe(secao(arvore, 'ranking'))).toContain(perfil.nome)
  })

  it('states no proportion ANYWHERE in the band for a visitor with no session (FR-009, CLR-002)', async () => {
    const banda = secao(await homePara({ tipo: 'anonimo' }), 'missoes')

    expect(
      proporcoesEm(banda),
      'the band states a proportion to a visitor the page has not identified. CLR-002: *"a ' +
        'signed-out visitor sees the mission card with no progress bar value — not a bar at ' +
        '0%"*. This assertion is deliberately blind to WHICH component draws it: a percentage ' +
        'printed as text, or a scale handed to something that is not `ProgressBar`, is the same ' +
        'claim about the same absent person.',
    ).toEqual([])
  })

  it('draws the signed-in maker their OWN percentages, never the lab-mate’s (FR-008, US1)', async () => {
    const arvore = await homePara(
      maker({
        '1': { id: 10, missao: 1, status: 'enviada' },
        '2': { id: 11, missao: 2, status: 'aprovada' },
        // Nothing on mission 3 — which is precisely the mission MISSOES_COM_ISCA says a
        // lab-mate finished.
      }),
    )

    expect(
      barrasDaBanda(arvore),
      'the band drew a percentage this maker did not earn. Every mission on screen carries a ' +
        'lab-mate’s `aprovada` row and a `progresso: 100` of its own; FR-008 says the number on ' +
        'the card is the READER’s submission, so the third card — untouched by this maker — is ' +
        'at zero however finished the document claims to be.',
    ).toEqual([
      [1, ETAPAS_DA_MISSAO],
      [ETAPAS_DA_MISSAO, ETAPAS_DA_MISSAO],
      [0, ETAPAS_DA_MISSAO],
    ])
    expect(
      textoDe(secao(arvore, 'missoes')),
      'the band names a maker who is not the reader',
    ).not.toContain(OUTRO_MAKER.nome)
  })

  it('leaves two makers of one lab no percentage in common (FR-008, US1)', async () => {
    const ana = barrasDaBanda(await homePara(maker({ '1': { id: 10, missao: 1, status: 'aprovada' } })))
    const bruno = barrasDaBanda(await homePara(maker({ '2': { id: 12, missao: 2, status: 'enviada' } })))

    // The same lab, the same three missions, the same page — and two different sets of numbers,
    // because the only input that changed is who is reading. A band that derived the percentage
    // from the mission (the document says 100) would hand these two readers one answer.
    expect(ana.map(([valor]) => valor)).toEqual([ETAPAS_DA_MISSAO, 0, 0])
    expect(bruno.map(([valor]) => valor)).toEqual([0, 1, 0])
  })

  it('fetches nobody’s submissions through a door of its own (FR-008)', async () => {
    await homePara(maker({ '1': { id: 10, missao: 1, status: 'enviada' } }))

    // `estadoPessoal` is the one reader that names the session's maker in its `where`
    // (missoes-reader.test.ts § 2). Every other route to `missaoSubmissao` on this page is
    // lab-scoped — allowed by `scopedAccess()` and one forgotten `.filter` from a lab-mate's
    // 100% — so the page must not take one, and that is a fact about the QUERIES it issued
    // rather than about what reached the tree.
    expect(
      porta.calls.map((call) => call.collection),
      'the anonymous door was asked for something besides the band. It is lab-scoped, not ' +
        'maker-scoped, so a submission read through it returns the whole lab’s progress.',
    ).toEqual(['missao'])
    expect(
      sessao.colecoes(),
      'the lab level’s door was asked for something other than the economy and the ledger',
    ).not.toContain('missaoSubmissao')
    expect(sessao.colecoes()).not.toContain('perfilMaker')
  })
})
