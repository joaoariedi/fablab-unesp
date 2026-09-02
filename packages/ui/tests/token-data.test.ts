import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { COLOUR_TOKENS, DOCUMENTED_PAIRS, PALETTE, colourProperty } from '../src/tokens'

/**
 * T006 / FR-001, FR-017 — the token *names* and the documented pairs, as data.
 *
 * Everything downstream of this file iterates rather than restates. `contrast.test.ts` (T008)
 * loops `DOCUMENTED_PAIRS` and looks each colour up in `PALETTE`; a test that instead listed
 * the pairs it expected would assert that the data equals its author's memory of it, and would
 * stay green when a pair was added. So the data has to be the single source — which moves the
 * risk somewhere new, and that is what this file is for:
 *
 *   **`PALETTE` is a second copy of the palette.** The colours already exist, once each, as
 *   custom properties in `tokens/palette.css` (T004). A TypeScript object repeating those seven
 *   hexes can drift from the stylesheet in either direction, and neither drift is visible:
 *   change `--color-teal` in CSS and every page restyles while `DOCUMENTED_PAIRS` keeps
 *   certifying the *old* colour's contrast; add a colour to `PALETTE` that no stylesheet
 *   defines and a pair gets documented against a value no component can ever paint.
 *
 * Both directions are asserted below, derived from the stylesheet rather than from a list
 * written here. That is the same rule `layout-tokens.test.ts` applies to breakpoints: the
 * token file is the source of truth, and the test is what holds the second copy to it.
 *
 * **Why there is no `white` in `PALETTE`.** FR-017's second clause — body text on white is
 * navy, small pink text on white is forbidden — is not expressible as a documented pair,
 * because `#FFFFFF` is not a palette token: `palette.css` defines the seven identity colours
 * and nothing else. Inventing a `white` key here to make the clause expressible is exactly the
 * drift this file exists to prevent. That clause is pinned instead in `contrast.test.ts`
 * § "the AA thresholds settle visual-identity.md § Paleta on pink", against values quoted from
 * `contracts/tokens.md`.
 */

const PALETTE_PATH = fileURLToPath(new URL('../src/tokens/palette.css', import.meta.url))

/** WCAG 2.x defines two size classes and only two; `contrast.test.ts` scores each one. */
const SIZE_CLASSES = ['small', 'large']

/** Comments may say anything — including a hex, or a token name. Strip them first. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * The `--color-*` declarations in `palette.css` that carry a literal hex, as
 * custom-property name → uppercase hex.
 *
 * `--color-primary` is absent by construction rather than by exclusion: its value is
 * `var(--color-rosa-raw)`, not a hex, so it never matches. That is the correct outcome — it is
 * the one per-organization token (CLR-001), and a fixed hex for it in `PALETTE` would document
 * the contrast of a colour an organization is free to replace.
 */
