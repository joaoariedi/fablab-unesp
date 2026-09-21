import type { Where } from 'payload'
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EmptyState, ProgressBar } from '@fablab/ui'

import type { EstadoPessoal } from '../../lib/content/missoes'
import type { MissaoIdentificada } from '../../lib/public/missoes'
import type { FindArgs, PaginatedResult } from '../../lib/tenancy/client'

/**
 * T023 / FR-012, FR-013, FR-014, FR-015, CLR-011 — the `NÍVEL DO LAB` card.
 *
 * `nivelDoLab` has had **zero callers** since 005 shipped it (research.md), so this file is the
 * first thing that drives it from a page. What it asserts is what a card cannot be trusted to
 * get right by accident:
 *
 *   * **The level and the bar are `nivelDoLab`'s**, not the card's (FR-012, FR-013). The fixture
 *     lab has *retuned* its economy — `{ xpPorAcao: 3, xpPorNivel: 4, nivelMaximo: 3 }`, never
 *     the CITe seed `{ 1, 5, 10 }` — so a card that carries the curve in its own source reports
 *     a different level here instead of agreeing with the ledger by coincidence.
 *   * **Two outcomes, never three** (CLR-011). A lab at level 0 with an empty ledger is a
 *     *value*: it renders as the card, with `nivelDoLab`'s own `{ atual: 0 }` bar. An empty
 *     state there would be the product's first day drawn as the product broken — which is the
 *     exact reasoning CLR-004 used to keep these panels out of Home v1.
 *   * **A lab with no `regrasXp` is the failure**, and it costs the card and nothing else
 *     (plan § D1). `nivelDoLab` *throws* for that lab; an uncaught throw here takes the whole
 *     Home down with it, hero included.
 *   * **No `Próxima recompensa`, and never the mockup's `1250 / 2000`** (FR-014). Both are
 *     `home.md` text a reader of that document alone would build — the reward block was deferred
 *     by the PO on 2026-08-24, and the counter is art the real economy contradicts.
 *
 * ── Why this file rather than `home-paineis.test.ts` ────────────────────────────────────────
 *
 * The panels file is the band's, and phase 4 has several implementers writing into it at once.
 * This card's assertions are a separate subject with a separate fake — the *ledger* store, which
 * no other panel reads — so they are their own file rather than a section appended to one that
 * is being rewritten underneath them.
 *
 * ── The instrument: the tree is walked, not rendered ────────────────────────────────────────
 *
 * The same helpers `home.test.ts` uses. The suite runs at `node` with no DOM, so `HomePage()`
 * returns a plain React element and what it composed is read off that object; `findAll` matches
 * on `type` **identity**, which is what proves the card mounted the library's real `ProgressBar`
 * rather than something shaped like one.
 */

/** This lab retuned its economy. Nothing here is the CITe seed `{ 1, 5, 10 }`. */
const REGRAS = { xpPorAcao: 3, xpPorNivel: 4, nivelMaximo: 3 }

/** Nine XP on that curve: level 2, one XP into a level four wide. Neither number is derivable
 *  from the seed, so a hardcoded curve cannot produce both. */
const LEDGER = [{ quantidade: 4 }, { quantidade: 3 }, { quantidade: 2 }]
const NIVEL_ESPERADO = 2
const PROGRESSO_ESPERADO = { atual: 1, de: 4 }

type LinhaLedger = { perfil?: unknown; quantidade?: unknown }

/** Flattened `{ and: [...] }`, so a clause is found wherever the reader nested it. */
const clausulas = (where: Where | undefined): Record<string, { equals?: unknown }> => {
  const w = (where ?? {}) as Record<string, unknown> & { and?: Where[] }
  if (Array.isArray(w.and)) return Object.assign({}, ...w.and.map(clausulas))
  return w as Record<string, { equals?: unknown }>
}

/**
 * The choke-point client the lab level is read through — a named fake, as
 * `.claude/rules/code-quality.md` requires, modelled on `xp-nivel-do-lab.test.ts`'s.
 *
 * `regras: null` is the lab whose economy row is missing: `rulesForTenant` throws for it, which
 * is the failure this card has to survive (plan § D1).
 */
class FakeLedgerStore {
  readonly finds: FindArgs[] = []

  constructor(
    private readonly mundo: { ledger: LinhaLedger[]; regras?: typeof REGRAS | null } = {
      ledger: LEDGER,
    },
  ) {}

  find = async <T = Record<string, unknown>>(args: FindArgs): Promise<PaginatedResult<T>> => {
    this.finds.push(args)

    if (args.collection === 'regrasXp') {
      const regras = this.mundo.regras === undefined ? REGRAS : this.mundo.regras
      const docs = regras === null ? [] : [regras as T]
      return { docs, totalDocs: docs.length }
    }

    if (args.collection !== 'xpLedger') {
      throw new Error(`the lab level read ${args.collection}, which is not the ledger (FR-012)`)
    }

    const perfil = clausulas(args.where).perfil
    const casadas = perfil
      ? this.mundo.ledger.filter((linha) => String(linha.perfil) === String(perfil.equals))
      : this.mundo.ledger
    const limit = args.limit ?? casadas.length
    const page = args.page ?? 1

    return {
      docs: casadas.slice((page - 1) * limit, page * limit) as T[],
      totalDocs: casadas.length,
    }
  }
}

