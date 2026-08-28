import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { Chip } from '../src/components/Chip'

/**
 * T021 / FR-006 — the two chips, and the colour that separates them.
 *
 * `visual-identity.md` § "Chips/tabs de filtro" (round 5, 2026-08-24) decides both halves:
 * a **filter** chip is display text in caps whose active item is underlined and painted in
 * the accent; a **status** chip (`Público` on Minha Conta) is **teal `#74B7A5` from the
 * palette** — "o verde saturado fora da paleta do mockup foi trocado pelo teal".
 *
 * The superseded green is the reason the status assertions are written as *equalities on the
 * teal token* rather than as `not.toBe(<some green>)`. The mockup's green has no token, so a
 * negative would have to name a hex this package is not allowed to write, and it would only
 * ever catch the one green somebody typed — not the near-miss `--color-teal` was chosen over.
 * Pinning the token catches every colour that is not teal, including that one.
 *
 * ── Why this test calls the component instead of rendering it ───────────────────────────────
 *
 * CLR-003 keeps the stack at `node` with no `jsdom`/`happy-dom` (vitest.config.ts states it),
 * so nothing in this package renders. A React function component is a plain function returning
 * a plain object, so calling it and reading `element.props` asserts what the component puts on
 * the element — no DOM, no `react-dom`, no new dependency. Same move as `button.test.ts`.
 *
 * What it cannot prove: that the cascade paints it. That is the workbench (FR-016) and
 * feature 003's Playwright.
 */

const CHIP_SOURCE_PATH = fileURLToPath(new URL('../src/components/Chip.tsx', import.meta.url))

/**
 * A complete hex run, matched anywhere — the eslint colour fence's own pattern (FR-002).
 * Restated here because that fence reads syntax while this reads the *resolved style values*:
 * a hex assembled at runtime is invisible to a selector and visible to this.
 */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])/

type ChipElement = ReactElement<{
  readonly style?: Record<string, unknown>
  readonly 'aria-current'?: string
}>

function statusChip(): ChipElement {
  return Chip({ children: 'Público', variant: 'status' })
}

function filterChip(active: boolean): ChipElement {
  return Chip({ children: 'Impressão 3D', variant: 'filter', active })
}

function styleOf(element: ChipElement): Record<string, unknown> {
  const style = element.props.style
  expect(style, 'a chip must carry its identity as a style object').toBeDefined()
  return style as Record<string, unknown>
}

describe('Chip — the status variant is teal (FR-006)', () => {
  it('fills with --color-teal, the palette colour that superseded the mockup green', () => {
    // The token's own role comment in palette.css reads "hero band, progress detail, status
    // chips": this is the usage that token exists for.
    expect(styleOf(statusChip()).background).toBe('var(--color-teal)')
  })

  it('labels in navy — the documented pair, at body size', () => {
    // { fg: 'navy', bg: 'teal', size: 'small' } in DOCUMENTED_PAIRS, scored by
    // contrast.test.ts. Any other label colour is a pair nothing in this package has certified.
    expect(styleOf(statusChip()).color).toBe('var(--color-navy)')
  })

  it('is not the accent, and not the filter chip wearing a different name', () => {
    const status = styleOf(statusChip())
    // Asserted as a string first: without this the negatives below pass on `undefined`, the
    // vacuous shape an unstyled chip would satisfy.
    expect(typeof status.background).toBe('string')
    // A status chip painted in `--color-primary` would follow an organization's theme, which
    // is precisely what a *platform* status colour must not do (CLR-001).
    expect(status.background).not.toBe('var(--color-primary)')
    expect(status.background).not.toBe('var(--color-rosa-raw)')
    // The two variants must be distinguishable at a glance; a teal fill on both is not.
    expect(styleOf(filterChip(false)).background).not.toBe('var(--color-teal)')
  })
})

describe('Chip — the filter variant (FR-006)', () => {
  it('paints the active item in the per-organization accent, never the private raw pink', () => {
    // `--color-primary` and not `--color-rosa-raw` (CLR-001): the two render IDENTICALLY for
    // CITe, so this is the one assertion that can tell a co-branded chip from a broken one
    // before a second organization exists.
    expect(styleOf(filterChip(true)).color).toBe('var(--color-primary)')
  })

  it('underlines the active item — "item ativo sublinhado/rosa", both halves', () => {
    expect(styleOf(filterChip(true)).textDecoration).toBe('underline')
  })

  it('leaves the inactive item unmarked: no underline, no accent', () => {
    const inactive = styleOf(filterChip(false))
    expect(inactive.textDecoration).not.toBe('underline')
    // An inactive chip in the accent would make every filter look selected.
    expect(inactive.color).not.toBe('var(--color-primary)')
    expect(inactive.color).toBe('var(--color-claro)')
  })

  it('sets its own caps in display type, rather than trusting the caller to shout', () => {
    const filter = styleOf(filterChip(false))
    // Button leaves caps to the caller because its labels are copy written in the call site.
    // A filter chip's label is category data arriving from the CMS in natural case, so the
    // caller has nothing to capitalise; `text-transform` also keeps the accessible name and
    // the copyable text intact, which pre-capsing the string does not.
    expect(filter.textTransform).toBe('uppercase')
    expect(filter.fontFamily).toBe('var(--font-display)')
  })

  it('states the active state to assistive tech, not only to the eye', () => {
    // Underline plus colour is the entire visual signal, and neither reaches a screen reader.
    expect(filterChip(true).props['aria-current']).toBe('true')
    expect(filterChip(false).props['aria-current']).toBeUndefined()
  })
})

describe('Chip — the rules every component in this package keeps', () => {
  it('resolves every colour through a token — no literal reaches any style object', () => {
    for (const element of [statusChip(), filterChip(true), filterChip(false)]) {
      for (const [property, value] of Object.entries(styleOf(element))) {
        if (typeof value !== 'string') continue
        expect(`${property}: ${value}`).not.toMatch(HEX_COLOUR)
      }
    }
    const source = readFileSync(CHIP_SOURCE_PATH, 'utf8')
    // Catches the superseded green in the only form it could return: a hex typed into the
    // component. The fence would refuse it too — this fails in the suite that owns the rule.
    expect(source).not.toMatch(HEX_COLOUR)
    expect(source).not.toContain('--color-rosa-raw')
  })

  it('renders an inert element, leaving interaction to the island that owns it (FR-014)', () => {
    // A chip is a label; the filtering is state, and state lives in the composing island.
    expect(statusChip().type).toBe('span')
    expect(filterChip(true).type).toBe('span')
    expect(readFileSync(CHIP_SOURCE_PATH, 'utf8')).not.toContain('use client')
  })
})
