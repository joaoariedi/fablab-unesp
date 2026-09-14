import type { PayloadRequest, Where } from 'payload'
import { describe, expect, it } from 'vitest'

import { creditXp, type CreditInput, type XpStore } from '../../lib/content/xp'
import { CrossTenantError } from '../../lib/tenancy'
import type { CreateArgs, FindArgs, UpdateArgs } from '../../lib/tenancy'
import type { PaginatedResult } from '../../lib/tenancy/client'

/**
 * T016 / FR-010 — **the projections are maintained inside the causing transaction.**
 *
 * `perfilMaker.xpTotal`, `perfilMaker.nivel` and the maker's row in `skills[]` are not stored
 * facts: they are `xpLedger` recomputed, the way `lib/content/counters.ts` recomputes a counter
 * from its source rows. What this file pins is the three properties that make that true, each
 * one a silent failure if it is lost:
 *
 *   1. **The caller's own `req` reaches the choke point.** Payload joins an operation to an
 *      open transaction through `req.transactionID`; a fresh request would leave the ledger
 *      entry and the total in two different transactions, so an approval could commit with the
 *      entry written and the total never updated — and nothing would report it.
 *   2. **Recomputed from the ledger, never incremented.** A `+= quantidade` accumulates every
 *      error it ever makes; a recount self-heals, and is what FR-011's reconciliation gate is
 *      able to check at all.
 *   3. **The projection write is awaited and its failure propagates**, so the action that
 *      caused the credit rolls back with it (FR-004, SC-003).
 *
 * Unit-level against a named fake, for the reason `counter-strategy.test.ts` states: *which*
 * request object reaches the client, and *which* rows were summed, are properties of this
 * function that a live database cannot demonstrate. T021's reconciliation is the integration
 * half — it recomputes every projection from the ledger across the whole database.
 */

/** A request object with nothing on it: the assertions are about identity, never contents. */
const REQ = { transactionID: 'tx-t016' } as unknown as PayloadRequest

const PERFIL = 42
const SKILL = 7

/** Deliberately not 1, so a sum that is secretly a row count is visible. */
const XP_POR_ACAO = 3
const REGRAS = { xpPorAcao: XP_POR_ACAO, xpPorNivel: 5, nivelMaximo: 10 }

const ENTRADA: Omit<CreditInput, 'req'> = {
  perfil: PERFIL,
  skill: SKILL,
  acao: 'publicar_artigo',
  refTipo: 'artigo',
  refId: 9,
}

/** A ledger row as this fake stores it. The tuple fields are optional because most cases only
 *  care about `perfil`/`skill`/`quantidade` — the no-op case is the one that names all of them,
 *  because it is the one whose subject is the read that matches on them. */
type LinhaLedger = {
  perfil?: unknown
  skill?: unknown
  quantidade?: unknown
  acao?: unknown
  refTipo?: unknown
  refId?: unknown
}
type LinhaSkill = { id?: string; skill: unknown; nivel: number; xp: number }

/** `{ perfil: { equals: 42 } }` and `{ and: [ … ] }` — the only two shapes a credit issues. */
const casa = (linha: LinhaLedger, where: Where | undefined): boolean => {
  if (!where) return true
  const { and, ...campos } = where as { and?: Where[] } & Record<string, { equals?: unknown }>
  if (and && !and.every((clausula) => casa(linha, clausula))) return false
  return Object.entries(campos).every(
    ([campo, cond]) => String((linha as Record<string, unknown>)[campo]) === String(cond?.equals),
  )
}

/**
 * A named fake for the choke-point client (`.claude/rules/code-quality.md` — mocks are named
 * classes, not inline stubs).
 *
 * Two behaviours are load-bearing rather than convenient:
 *
 *   - **`create` appends to the ledger it also serves**, because inside one transaction the
 *     recount must see the entry just written. A fake whose ledger never grows would let an
 *     implementation that recomputes *before* the create pass.
 *   - **`find` paginates for real** while reporting `totalDocs` for the whole ledger, so an
 *     implementation that reads one page and stops under-reports visibly instead of silently.
 */
class FakeXpProjectionStore implements XpStore {
  readonly finds: FindArgs[] = []
  readonly creates: CreateArgs[] = []
  readonly updates: UpdateArgs[] = []

  constructor(
    private readonly comportamento: {
      /** The ledger as it stands before the credit. */
      ledger?: LinhaLedger[]
      /** The profile as stored, with its whole `skills[]` panel. */
      perfil?: { id: number; skills?: LinhaSkill[] } | null
      /** When set, `create` rejects with it. */
      createFails?: unknown
      /** When set, `update` rejects with it — the rollback path. */
      updateFails?: unknown
      /** When true, `update` matches no row: a profile in another organization. */
      updateMissed?: boolean
    } = {},
  ) {
    this.ledger = [...(comportamento.ledger ?? [])]
  }

