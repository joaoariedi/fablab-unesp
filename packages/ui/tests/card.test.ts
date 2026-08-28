import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { Card, type CardProps } from '../src/components/Card'

/**
 * T020 / FR-006 — the base content card.
 *
 * `visual-identity.md` § "Direção de arte da UI": *"Cards com contorno fino claro/colorido,
 * cantos levemente arredondados, título em display rosa/claro, corpo em Comfortaa; tag de
 * categoria em chip rosa; rodapé do card com avatar pixel + @handle + nível + curtidas (♥)"*.
 *
 * The card title is one of the three surfaces FR-003 puts under `--color-primary` (CTAs,
 * active tabs, **card titles**), which is why the title colour is asserted by token name and
 * not by appearance: `--color-primary` and `--color-rosa-raw` paint the same pink for CITe,
 * so the only moment the difference is observable is when a second organization exists — long
 * after the mistake would have been made.
 *
 * ── Why this test calls the component instead of rendering it ───────────────────────────────
 *
 * Same constraint as `button.test.ts`: CLR-003 keeps this package's stack at `node` with no
 * DOM, so nothing here renders. A React function component is a plain function returning a
 * plain object, so calling it and walking `props.children` asserts the tree the component
 * actually builds. What it cannot prove is that the cascade paints it — that is the workbench
 * (FR-016) and feature 003's Playwright.
 */

const CARD_SOURCE_PATH = fileURLToPath(new URL('../src/components/Card.tsx', import.meta.url))

/** A complete hex run, matched anywhere — the same pattern the colour fence uses (FR-002). */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])/

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly style?: Record<string, unknown>
}>

/**
 * The pixel avatar the footer must place. A sentinel element rather than a string: the card
 * has to pass the caller's node through untouched (`PixelImage` from T027 is what really goes
 * here), and identity is the only assertion that proves it was not re-created or dropped.
 */
const AVATAR = createElement('img', { src: '/avatar.png', alt: '' })

function props(overrides: Partial<CardProps> = {}): CardProps {
  return {
    title: 'BRAÇO ROBÓTICO',
    category: 'PROJETO',
    author: { avatar: AVATAR, handle: 'ariedi', level: 7 },
    likes: 42,
    ...overrides,
  }
}

/** Every node in the tree, in document order, the root included. */
function walk(node: ReactNode): ReactNode[] {
  if (!isValidElement(node)) return node === null || node === undefined || node === false ? [] : [node]
  const element = node as AnyElement
  const children = element.props.children
  const nested = Array.isArray(children) ? children : [children]
  return [element, ...nested.flatMap(walk)]
}

function elementsOf(node: ReactNode): AnyElement[] {
  return walk(node).filter(isValidElement) as AnyElement[]
}

function textOf(node: ReactNode): string {
  return walk(node)
    .filter((entry) => typeof entry === 'string' || typeof entry === 'number')
    .join(' ')
}

function styleOf(node: ReactNode): Record<string, unknown> {
  const style = (node as AnyElement).props.style
  expect(style, 'the element must carry its identity as a style object').toBeDefined()
  return style as Record<string, unknown>
}

/** The first element of the given tag, e.g. the title heading or the footer. */
function firstOfType(root: ReactNode, type: string): AnyElement {
  const found = elementsOf(root).find((element) => element.type === type)
  expect(found, `the card must render a <${type}>`).toBeDefined()
  return found as AnyElement
}

describe('Card — the base content card (FR-006)', () => {
  it('draws a thin outline in the light token by default', () => {
    // "contorno fino claro/colorido": thin, and light unless the caller asks for the accent.
    expect(styleOf(Card(props())).border).toBe('1px solid var(--color-claro)')
  })

  it('takes the coloured outline on request, never the private raw pink', () => {
    const border = styleOf(Card(props({ outline: 'primary' }))).border
    expect(border).toBe('1px solid var(--color-primary)')
    // CLR-001: `--color-rosa-raw` renders identically for CITe and follows no organization.
    expect(border).not.toContain('--color-rosa-raw')
  })

  it('is softly rounded through the radius token, not a literal', () => {
    // "cantos levemente arredondados" — `--radius-md`, the same step the button uses. An
    // inline `12px` would be a second definition free to drift.
    expect(styleOf(Card(props())).borderRadius).toBe('var(--radius-md)')
  })

  it('sets the body in Comfortaa through --font-body', () => {
    expect(styleOf(Card(props())).fontFamily).toBe('var(--font-body)')
  })

  it('titles in the display face and the per-organization accent', () => {
    const heading = firstOfType(Card(props()), 'h3')
    expect(textOf(heading)).toContain('BRAÇO ROBÓTICO')
    expect(styleOf(heading).fontFamily).toBe('var(--font-display)')
    // FR-003 names card titles as one of the three surfaces `--color-primary` drives.
    expect(styleOf(heading).color).toBe('var(--color-primary)')
  })

  it('carries the category as a chip — accent fill, navy label, small radius', () => {
    const chip = elementsOf(Card(props())).find((element) => textOf(element) === 'PROJETO')
    expect(chip, 'the category must be rendered as its own element, not inlined in the body').toBeDefined()
    const style = styleOf(chip)
    expect(style.background).toBe('var(--color-primary)')
    // The documented pair: navy on the accent. A light label would clear nothing certified.
    expect(style.color).toBe('var(--color-navy)')
    expect(style.borderRadius).toBe('var(--radius-sm)')
  })

  it('footers with the pixel avatar, the handle, the level and the likes, in that order', () => {
    const footer = firstOfType(Card(props()), 'footer')
    // Identity, not a lookalike: the caller's node reaches the footer untouched.
    expect(walk(footer)).toContain(AVATAR)
    expect(textOf(footer)).toMatch(/@ariedi[\s\S]*Nível 7[\s\S]*♥[\s\S]*42/)
  })

  it('renders exactly one @ when the handle already carries one', () => {
    const footer = firstOfType(Card(props({ author: { handle: '@ariedi', level: 3 } })), 'footer')
    expect(textOf(footer)).toContain('@ariedi')
    expect(textOf(footer)).not.toContain('@@')
  })

  it('resolves every colour through a token — no literal reaches any style object', () => {
    for (const element of elementsOf(Card(props({ outline: 'primary' })))) {
      for (const [property, value] of Object.entries(element.props.style ?? {})) {
        if (typeof value !== 'string') continue
        expect(`${property}: ${value}`).not.toMatch(HEX_COLOUR)
      }
    }
    expect(readFileSync(CARD_SOURCE_PATH, 'utf8')).not.toContain('--color-rosa-raw')
  })

  it('stays a server component — a static card ships no JavaScript (FR-014)', () => {
    expect(readFileSync(CARD_SOURCE_PATH, 'utf8')).not.toContain('use client')
  })
})
