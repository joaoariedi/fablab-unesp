import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EmptyState, type EmptyStateProps } from '@fablab/ui'

import type { EstadoPessoal } from '../../lib/content/missoes'
import type { MissaoIdentificada } from '../../lib/public/missoes'
import type { FindArgs } from '../../lib/tenancy/client'
import type { RankingRow } from '../../lib/tenancy/public-payload'

/**
 * T027 / FR-022, FR-023, FR-024 — every block's THREE outcomes, wired.
 *
 * `lerUltimosProjetos` has modelled the contract since 003: `null` is *"this read failed"*,
 * `[]` is *"this lab has nothing yet"*, and the two are different screens. The band and the
 * ranking card arrived (T020–T024) drawing only the first — a failed read rendered **nothing**,
 * and an empty one rendered a heading over a silence — and both of those are the CLR-004 failure
 * mode with the sign flipped: a section that is simply absent reads as a product that does not
 * have it, and a heading with nothing under it reads as a lab nobody uses.
 *
 * ── Why the EMPTY and the FAILED case are asserted against each other ────────────────────────
 *
 * US8's own error line: *"an empty read and a failed read must be distinguishable on screen"*.
 * A single `EmptyState` wired to both outcomes satisfies "something is drawn" and satisfies
 * nothing else — so every case below names the wording `home.md` gives that block (FR-024) and
 * the failed cases additionally demand *"Não foi possível carregar"* with a `Tentar novamente`
 * (FR-023). Two blocks, three outcomes, six screens that must not be each other.
 *
 * ── Why the sections are located by heading rather than the page's text searched ─────────────
 *
 * Every block on this page fails onto the same wording, and the lab card is in its error state
 * in this file by default (its reader needs a session client no test here supplies). A
 * page-wide `toContain('Não foi possível carregar')` would therefore pass for the band while
 * the band rendered nothing at all — which is the exact state this task exists to end. So each
 * assertion is scoped to the `<section>` that carries the block's own heading.
 */

/** Two missions the team has marked for the Home, as `depth: 1` populates them. */
const MISSOES_EM_DESTAQUE = [
  {
    id: 1,
    titulo: 'Desafio Corte Laser',
    descricao: 'Crie um chaveiro personalizado com corte a laser.',
    icone: { id: 90, url: '/media/laser.svg' },
  },
  {
    id: 2,
    titulo: 'Impressão 3D',
    descricao: 'Modele e imprima um suporte para celular.',
    icone: { id: 91, url: '/media/impressao.svg' },
  },
]

/** Two makers as `readPublicRanking` returns them — already in the board's order (FR-021). */
const BOARD: readonly RankingRow[] = [
  { id: 11, nome: 'Ana Souza', handle: 'ana.souza', xpTotal: 2450, nivel: 7, avatarRender: null },
  { id: 12, nome: 'Bruno Lima', handle: 'bruno.lima', xpTotal: 1980, nivel: 6, avatarRender: null },
]

/** The wording `home.md` § *Estados e interações* gives each outcome. Written once here, so a
 *  case cannot quietly assert a sentence this file invented. */
const COPY = {
  erro: 'Não foi possível carregar',
  retentar: 'Tentar novamente',
  missoesVazias: 'Nenhuma missão ativa no momento',
  rankingVazio: 'Ainda sem makers no ranking',
} as const

/**
 * The anonymous door's client, answering `missao` with whatever this case is about.
 *
 * `null` is not a document set: it is handed here as *"the read throws"*, because that is the
 * only way `lerMissoesEmDestaque` can arrive at `null`, and a fake that returned `null` docs
 * would be testing a shape the door cannot produce.
 */
class FakePublicClient {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'

  constructor(private readonly missoes: readonly unknown[] | null) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    if (args.collection !== 'missao') return { docs: [] as T[], totalDocs: 0 }
    if (this.missoes === null) throw new Error('missao read failed')
    const docs = this.missoes as T[]
    return { docs, totalDocs: docs.length }
  }

  findByID = async <T>(): Promise<T | null> => null
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
    readPublicRanking: vi.fn<(limite: number) => Promise<RankingRow[] | null>>(async () => BOARD.slice()),
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

/** Every anchor's href in a subtree — the `Tentar novamente` action is a link, never a handler. */
const hrefs = (node: ReactNode): string[] =>
  findAll(node, 'a').map((a) => String(a.props.href ?? ''))

