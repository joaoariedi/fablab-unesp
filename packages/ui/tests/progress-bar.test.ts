import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { ProgressBar, percentOf } from '../src/components/ProgressBar'

/**
 * T023 / FR-006 — the continuous progress bar.
 *
 * `visual-identity.md` § "Barras de progresso": *"pips das skills representam 10 níveis …;
 * **contínuas com % para missões e XP**"*. The sentence draws the line this component sits on:
 * a *skill* is ten discrete pips (`SkillPips`, T022) and a *mission or XP* bar is continuous
 * and carries its percentage as text. A continuous bar without the number is the other half of
 * the same decision missing, so the printed `%` is asserted as visible text and not only as an
 * ARIA value — `tech-stack.md:73` records the mission mockup showing 50% / 30% / **0%**, and 0%
 * is exactly the state an unlabelled empty track cannot distinguish from a bar that failed to
 * render.
 *
 * ── Why the progress arrives as value/max and not as a ready-made percentage ─────────────────
 *
 * The two callers count in different units: a mission is a fraction of its steps, and XP is
 * `5 XP por nível` (`aulas.md:132`) — so `3 XP` of a level is 60%, a number the call site would
 * otherwise compute itself. Percentages computed at four call sites round four ways, and the
 * one that floors instead of rounding shows `99%` on a finished mission. `percentOf` is
 * exported so that arithmetic has one home, and so this test can reach it without a renderer.
 *
 * ── Why this test calls the component instead of rendering it ───────────────────────────────
 *
 * CLR-003 keeps this package's stack at `node` with no `jsdom`/`happy-dom` (vitest.config.ts
 * states it), so nothing here renders. A React function component is a plain function returning
 * a plain object, so calling it and walking `props.children` asserts the tree the component
 * actually builds — no DOM, no `react-dom`, no new dependency. Same move as `button.test.ts`,
 * `chip.test.ts`, `card.test.ts` and `skill-pips.test.ts`.
 *
 * What it cannot prove: that the cascade paints a filled strip at the width claimed. That is
 * the workbench (FR-016) and feature 003's Playwright.
 */

const PROGRESS_BAR_SOURCE_PATH = fileURLToPath(
  new URL('../src/components/ProgressBar.tsx', import.meta.url),
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
  readonly 'aria-valuetext'?: string
  readonly 'aria-hidden'?: boolean
}>

function bar(value: number, max?: number): AnyElement {
  return ProgressBar({ value, max, label: 'Missão: primeira impressão' }) as AnyElement
}

/** Every node in the tree, in document order, the root included. */
function walk(node: ReactNode): ReactNode[] {
  if (!isValidElement(node)) {
    return node === null || node === undefined || node === false ? [] : [node]
  }
  const element = node as AnyElement
  const children = element.props.children
  const nested = Array.isArray(children) ? children : [children]
  return [element, ...nested.flatMap(walk)]
}

function elementsOf(node: ReactNode): AnyElement[] {
  return walk(node).filter(isValidElement) as AnyElement[]
}

/** The visible text of the tree — what a sighted reader actually gets. */
function textOf(node: ReactNode): string {
  return walk(node)
    .filter((entry) => typeof entry === 'string' || typeof entry === 'number')
    .join('')
}

function styleOf(element: AnyElement): Record<string, unknown> {
  const style = element.props.style
  expect(style, 'the element must carry its identity as a style object').toBeDefined()
  return style as Record<string, unknown>
}

/** The element carrying `role="progressbar"` — the track, the thing assistive tech announces. */
function track(value: number, max?: number): AnyElement {
  const found = elementsOf(bar(value, max)).find((element) => element.props.role === 'progressbar')
  expect(found, 'the bar must expose a role="progressbar" element').toBeDefined()
  return found as AnyElement
}

/** The painted portion: the one descendant of the track whose width is a percentage. */
function fill(value: number, max?: number): AnyElement {
  const inner = elementsOf(track(value, max)).slice(1)
  const found = inner.find((element) => typeof element.props.style?.width === 'string')
  expect(found, 'the track must contain a fill element with a percentage width').toBeDefined()
  return found as AnyElement
}

