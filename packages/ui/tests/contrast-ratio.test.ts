import { describe, expect, it } from 'vitest'

import { contrastRatio } from '../src/tokens/contrast'

/**
 * T007c / FR-017, SC-006 — the sRGB arithmetic every documented token pair is judged by.
 *
 * This file asserts the *function*. T008 (`tests/contrast.test.ts`) asserts the *pairs* with
 * it. The split is the reason this task exists at all: round 4 found SC-006 resting on a
 * function no task assigned a file, so the pair test would have had to restate the maths it
 * was checking — and a test that restates its subject agrees with itself no matter which of
 * the two is wrong.
 *
 * **The anchors are published values, not values this implementation produced.** WCAG 2 fixes
 * `#767676` as the darkest grey that clears AA on white (4.54) and `#777777` as the first that
 * misses it (4.48); white-on-black is 21 by definition. Deriving expectations from the code
 * under test is the failure mode a contrast gate is most exposed to — it stays green while the
 * whole palette is illegible.
 *
 * That one-step grey boundary is also what pins the **linearisation**. An implementation that
 * skips it and averages raw channel bytes reports 2.05 for `#767676` on white — a pair the
 * gate would then wave through at any threshold. The two greys differ by a single byte, so
 * nothing but correct gamma handling can land one either side of 4.5.
 */

/** WCAG 2.x AA for body text. `#767676`/`#777777` straddle it by one byte of grey. */
const AA_NORMAL_TEXT = 4.5

describe('contrastRatio() — WCAG 2.x relative luminance (FR-017)', () => {
  it('reports 21:1 for white on black, the defined maximum', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5)
  })

  it('reports 1:1 for a colour against itself, the defined minimum', () => {
    expect(contrastRatio('#0D1B2A', '#0D1B2A')).toBeCloseTo(1, 10)
  })

  it('is symmetric — the ratio does not depend on which colour is called foreground', () => {
    // The formula orders by luminance, not by argument. A version that divides fg by bg
    // returns a value below 1 for light-on-dark, and `toBeGreaterThanOrEqual(4.5)` would then
    // fail every legible light-on-navy pair while passing the illegible inverse.
    expect(contrastRatio('#EE703E', '#0D1B2A')).toBeCloseTo(contrastRatio('#0D1B2A', '#EE703E'), 10)
  })

  it('puts #767676 on white just above AA, matching the published 4.54:1', () => {
    const ratio = contrastRatio('#767676', '#FFFFFF')
    expect(ratio).toBeCloseTo(4.5422, 3)
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })

  it('puts #777777 on white just below AA, matching the published 4.48:1', () => {
    // One byte darker passes, this one fails. Nothing short of correct sRGB linearisation
    // separates them: a raw-byte implementation reports ~2.05 for both.
    const ratio = contrastRatio('#777777', '#FFFFFF')
    expect(ratio).toBeCloseTo(4.4781, 3)
    expect(ratio).toBeLessThan(AA_NORMAL_TEXT)
  })

  it('uses the linear segment below the 0.03928 cutoff for very dark channels', () => {
    // #0A0A0A sits at 0.0392 — under the cutoff, so the piecewise branch the power curve
    // alone would miss. The two forms are near-continuous by construction, so this asserts a
    // tight value rather than a threshold: it is the only case that executes that branch.
    expect(contrastRatio('#0A0A0A', '#FFFFFF')).toBeCloseTo(19.7981, 3)
  })

  it('accepts lowercase hex and a missing leading #, since token data is hand-written', () => {
    const canonical = contrastRatio('#767676', '#FFFFFF')
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(canonical, 10)
    expect(contrastRatio('767676', 'ffffff')).toBeCloseTo(canonical, 10)
  })

  it.each(['#FFF', '#GGGGGG', 'white', '#FFFFFFFF', ''])(
    'refuses %o rather than scoring it',
    (malformed) => {
      // Silently coercing an unparsable colour to 0 makes it black, and black against a light
      // background clears AA comfortably — the gate would report a pass for a value it never
      // understood. Asserted in both argument positions because a guard applied to one
      // parameter and not the other is the shape this actually breaks in.
      expect(() => contrastRatio(malformed, '#FFFFFF')).toThrow()
      expect(() => contrastRatio('#FFFFFF', malformed)).toThrow()
    },
  )

  it('names the offending value and the expected shape when it refuses', () => {
    // SC-006 fails in CI, where the failure text is the only debugging available. A bare
    // "invalid colour" cannot be acted on without re-running locally.
    let message = ''
    try {
      contrastRatio('#GGGGGG', '#FFFFFF')
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toContain('#GGGGGG')
    expect(message).toMatch(/#RRGGBB/i)
  })
})