/**
 * The `EmptyState` elements in a subtree, as the props the block handed them.
 *
 * **Props rather than text, and that is not a convenience.** `EmptyState` takes its wording as
 * `titulo`/`descricao`/`acao` and renders them inside itself, so walking `children` — which is
 * what a reader-level text assertion does here, with no DOM at `node` — sees an empty element
 * and would report a missing empty state as satisfied. Matching on the component's *identity*
 * also proves the block failed onto the shared surface every listing already fails onto, rather
 * than onto a paragraph of its own that no design owns.
 */
const estados = (node: ReactNode): EmptyStateProps[] =>
  findAll(node, EmptyState).map((el) => el.props as unknown as EmptyStateProps)

/** The one state a block is in, with its absence reported as the outcome that went unwired. */
function estadoUnico(secaoDoBloco: ReactNode, bloco: string): EmptyStateProps {
  const encontrados = estados(secaoDoBloco)
  expect(
    encontrados.length,
    `${bloco} drew ${encontrados.length} EmptyState(s); exactly one of FR-022's three outcomes ` +
      'is on screen at a time, and neither an unwired outcome (none) nor two bodies at once is it.',
  ).toBe(1)
  return encontrados[0] as EmptyStateProps
}

/** Everything one state says, joined — so a wording assertion cannot pass on the heading above it. */
const palavrasDe = (estado: EmptyStateProps): string =>
  [estado.titulo, estado.descricao ?? '', estado.acao.label].join(' ')

/** The Home, with each block's read set to the outcome this case is about. */
async function home(estado: {
  missoes: readonly unknown[] | null
  ranking: readonly RankingRow[] | null
}): Promise<ReactNode> {
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakePublicClient(estado.missoes))
  mocks.readPublicRanking.mockResolvedValue(estado.ranking === null ? null : [...estado.ranking])
  return (await HomePage()) as unknown as ReactNode
}

/**
 * The `<section>` carrying this heading.
 *
 * Its absence is the failure this task is about, so it is reported as such rather than as
 * `undefined is not an object` three lines later.
 */
function secao(arvore: ReactNode, titulo: string): QualquerElemento {
  const encontrada = findAll(arvore, 'section').find((s) => textoDe(s).includes(titulo))
  expect(
    encontrada,
    `the Home renders no ${titulo} section at all. FR-022 gives every block three outcomes and ` +
      'none of them is silence: a failed read owes the visitor the error state (FR-023) and an ' +
      'empty one owes it the wording home.md gives that block (FR-024). A section that vanishes ' +
      'on failure is CLR-004 with the sign flipped — it reads as a product that does not have it.',
  ).toBeDefined()
  return encontrada as QualquerElemento
}

const semProjetos = { docs: [], totalDocs: 0, page: 1, totalPages: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listPublic.mockResolvedValue(semProjetos)
  mocks.estadoPessoal.mockResolvedValue({ tipo: 'anonimo' })
})

describe('§1 — MISSÕES EM DESTAQUE: data, empty, failed (FR-022, FR-023, FR-024)', () => {
  const banda = async (missoes: readonly unknown[] | null): Promise<QualquerElemento> =>
    secao(await home({ missoes, ranking: BOARD }), 'MISSÕES EM DESTAQUE')

  it('draws the missions and no state body at all when the read returned rows', async () => {
    const comDados = await banda(MISSOES_EM_DESTAQUE)

    for (const missao of MISSOES_EM_DESTAQUE) expect(textoDe(comDados)).toContain(missao.titulo)
    expect(
      estados(comDados),
      'the band drew an EmptyState beside its cards — the third outcome is the DATA, and a lab ' +
        'with missions is not empty and did not fail.',
    ).toEqual([])
  })

  it('names its own emptiness on `[]`, in home.md’s wording (FR-024, US8)', async () => {
    const vazia = estadoUnico(await banda([]), 'the band on an empty lab')

    expect(
      vazia.variant,
      'a lab with nothing featured got a heading over a silence, or the failed body. home.md ' +
        `§ *Estados*: *"sem missões em destaque → ${COPY.missoesVazias}"*, which is the VAZIO ` +
        'state — US8: an empty read and a failed read must be distinguishable on screen.',
    ).toBe('vazio')
    expect(palavrasDe(vazia)).toContain(COPY.missoesVazias)
    expect(palavrasDe(vazia)).not.toContain(COPY.erro)
  })

  it('keeps `VER TODAS ›` on the empty band — US6’s own edge', async () => {
    // An empty Home band is exactly when a visitor wants the full catalogue.
    expect(hrefs(await banda([]))).toContain('/missoes')
  })

  it('renders the error state with a `Tentar novamente` action on `null` (FR-022, FR-023)', async () => {
    const falhou = await banda(null)
    const erro = estadoUnico(falhou, 'the band whose read threw')

    expect(erro.variant).toBe('erro')
    expect(erro.titulo).toContain(COPY.erro)
    expect(
      palavrasDe(erro),
      'the failed band said it was empty. `null` is *"this read failed"* and `[]` is *"nothing ' +
        'is featured"* — the contract lerUltimosProjetos has modelled since 003 (FR-022).',
    ).not.toContain(COPY.missoesVazias)
    expect(erro.acao.label).toBe(COPY.retentar)
    expect(
      erro.acao.href,
      'the `Tentar novamente` action is a link to the URL that failed — the Home itself. A ' +
        'handler would need a client boundary for a control that is an anchor (EmptyState).',
    ).toBe('/')
  })
})

