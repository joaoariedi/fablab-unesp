import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PixelImage } from '@fablab/ui'

import type { EstadoPessoal } from '../../lib/content/missoes'
import type { MissaoIdentificada } from '../../lib/public/missoes'
import type { FindArgs, PaginatedResult } from '../../lib/tenancy/client'
import { RANKING_PATH } from '../../app/(frontend)/ranking/page'

/**
 * T024 / FR-017, FR-018, FR-019, FR-020 — the `RANKING MAKERS` card on the Home.
 *
 * `home.md` § *Faixa de 3 cards* draws it as *"lista top-5 com posição em dois dígitos, avatar
 * pixel, @handle e XP"* with a footer link `VER RANKING COMPLETO`. What a card cannot be trusted
 * to get right by accident, and what this file therefore drives:
 *
 *   * **The five places are the BOARD's five** (FR-017, FR-021). The card reads through
 *     `readPublicRanking` — the one door that serves this lab's makers to a visitor with no
 *     session, and the function that carries `/ranking`'s own `ORDENACAO_DO_RANKING`. A card
 *     that issued a query of its own would be a second ranking, free to disagree with the board
 *     its own link leads to; the fake reader here is never called by such a card, and §1 says
 *     so. The bound is asked for as a **limit**, not taken as a slice: the fixture holds six
 *     makers and the reader honours the number it is given, so a card that asks for more and
 *     cuts renders a sixth row.
 *   * **The order is the reader's** (FR-021). §2 answers with a board whose XP *ascends* — an
 *     arrangement no `-xpTotal` sort produces. A card that re-sorted what it was handed would
 *     "fix" it and read as correct; one that renders by index reproduces it exactly, which is
 *     the only way to see that the position is a place and not a local opinion.
 *   * **Two digits** (FR-018). `01 … 05`, which is typography and never arithmetic — `/ranking`
 *     draws `1º` on a full board and the Home's mockup draws `01`, so the two differ on purpose
 *     and only an assertion keeps this one from drifting into the other.
 *   * **The name, the `@handle` and the XP** (FR-018). The mockup's handles are illustrative and
 *     superseded (home.md, round 4, 2026-08-24): what a visitor reads is the person's *name*
 *     with the identifier beside it. A `handle` stored without its `@` still renders with one —
 *     `formatHandle` is the one place that decision lives.
 *   * **A null `avatarRender` draws no image at all** (FR-019, SC-009). The compositor is blocked
 *     (004 T042 / ISS-003) so the column is nullable in the live database, and `/ranking` answers
 *     it by drawing no `<img>` rather than an empty frame. The Home renders *the same* thing: a
 *     broken image is worse than a frame, and a second answer here is a second rule to keep in
 *     step. The unpopulated case is asserted too — a relationship that was not populated is an
 *     **id**, and an id is not a picture.
 *
 * ── Why this file rather than `home-paineis.test.ts` ────────────────────────────────────────
 *
 * The same reason `home-nivel-lab.test.ts` gives: the panels file is the band's, phase 4 has
 * several implementers writing into it at once, and this card's fixture is its own — the board
 * reader, which no other panel calls.
 *
 * ── The instrument: the tree is walked, not rendered ────────────────────────────────────────
 *
 * The suite runs at `node` with no DOM, so `HomePage()` returns a plain React element and what
 * it composed is read off that object. `findAll` matches on `type` **identity**, which is what
 * proves the row mounted the library's real `PixelImage` rather than something shaped like one.
 */

/** A media document as `depth: 1` populates it. */
type MidiaFake = { id: number; url: string }

type MakerFake = {
  id: number
  nome: string
  handle: string
  xpTotal: number
  nivel: number
  avatarRender: MidiaFake | number | null
}

/**
 * Six makers, already in the order the board's `sort` produced — the reader is the database's
 * answer, and this fixture is never re-sorted by anything in the test either.
 *
 * The sixth exists so the bound is observable: a card that asks for more than five renders Fábio.
 */
const MAKERS: readonly MakerFake[] = [
  {
    id: 11,
    nome: 'Ana Souza',
    handle: '@ana.souza',
    xpTotal: 2450,
    nivel: 9,
    avatarRender: { id: 1, url: '/media/ana.png' },
  },
  // Stored without the `@`: the row still reads `@bruno.lima`, because `formatHandle` owns that.
  { id: 12, nome: 'Bruno Lima', handle: 'bruno.lima', xpTotal: 2130, nivel: 8, avatarRender: null },
  // An unpopulated relationship — an id, which is not a picture.
  { id: 13, nome: 'Célia Martins', handle: '@celia', xpTotal: 1890, nivel: 7, avatarRender: 77 },
  {
    id: 14,
    nome: 'Davi Rocha',
    handle: '@davi',
    xpTotal: 1750,
    nivel: 6,
    avatarRender: { id: 2, url: '/media/davi.png' },
  },
  { id: 15, nome: 'Elisa Prado', handle: '@elisa', xpTotal: 1420, nivel: 5, avatarRender: null },
  { id: 16, nome: 'Fábio Nunes', handle: '@fabio', xpTotal: 900, nivel: 3, avatarRender: null },
]

