import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The `xp-ledger` isolation layer needs a line to break (T045, FR-035, D7).
 *
 * `scripts/isolation-mutation.sh` proves the isolation harness can fail by patching one marked
 * expression per layer, and the four layers that exist today all rewrite the *machinery* —
 * the choke-point filter, the access constraint, the anonymous read, the relationship
 * validator. None of them touches a **caller's choice of client**, because until `creditXp`
 * no caller had a choice worth making: it is the first module that resolves a *global*
 * identity (`progressoAula.usuario`) to a *scoped* profile and then writes a total to it, so
 * reaching for a broader client is a mistake available here and nowhere else. Swapping
 * `getTenantScopedPayload` for the system client compiles, typechecks, and credits XP at the
 * wrong lab.
 *
 * This asserts the marker is where the layer expects it, because the drift it guards against
 * is silent: `isolation-mutation-layers.test.ts` catches a `perl` pattern that stopped
 * matching, but only once the layer exists. Until then the only thing standing between the
 * plan's chosen expression and a mutation that patches some *other* `getStore` line in this
 * file is that the marked line be marked, and be the only one of its shape.
 */

const XP = join(import.meta.dirname, '..', '..', 'lib', 'content', 'xp.ts')
const MARKER = '/* @isolation-mutation-point */'

const source = () => readFileSync(XP, 'utf8')

/** The choice itself: the `??` that picks the injected store over the choke point. */
const CHOICE = /^\s*const getStore = deps\.getStore \?\?.*getTenantScopedPayload.*$/

/** `creditXp`'s body, so a marker on some other function's identical line does not count. */
function creditXpBody(): string[] {
  const lines = source().split('\n')
  const start = lines.findIndex((line) => line.includes('export async function creditXp('))
  expect(start, 'creditXp is gone from lib/content/xp.ts — the layer has no target').toBeGreaterThan(-1)
  const rest = lines.slice(start)
  const end = rest.findIndex((line, index) => index > 0 && line.startsWith('}'))
  return rest.slice(0, end === -1 ? rest.length : end + 1)
}

describe("the xp-ledger layer's mutation point (T045, FR-035)", () => {
  it("marks creditXp's choice of client", () => {
    const body = creditXpBody()
    const choice = body.findIndex((line) => CHOICE.test(line))
    expect(
      choice,
      `no line in creditXp matches ${CHOICE} — the expression D7 names as the xp-ledger ` +
        `layer's mutation target moved or was rewritten`,
    ).toBeGreaterThan(-1)
    expect(
      body[choice - 1]?.trim(),
      `the line above creditXp's choice of client is not ${MARKER}. The xp-ledger layer ` +
        `patches that choice to prove the harness can fail; unmarked, the next person to ` +
        `touch this line has nothing telling them a gate depends on its exact text.`,
    ).toBe(MARKER)
  })

  it('leaves the other stores in this file unmarked, so the layer has one target', () => {
    const marked = source().split('\n').filter((line) => line.trim() === MARKER)
    expect(
      marked.length,
      `lib/content/xp.ts carries ${marked.length} mutation-point markers. The layer mutates ` +
        `one expression; a second marker makes it ambiguous which one is the gate.`,
    ).toBe(1)
  })

  it("keeps creditXp's choice textually unique, so a substitution cannot hit the wrong store", () => {
    const choices = source()
      .split('\n')
      .filter((line) => CHOICE.test(line))
      .map((line) => line.trim())
    const marked = creditXpBody().filter((line) => CHOICE.test(line)).map((line) => line.trim())
    expect(
      choices.filter((line) => line === marked[0]).length,
      `creditXp's choice of client reads exactly like another function's in this file. ` +
        `scripts/isolation-mutation.sh substitutes on the first match under perl -0, so a ` +
        `shared shape means the layer would mutate a read path and report a proof it never ran.`,
    ).toBe(1)
  })
})
