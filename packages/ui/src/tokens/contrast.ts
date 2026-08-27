/**
 * T007c / FR-017, SC-006 — WCAG 2.x contrast ratio over sRGB hex colours.
 *
 * Exported rather than inlined in the pair test (T008) on purpose: a test that carries its own
 * copy of the arithmetic it is checking agrees with itself whichever copy is wrong. Round 4
 * found SC-006 resting on a function no task assigned a file, which is how that happens.
 *
 * The file lives under `tokens/`, the one directory the hex fence (T007/T007b) exempts — it
 * parses hex, it does not author any.
 *
 * @example
 *   contrastRatio('#767676', '#FFFFFF') // 4.5422 — the darkest grey clearing AA on white
 */

/** Accepts `#RRGGBB` or bare `RRGGBB`, any case. Shorthand `#RGB` is deliberately not parsed:
 *  the token data is generated `#RRGGBB`, so accepting a second spelling only widens what a
 *  typo can silently mean. */
const SIX_DIGIT_HEX = /^#?([0-9a-f]{6})$/i

/**
 * sRGB → linear light for one 8-bit channel.
 *
 * The piecewise form is the specification's, not an approximation of it: below the cutoff the
 * curve is linear, above it a 2.4 gamma. Skipping the transform entirely — averaging raw
 * channel bytes — is the common shortcut, and it reports 2.05 for `#767676` on white against a
 * true 4.54, which would wave illegible pairs through the gate at any threshold.
 */
function linearise(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance: linear channels under the ITU-R BT.709 luma weights. */
function relativeLuminance(colour: string): number {
  const match = SIX_DIGIT_HEX.exec(colour.trim())
  if (!match?.[1]) {
    // Coercing an unparsable value to 0 would make it black, and black clears AA against any
    // light background — the gate would report a pass for a colour it never understood. The
    // offending value travels with the message because SC-006 fails in CI, where the failure
    // text is all the debugging there is.
    throw new TypeError(
      `contrastRatio: expected a #RRGGBB hex colour, received ${JSON.stringify(colour)}`,
    )
  }
  const hex = match[1]
  const [r, g, b] = [0, 2, 4].map((i) => linearise(Number.parseInt(hex.slice(i, i + 2), 16)))
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

/**
 * WCAG 2.x contrast ratio between two colours, from 1 (identical) to 21 (white on black).
 *
 * Ordered by luminance rather than by argument, so the result is symmetric: dividing the first
 * argument by the second returns a value below 1 for light-on-dark, and a `>= 4.5` gate would
 * then reject every legible light-on-navy pair while accepting its illegible inverse.
 */
export function contrastRatio(foreground: string, background: string): number {
  const [darker, lighter] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => a - b,
  )
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
}
