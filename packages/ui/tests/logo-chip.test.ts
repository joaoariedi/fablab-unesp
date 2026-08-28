import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LOGO_CHIP_COLOUR,
  LOGO_CHIP_COLOURS,
  LogoChip,
  type LogoChipColour,
} from '../src/components/LogoChip'
import { COLOUR_TOKENS, PALETTE, colourProperty } from '../src/tokens'

/**
 * T018 / FR-007, US4 — the logo is the canonical one, everywhere.
 *
 * `visual-identity.md` § Logo, round 2 (2026-08-23): the header chip is the **laranja**
 * extruded rectangle with the isometric cube **between** `FAB` and `LAB`, as rendered in
 * `design/criar-conta-passo-1.png`. The chip also exists over the other palette colours for
 * posters and non-header material, and the **rosa** variant of the old map mockup "fica como
 * registro" — it survives as a record, never as the thing a caller gets by default.
 *
 * ── Why the default is asserted twice, positively and negatively ────────────────────────────
 *
 * `toBe('var(--color-laranja)')` alone would go green on a component that also lets the pink
 * back in through a second door — an `undefined` colour falling through to the accent, a
 * `colour=""` empty string, a spread that overrides the fill. US4's error case is specifically
 * "the pink chip must not be **reachable** as the header default", so the negative is asserted
 * against the *resolved* fill of the chip a caller gets when they ask for nothing, in every
 * spelling of "nothing" the type system still permits at a JS call site.
 *
 * ── Why the cube is asserted as an ORDER, not as presence ───────────────────────────────────
 *
 * "cube between FAB and LAB" is a claim about position. A test for "the chip contains a cube"
 * passes on `FAB LAB ◆`, on `◆ FAB LAB`, and on a chip that renders the wordmark as one string
 * with the cube parked beside it — three renderings the round-2 decision exists to exclude. So
 * the wordmark line's children are classified and compared as a sequence.
 *
 * ── Why this test calls the component instead of rendering it ───────────────────────────────
 *
 * CLR-003 keeps this package at `node` with no `jsdom`/`happy-dom` (vitest.config.ts states
 * it), so nothing here renders. A React function component is a plain function returning a
 * plain object, so calling it and walking `props.children` asserts what the component puts on
 * the element — no DOM, no `react-dom`, no new dependency. Same move as `chip.test.ts`.
 *
 * What it cannot prove: that the cascade paints it, or that the extruded shadow reads as 3D.
 * That is the workbench (FR-016) and feature 003's Playwright.
 */

const LOGO_CHIP_SOURCE_PATH = fileURLToPath(
  new URL('../src/components/LogoChip.tsx', import.meta.url),
)
const PALETTE_CSS_PATH = fileURLToPath(new URL('../src/tokens/palette.css', import.meta.url))

/** A complete hex run, matched anywhere — the eslint colour fence's own pattern (FR-002). */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])/

/** The lockup's two lines, exactly as `visual-identity.md` § Logo spells them. */
const WORDMARK_FIRST = 'FAB'
const WORDMARK_SECOND = 'LAB'
const LOGOTYPE = 'CITE BAURU'

type AnyProps = {
  readonly style?: Record<string, unknown>
  readonly children?: ReactNode
  readonly href?: string
  readonly 'aria-hidden'?: boolean | string
}
type AnyElement = ReactElement<AnyProps>

function isElement(node: unknown): node is AnyElement {
  return typeof node === 'object' && node !== null && '$$typeof' in node
}

function childrenOf(element: AnyElement): readonly unknown[] {
  const { children } = element.props
  if (children === undefined || children === null) return []
  return Array.isArray(children) ? children : [children]
}

/** Every string in the subtree, concatenated — the text a reader would see. */
function textOf(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isElement(node)) return childrenOf(node).map(textOf).join('')
  return ''
}

/** Every element in the subtree, root first. */
function elementsOf(node: unknown): readonly AnyElement[] {
  if (Array.isArray(node)) return node.flatMap(elementsOf)
  if (!isElement(node)) return []
  return [node, ...childrenOf(node).flatMap(elementsOf)]
}