describe('ProgressBar — continuous, and it counts in the caller units (FR-006)', () => {
  it('paints the fill as a percentage width, not a fixed size', () => {
    expect(styleOf(fill(50)).width).toBe('50%')
  })

  it('defaults to a percentage scale, so a mission at 30 is 30% wide', () => {
    expect(percentOf(30)).toBe(30)
    expect(styleOf(fill(30)).width).toBe('30%')
  })

  it('scales against max — 3 XP of the 5 that make a level is 60%', () => {
    // `aulas.md:132`: 1 XP per action, 5 XP per level. Without `max` the call site divides,
    // and four call sites round four ways.
    expect(percentOf(3, 5)).toBe(60)
    expect(styleOf(fill(3, 5)).width).toBe('60%')
  })

  it('rounds once, so the printed number and the painted width cannot disagree', () => {
    // 1/3 is 33.333…: a bar 33.333% wide beside a label reading 33% is two roundings, and the
    // pair drifts as soon as one of them changes.
    expect(percentOf(1, 3)).toBe(33)
    expect(styleOf(fill(1, 3)).width).toBe('33%')
    expect(textOf(bar(1, 3))).toContain('33%')
  })

  it('empties at 0 and fills at max, the two ends of the scale', () => {
    expect(styleOf(fill(0)).width).toBe('0%')
    expect(styleOf(fill(5, 5)).width).toBe('100%')
  })

  it('clamps out-of-range progress instead of overflowing the track', () => {
    // Mission counts arrive from the API; an over-complete mission must not paint 140%.
    expect(percentOf(140)).toBe(100)
    expect(styleOf(fill(140)).width).toBe('100%')
    expect(percentOf(-20)).toBe(0)
    expect(styleOf(fill(-20)).width).toBe('0%')
  })

  it('survives a zero or negative max rather than painting NaN%', () => {
    // A mission with no steps yet defined divides by zero; `width: NaN%` is dropped silently
    // by the cascade and the label reads "NaN%" out loud.
    expect(percentOf(1, 0)).toBe(0)
    expect(styleOf(fill(1, 0)).width).toBe('0%')
    expect(textOf(bar(1, 0))).toContain('0%')
    expect(textOf(bar(1, 0))).not.toContain('NaN')
  })
})

describe('ProgressBar — the % is printed, not implied (FR-006)', () => {
  it('prints the percentage as visible text beside the track', () => {
    // "contínuas com % para missões e XP" — the number is half the requirement.
    expect(textOf(bar(50))).toContain('50%')
  })

  it('prints 0% rather than showing an empty track and no number', () => {
    // The mission mockup shows 50% / 30% / 0% (tech-stack.md:73). At 0 the track alone is
    // indistinguishable from a bar that did not render.
    expect(textOf(bar(0))).toContain('0%')
  })

  it('keeps the number out of the accessible tree twice over', () => {
    // The track already announces its value; a duplicated label makes a screen reader read
    // "50 percent, 50 percent".
    // The innermost element whose entire text is the percentage: the root's text is the same
    // string, since the number is the only text the bar renders, so the *last* match in
    // document order is the label itself rather than an ancestor that merely contains it.
    const labels = elementsOf(bar(50)).filter((element) => textOf(element).trim() === '50%')
    const label = labels.at(-1)
    expect(label, 'the percentage must be its own element').toBeDefined()
    expect((label as AnyElement).props['aria-hidden']).toBe(true)
  })
})

describe('ProgressBar — the colours (FR-002, CLR-001)', () => {
  it('fills in teal — the palette token whose role is progress detail', () => {
    // palette.css: `--color-teal` is "hero band, progress detail, status chips".
    expect(styleOf(fill(50)).background).toBe('var(--color-teal)')
  })

  it('does not follow the organization accent — progress is platform data', () => {
    // CLR-001 keeps `--color-primary` to CTAs, active tabs and card titles; a themed bar would
    // recolour every maker's XP with whichever lab they happen to be viewing.
    expect(styleOf(fill(50)).background).not.toBe('var(--color-primary)')
    expect(styleOf(fill(50)).background).not.toBe('var(--color-rosa-raw)')
  })

  it('outlines the empty track rather than leaving a blank gap', () => {
    // Same reason as the empty pips: at 0% the outline is the only thing that says a bar is
    // there at all.
    expect(styleOf(track(0)).border).toBe('1px solid var(--color-claro)')
  })

  it('resolves every colour through a token — no literal reaches any style object', () => {
    for (const element of elementsOf(bar(50, 5))) {
      for (const [property, value] of Object.entries(element.props.style ?? {})) {
        if (typeof value !== 'string') continue
        expect(`${property}: ${value}`).not.toMatch(HEX_COLOUR)
      }
    }
    const source = readFileSync(PROGRESS_BAR_SOURCE_PATH, 'utf8')
    expect(source).not.toMatch(HEX_COLOUR)
    expect(source).not.toContain('--color-rosa-raw')
  })
})

describe('ProgressBar — the rules every component in this package keeps', () => {
  it('states the progress to assistive tech, in the caller units', () => {
    const element = track(3, 5)
    expect(element.props['aria-valuenow']).toBe(3)
    expect(element.props['aria-valuemin']).toBe(0)
    expect(element.props['aria-valuemax']).toBe(5)
    expect(element.props['aria-label']).toContain('Missão: primeira impressão')
  })

  it('announces the same percentage the eye reads, whatever the units', () => {
    // Without `aria-valuetext` a screen reader says "3 of 5" while the label says 60%.
    expect(track(3, 5).props['aria-valuetext']).toBe('60%')
  })

  it('reports the clamped value to assistive tech, not the raw one', () => {
    // Otherwise the track paints full and the screen reader announces 140 of 100.
    expect(track(140).props['aria-valuenow']).toBe(100)
    expect(track(-20).props['aria-valuenow']).toBe(0)
  })

  it('stays a server component — a static bar ships no JavaScript (FR-014)', () => {
    expect(readFileSync(PROGRESS_BAR_SOURCE_PATH, 'utf8')).not.toContain('use client')
  })
})
