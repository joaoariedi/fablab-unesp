import type { NumberField, PayloadRequest, Where } from 'payload'
import { describe, expect, it } from 'vitest'

import { REGRAS_XP_CITE } from '../../collections/content/RegrasXp'
import { XpLedger } from '../../collections/content/XpLedger'
import { syncCounter, type CounterStore } from '../../lib/content/counters'
import { creditXp, type CreditInput, type XpStore } from '../../lib/content/xp'
import type { ByIDArgs, CreateArgs, FindArgs, UpdateArgs } from '../../lib/tenancy'
import type { PaginatedResult } from '../../lib/tenancy/client'

/**
 * T021b / FR-009, plan § D2 — **the free oracle, asserted as an oracle and never as a
 * dependency.**
 *
 * `perfilMaker.xpTotal` is the sum of `xpLedger.quantidade`, and summing costs what counting
 * does not: `count` reads `totalDocs` off a `find` and touches no row, while a sum must read
 * every row (`counters.ts`, where the `sum` derivation is declared, prices it there). So there
 * is a standing temptation to count the entries instead — and while `regrasXp.xpPorAcao` is 1
 * the two answers agree, which means the shortcut *passes every test that only ever sees the
 * CITe economy*.
 *
 * That agreement is worth having, and it is worth having in exactly one direction:
 *
 *   - **As an oracle.** With the seed rate at 1, two independent derivations of the same truth
 *     must produce the same number. A drift between them is a defect in one of them, for free,
 *     with no fixture to maintain.
 *   - **Never as a dependency.** `regrasXp` is per-organization data and FR-009 makes retuning
 *     it an *edit*, not a deploy. The amount is therefore stored per entry, and the projection
 *     re-sums the amounts that were actually recorded — including the ones recorded under a
 *     previous economy. A lab that sets `xpPorAcao` to 3 breaks the agreement on purpose, and
 *     nothing may break with it.
 *
 * The second half is what the assertions below spend most of their length on, because it is
 * the half that fails silently: an implementation that counts rows, or that multiplies the
 * *current* rate by the row count, is indistinguishable from a correct one at this lab today
 * and wrong at the first lab that retunes — retroactively, for every entry in its history.
 *
 * Unit-level against a named fake, for the reason `counter-strategy.test.ts` and
 * `xp-projecoes.test.ts` state: the claim is about *which rows were added and what was read off
 * them*, and both derivations are driven over one shared ledger so the comparison is between
 * the real implementations rather than between a test's own arithmetic and one of them.
 */

/** A request with nothing on it: no assertion here is about its contents. */
const REQ = { transactionID: 'tx-t021b' } as unknown as PayloadRequest

const PERFIL = 42
const SKILL_A = 7
const SKILL_B = 8

/** Where the two comparison derivations write, so neither overwrites the real projection. */
const RASCUNHO = { collection: 'perfilMaker', id: 999 } as const

type LinhaLedger = { perfil?: unknown; skill?: unknown; quantidade?: unknown }
type LinhaSkill = { skill?: unknown; nivel?: number; xp?: number }
type Regras = { xpPorAcao: number; xpPorNivel: number; nivelMaximo: number }

/** `{ perfil: { equals } }` and `{ and: [ … ] }` — the only two shapes either module issues. */
const casa = (linha: LinhaLedger, where: Where | undefined): boolean => {
  if (!where) return true
  const { and, ...campos } = where as { and?: Where[] } & Record<string, { equals?: unknown }>
  if (and && !and.every((clausula) => casa(linha, clausula))) return false
  return Object.entries(campos).every(
    ([campo, cond]) => String((linha as Record<string, unknown>)[campo]) === String(cond?.equals),
  )
}

/**
 * One lab's economy and its ledger, as a named fake serving **both** modules under test
 * (`.claude/rules/code-quality.md` — mocks are named classes, not inline stubs).
 *
 * Three behaviours are load-bearing rather than convenient:
 *
 *   - **`create` appends to the ledger `find` also serves**, so a recount sees the entry the
 *     same credit just wrote — the in-transaction read `creditXp` depends on.
 *   - **`regrasXp` is mutable through {@link retune}**, because a rate that can never change
 *     is exactly the world in which counting rows looks correct.
 *   - **`find` reports `totalDocs` for the whole match while paginating for real**, so an
 *     implementation that reads one page and stops under-reports visibly.
 */
class FakeLedgerLab implements XpStore, CounterStore {
  readonly ledger: LinhaLedger[]
  private readonly linhas = new Map<string, Record<string, unknown>>()
  private regras: Regras
  private proximoId = 1

  constructor(opcoes: { regras: Regras; ledger?: LinhaLedger[]; skills?: LinhaSkill[] }) {
    this.regras = opcoes.regras
    this.ledger = [...(opcoes.ledger ?? [])]
    this.linhas.set(`perfilMaker:${String(PERFIL)}`, {
      id: PERFIL,
      skills: opcoes.skills ?? [],
    })
  }

  /** The retune FR-009 makes an edit rather than a deploy. */
  retune(xpPorAcao: number): void {
    this.regras = { ...this.regras, xpPorAcao }
  }