function paletteHexesFromStylesheet(): Map<string, string> {
  const found = new Map<string, string>()
  const css = stripComments(readFileSync(PALETTE_PATH, 'utf8'))
  for (const match of css.matchAll(/(--color-[a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)) {
    found.set(match[1]!, match[2]!.toUpperCase())
  }
  return found
}

describe('PALETTE is the stylesheet, in TypeScript (FR-001)', () => {
  it('reads at least the six platform colours plus the raw pink out of palette.css', () => {
    // Guards every derived assertion below against a green empty set: if the regex ever stops
    // matching, "every declaration has a PALETTE entry" becomes vacuously true.
    expect(paletteHexesFromStylesheet().size).toBeGreaterThanOrEqual(7)
  })

  it('carries an entry for every colour token the stylesheet defines', () => {
    const missing = [...paletteHexesFromStylesheet().keys()].filter(
      (property) => !COLOUR_TOKENS.some((token) => colourProperty(token) === property),
    )
    expect(missing, `defined in palette.css but absent from PALETTE: ${missing.join(', ')}`).toEqual([])
  })

  it('agrees with the stylesheet on every value', () => {
    const stylesheet = paletteHexesFromStylesheet()
    for (const token of COLOUR_TOKENS) {
      const property = colourProperty(token)
      expect(
        PALETTE[token].toUpperCase(),
        `PALETTE.${token} and ${property} have drifted apart`,
      ).toBe(stylesheet.get(property))
    }
  })

  it('invents no colour: every key resolves to a property palette.css declares', () => {
    const stylesheet = paletteHexesFromStylesheet()
    const invented = COLOUR_TOKENS.filter((token) => !stylesheet.has(colourProperty(token)))
    expect(invented, `PALETTE keys backed by no custom property: ${invented.join(', ')}`).toEqual([])
  })

  it('omits primary — the one per-organization token has no fixed hex to document', () => {
    // CLR-001: `--color-primary` resolves from `theme.primaryColor`. A hex for it here would be
    // CITe's default masquerading as a platform value, and `DOCUMENTED_PAIRS` would then
    // certify the contrast of a colour any organization may replace.
    expect(Object.keys(PALETTE)).not.toContain('primary')
  })

  it('maps a token name to its custom property, so tests iterate names rather than retype them', () => {
    expect(colourProperty('navy')).toBe('--color-navy')
    // The kebab-case case is the one worth pinning: `rosaRaw` is two words in TypeScript and
    // three segments in CSS, and a naive `'--color-' + token` would silently produce
    // `--color-rosaRaw` — a property no stylesheet defines and no cascade would complain about.
    expect(colourProperty('rosaRaw')).toBe('--color-rosa-raw')
  })

  it('lists every PALETTE key in COLOUR_TOKENS — the iterable form of the same data', () => {
    expect([...COLOUR_TOKENS].sort()).toEqual(Object.keys(PALETTE).sort())
  })
})

describe('DOCUMENTED_PAIRS is iterable data (FR-017)', () => {
  it('is a non-empty array — a loop over nothing is a suite that certifies nothing', () => {
    expect(Array.isArray(DOCUMENTED_PAIRS)).toBe(true)
    expect(DOCUMENTED_PAIRS.length).toBeGreaterThan(0)
  })

  it('names only colours PALETTE defines', () => {
    const known = new Set<string>(Object.keys(PALETTE))
    const unknown = DOCUMENTED_PAIRS.flatMap(({ fg, bg }) =>
      [fg, bg].filter((token) => !known.has(token)),
    )
    expect(unknown, `documented against colours PALETTE lacks: ${unknown.join(', ')}`).toEqual([])
  })

  it('declares only size classes WCAG AA defines', () => {
    // `contrast.test.ts` throws on an unrecognised class rather than defaulting to the stricter
    // threshold, so a typo here fails loudly there. Catching it at the data keeps that failure
    // pointing at the pair rather than at the maths.
    const unknownSizes = DOCUMENTED_PAIRS.map(({ size }) => size).filter(
      (size) => !SIZE_CLASSES.includes(size),
    )
    expect(unknownSizes, `size classes WCAG AA does not define: ${unknownSizes.join(', ')}`).toEqual([])
  })

  it('never documents a colour against itself — that pair scores 1:1 by definition', () => {
    const selfPairs = DOCUMENTED_PAIRS.filter(({ fg, bg }) => fg === bg)
    expect(selfPairs).toEqual([])
  })

  it('documents each foreground/background combination once', () => {
    // A duplicate is not merely noise: two entries for one combination at different size
    // classes means the weaker one is documented, and the AA gate would then pass a pair the
    // stricter entry rejects.
    const seen = DOCUMENTED_PAIRS.map(({ fg, bg }) => `${fg} on ${bg}`)
    expect(seen).toEqual([...new Set(seen)])
  })

  it('documents the primary button’s own pair — navy label on the default pink fill', () => {
    // FR-006 makes the primary button pink-filled with navy text, and that combination is the
    // single most-used pair in the library. If the data is allowed to omit it, the AA gate
    // passes while the one pair a reviewer would check by eye is uncertified.
    const button = DOCUMENTED_PAIRS.find(({ fg, bg }) => fg === 'navy' && bg === 'rosaRaw')
    expect(button, 'navy on rosaRaw is not documented').toBeDefined()
  })
})