function styleOf(element: AnyElement): Record<string, unknown> {
  const style = element.props.style
  expect(style, 'the chip must carry its identity as a style object').toBeDefined()
  return style as Record<string, unknown>
}

/** The chip as a caller gets it — `colour` omitted entirely. */
function defaultChip(): AnyElement {
  return LogoChip({}) as AnyElement
}

function chipOf(colour: LogoChipColour): AnyElement {
  return LogoChip({ colour }) as AnyElement
}

/**
 * The element carrying `FAB … LAB`: the deepest one whose text holds both words. Deepest,
 * because the chip root also contains both and would answer this question with the whole chip.
 */
function wordmarkLine(chip: AnyElement): AnyElement {
  const candidates = elementsOf(chip).filter(
    (element) => textOf(element).includes(WORDMARK_FIRST) && textOf(element).includes(WORDMARK_SECOND),
  )
  const line = candidates.at(-1)
  expect(line, 'no element in the chip carries both FAB and LAB').toBeDefined()
  return line as AnyElement
}

/** What one child of the wordmark line is: a word, the cube, or something unaccounted for. */
function classify(node: unknown): string {
  const text = textOf(node).trim()
  if (text === WORDMARK_FIRST) return WORDMARK_FIRST
  if (text === WORDMARK_SECOND) return WORDMARK_SECOND
  if (text === '') {
    const drawsSomething = elementsOf(node).some((element) => typeof element.type === 'string' && element.type === 'svg')
    return drawsSomething ? 'cube' : 'empty'
  }
  return `unexpected(${text})`
}

/**
 * `'var(--color-laranja)'` → `'--color-laranja'`. Anything that is not a lone `var()` reference
 * returns undefined, which is what makes "the fill is a token" assertable rather than assumed.
 */
function tokenReference(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return /^var\((--[a-z0-9-]+)\)$/.exec(value.trim())?.[1]
}