  /** The projection as stored on the profile, after whatever credits have run. */
  perfil(): Record<string, unknown> {
    return this.linhas.get(`perfilMaker:${String(PERFIL)}`) ?? {}
  }

  async find<T = Record<string, unknown>>(args: FindArgs): Promise<PaginatedResult<T>> {
    if (args.collection === 'regrasXp') return { docs: [this.regras as T], totalDocs: 1 }

    if (args.collection === 'perfilMaker') {
      const docs = [...this.linhas.values()].filter((linha) => casa(linha, args.where)) as T[]
      return { docs, totalDocs: docs.length }
    }

    const casadas = this.ledger.filter((linha) => casa(linha, args.where))
    const limit = args.limit ?? casadas.length
    const page = args.page ?? 1
    return {
      docs: casadas.slice((page - 1) * limit, page * limit) as T[],
      totalDocs: casadas.length,
    }
  }

  async findByID<T = Record<string, unknown>>(args: ByIDArgs): Promise<T | null> {
    return (this.linhas.get(`${args.collection}:${String(args.id)}`) ?? null) as T | null
  }

  async create<T = Record<string, unknown>>(args: CreateArgs): Promise<T> {
    this.ledger.push(args.data as LinhaLedger)
    return { id: this.proximoId++, ...args.data } as T
  }

  async update<T = Record<string, unknown>>(args: UpdateArgs): Promise<T | null> {
    const chave = `${args.collection}:${String(args.id)}`
    const linha = { ...(this.linhas.get(chave) ?? { id: args.id }), ...args.data }
    this.linhas.set(chave, linha)
    return linha as T
  }
}

const ACAO: Omit<CreditInput, 'req' | 'refId' | 'skill'> = {
  perfil: PERFIL,
  acao: 'publicar_artigo',
  refTipo: 'artigo',
}

/** One credit, through the real `creditXp`. Distinct `refId`s, so none is a duplicate. */
const creditar = (loja: FakeLedgerLab, refId: number, skill: number = SKILL_A) =>
  creditXp({ req: REQ, ...ACAO, refId, skill }, { getStore: async () => loja })

/** The ledger clause every projection of one maker's total uses. */
const DESTE_MAKER = { perfil: { equals: PERFIL } } as Where

const daSkill = (skill: number) =>
  ({ and: [DESTE_MAKER, { skill: { equals: skill } }] }) as Where

/** The `sum` derivation of `counters.ts`, over the shared ledger. */
const somar = (loja: FakeLedgerLab, where: Where = DESTE_MAKER) =>
  syncCounter(
    {
      req: REQ,
      target: RASCUNHO,
      field: 'xpTotal',
      derive: { kind: 'sum', field: 'quantidade', source: { collection: 'xpLedger', where } },
    },
    { getStore: async () => loja },
  )

/** The `count` derivation of `counters.ts`, over the very same rows. */
const contar = (loja: FakeLedgerLab, where: Where = DESTE_MAKER) =>
  syncCounter(
    {
      req: REQ,
      target: RASCUNHO,
      field: 'xpTotal',
      derive: { kind: 'count', source: { collection: 'xpLedger', where } },
    },
    { getStore: async () => loja },
  )

const linhaDaSkill = (loja: FakeLedgerLab, skill: number): LinhaSkill | undefined =>
  ((loja.perfil().skills ?? []) as LinhaSkill[]).find((l) => String(l.skill) === String(skill))

describe('while xpPorAcao is 1, a sum equals a count (T021b, FR-009)', () => {
  it('states its own precondition: the CITe seed rate is 1, and the oracle dies with it', () => {
    // The whole agreement below is downstream of this number. Asserted here rather than
    // assumed so that a seed retuned to 2 fails *this* file — the one whose claim it voids —
    // instead of quietly turning every agreement below into a coincidence nobody rechecks.
    expect(
      REGRAS_XP_CITE.xpPorAcao,
      'the CITe seed no longer credits 1 XP per action, so a row count is no longer a second ' +
        'derivation of the maker total and every agreement asserted in this file is void',
    ).toBe(1)
  })

  it('projects a total that equals the number of entries, by two derivations that agree', async () => {
    const loja = new FakeLedgerLab({ regras: REGRAS_XP_CITE })

    await creditar(loja, 1)
    await creditar(loja, 2)
    await creditar(loja, 3)

    const soma = await somar(loja)
    const contagem = await contar(loja)

    expect(loja.ledger).toHaveLength(3)
    expect(
      soma,
      'the summed amounts and the row count disagree while xpPorAcao is 1, so one of the two ' +
        'derivations of the same truth is wrong — the free oracle of plan § D2, firing',
    ).toBe(contagem)
    expect(loja.perfil().xpTotal).toBe(3)
  })

  it('holds per skill as well, over the rows of that skill alone', async () => {
    const loja = new FakeLedgerLab({ regras: REGRAS_XP_CITE })

    await creditar(loja, 1, SKILL_A)
    await creditar(loja, 2, SKILL_A)
    await creditar(loja, 3, SKILL_B)

    expect(await somar(loja, daSkill(SKILL_A))).toBe(await contar(loja, daSkill(SKILL_A)))
    expect(linhaDaSkill(loja, SKILL_A)?.xp).toBe(2)
    expect(linhaDaSkill(loja, SKILL_B)?.xp).toBe(1)
  })
})