/** The anonymous door, answering nothing: this file is about the lab card, and a band with no
 *  missions keeps every assertion below about the section it was written for. */
class FakePublicClient {
  readonly tenantId = 'org-fake'
  find = async <T>(): Promise<{ docs: T[]; totalDocs: number }> => ({ docs: [], totalDocs: 0 })
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
    getPublicLabLevelStoreForRSC: vi.fn(),
    getTenantScopedPayloadForRSC: vi.fn(),
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
  // The card's own door since T023. `getPublicLabLevelStore` is what bounds an anonymous read of
  // the ledger to a forced `{ quantidade: true }`; what this file measures is the card drawn on
  // top of it, so the store is faked and the bound is `tests/tenancy/public-nivel-lab.test.ts`'s
  // to prove against a real Postgres.
  getPublicLabLevelStoreForRSC: mocks.getPublicLabLevelStoreForRSC,
}))

/** The **session** door, mocked so this file can watch it stay untouched (§7, FR-016). Mocking
 *  rather than driving through `next/headers`, which throws outside a Next request scope, is
 *  what every page suite here does — and it is why the six original cases passed while the card
 *  errored for every signed-out visitor: each injected a store that answers. */
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

/** The Home's other read, which this file is not about: it succeeds and returns nothing. */
const semProjetos = { docs: [], totalDocs: 0, page: 1, totalPages: 1 }