/** Custom property → its palette hex. `--color-primary` is scored at its documented default. */
function hexOfProperty(property: string): string | undefined {
  if (property === '--color-primary') return PALETTE.rosaRaw
  const token = COLOUR_TOKENS.find((name) => colourProperty(name) === property)
  return token === undefined ? undefined : PALETTE[token]
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

describe('LogoChip — the canonical chip is laranja (FR-007, US4)', () => {
  it('defaults to the laranja fill, the round-2 header decision', () => {
    expect(styleOf(defaultChip()).background).toBe('var(--color-laranja)')
  })

  it('names laranja as the default in its own vocabulary', () => {
    // Not a restatement of the assertion above: this is what `HeaderNav` (T028) and the
    // workbench (FR-016) read when they need to say "the canonical one" without a literal.
    expect(DEFAULT_LOGO_CHIP_COLOUR).toBe('laranja')
    expect(LOGO_CHIP_COLOURS).toContain(DEFAULT_LOGO_CHIP_COLOUR)
  })

  it('labels the canonical chip in navy — 5.56:1 on laranja, the documented lockup pair', () => {
    expect(styleOf(defaultChip()).color).toBe('var(--color-navy)')
  })

  it('is extruded: the hard offset shadow, from the token whose 0 blur is the whole point', () => {
    expect(styleOf(defaultChip()).boxShadow).toBe('var(--shadow-hard)')
  })

  it('sets the lockup in the display face — there is no --font-logotype to reach for', () => {
    expect(styleOf(defaultChip()).fontFamily).toBe('var(--font-display)')
  })
})

describe('LogoChip — the pink map-mockup variant is not reachable as the default (US4)', () => {
  it('does not paint the accent when the caller asks for nothing', () => {
    const fill = styleOf(defaultChip()).background
    expect(typeof fill, 'a fill of undefined would satisfy every negative below vacuously').toBe('string')
    expect(fill).not.toBe('var(--color-primary)')
  })

  it('still resolves to laranja when `colour` arrives as undefined from a JS call site', () => {
    // `<LogoChip colour={org.chipColour} />` with an unset field is exactly this call, and it
    // is the door a `colour || 'laranja'`-free default parameter closes and a `??`-less one does not.
    const chip = LogoChip({ colour: undefined }) as AnyElement
    expect(styleOf(chip).background).toBe('var(--color-laranja)')
  })

  it('never references the private raw pink, in any spelling (CLR-001)', () => {
    const source = readFileSync(LOGO_CHIP_SOURCE_PATH, 'utf8')
    expect(source).not.toContain('--color-rosa-raw')
    expect(source).not.toMatch(HEX_COLOUR)
  })
})

describe('LogoChip — the cube sits BETWEEN FAB and LAB (FR-007)', () => {
  it('orders the lockup line as FAB, cube, LAB', () => {
    const children = childrenOf(wordmarkLine(defaultChip()))
    expect(children.map(classify).filter((kind) => kind !== 'empty')).toEqual([
      WORDMARK_FIRST,
      'cube',
      WORDMARK_SECOND,
    ])
  })

  it('keeps the two words as separate nodes — never one "FAB LAB" string beside a cube', () => {
    const glued = elementsOf(defaultChip()).some((element) =>
      childrenOf(element).some(
        (child) =>
          typeof child === 'string' &&
          child.includes(WORDMARK_FIRST) &&
          child.includes(WORDMARK_SECOND),
      ),
    )
    expect(glued, 'the wordmark is one string, so nothing can sit between its words').toBe(false)
  })

  it('carries the logotype line, CITE BAURU', () => {
    expect(textOf(defaultChip())).toContain(LOGOTYPE)
  })

  it('hides the cube from assistive technology — the lockup is read as text, not as "image"', () => {
    const cube = elementsOf(defaultChip()).find((element) => element.type === 'svg')
    expect(cube, 'the cube must be drawn, not typed as a glyph the display face may not carry').toBeDefined()
    expect(cube?.props['aria-hidden']).toBe(true)
  })
})

describe('LogoChip — the other palette colours, for posters and non-header material (US4)', () => {
  it('offers more than the canonical one', () => {
    expect(LOGO_CHIP_COLOURS.length).toBeGreaterThan(1)
  })

  it('paints every colour through a custom property that palette.css actually defines', () => {
    const paletteCss = readFileSync(PALETTE_CSS_PATH, 'utf8')
    for (const colour of LOGO_CHIP_COLOURS) {
      const property = tokenReference(styleOf(chipOf(colour)).background)
      expect(property, `chip colour "${colour}" does not fill through a lone var() reference`).toBeDefined()
      expect(paletteCss, `${property} is referenced by LogoChip but defined nowhere`).toContain(
        `${property}:`,
      )
    }
  })

  it('gives each colour its own fill — no two names painting the same chip', () => {
    const fills = LOGO_CHIP_COLOURS.map((colour) => styleOf(chipOf(colour)).background)
    expect(new Set(fills).size).toBe(LOGO_CHIP_COLOURS.length)
  })

  it('clears 3:1 for display type on every offered colour (FR-017, SC-006)', () => {
    const failures: string[] = []
    for (const colour of LOGO_CHIP_COLOURS) {
      const style = styleOf(chipOf(colour))
      const fill = hexOfProperty(tokenReference(style.background) ?? '')
      const ink = hexOfProperty(tokenReference(style.color) ?? '')
      expect(fill, `chip "${colour}" fills with a property no palette token backs`).toBeDefined()
      expect(ink, `chip "${colour}" inks with a property no palette token backs`).toBeDefined()
      const ratio = contrastRatio(fill ?? '#000000', ink ?? '#000000')
      if (ratio < 3) failures.push(`${colour}: ${ratio.toFixed(2)}:1`)
    }
    expect(failures, `chip colours whose label cannot be read at display size:\n${failures.join('\n')}`).toEqual([])
  })
})

describe('LogoChip — the logo links home when asked, and is inert when not (FR-009)', () => {
  it('renders an anchor carrying the href it was given', () => {
    const chip = LogoChip({ href: '/' }) as AnyElement
    expect(chip.type).toBe('a')
    expect(chip.props.href).toBe('/')
  })

  it('renders no anchor when there is nowhere to go', () => {
    const chip = defaultChip()
    expect(chip.type).not.toBe('a')
    expect(chip.props.href).toBeUndefined()
  })
})