describe('…and the moment the lab retunes, only the count is wrong (T021b, FR-009)', () => {
  it('stores the amount on each entry, so a retune leaves the history it did not earn', async () => {
    const loja = new FakeLedgerLab({ regras: { ...REGRAS_XP_CITE } })

    await creditar(loja, 1)
    await creditar(loja, 2)
    await creditar(loja, 3)

    // FR-009: an edit in the admin, not a deploy. Everything already earned keeps its amount.
    loja.retune(3)
    await creditar(loja, 4)
    await creditar(loja, 5)

    expect(
      loja.ledger.map((linha) => linha.quantidade),
      'the entries do not each carry the rate they were credited at, so a retune either ' +
        'rewrites history or is not recorded at all (FR-009)',
    ).toEqual([1, 1, 1, 3, 3])

    const soma = await somar(loja)
    const contagem = await contar(loja)

    // 3 × 1 + 2 × 3. A count reports 5; the current rate times the count reports 15. Both are
    // plausible-looking numbers that are wrong for every lab that ever retuned.
    expect(soma).toBe(9)
    expect(contagem).toBe(5)
    expect(
      soma,
      'the sum and the row count still agree after a retune, which means the amounts are not ' +
        'being added — the oracle was leaned on as a mechanism (plan § D2)',
    ).not.toBe(contagem)
  })

  it('projects the summed history onto the profile, and the level from that sum', async () => {
    // Two entries from the old economy, already in the ledger, plus one at the new rate.
    const loja = new FakeLedgerLab({
      regras: { xpPorAcao: 5, xpPorNivel: 5, nivelMaximo: 10 },
      ledger: [
        { perfil: PERFIL, skill: SKILL_A, quantidade: 1 },
        { perfil: PERFIL, skill: SKILL_A, quantidade: 1 },
      ],
    })

    await creditar(loja, 1)

    // 1 + 1 + 5. Counting the three rows gives 3, and 3 × 5 gives 15; neither is this ledger.
    expect(loja.perfil().xpTotal).toBe(7)
    // floor(7 / 5) on this lab's own curve — derived from the summed total, not from the count.
    expect(loja.perfil().nivel).toBe(1)
    expect(await somar(loja)).toBe(7)
  })

  it('records the actions of a paused economy as zero-amount entries the count still counts', async () => {
    // `xpPorAcao: 0` is a lab pausing its gamification without deleting its history — the
    // state `RegrasXp.ts` allows `min: 0` for. The entry is still written, because idempotency
    // has to stay honest if the rate is raised again, and the sum is the only derivation that
    // reports what it is worth.
    const loja = new FakeLedgerLab({ regras: { ...REGRAS_XP_CITE, xpPorAcao: 0 } })

    await creditar(loja, 1)

    expect(loja.ledger).toHaveLength(1)
    expect(await contar(loja)).toBe(1)
    expect(
      await somar(loja),
      'a paused economy credited XP anyway, so the amount written was not read from this ' +
        "organization's regrasXp row (FR-009)",
    ).toBe(0)
    expect(loja.perfil().xpTotal).toBe(0)
  })
})

describe('the oracle is only useful if it can fire (T021b, plan § D2)', () => {
  it('crosses the sum page boundary, where a one-page sum would disagree with the count', async () => {
    // Both derivations page at 200 rows. A sum that read the first page and stopped would
    // report 200 here while the count reported 251 — the exact silent shortfall `counters.ts`
    // declares its page-size constant against, caught by a comparison that costs nothing.
    const ledger = Array.from({ length: 250 }, () => ({
      perfil: PERFIL,
      skill: SKILL_A,
      quantidade: 1,
    }))
    const loja = new FakeLedgerLab({ regras: REGRAS_XP_CITE, ledger })

    await creditar(loja, 9999)

    expect(
      await somar(loja),
      'the summed amounts stop short of the row count past one page, so a maker with a long ' +
        'history has a total that is quietly missing everything after the first 200 entries',
    ).toBe(await contar(loja))
    expect(loja.perfil().xpTotal).toBe(251)
  })

  it('can only ever break upward: no entry is worth less than nothing', () => {
    // The direction matters to the oracle itself. A negative amount would let a sum fall
    // *below* its own row count — `XpLedger.ts` states it in those words — so a lab's total
    // could disagree with its history in a direction no reader of either number would suspect.
    // Nothing in this economy takes XP away; the floor is what keeps that true of the data.
    const quantidade = XpLedger.fields.find(
      (f) => (f as { name?: string }).name === 'quantidade',
    ) as NumberField | undefined

    expect(
      quantidade?.min,
      'xpLedger.quantidade accepts a negative amount, so the ledger can sum to less than the ' +
        'number of credits it records and the count/sum agreement breaks downward (FR-009)',
    ).toBe(0)
  })
})