  private readonly ledger: LinhaLedger[]

  async find<T = Record<string, unknown>>(args: FindArgs): Promise<PaginatedResult<T>> {
    this.finds.push(args)

    if (args.collection === 'regrasXp') return { docs: [REGRAS as T], totalDocs: 1 }

    if (args.collection === 'perfilMaker') {
      const perfil = this.comportamento.perfil
      const docs = perfil ? [perfil as T] : []
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

  async create<T = Record<string, unknown>>(args: CreateArgs): Promise<T> {
    this.creates.push(args)
    if (this.comportamento.createFails !== undefined) throw this.comportamento.createFails
    this.ledger.push(args.data as LinhaLedger)
    return { id: 1, ...args.data } as T
  }

  async update<T = Record<string, unknown>>(args: UpdateArgs): Promise<T | null> {
    if (this.comportamento.updateFails !== undefined) throw this.comportamento.updateFails
    this.updates.push(args)
    if (this.comportamento.updateMissed) return null
    return { id: args.id, ...args.data } as T
  }
}

const linha = (quantidade: number, extra: LinhaLedger = {}): LinhaLedger => ({
  perfil: PERFIL,
  skill: SKILL,
  quantidade,
  ...extra,
})

const creditar = (store: FakeXpProjectionStore, entrada: Omit<CreditInput, 'req'> = ENTRADA) =>
  creditXp({ req: REQ, ...entrada }, { getStore: async () => store })

/** The `perfilMaker` write, whichever order the credit issued its reads in. */
const escritaNoPerfil = (store: FakeXpProjectionStore): UpdateArgs | undefined =>
  store.updates.find((u) => u.collection === 'perfilMaker')

describe('the maker projections are the ledger, recomputed (T016, FR-010)', () => {
  it("writes xpTotal and nivel onto the profile through the CALLER'S OWN req", async () => {
    const store = new FakeXpProjectionStore({
      ledger: [linha(3), linha(3)],
      perfil: { id: PERFIL, skills: [] },
    })
    let recebido: PayloadRequest | undefined

    await creditXp(
      { req: REQ, ...ENTRADA },
      {
        getStore: async (req) => {
          recebido = req
          return store
        },
      },
    )

    // Identity, not equality: a *copy* of the request — or a fresh one — leaves the projection
    // outside the transaction the ledger entry was written in, so a failure can no longer roll
    // both back together (FR-004).
    expect(
      recebido,
      'the projection was written through a client built from a different request object than ' +
        "the credit's own, so the total is not on the causing write's transaction (FR-010)",
    ).toBe(REQ)

    const escrita = escritaNoPerfil(store)
    expect(
      escrita,
      'the ledger entry was written and no projection was updated. `perfilMaker.xpTotal` is a ' +
        'projection of the ledger (FR-010) and it is now behind it, with nothing reporting it',
    ).toBeDefined()
    expect(escrita?.id).toBe(PERFIL)
    // 3 + 3 already there, plus the 3 this credit just wrote — the recount SEES its own entry.
    expect(escrita?.data.xpTotal).toBe(9)
    // floor(9 / 5) on this organization's curve.
    expect(escrita?.data.nivel).toBe(1)
  })

  it('recounts the ledger instead of incrementing, and counts only this profile', async () => {
    const store = new FakeXpProjectionStore({
      // A stale total on the row, and another maker's entries beside this one's: an
      // implementation that adds `quantidade` to what is stored reports 1003, and one that
      // forgets the `perfil` clause reports 1006.
      ledger: [linha(3), linha(500, { perfil: 99 }), linha(500, { perfil: 99, skill: null })],
      perfil: { id: PERFIL, xpTotal: 1000, skills: [] } as never,
    })

    await creditar(store)

    expect(
      escritaNoPerfil(store)?.data.xpTotal,
      "xpTotal is not a recount of THIS profile's ledger rows. A delta accumulates every error " +
        "it ever makes, and another maker's rows are another maker's total (FR-010, US7)",
    ).toBe(6)
  })

  it('sums every page of the ledger, not only the first', async () => {
    const store = new FakeXpProjectionStore({
      // More rows than any single page: a read that stops at the default page size reports a
      // total short by every row after it, and raises no error at all.
      ledger: Array.from({ length: 250 }, () => linha(1)),
      perfil: { id: PERFIL, skills: [] },
    })

    await creditar(store)
    const escrita = escritaNoPerfil(store)

    expect(
      escrita?.data.xpTotal,
      'the sum stopped at one page of ledger rows, so every projection is short by the rest',
    ).toBe(253)
    // FR-043: the TOTAL is uncapped and keeps rising; only the level stops, at nivelMaximo.
    expect(escrita?.data.nivel).toBe(REGRAS.nivelMaximo)
  })

  it("updates the matching skills[] row and leaves every other maker's skill untouched", async () => {
    const outra: LinhaSkill = { id: 'linha-outra', skill: 99, nivel: 4, xp: 20 }
    const store = new FakeXpProjectionStore({
      ledger: [linha(3), linha(4, { skill: 99 })],
      perfil: { id: PERFIL, skills: [{ id: 'linha-desta', skill: SKILL, nivel: 0, xp: 0 }, outra] },
    })

    await creditar(store)
    const skills = escritaNoPerfil(store)?.data.skills as LinhaSkill[] | undefined

    expect(
      skills,
      'the credit named a skill and the SUAS SKILLS panel was not updated (FR-010, US9)',
    ).toBeDefined()
    expect(
      skills?.find((s) => String(s.skill) === String(SKILL)),
      "the skill's row is not the sum of the ledger entries crediting that skill",
      // 3 already there plus the 3 just credited; floor(6 / 5) = 1.
    ).toMatchObject({ id: 'linha-desta', skill: SKILL, xp: 6, nivel: 1 })
    expect(
      skills?.find((s) => String(s.skill) === String(outra.skill)),
      'another skill of the same maker was rewritten by a credit that did not name it. A ' +
        'whole-array write that drops or resets the other rows loses progress FR-015 promises ' +
        'no credit ever moves',
    ).toEqual(outra)
  })

  it('leaves skills[] alone when the credit names no skill (FR-039)', async () => {
    const store = new FakeXpProjectionStore({
      ledger: [linha(3, { skill: null })],
      perfil: { id: PERFIL, skills: [{ id: 'linha-desta', skill: SKILL, nivel: 2, xp: 10 }] },
    })

    await creditar(store, { ...ENTRADA, skill: null })
    const escrita = escritaNoPerfil(store)

    expect(escrita?.data.xpTotal, 'a publication naming no skill still credits the total').toBe(6)
    expect(
      Object.keys(escrita?.data ?? {}),
      'a credit that names no skill rewrote the whole SUAS SKILLS panel. FR-039 says such a ' +
        'publication credits the total and no skill — it must not touch the array at all',
    ).not.toContain('skills')
  })

  /**
   * The no-op path, reached by **reading** rather than by catching.
   *
   * This used to drive it with a rejecting `create`, because `creditXp` caught the duplicate.
   * It does not any more, and the reason is not stylistic: Payload's `create` calls
   * `killTransaction` unconditionally on any error and the drizzle adapter takes no savepoint,
   * so the catch ran over a transaction that was already destroyed. The entry is read for first.
   *
   * The claim this case makes is unchanged — a credit that wrote nothing must project nothing.
   */
  it('writes NO projection when the entry already existed (FR-003, FR-025)', async () => {
    const store = new FakeXpProjectionStore({
      // The tuple `ENTRADA` names is ALREADY in the ledger, which is what the read finds. Seeded
      // rather than flagged: this fake matches by `where` like the real store, so the no-op is
      // reached the way production reaches it instead of through a switch only the test knows.
      ledger: [linha(3, { acao: 'publicar_artigo', refTipo: 'artigo', refId: 9 })],
      perfil: { id: PERFIL, skills: [] },
    })

    await expect(creditar(store)).resolves.toBe(false)
    expect(
      store.updates,
      'a rewatch, a re-approval or the loser of two concurrent approvals rewrote the profile. ' +
        'The ledger did not change, so neither may its projections — and the recount would ' +
        "race the winner's own update over the same row",
    ).toEqual([])
  })

  it("propagates a failed projection write so the causing action rolls back (FR-004, SC-003)", async () => {
    const queda = new Error('Connection terminated unexpectedly')
    const store = new FakeXpProjectionStore({
      ledger: [],
      perfil: { id: PERFIL, skills: [] },
      updateFails: queda,
    })

    await expect(
      creditar(store),
      'the projection write failed and creditXp reported success. The entry then commits with ' +
        'a total that does not include it — the exact drift FR-010 keeps inside one transaction',
    ).rejects.toBe(queda)
  })

  it('refuses silently-missed writes: a profile matching no row is a CrossTenantError', async () => {
    const store = new FakeXpProjectionStore({
      ledger: [],
      perfil: { id: PERFIL, skills: [] },
      updateMissed: true,
    })

    await expect(
      creditar(store),
      'the update matched no row — a profile of another organization, or one deleted under ' +
        'the write — and nothing failed. That is the one drift path the transaction cannot ' +
        'catch, because there is no error to roll it back',
    ).rejects.toThrow(CrossTenantError)
  })
})
