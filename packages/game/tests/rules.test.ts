import { describe, expect, it } from 'vitest'

import { levelFor, progressInLevel, type XpRules } from '../src/rules'

/**
 * T001 / T003 — FR-005, FR-007, SC-006.
 *
 * Every assertion here injects its rules. CLR-010 is the reason: `regrasXp` is
 * per-organization *data*, so a test asserting "the cap is 10" asserts a **seed value** and
 * turns a lab that retuned its economy legitimately into a CI failure. The rule is
 * `min(rules.nivelMaximo, floor(xp / rules.xpPorNivel))`; the CITe numbers are one case of it.
 *
 * The tables below state their expected levels as **literals**. That is deliberate and it is
 * what T003 adds over the formula sweep further down: a sweep whose expected value recomputes
 * `min(cap, floor(xp / perLevel))` proves the implementation matches *that expression*, but it
 * cannot tell you the expression is the one SC-006 asked for. The literal rows can — they are
 * the numbers the spec wrote down, checked against the numbers the code produces. Both kinds
 * are kept: the tables pin the agreed answers, the sweep covers the xp the tables skip.
 */

/** The seed `lib/tenancy/seed-on-create.ts` writes for a new organization. Not the definition. */
const CITE: XpRules = { xpPorAcao: 1, xpPorNivel: 5, nivelMaximo: 10 }

/**
 * A lab that retuned. Deliberately shares no number with CITE — different xp per action,
 * different level width, different cap — so a `5` or a `10` hard-coded anywhere in the rules
 * shows up as a failure here rather than surviving to production.
 */
const RETUNED: XpRules = { xpPorAcao: 2, xpPorNivel: 3, nivelMaximo: 4 }

describe('levelFor — the SC-006 table, over injected rules', () => {
  /**
   * SC-006 names this row explicitly: 0→0, 5→1, 49→9, 50→10, 999→10. It is the CITe seed's
   * case of the rule, never the rule. The boundary rows (4 vs 5, 49 vs 50) are the off-by-one
   * the spec's CLR section warns "5 XP per level with a cap of 10" invites.
   */
  it.each([
    [0, 0],
    [4, 0],
    [5, 1],
    [45, 9],
    [49, 9],
    [50, 10],
    [51, 10],
    [999, 10],
  ])('CITe seed: %i XP is level %i', (xp, expected) => {
    expect(levelFor(xp, CITE)).toBe(expected)
  })

  /**
   * The same rule, a different economy — this is the "plus one with a different cap" half of
   * SC-006's validation method. Every row here disagrees with the CITe row at the same XP, so
   * a cap or a level width baked into `rules.ts` cannot pass both tables.
   */
  it.each([
    [0, 0],
    [2, 0],
    [3, 1],
    [11, 3],
    [12, 4],
    [13, 4],
    [999, 4],
  ])('retuned lab: %i XP is level %i', (xp, expected) => {
    expect(levelFor(xp, RETUNED)).toBe(expected)
  })

  it('reads the CITe seed the way CLR-005 says: 0 XP is level 0, never level 1', () => {
    expect(levelFor(0, CITE)).toBe(0)
    expect(levelFor(4, CITE)).toBe(0)
    expect(levelFor(5, CITE)).toBe(1)
  })

  it('caps the level HERE — the cap is a property of the rules, not of a column', () => {
    // 999 XP is level 10 at CITe and level 4 at RETUNED. A cap applied anywhere else, or
    // hard-coded to 10, fails the second of these.
    expect(levelFor(999, CITE)).toBe(10)
    expect(levelFor(999, RETUNED)).toBe(4)
  })

  it('is min(cap, floor(xp / perLevel)) for every rule set, not for the seed only', () => {
    for (const rules of [CITE, RETUNED]) {
      for (let xp = 0; xp <= 120; xp += 1) {
        expect(levelFor(xp, rules)).toBe(
          Math.min(rules.nivelMaximo, Math.floor(xp / rules.xpPorNivel)),
        )
      }
    }
  })
})

