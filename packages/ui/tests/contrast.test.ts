import { describe, expect, it } from 'vitest'

import { DOCUMENTED_PAIRS, PALETTE } from '../src/tokens'
import { contrastRatio } from '../src/tokens/contrast'

/**
 * T008 / FR-017, SC-006 — every documented token pair clears WCAG AA for its size class.
 *
 * The gate is the mechanism, not the numbers: **a pair that fails cannot be documented.**
 * `DOCUMENTED_PAIRS` is the list of combinations components are allowed to rely on, so a pair
 * that cannot clear AA has to leave the list rather than have the threshold bent around it.
 * That is what finally answers the open question in `docs/product/visual-identity.md` § Paleta
 * about pink text on navy — see the second block below, which pins both halves of the answer.
 *
 * **The arithmetic is imported, never restated.** `contrastRatio()` (T007c) is asserted against
 * published WCAG anchors in `contrast-ratio.test.ts`; a copy of the maths living here would
 * agree with itself whichever copy was wrong. Round 4 found SC-006 resting on a function no
 * task assigned a file, and this split is the fix.
 *
 * **The pairs are iterated, never restated either.** A test that lists the pairs it expects
 * asserts that the token data equals the test author's memory of it, and stays green when a
 * pair is added. This file reads the same array the components do.
 */

/** WCAG 2.x AA: 4.5:1 for body text, 3:1 for large text (>= 24px, or >= 18.66px bold). */
const AA_SMALL_TEXT = 4.5
const AA_LARGE_TEXT = 3

/**
 * The two size classes AA defines, and deliberately only two.
 *
 * The plan sketched this as `size === 'large' ? 3 : 4.5`, which silently gives the *stricter*
 * threshold to a misspelling — readable as a safe default, but it means `'lrage'` and
 * `'Large'` are scored as body text and nobody learns the size class was never understood.
 * An unrecognised class fails loudly instead, naming what it accepts. A third spelling for one
 * of these classes is the `--color-rosa` trap in miniature (contracts/tokens.md § the rule that
 * matters most): two names for one value, where picking the wrong one changes nothing visible.
 */
const AA_MINIMUM: Record<string, number> = {
  small: AA_SMALL_TEXT,
  large: AA_LARGE_TEXT,
}

/**
 * The AA minimum for a documented size class.
 *
 * @example minimumFor('large') // 3
 */
function minimumFor(size: string): number {
  const minimum = AA_MINIMUM[size]
  if (minimum === undefined) {
    throw new Error(
      `DOCUMENTED_PAIRS declares the size class ${JSON.stringify(size)}, which WCAG AA does ` +
        `not define. Accepted classes: ${Object.keys(AA_MINIMUM).join(', ')}.`,
    )
  }
  return minimum
}

/**
 * The hex a documented pair's token name stands for.
 *
 * A name `PALETTE` does not define must fail here rather than reach `contrastRatio()` as
 * `undefined`: the pair would then be reported as a *contrast* failure, sending the reader
 * after a colour when the defect is a typo in a token name.
 *
 * @example hexFor('navy') // '#191C37'
 */
function hexFor(token: string): string {
  // Cast because `PALETTE`'s keys are literal token names while a pair's `fg`/`bg` may be typed
  // as plain strings; the lookup is checked for real one line below.
  const hex = (PALETTE as Record<string, string | undefined>)[token]
  if (hex === undefined) {
    throw new Error(
      `DOCUMENTED_PAIRS names the colour token ${JSON.stringify(token)}, which PALETTE does ` +
        `not define. PALETTE knows: ${Object.keys(PALETTE).join(', ')}.`,
    )
  }
  return hex
}

