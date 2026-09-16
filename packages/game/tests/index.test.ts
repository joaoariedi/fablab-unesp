import { describe, expect, it } from 'vitest'

import * as entrypoint from '../src/index'
import { levelFor, progressInLevel, type XpRules } from '../src/rules'

/**
 * T002 / FR-005 — the package **entrypoint** is what consumers import.
 *
 * `rules.ts` being correct proves nothing about `@fablab/game`: `package.json` points `main`,
 * `types` and `exports` at `src/index.ts` alone, so a rule that exists only in `rules.ts` is
 * unreachable from `apps/web` no matter how green its own test is. That is lesson 1 of
 * tasks.md — a module with tests and no reachable caller is not a feature — asserted at the
 * one boundary where it can be caught before a caller exists.
 *
 * The identity assertions are deliberate. Re-exporting is the requirement; a second copy of
 * the cap arithmetic pasted into `index.ts` would satisfy a behavioural test and then drift
 * from `rules.ts` on the first retune, so the test asks for the *same function*, not an
 * equivalent one.
 */

/** The CITe seed from `lib/tenancy/seed-on-create.ts`. One case of the rule, not the rule. */
const CITE: XpRules = { xpPorAcao: 1, xpPorNivel: 5, nivelMaximo: 10 }

describe('@fablab/game entrypoint', () => {
  it('exports levelFor — the same function as src/rules, not a copy', () => {
    expect(typeof entrypoint.levelFor).toBe('function')
    expect(entrypoint.levelFor).toBe(levelFor)
  })

  it('exports progressInLevel — the same function as src/rules, not a copy', () => {
    expect(typeof entrypoint.progressInLevel).toBe('function')
    expect(entrypoint.progressInLevel).toBe(progressInLevel)
  })

  it('answers through the entrypoint the way the rule does, on injected rules', () => {
    // Behaviour through the public surface, so a re-export that somehow reached a different
    // implementation shows up here and not only in the identity checks above.
    expect(entrypoint.levelFor(0, CITE)).toBe(0)
    expect(entrypoint.levelFor(49, CITE)).toBe(9)
    expect(entrypoint.levelFor(999, CITE)).toBe(10)
    expect(entrypoint.progressInLevel(7, CITE)).toEqual({ atual: 2, de: 5 })
  })

  it('leaves no `export {}` placeholder behind: the entrypoint has a public surface', () => {
    // `export {}` compiles to a module with zero named exports. This is the assertion that
    // fails while the feature-000 placeholder is still in place.
    expect(Object.keys(entrypoint).sort()).toEqual(['levelFor', 'progressInLevel'])
  })
})