describe('progressInLevel — the pip bar, including at the cap', () => {
  /**
   * CLR-013, the half of SC-006 about the bar. `xpTotal` is uncapped and keeps rising, so this
   * function is asked about XP far past the cap; the modulo alone would report 0/5 at exactly
   * 50 and climb again, which renders as an empty bar for a maker who just reached the top —
   * a demotion. At and above the cap the bar is full and stays full.
   */
  it.each([
    [0, 0, 5],
    [4, 4, 5],
    [5, 0, 5],
    [7, 2, 5],
    [49, 4, 5],
    [50, 5, 5],
    [51, 5, 5],
    [999, 5, 5],
  ])('CITe seed: %i XP fills %i of %i', (xp, atual, de) => {
    expect(progressInLevel(xp, CITE)).toEqual({ atual, de })
  })

  it.each([
    [0, 0, 3],
    [2, 2, 3],
    [3, 0, 3],
    [11, 2, 3],
    [12, 3, 3],
    [13, 3, 3],
    [999, 3, 3],
  ])('retuned lab: %i XP fills %i of %i', (xp, atual, de) => {
    expect(progressInLevel(xp, RETUNED)).toEqual({ atual, de })
  })

  it('starts EMPTY at level 0 — a lab with no XP reads 0, not a full or blank bar', () => {
    // US8's edge and FR-032: the bar begins empty. Guarded here because the cap branch returns
    // a FULL bar, and a cap comparison that caught level 0 would make every new maker look done.
    expect(progressInLevel(0, CITE)).toEqual({ atual: 0, de: 5 })
    expect(progressInLevel(0, RETUNED)).toEqual({ atual: 0, de: 3 })
  })

  it('stays FULL at and above the cap — a bar that reset would read as a demotion (CLR-013)', () => {
    expect(progressInLevel(50, CITE)).toEqual({ atual: 5, de: 5 })
    expect(progressInLevel(999, CITE)).toEqual({ atual: 5, de: 5 })
    expect(progressInLevel(12, RETUNED)).toEqual({ atual: 3, de: 3 })
    expect(progressInLevel(999, RETUNED)).toEqual({ atual: 3, de: 3 })
  })

  it('never reports more progress than the level is wide, at any XP, on either rule set', () => {
    for (const rules of [CITE, RETUNED]) {
      for (let xp = 0; xp <= 120; xp += 1) {
        const { atual, de } = progressInLevel(xp, rules)
        expect(de).toBe(rules.xpPorNivel)
        expect(atual).toBeGreaterThanOrEqual(0)
        expect(atual).toBeLessThanOrEqual(de)
      }
    }
  })
})

/**
 * The floor, and why it is here rather than in a requirement.
 *
 * T003's verifier flagged it as out of scope and did not test it, which was the right call at
 * the time: `levelFor(-1, CITE)` returned **-1** and `progressInLevel(-1)` a bar filled to -1,
 * and neither is reachable while FR-001 keeps the ledger append-only and FR-006 credits only
 * positive amounts. The honest report is what made it fixable.
 *
 * It is pinned now because "unreachable" is a property of today's callers, not of the function.
 * A reversal — an estorno, a moderation clawback, a correction after a bad import — arrives as
 * a negative amount, and the two outputs above are nonsense in every direction: a negative level
 * sorts BELOW a maker who has done nothing (FR-013), and a bar cannot fill to less than empty.
 */
describe('a negative total is clamped, not propagated', () => {
  const CITE: XpRules = { xpPorAcao: 1, xpPorNivel: 5, nivelMaximo: 10 }

  it.each([-1, -5, -999])('levelFor(%i) is 0, never negative', (xp) => {
    expect(levelFor(xp, CITE)).toBe(0)
  })

  it('fills the bar to empty, not below it', () => {
    // `-1 % 5` is `-1` in JavaScript and not `4`, which is the whole reason this needs a clamp
    // rather than trusting the modulo.
    expect(progressInLevel(-1, CITE)).toEqual({ atual: 0, de: 5 })
  })

  it('leaves zero and the positive cases exactly where they were', () => {
    // The guard on the guard: a clamp written as `Math.abs` would pass every case above and
    // turn -3 into level 0 by accident while turning nothing else wrong — so the untouched
    // values are asserted beside it.
    expect(levelFor(0, CITE)).toBe(0)
    expect(levelFor(49, CITE)).toBe(9)
    expect(levelFor(999, CITE)).toBe(10)
  })
})