describe('every documented token pair meets WCAG AA (FR-017, SC-006)', () => {
  it('documents at least one pair, so the cases below are not a green empty set', () => {
    // tasks.md § Read before starting, point 6: three of the five measured dead gates in this
    // project reported success while checking nothing, and one of them — SC-012 v2 — ran over
    // an empty set. A `for` loop over an empty `DOCUMENTED_PAIRS` registers zero tests, and a
    // suite with zero contrast tests exits 0 exactly like a suite where every pair passes.
    expect(Array.isArray(DOCUMENTED_PAIRS)).toBe(true)
    expect(DOCUMENTED_PAIRS.length).toBeGreaterThan(0)
  })

  for (const pair of DOCUMENTED_PAIRS) {
    const { fg, bg, size } = pair

    it(`${fg} on ${bg} clears AA for ${size} text`, () => {
      const ratio = contrastRatio(hexFor(fg), hexFor(bg))

      // The message carries the ratio because SC-006 fails in CI, where this text is the whole
      // debugging session: the fix is to drop the pair or restate its size class, and neither
      // is decidable from "expected true to be false".
      expect(
        ratio,
        `${fg} (${hexFor(fg)}) on ${bg} (${hexFor(bg)}) scores ${ratio.toFixed(2)}:1, below the ` +
          `${minimumFor(size)}:1 WCAG AA minimum for ${size} text. A pair that fails AA cannot ` +
          `be documented — remove it from DOCUMENTED_PAIRS or document it as large text if it ` +
          `is only ever used at >= 24px.`,
      ).toBeGreaterThanOrEqual(minimumFor(size))
    })
  }
})

describe('the AA thresholds settle visual-identity.md § Paleta on pink (FR-017)', () => {
  /*
   * Hex literals are legal in this file — the colour fence (T007) exempts
   * `packages/ui/tests/**` so fixtures can do the forbidden thing. These three are quoted from
   * `contracts/tokens.md` § Colour rather than read back out of `PALETTE`: the point is to pin
   * the *answer* to an open design question against published values, and a check that reads
   * its expectation from the thing it is checking cannot go red when that thing changes.
   *
   * This block is what makes the gate above more than a tautology. Without it, `DOCUMENTED_PAIRS`
   * could contain nothing but navy-on-white and pass forever.
   */
  const NAVY = '#191C37'
  const WHITE = '#FFFFFF'
  const ROSA_RAW = '#EE9DC4'

  it('answers yes to pink on navy — 8.12:1 clears AA even at body size', () => {
    // The open question in visual-identity.md § Paleta, closed by arithmetic: pink on navy is
    // legible at any size, so the pair may be documented as `small`.
    expect(contrastRatio(ROSA_RAW, NAVY)).toBeGreaterThanOrEqual(AA_SMALL_TEXT)
  })

  it('answers no to pink on white — 2.05:1 misses AA at every size', () => {
    // FR-017's second clause ("on white, small pink text is forbidden") is not a convention
    // here: the pair cannot be added to DOCUMENTED_PAIRS at either size class without the loop
    // above going red. Asserted against the *large* threshold, the weaker of the two, because
    // clearing 3:1 is the only way this could sneak in as a documented heading colour.
    expect(contrastRatio(ROSA_RAW, WHITE)).toBeLessThan(AA_LARGE_TEXT)
  })

  /*
   * FR-017's white clause has a second half — "on white, body text is navy" — and it is
   * deliberately NOT asserted here, having been written and then measured away.
   *
   * `contrast(navy, white)` is **strictly greater** than `contrast(navy, claro)` for every
   * value of navy, because claro (#DCE7E3) is darker than white and navy is darker than both.
   * `{ fg: 'navy', bg: 'claro', size: 'small' }` is already in DOCUMENTED_PAIRS, so the loop
   * above dominates the white case: measured at 16.63 vs 13.13 as committed, and 3.11 vs 2.45
   * at a lightened #8891B4. A navy-on-white assertion can therefore never be the only red —
   * the claro pair fails first, always.
   *
   * That makes it a gate that cannot fire, which is the failure this project has now hit five
   * times (plan § Risks, "a gate asserts the absence of something that never existed"). The
   * white surface is covered, and covered more strictly, by a pair that is already documented.
   */
})