/** The lab's economy, so the `NÍVEL DO LAB` card beside this one is a value and not a failure. */
const REGRAS = { xpPorAcao: 1, xpPorNivel: 5, nivelMaximo: 10 }

/**
 * The board, standing in for `readPublicRanking` — a named fake, as `.claude/rules/code-quality.md`
 * requires, modelled on `ranking-page.test.ts`'s.
 *
 * It records the limits it was asked for and honours them, so the card's bound is a property of
 * the **call** rather than of this fixture's length.
 */
class FakeBoard {
  readonly limites: number[] = []

  constructor(private readonly makers: readonly MakerFake[] = MAKERS) {}

  ler = async (limite: number): Promise<MakerFake[]> => {
    this.limites.push(limite)
    return this.makers.slice(0, limite)
  }
}

/** The anonymous door, answering nothing: the band is not this file's subject, and a Home with
 *  no featured missions keeps every assertion below about the card it was written for. */
class FakePublicClient {
  readonly tenantId = 'org-fake'
  find = async <T>(): Promise<PaginatedResult<T>> => ({ docs: [], totalDocs: 0 })
  findByID = async <T>(): Promise<T | null> => null
}

/** The signed-in choke point, serving the lab level only — this file is about the board. */
class FakeLedgerStore {
  find = async <T>(args: FindArgs): Promise<PaginatedResult<T>> => {
    if (args.collection === 'regrasXp') return { docs: [REGRAS as unknown as T], totalDocs: 1 }
    return { docs: [], totalDocs: 0 }
  }
}

const mocks = vi.hoisted(() => {
  /** What the real `notFound()` does: it throws and never returns. */
  const NOT_FOUND = new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  return {
    NOT_FOUND,
    notFound: vi.fn((): never => {
      throw NOT_FOUND
    }),
    listPublic: vi.fn(),
    getPublicScopedPayloadForRSC: vi.fn(),
    getTenantScopedPayloadForRSC: vi.fn(),
    readPublicRanking: vi.fn<(limite: number) => Promise<unknown[] | null>>(),
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

/**
 * The board reader is replaced, not driven through its own door.
 *
 * `readPublicRanking` resolves `getPublicScopedPayloadForRSC` through its **module-local**
 * binding, which a mocked export cannot intercept — so faking the door alone would leave the
 * real reader reaching `next/headers` outside a request scope, swallowing the failure and
 * answering `null`. What the door does with the query is T009's own suite
 * (`tests/tenancy/public-ranking.test.ts`, against a real Postgres); what this file owns is that
 * the **card** goes through that reader and draws what it returns.
 */
vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/public-payload')>()),
  getPublicScopedPayloadForRSC: mocks.getPublicScopedPayloadForRSC,
  readPublicRanking: mocks.readPublicRanking,
}))

vi.mock('../../lib/tenancy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy')>()),
  getTenantScopedPayloadForRSC: mocks.getTenantScopedPayloadForRSC,
}))

vi.mock('../../lib/public/missoes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/public/missoes')>()),
  estadoPessoal: mocks.estadoPessoal,
}))

const { default: HomePage } = (await import('../../app/(frontend)/page')) as {
  default: () => Promise<ReactElement>
}

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

/** The Home's carousel read, which this file is not about: it succeeds and returns nothing. */
const semProjetos = { docs: [], totalDocs: 0, page: 1, totalPages: 1 }

