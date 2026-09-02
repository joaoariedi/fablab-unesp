import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { Button } from '../src/components/Button'

/**
 * T019 / FR-006 — the canonical primary button.
 *
 * `visual-identity.md` § Botões (decided 2026-08-23, round 5 2026-08-24): primary =
 * **rosa preenchido, texto navy, sombra dura deslocada**. Two earlier renderings are
 * explicitly superseded and must not survive as a variant or a default — the v1 navy fill
 * with a pink outline, and the step-2 navy form button. Both are *navy fills*, which is why
 * the negative case below is about the fill and not about a variant name: a superseded button
 * that came back under a different label would still be navy.
 *
 * ── Why this test calls the component instead of rendering it ───────────────────────────────
 *
 * CLR-003 keeps the test stack at `node` with no `jsdom`/`happy-dom` dependency, so nothing in
 * this package renders (vitest.config.ts states it; plan § "What these tests can and cannot
 * prove" accepts the consequence). A React function component is a plain function returning a
 * plain object, so calling it and reading `element.props` asserts what the component actually
 * puts on the element — no DOM, no `react-dom`, no new dependency. This is the same move the
 * plan made for `clampScale()`: assert the decision as data rather than as pixels.
 *
 * What it therefore cannot prove: that the cascade paints it. That is the workbench (FR-016)
 * and feature 003's Playwright.
 */

const BUTTON_SOURCE_PATH = fileURLToPath(new URL('../src/components/Button.tsx', import.meta.url))

/**
 * A complete hex run, matched anywhere — the eslint colour fence's own pattern (FR-002).
 * Restated here because that fence reads syntax while this reads the *resolved style values*:
 * a hex assembled at runtime is invisible to a selector and visible to this.
 */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])/

/** The element the component returns, typed enough to read its props without `any`. */
function renderElement(): ReactElement<{
  readonly type?: string
  readonly style?: Record<string, unknown>
}> {
  return Button({ children: 'ENVIAR' })
}

function primaryStyle(): Record<string, unknown> {
  const style = renderElement().props.style
  expect(style, 'the primary button must carry its identity as a style object').toBeDefined()
  return style as Record<string, unknown>
}

describe('Button — the canonical primary (FR-006)', () => {
  it('fills with the per-organization accent, never the private raw pink', () => {
    // `--color-primary` and not `--color-rosa-raw` (CLR-001): the two render IDENTICALLY for
    // CITe, so this is the one assertion that can tell a co-branded button from a broken one
    // before a second organization exists.
    expect(primaryStyle().background).toBe('var(--color-primary)')
  })

  it('labels in navy — the documented pair, at body size', () => {
    // { fg: 'navy', bg: 'rosaRaw', size: 'small' } in DOCUMENTED_PAIRS, scored by
    // contrast.test.ts. A label in `--color-claro` would clear nothing that list certifies.
    expect(primaryStyle().color).toBe('var(--color-navy)')
  })

  it('carries the hard offset shadow token, not a shadow of its own', () => {
    // `--shadow-hard` is `4px 4px 0px var(--color-navy)` with a deliberate 0 blur. Writing the
    // offset inline here would be a second definition free to drift soft.
    expect(primaryStyle().boxShadow).toBe('var(--shadow-hard)')
  })

  it('is not the superseded navy fill of the v1 mockup or the step-2 form button', () => {
    const background = primaryStyle().background
    // Asserted as a string first: without this the two negatives below pass on `undefined`,
    // which is the vacuous shape a button with no styling at all would satisfy.
    expect(typeof background).toBe('string')
    expect(background).not.toBe('var(--color-navy)')
    expect(background).not.toBe('var(--color-rosa-raw)')
  })

  it('resolves every colour through a token — no literal reaches the style object', () => {
    for (const [property, value] of Object.entries(primaryStyle())) {
      if (typeof value !== 'string') continue
      expect(`${property}: ${value}`).not.toMatch(HEX_COLOUR)
    }
    expect(readFileSync(BUTTON_SOURCE_PATH, 'utf8')).not.toContain('--color-rosa-raw')
  })

  it('renders a real <button> that does not submit a form by accident', () => {
    const element = renderElement()
    expect(element.type).toBe('button')
    // The HTML default for a button inside a form is `submit`. A shared component that
    // inherits that default turns every decorative button in a form into a submit control.
    expect(element.props.type).toBe('button')
  })

  it('stays a server component — no client island for a static button (FR-014)', () => {
    expect(readFileSync(BUTTON_SOURCE_PATH, 'utf8')).not.toContain('use client')
  })
})
