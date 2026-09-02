import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { SkillPips, SKILL_PIP_COUNT } from '../src/components/SkillPips'

/**
 * T022 / FR-006 — the skill pips.
 *
 * `visual-identity.md` § "Barras de progresso": *"pips das skills representam **10 níveis**
 * (decidido; o mockup mostra 6 segmentos — superado)"*. spec.md § Decisions repeats it as a
 * decision taken while writing the spec, so 6 is a superseded render and not a variant.
 *
 * That is why the count is asserted as an equality on 10 rather than as `not.toBe(6)`: the
 * mockup's 6 is only the nearest wrong answer, and a component that drew 8, or one that drew
 * one pip per level, would satisfy the negative while missing the decision entirely.
 *
 * The second half of the task — **empty at level 0** — is the case a "fill `level` pips" loop
 * gets right by accident and a 1-based loop gets wrong: `index <= level` paints one pip for a
 * learner who has earned nothing, which reads as level 1 and is the one state a new account
 * spends its first session in.
 *
 * ── Why this test calls the component instead of rendering it ───────────────────────────────
 *
 * CLR-003 keeps this package's stack at `node` with no `jsdom`/`happy-dom` (vitest.config.ts
 * states it), so nothing here renders. A React function component is a plain function
 * returning a plain object, so calling it and walking `props.children` asserts the tree the
 * component actually builds — no DOM, no `react-dom`, no new dependency. Same move as
 * `button.test.ts`, `chip.test.ts` and `card.test.ts`.
 *
 * What it cannot prove: that the cascade paints ten boxes in a row. That is the workbench
 * (FR-016) and feature 003's Playwright.
 */

const SKILL_PIPS_SOURCE_PATH = fileURLToPath(
  new URL('../src/components/SkillPips.tsx', import.meta.url),
)

/** A complete hex run, matched anywhere — the same pattern the colour fence uses (FR-002). */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])/

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly style?: Record<string, unknown>
  readonly role?: string
  readonly 'aria-label'?: string
  readonly 'aria-valuenow'?: number
  readonly 'aria-valuemin'?: number
  readonly 'aria-valuemax'?: number
}>

function pipsFor(level: number): AnyElement {
  return SkillPips({ level, label: 'Impressão 3D' }) as AnyElement
}

function styleOf(element: AnyElement): Record<string, unknown> {
  const style = element.props.style
  expect(style, 'the element must carry its identity as a style object').toBeDefined()
  return style as Record<string, unknown>
}

/** The pip elements, in the order the component emits them. */
function pipElements(level: number): AnyElement[] {
  const children = pipsFor(level).props.children
  const list = (Array.isArray(children) ? children : [children]).filter(isValidElement)
  return list as AnyElement[]
}

/**
 * One character per pip: `#` filled, `.` empty — the whole row as a string, so a failure
 * prints the row that was drawn instead of "expected 7 to be 6". Anything that is neither
 * reading is `?`, which keeps a pip painted some third colour from counting as empty.
 */
function row(level: number): string {
  return pipElements(level)
    .map((pip) => {
      const background = styleOf(pip).background
      if (background === 'var(--color-teal)') return '#'
      if (background === 'transparent') return '.'
      return '?'
    })
    .join('')
}

describe('SkillPips — ten segments, superseding the mockup (FR-006)', () => {
  it('draws exactly 10 pips, the decided count', () => {
    expect(pipElements(4)).toHaveLength(10)
    // The count is the requirement, so it is also a value the workbench and the card footer
    // can read rather than restate — a second `10` typed elsewhere is free to drift to 6.
    expect(SKILL_PIP_COUNT).toBe(10)
  })

  it('draws the same 10 whatever the level — the pips are the scale, not the score', () => {
    // A component that emits one pip per level looks correct at level 10 and draws an empty
    // strip at level 0. The scale is fixed; only the fill moves.
    for (const level of [0, 1, 5, 9, 10]) {
      expect(pipElements(level), `level ${level}`).toHaveLength(10)
    }
  })
})

describe('SkillPips — the fill (FR-006)', () => {
  it('is empty at level 0 — a new account has earned nothing', () => {
    // The case `index <= level` gets wrong: one pip lit for a learner at zero.
    expect(row(0)).toBe('..........')
  })

  it('fills a prefix, not a scatter — level 7 is the first seven', () => {
    expect(row(7)).toBe('#######...')
  })

  it('fills every pip at level 10, the top of the scale', () => {
    expect(row(10)).toBe('##########')
  })

  it('lights exactly one pip at level 1 — the off-by-one on the other side', () => {
    expect(row(1)).toBe('#.........')
  })

  it('clamps a level above the scale instead of growing the strip', () => {
    // XP arriving from the API is not this component's invariant to trust.
    expect(row(12)).toBe('##########')
  })

  it('clamps a negative level to empty rather than filling backwards', () => {
    expect(row(-3)).toBe('..........')
  })

  it('paints the filled pips in teal — the palette token whose role is progress detail', () => {
    const filled = pipElements(3)[0] as AnyElement
    expect(styleOf(filled).background).toBe('var(--color-teal)')
    // Not `--color-primary`: a skill level is platform data, and a per-organization accent
    // here would recolour every learner's progress with the lab they happen to be viewing
    // (CLR-001 keeps theming to CTAs, active tabs and card titles).
    expect(styleOf(filled).background).not.toBe('var(--color-primary)')
  })

  it('leaves the empty pips outlined rather than invisible', () => {
    const empty = pipElements(0)[0] as AnyElement
    // Without a border an empty strip is a blank gap: the learner cannot see there are ten
    // levels to earn, which is the entire information the component carries at level 0.
    expect(styleOf(empty).border).toBe('1px solid var(--color-claro)')
    expect(styleOf(empty).background).not.toBe('var(--color-teal)')
  })
})

describe('SkillPips — the rules every component in this package keeps', () => {
  it('states the level to assistive tech, not only to the eye', () => {
    // Ten boxes in a row carry no accessible name; a screen reader would announce nothing.
    const element = pipsFor(7)
    expect(element.props.role).toBe('meter')
    expect(element.props['aria-valuenow']).toBe(7)
    expect(element.props['aria-valuemin']).toBe(0)
    expect(element.props['aria-valuemax']).toBe(SKILL_PIP_COUNT)
    expect(element.props['aria-label']).toContain('Impressão 3D')
  })

  it('reports the clamped level to assistive tech, not the raw one', () => {
    // Otherwise the strip says ten and the screen reader says twelve.
    expect(pipsFor(12).props['aria-valuenow']).toBe(10)
    expect(pipsFor(-3).props['aria-valuenow']).toBe(0)
  })

  it('resolves every colour through a token — no literal reaches any style object', () => {
    for (const element of [pipsFor(5), ...pipElements(5)]) {
      for (const [property, value] of Object.entries(element.props.style ?? {})) {
        if (typeof value !== 'string') continue
        expect(`${property}: ${value}`).not.toMatch(HEX_COLOUR)
      }
    }
    const source = readFileSync(SKILL_PIPS_SOURCE_PATH, 'utf8')
    expect(source).not.toMatch(HEX_COLOUR)
    expect(source).not.toContain('--color-rosa-raw')
  })

  it('stays a server component — a static strip of pips ships no JavaScript (FR-014)', () => {
    expect(readFileSync(SKILL_PIPS_SOURCE_PATH, 'utf8')).not.toContain('use client')
  })
})