describe('§ NÍVEL DO LAB — the card (T023, FR-012 … FR-015, CLR-011)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listPublic.mockResolvedValue(semProjetos)
    mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakePublicClient())
    mocks.estadoPessoal.mockResolvedValue({ tipo: 'anonimo' })
    // Nothing on this page may reach the session door now. Left rejecting rather than
    // unconfigured: an unconfigured `vi.fn()` resolves `undefined`, and a card that read through
    // it would fail on the shape rather than on the door, which is a different message and a
    // weaker test.
    mocks.getTenantScopedPayloadForRSC.mockRejectedValue(
      new Error('the Home must not open the session door for the lab level (FR-016, T023)'),
    )
  })

  /** The Home, rendered against a lab with this ledger and this economy. */
  async function home(
    mundo: { ledger: LinhaLedger[]; regras?: typeof REGRAS | null } = { ledger: LEDGER },
  ): Promise<ReactNode> {
    mocks.getPublicLabLevelStoreForRSC.mockResolvedValue(new FakeLedgerStore(mundo))
    return (await HomePage()) as unknown as ReactNode
  }

  /** The card's own `<section>`, found by the heading it carries. */
  async function cartao(
    mundo?: { ledger: LinhaLedger[]; regras?: typeof REGRAS | null },
  ): Promise<QualquerElemento> {
    const arvore = await home(mundo)
    const secao = findAll(arvore, 'section').find((s) => textoDe(s).includes('NÍVEL DO LAB'))
    expect(
      secao,
      'the Home renders no NÍVEL DO LAB section. home.md § *Faixa de 3 cards* draws it as the ' +
        'collective achievement — `NÍVEL` + number + bar — and CLR-004, the reason it was left ' +
        'out of Home v1, is satisfied: 005 shipped `xpLedger` and `nivelDoLab`.',
    ).toBeDefined()
    return secao as QualquerElemento
  }

  it('renders the level `nivelDoLab` computed on THIS lab’s curve (FR-012)', async () => {
    const texto = textoDe(await cartao())

    // Two digits, as the mockup's `NÍVEL 07` is drawn — and `2`, which only a reader of this
    // lab's own `regrasXp` produces: on the CITe seed the same nine XP would be level 1.
    expect(texto).toMatch(new RegExp(`NÍVEL\\s*0?${NIVEL_ESPERADO}\\b`))
  })

  it('draws the bar from `progresso` — XP inside the level, never a running total (FR-013)', async () => {
    const barras = findAll(await cartao(), ProgressBar)

    expect(
      barras,
      'the card mounted no ProgressBar. FR-013: the bar is the XP earned inside the current ' +
        'level over that level’s width, and `nivelDoLab` returns exactly that as `progresso`.',
    ).toHaveLength(1)
    expect(barras[0]?.props.value).toBe(PROGRESSO_ESPERADO.atual)
    expect(barras[0]?.props.max).toBe(PROGRESSO_ESPERADO.de)
  })

  it('shows level and bar and nothing else — no reward block, no `1250 / 2000` (FR-014)', async () => {
    const texto = textoDe(await cartao())

    expect(
      texto,
      'the card carries the `Próxima recompensa:` block. It is mockup record only — the PO ' +
        'decided on 2026-08-24 that v1 has no collective reward; it returns with the cosmetics.',
    ).not.toContain('recompensa')
    // The mockup's counter is art: this lab's whole ledger is nine XP.
    for (const ilustrativo of ['1250', '2000']) expect(texto).not.toContain(ilustrativo)
  })

  it('renders an empty lab as the CARD at level 0, never as an empty state (CLR-011, FR-015)', async () => {
    const secao = await cartao({ ledger: [] })

    expect(
      findAll(secao, EmptyState),
      'a lab with no ledger rows rendered an empty state. CLR-011: `nivelDoLab` returns a value ' +
        'or throws — there is no third outcome, and level 0 with an empty bar is *its* answer ' +
        '(SC-014), not a card’s judgement that the lab is "empty enough".',
    ).toEqual([])
    expect(textoDe(secao)).toMatch(/NÍVEL\s*0?0\b/)

    const barras = findAll(secao, ProgressBar)
    expect(barras).toHaveLength(1)
    expect(barras[0]?.props.value).toBe(0)
    expect(barras[0]?.props.max).toBe(REGRAS.xpPorNivel)
  })

  it('catches a lab with no `regrasXp`: the card fails, the page does not (D1, FR-023)', async () => {
    // `nivelDoLab` THROWS for this lab — `rulesForTenant`'s refusal, because a default curve
    // would render a level nobody's economy produced. Uncaught, it takes the hero with it.
    const arvore = await home({ ledger: LEDGER, regras: null })

    const erro = findAll(arvore, EmptyState).find((e) => e.props.variant === 'erro')
    expect(
      erro,
      'a lab whose `regrasXp` row is missing rendered no error state. `nivelDoLab` is ' +
        'documented to throw for it, so `lerNivelDoLab` has to catch — and CLR-011’s second ' +
        'outcome is this card, not a blank space.',
    ).toBeDefined()
    expect(String(erro?.props.titulo)).toContain('Não foi possível carregar')
    // The rest of the Home is untouched: one broken block costs one block (FR-023).
    expect(textoDe(arvore)).toContain('TRANSFORME.')
  })

  it('404s the whole site on an unresolved host rather than drawing an error card (FR-025)', async () => {
    const { TenantUnresolvedError } = await import('../../lib/tenancy/errors')
    mocks.getPublicLabLevelStoreForRSC.mockRejectedValue(new TenantUnresolvedError('nao.existe'))

    // `notFound()` throws Next's control-flow error. A reader that catches broadly swallows its
    // own 404 and the page renders an error card on a host that resolves to no organization.
    await expect(HomePage()).rejects.toBe(mocks.NOT_FOUND)
    expect(mocks.notFound).toHaveBeenCalled()
  })

  /**
   * § The case the six above could not see (T023, FR-016, CLR-001).
   *
   * Every one of them injects a store that answers, so the card drew its level whichever door
   * the page had opened. Phase 4 opened the **session** door — `getTenantScopedPayloadForRSC`,
   * `overrideAccess: false` with the session user — and `scopedAccess()` begins
   * `if (!user) return false`. On the page whose primary audience has no account, the card
   * therefore rendered *"Não foi possível carregar"*, and FR-016 says it is visible to everyone.
   *
   * So the assertion here is not about what the card shows — the cases above cover that — but
   * about **which door it opened**, which is the only thing a fake store cannot fake. The
   * session door is armed to reject in `beforeEach`; these two cases say that out loud.
   */
  describe('§7 — the card a signed-out visitor sees (FR-016, CLR-001)', () => {
    it('never opens the session door, which refuses a caller with no user', async () => {
      const texto = textoDe(await home())

      expect(
        mocks.getTenantScopedPayloadForRSC,
        'the Home opened the session door for the lab level. `scopedAccess()` returns false ' +
          'for a caller with no user, so every signed-out visitor gets the card’s error state ' +
          'while FR-016 and CLR-001 both say the card is theirs to see.',
      ).not.toHaveBeenCalled()
      expect(mocks.getPublicLabLevelStoreForRSC).toHaveBeenCalled()
      expect(texto).toContain('NÍVEL 02')
    })

    it('draws the level itself, not the error state, with no session anywhere on the page', async () => {
      const secao = await cartao()

      // Asserted on the ELEMENT, never on `textoDe`. `textoDe` walks `children`, and
      // `EmptyState` carries its failure text in the `titulo` **prop** — so a `not.toContain`
      // over the rendered text passes against a card showing nothing but its error, which this
      // case was written as and the probe caught (preamble item 3, in its ninth costume).
      expect(
        findAll(secao, EmptyState).find((e) => e.props.variant === 'erro'),
        'the NÍVEL DO LAB card rendered its error state for a visitor with no account. FR-016 ' +
          'and CLR-001 both say the card is theirs to see.',
      ).toBeUndefined()
      expect(findAll(secao, ProgressBar)).toHaveLength(1)
      expect(textoDe(secao)).toMatch(/NÍVEL\s*0?\d/)
    })
  })
})