describe('§ RANKING MAKERS — the card (T024, FR-017 … FR-020)', () => {
  let board: FakeBoard

  beforeEach(() => {
    vi.clearAllMocks()
    board = new FakeBoard()
    mocks.listPublic.mockResolvedValue(semProjetos)
    mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakePublicClient())
    mocks.getTenantScopedPayloadForRSC.mockResolvedValue(new FakeLedgerStore())
    mocks.readPublicRanking.mockImplementation(board.ler)
    mocks.estadoPessoal.mockResolvedValue({ tipo: 'anonimo' })
  })

  /** The card's own `<section>`, found by the heading it carries. */
  async function cartao(): Promise<QualquerElemento> {
    const arvore = (await HomePage()) as unknown as ReactNode
    const secao = findAll(arvore, 'section').find((s) => textoDe(s).includes('RANKING MAKERS'))
    expect(
      secao,
      'the Home renders no RANKING MAKERS section. home.md § *Faixa de 3 cards* draws the ' +
        'top five beside the lab level, and CLR-004 — the reason it was left out of Home v1 — ' +
        'is satisfied: 005 shipped the ledger and 006 shipped `readPublicRanking`.',
    ).toBeDefined()
    return secao as QualquerElemento
  }

  /** The rows, in the order the card drew them. */
  async function linhas(): Promise<QualquerElemento[]> {
    return findAll(await cartao(), 'li')
  }

  it('reads the board through `readPublicRanking`, asking for five (FR-017, FR-021)', async () => {
    await cartao()

    expect(
      mocks.readPublicRanking,
      'the card never called `readPublicRanking`. It is the one door that serves this lab’s ' +
        'makers to a visitor with no session, and a query of the card’s own would be a second ' +
        'ranking free to disagree with the board it links to (FR-021).',
    ).toHaveBeenCalledTimes(1)
    expect(
      board.limites,
      'the Home draws five places, and asks the reader for five (FR-017) — a card that reads ' +
        'more and slices fetches rows nobody sees, on the page SC-006 measures a budget against.',
    ).toEqual([5])
  })

  it('draws exactly five places, and never a sixth (FR-017)', async () => {
    const rows = await linhas()

    expect(
      rows,
      'the card drew a number of rows that is not five. The fixture holds six makers precisely ' +
        'so a card that renders whatever it was handed is visible here.',
    ).toHaveLength(5)
    expect(textoDe(await cartao())).not.toContain('Fábio Nunes')
  })

  it('renders the reader’s order untouched, never one of its own (FR-021)', async () => {
    // A board whose XP ASCENDS: no `-xpTotal` sort produces this, so a card that re-sorted what
    // it was handed would "correct" it and read as right. Rendering by index reproduces it.
    const invertido = [...MAKERS].slice(0, 5).reverse()
    board = new FakeBoard(invertido)
    mocks.readPublicRanking.mockImplementation(board.ler)

    const rows = await linhas()

    expect(
      rows.map((linha) => textoDe(linha).replace(/\s+/g, ' ').trim().slice(0, 2)),
      'the positions are not 01…05 top to bottom.',
    ).toEqual(['01', '02', '03', '04', '05'])
    for (const [indice, maker] of invertido.entries()) {
      expect(
        textoDe(rows[indice] as ReactNode),
        `place ${indice + 1} is not the reader’s ${indice + 1}th row. The order arrives ordered ` +
          'from `readPublicRanking`; re-sorting here is a second ranking (FR-021).',
      ).toContain(maker.nome)
    }
  })

  it('numbers the places in TWO digits (FR-018)', async () => {
    const rows = await linhas()

    expect(rows.map((linha) => textoDe(linha).replace(/\s+/g, ' ').trim().slice(0, 2))).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
    ])
    // `/ranking` draws `1º` on the full board; the Home's mockup draws `01`. The two differ on
    // purpose, so the ordinal must not leak into this card.
    expect(textoDe(await cartao())).not.toContain('1º')
  })

  it('shows the name, the `@handle` and the XP total on every row (FR-018)', async () => {
    const rows = await linhas()

    for (const [indice, maker] of MAKERS.slice(0, 5).entries()) {
      const texto = textoDe(rows[indice] as ReactNode)
      expect(texto, `row ${indice + 1} does not carry the maker’s name`).toContain(maker.nome)
      // Stored without the `@` for Bruno: the row reads `@bruno.lima` all the same.
      const handle = maker.handle.startsWith('@') ? maker.handle : `@${maker.handle}`
      expect(texto, `row ${indice + 1} does not carry ${handle}`).toContain(handle)
      expect(texto, `row ${indice + 1} does not carry the XP total`).toContain(
        `${maker.xpTotal} XP`,
      )
    }
  })

  it('draws no image for a maker whose avatar was never composed (FR-019, SC-009)', async () => {
    const rows = await linhas()

    // Bruno (null) and Célia (an unpopulated id) are the two shapes the blocked compositor
    // leaves behind; Elisa is the third row with nothing to draw.
    for (const indice of [1, 2, 4]) {
      const linha = rows[indice] as ReactNode
      expect(
        [...findAll(linha, PixelImage), ...findAll(linha, 'img')],
        `row ${indice + 1} drew an image for a maker with no composed avatar. ` +
          '`avatarRender` is nullable while the compositor is blocked (004 T042 / ISS-003), ' +
          'and `/ranking` answers that by drawing no `<img>` at all — a broken image is worse ' +
          'than a frame, and FR-019 asks for the same placeholder here.',
      ).toEqual([])
      // The row is still a row: the missing picture costs the picture and nothing else.
      expect(textoDe(linha)).toContain(MAKERS[indice]?.nome)
    }
  })

  it('draws the composed avatar where there is one, through `PixelImage` (FR-019)', async () => {
    const rows = await linhas()
    const imagens = findAll(rows[0] as ReactNode, PixelImage)

    expect(
      imagens,
      'the first row mounted no `PixelImage`. Ana’s render is populated, so a card that never ' +
        'draws an avatar would satisfy the null case above by drawing nothing, ever.',
    ).toHaveLength(1)
    expect(imagens[0]?.props.src).toBe('/media/ana.png')
  })

  it('links `VER RANKING COMPLETO` to `/ranking` (FR-020)', async () => {
    const links = findAll(await cartao(), 'a')
    const completo = links.find((a) => textoDe(a).includes('VER RANKING COMPLETO'))

    expect(
      completo,
      'the card carries no `VER RANKING COMPLETO` link. home.md draws it in the card’s footer, ' +
        'and it is the Home’s route to the full board.',
    ).toBeDefined()
    // `RANKING_PATH`, the page's own export, so the route moves in one edit.
    expect(completo?.props.href).toBe(RANKING_PATH)
  })
})
