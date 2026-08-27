/**
 * T006 / FR-001, FR-017 — the token surface as *data*.
 *
 * `palette.css` (T004) is where the colours are defined for the browser; this file is where
 * they are defined for the tests. Everything downstream iterates these two exports rather than
 * restating them: `contrast.test.ts` (T008) loops `DOCUMENTED_PAIRS` and resolves each colour
 * through `PALETTE`, so adding a pair adds a test case and no test file has to be edited.
 *
 * The reason that matters is the failure it removes. A test that carries its own list of pairs
 * asserts that the data equals the test author's memory of it — it stays green when a pair is
 * added and stays green when a pair is wrong. Reading the same array the library documents is
 * the only version of this check with anything behind it.
 *
 * ── The cost of a second copy, and what pays for it ─────────────────────────────────────────
 *
 * `PALETTE` repeats seven hexes that already exist in `palette.css`, and a second copy can
 * drift in both directions invisibly: change `--color-teal` in CSS and `DOCUMENTED_PAIRS` goes
 * on certifying the old colour's contrast; add a key here that no stylesheet defines and a pair
 * gets documented against a value no component can paint. `tests/token-data.test.ts` closes
 * both directions by parsing `palette.css` and comparing — the same arrangement
 * `layout-tokens.test.ts` uses for the breakpoints, where the stylesheet is the source of truth
 * and the test holds the copy to it.
 *
 * The copy is not avoidable: there is no DOM and no CSS parser in this package's test stack
 * (CLR-003), so a component or a test that needs a colour *value* cannot ask the cascade for
 * one. What is avoidable is the drift, and that is a test rather than a convention.
 *
 * ── The file is `tokens/`, which is the only place a hex may be written ─────────────────────
 *
 * The colour fence (T007 / T007b) exempts exactly this directory. Every hex below therefore has
 * its one legitimate home here; a component reaches for `var(--color-…)` instead.
 */

/**
 * The platform palette, keyed by token name (FR-001; the 2026-08-23 decision makes these
 * values definitive, and mockup render drift is ignored).
 *
 * **`primary` is deliberately absent.** `--color-primary` is the one per-organization token
 * (CLR-001) — it resolves from `theme.primaryColor` at request time. A fixed hex for it here
 * would be CITe's default wearing a platform token's name, and `DOCUMENTED_PAIRS` would then
 * certify the contrast of a colour any organization is free to replace. The default's *value*
 * is documented under its real name, `rosaRaw`, which is what it actually is.
 *
 * **`white` is absent too**, for the mirror-image reason: `#FFFFFF` is not a palette token, so
 * a `white` key would be a colour with no custom property behind it — precisely the drift the
 * test guards. FR-017's white clause (body text on white is navy; small pink on white is
 * forbidden) is pinned in `contrast.test.ts` against values quoted from `contracts/tokens.md`.
 *
 * @example PALETTE.navy // '#191C37'
 */
export const PALETTE = {
  navy: '#191C37',
  azul: '#3760AA',
  teal: '#74B7A5',
  amarelo: '#F8C810',
  laranja: '#EE703E',
  claro: '#DCE7E3',
  /** PRIVATE (CLR-001): the *default* for `--color-primary`, never an accent a component uses. */
  rosaRaw: '#EE9DC4',
} as const

/** A platform colour token name. Narrow on purpose: a typo is a compile error, not a pair that
 *  silently scores `undefined` against its background. */
export type ColourToken = keyof typeof PALETTE

/** Every colour token name, iterable. `Object.keys` widens to `string[]`, which would let an
 *  unknown name through the places that consume this list. */
export const COLOUR_TOKENS = Object.keys(PALETTE) as ReadonlyArray<ColourToken>

/**
 * The CSS custom property a colour token is published as.
 *
 * The camelCase → kebab-case step is the whole reason this is a function rather than a template
 * literal at each call site: `'--color-' + 'rosaRaw'` yields `--color-rosaRaw`, a property no
 * stylesheet defines, and an unknown custom property makes no noise at all — `var()` simply
 * falls back or resolves to nothing.
 *
 * @example colourProperty('rosaRaw') // '--color-rosa-raw'
 */
export function colourProperty(token: ColourToken): string {
  return `--color-${token.replace(/[A-Z]/g, (upper) => `-${upper.toLowerCase()}`)}`
}

/**
 * The two size classes WCAG AA defines, and deliberately only two — 4.5:1 for body text, 3:1
 * for large text (>= 24px, or >= 18.66px bold). The class states how the pair is *used*, not
 * the best threshold it happens to clear.
 */
export type TextSize = 'small' | 'large'

/** A foreground/background combination components are allowed to rely on, at a size class. */
export interface DocumentedPair {
  readonly fg: ColourToken
  readonly bg: ColourToken
  readonly size: TextSize
}

/**
 * The colour combinations this library documents (FR-017, SC-006).
 *
 * **This list is a promise, and `contrast.test.ts` is what makes it one: a pair that fails AA
 * cannot be documented.** When a combination cannot clear its threshold the remedy is to remove
 * it here — or to restate its size class if it is genuinely only ever set at display sizes —
 * never to bend the threshold in the test.
 *
 * Every entry is a pair a component actually uses; the list is not the set of combinations that
 * happen to pass. Documenting a pair nobody paints would grow the gate without protecting
 * anything, and would make the failing case ("this pair is used and cannot be") indistinguishable
 * from the theoretical one.
 *
 * `rosaRaw` appears as the stand-in for `--color-primary`'s **default** — the only value of that
 * token this package can check. An organization that sets a light `theme.primaryColor` gets a
 * pair nothing here has scored; FR-019 validates the *shape* of that value, not its contrast,
 * and closing that gap needs the theme editor's own check in feature 007.
 */
export const DOCUMENTED_PAIRS: readonly DocumentedPair[] = [
  // Body text on the navy base (FR-011) and on the light surfaces, the two workhorse pairs.
  { fg: 'claro', bg: 'navy', size: 'small' },
  { fg: 'navy', bg: 'claro', size: 'small' },

  // The primary button: pink fill, navy label (FR-006). The most-repeated pair in the library.
  { fg: 'navy', bg: 'rosaRaw', size: 'small' },

  // The default accent as text — CTA labels on dark, active tab labels, card titles (CLR-001).
  // This is the answer to the open question in visual-identity.md § Paleta: pink on navy scores
  // 8.12:1, so it is legible at body size and needs no "headings only" caveat.
  { fg: 'rosaRaw', bg: 'navy', size: 'small' },

  // XP, rewards and mission numbering on the navy base.
  { fg: 'amarelo', bg: 'navy', size: 'small' },

  // The teal hero band, both directions: navy text on the band, teal status chips on the base.
  { fg: 'navy', bg: 'teal', size: 'small' },
  { fg: 'teal', bg: 'navy', size: 'small' },

  // Links and icons on light surfaces.
  { fg: 'azul', bg: 'claro', size: 'small' },

  // The logo lockup on the navy base. Documented as `large` because that is how it is used —
  // display type only — not because it needs the weaker threshold: it clears 5.56:1. Laranja is
  // never body text, and documenting it as `small` would certify a usage the design forbids.
  { fg: 'laranja', bg: 'navy', size: 'large' },
]