describe('§2 — RANKING MAKERS: data, empty, failed (FR-022, FR-023, FR-024)', () => {
  const cartao = async (ranking: readonly RankingRow[] | null): Promise<QualquerElemento> =>
    secao(await home({ missoes: MISSOES_EM_DESTAQUE, ranking }), 'RANKING MAKERS')

  it('draws the board and no state body at all when the read returned rows', async () => {
    const comDados = await cartao(BOARD)

    for (const maker of BOARD) expect(textoDe(comDados)).toContain(maker.nome)
    expect(estados(comDados)).toEqual([])
  })

  it('names its own emptiness on `[]`, in home.md’s wording (FR-024, US5, US8)', async () => {
    const vazio = estadoUnico(await cartao([]), 'the ranking card on a lab with no XP earned')

    expect(
      vazio.variant,
      'a lab whose makers have earned nothing got an empty list under a heading, or the failed ' +
        `body. home.md: *"ranking sem dados → ${COPY.rankingVazio}"*.`,
    ).toBe('vazio')
    expect(palavrasDe(vazio)).toContain(COPY.rankingVazio)
    expect(palavrasDe(vazio)).not.toContain(COPY.erro)
  })

  it('keeps `VER RANKING COMPLETO` on the empty card (CHK051, FR-020)', async () => {
    expect(hrefs(await cartao([]))).toContain('/ranking')
  })

  it('renders the error state with a `Tentar novamente` action on `null` (FR-022, FR-023)', async () => {
    const erro = estadoUnico(await cartao(null), 'the ranking card whose read failed')

    expect(erro.variant).toBe('erro')
    expect(erro.titulo).toContain(COPY.erro)
    expect(
      palavrasDe(erro),
      'the failed ranking said the lab had no makers — the one screen a lab WITH makers must ' +
        'never be shown by accident (the live defect T013 recorded on /ranking).',
    ).not.toContain(COPY.rankingVazio)
    expect(erro.acao.label).toBe(COPY.retentar)
    expect(erro.acao.href).toBe('/')
  })
})

describe('§3 — ÚLTIMOS PROJETOS keeps the contract the other two were wired to (FR-022)', () => {
  /** The carousel's block, whose three outcomes 003 shipped — asserted here because T027 is the
   *  task that makes the contract page-wide, and a regression in the block that DEFINED it would
   *  otherwise be invisible to this file. */
  const projetos = async (docs: readonly unknown[] | null): Promise<QualquerElemento> => {
    if (docs === null) mocks.listPublic.mockRejectedValue(new Error('projeto read failed'))
    else mocks.listPublic.mockResolvedValue({ ...semProjetos, docs, totalDocs: docs.length })
    return secao(await home({ missoes: MISSOES_EM_DESTAQUE, ranking: BOARD }), 'ÚLTIMOS PROJETOS')
  }

  it('names its own emptiness on `[]` (FR-024, US8)', async () => {
    const vazio = estadoUnico(await projetos([]), 'the carousel on a lab with nothing published')

    expect(vazio.variant).toBe('vazio')
    expect(palavrasDe(vazio)).toContain('Nenhum projeto publicado ainda')
  })

  it('renders the error state with a `Tentar novamente` action on a failed read (FR-023)', async () => {
    const erro = estadoUnico(await projetos(null), 'the carousel whose read threw')

    expect(erro.variant).toBe('erro')
    expect(erro.titulo).toContain(COPY.erro)
    expect(erro.acao.label).toBe(COPY.retentar)
    expect(palavrasDe(erro)).not.toContain('Nenhum projeto publicado ainda')
  })
})
