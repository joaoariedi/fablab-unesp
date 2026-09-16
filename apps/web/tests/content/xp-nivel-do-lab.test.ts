import type { PayloadRequest, Where } from 'payload'
import { describe, expect, it } from 'vitest'

import { nivelDoLab } from '../../lib/content/xp'
import type { FindArgs } from '../../lib/tenancy'
import type { PaginatedResult } from '../../lib/tenancy/client'

/**
 * T044 / FR-012, SC-014, US8 — **the Nível do Lab is the organization's whole ledger, on the
 * same curve as everybody else's.**
 *
 * Three properties, each a silent failure if it is lost:
 *
 *   1. **Every entry counts, including the ones that name nobody.** CLR-011 erases a profile by
 *      *nulling* `xpLedger.perfil` and leaving the amount alone, precisely so the lab does not
 *      shrink when somebody leaves. A reader that filtered on the profile — or that summed
 *      `perfilMaker.xpTotal` across the roster instead of the ledger — would reproduce exactly
 *      the bug that clarification rejected, and no maker's own total would change to reveal it.
 *      `xp-erasure.test.ts` asserts the rows survive; this asserts the projection reads them.
 *   2. **The curve is the organization's `regrasXp`, never the CITe seed** (CLR-010, FR-009).
 *      The numbers below are deliberately not `{ 1, 5, 10 }`, so an implementation carrying the
 *      seed in its own source reports a different level here instead of agreeing by coincidence.
 *   3. **An empty lab reads 0 with an empty bar** (SC-014) — not blank, not `NaN`. A lab with no
 *      entries is the ordinary first day of a new organization, and a card that renders `NaN/5`
 *      on it looks like the product broken rather than the product new.
 *
 * Unit-level against a named fake, for `xp-projecoes.test.ts`'s reason: *which* request object
 * reaches the choke point, and *which* rows were summed, are properties of this function that a
 * live database cannot demonstrate.
 */

/** A request object with nothing on it: the assertions are about identity, never contents. */
const REQ = { transactionID: 'tx-t044' } as unknown as PayloadRequest

/**
 * This lab retuned its economy. Nothing here is the CITe seed `{ 1, 5, 10 }`: a level computed
 * from numbers written into the implementation would still be *a* number, and reading it against
 * the seed is how a hardcoded curve passes a test that was supposed to catch it.
 */
const REGRAS = { xpPorAcao: 3, xpPorNivel: 4, nivelMaximo: 3 }

type LinhaLedger = { perfil?: unknown; quantidade?: unknown }

const PERFIL = 7
const PERFIL_ALHEIO = 8

/** Flattened `{ and: [...] }`, so a clause is found wherever the reader nested it. */
const clausulas = (where: Where | undefined): Record<string, { equals?: unknown }> => {
  const w = (where ?? {}) as Record<string, unknown> & { and?: Where[] }
  if (Array.isArray(w.and)) return Object.assign({}, ...w.and.map(clausulas))
  return w as Record<string, { equals?: unknown }>
}

/**
 * A named fake for the choke-point client (`.claude/rules/code-quality.md` — mocks are named
 * classes, not inline stubs).
 *
 * Two behaviours are load-bearing rather than convenient:
 *
 *   - **`where` is honoured for `perfil`**, so a reader that scopes the sum to one maker — or to
 *     the makers that still exist — visibly under-reports here instead of passing because the
 *     fake ignored the filter it was given.
 *   - **`find` paginates for real** while reporting `totalDocs` for the whole ledger, so a
 *     reader that takes one page and stops is short by the rest, loudly.
 */
class FakeLabLedgerStore {
  readonly finds: FindArgs[] = []

  constructor(
    private readonly mundo: { ledger: LinhaLedger[]; regras?: typeof REGRAS | null } = {
      ledger: [],
    },
  ) {}

  async find<T = Record<string, unknown>>(args: FindArgs): Promise<PaginatedResult<T>> {
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

const ler = (store: FakeLabLedgerStore) => nivelDoLab(REQ, { getStore: async () => store })

/** Every `where` this read issued against the ledger, flattened. */
const filtrosDoLedger = (store: FakeLabLedgerStore) =>
  store.finds.filter((f) => f.collection === 'xpLedger').map((f) => clausulas(f.where))

describe('the Nível do Lab is the whole ledger on the economy curve (T044, FR-012)', () => {
  it("sums every maker's entries and projects them on this organization's own curve", async () => {
    const store = new FakeLabLedgerStore({
      ledger: [
        { perfil: PERFIL, quantidade: 3 },
        { perfil: PERFIL_ALHEIO, quantidade: 4 },
        { perfil: PERFIL, quantidade: 2 },
      ],
    })

    const lab = await ler(store)

    expect(
      lab.xp,
      'the lab total is not the sum of every ledger entry. It is a projection of the ' +
        "organization's whole ledger (FR-012), not of one maker's rows",
    ).toBe(9)
    // floor(9 / 4) on THIS lab's curve. On the CITe seed it would be 1 — which is the answer a
    // hardcoded `xpPorNivel: 5` gives, and the reason these numbers are not the seed (CLR-010).
    expect(
      lab.nivel,
      'the lab level was not computed on the curve this organization retuned. `regrasXp` is ' +
        'per-organization data (FR-009): a number written into the source is a deploy-time ' +
        'answer to a runtime question',
    ).toBe(2)
    expect(
      lab.progresso,
      'the bar does not report the XP earned inside the current level, on the width the ' +
        "organization's own curve declares",
    ).toEqual({ atual: 1, de: REGRAS.xpPorNivel })
  })

  it('counts the entries that name nobody, so an erasure never shrinks the lab', async () => {
    const store = new FakeLabLedgerStore({
      // The middle row is an erased maker's, exactly as CLR-011 leaves it: the profile nulled,
      // the amount untouched. Skip it and the lab reads 5 — level 1 instead of 2, in public,
      // because somebody exercised their right to be forgotten.
      ledger: [
        { perfil: PERFIL, quantidade: 3 },
        { perfil: null, quantidade: 4 },
        { perfil: PERFIL_ALHEIO, quantidade: 2 },
      ],
    })

    const lab = await ler(store)

    expect(
      lab.xp,
      "an entry whose `perfil` is null was not counted. The XP was really earned and the lab's " +
        'level is a fact about the work, not about who is still registered (CLR-011, SC-021)',
    ).toBe(9)
    expect(
      filtrosDoLedger(store).every((filtro) => filtro.perfil === undefined),
      'the lab level filtered the ledger by `perfil`. That drops every anonymised entry — and ' +
        'it is the exact reader CLR-011 refused to delete the rows to avoid',
    ).toBe(true)
  })

  it('reads through the choke point built from the CALLER’S OWN req', async () => {
    const store = new FakeLabLedgerStore({ ledger: [{ perfil: PERFIL, quantidade: 3 }] })
    let recebido: PayloadRequest | undefined

    await nivelDoLab(REQ, {
      getStore: async (req) => {
        recebido = req
        return store
      },
    })

    // Identity, not equality: the choke point is what confines this sum to one organization
    // (FR-029). A client built from anything else is a lab level that can count another lab's XP.
    expect(
      recebido,
      'the lab level was read through a client built from a different request object than the ' +
        'caller’s, so nothing confines the sum to this organization (FR-029, US7)',
    ).toBe(REQ)
  })

  it('sums every page of the ledger, not only the first', async () => {
    const store = new FakeLabLedgerStore({
      // More rows than any single page: a read that stops at the default page size reports a
      // total short by every row after it, and raises no error at all.
      ledger: Array.from({ length: 250 }, () => ({ perfil: PERFIL, quantidade: 1 })),
    })

    const lab = await ler(store)

    expect(
      lab.xp,
      'the lab sum stopped at one page of ledger rows, so the level is short by the rest',
    ).toBe(250)
    // FR-043: the total is uncapped and keeps rising; only the level stops, at nivelMaximo, and
    // the bar stays full there rather than emptying at exactly the cap (CLR-013).
    expect(lab.nivel).toBe(REGRAS.nivelMaximo)
    expect(lab.progresso).toEqual({ atual: REGRAS.xpPorNivel, de: REGRAS.xpPorNivel })
  })

  it('reads 0 with an empty bar on a lab with no entries — never blank, never NaN', async () => {
    const lab = await ler(new FakeLabLedgerStore({ ledger: [] }))

    // SC-014, stated three ways because three different bugs each produce a different wrong
    // answer here: `undefined` from a sum that never ran, `NaN` from `0 / 0` or from a curve
    // that was never read, and a blank card from a reader that refused an empty ledger.
    expect(lab.xp, 'an empty lab does not report 0 XP (SC-014)').toBe(0)
    expect(
      lab.nivel,
      'an empty lab does not report level 0. Level 0 is a real level — CLR-005',
    ).toBe(0)
    expect(
      lab.progresso,
      'an empty lab does not report an empty bar of the full width, so the card has nothing ' +
        'to render but a gap (SC-014, US8)',
    ).toEqual({ atual: 0, de: REGRAS.xpPorNivel })

    for (const [nome, valor] of Object.entries({
      xp: lab.xp,
      nivel: lab.nivel,
      atual: lab.progresso.atual,
      de: lab.progresso.de,
    })) {
      expect(
        Number.isFinite(valor),
        `the empty lab reported ${String(valor)} for \`${nome}\`. SC-014 asks for 0, and a card ` +
          'rendering NaN or a blank looks like the product broken rather than the product new',
      ).toBe(true)
    }
  })

  it('refuses a lab with no economy rather than inventing a curve', async () => {
    const store = new FakeLabLedgerStore({
      ledger: [{ perfil: PERFIL, quantidade: 3 }],
      regras: null,
    })

    // The same refusal a credit makes: FR-009 seeds `regrasXp` on organization creation, so its
    // absence is a broken lab, not a state a maker can reach. A default curve here would render
    // a level nobody's economy produced, and it would be indistinguishable from a real one.
    await expect(ler(store)).rejects.toThrow(/regrasXp/)
  })
})
