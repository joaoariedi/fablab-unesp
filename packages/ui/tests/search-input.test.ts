import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { SearchInput } from '../src/components/SearchInput'
import { colourProperty, DOCUMENTED_PAIRS } from '../src/tokens'

/**
 * T024 / FR-006 — the search field.
 *
 * `visual-identity.md` § Busca: *"input arredondado com ícone de lupa (escuro sobre navy;
 * claro nas páginas de fundo branco)"* — one component, two surfaces. `artigos.md` § "Barra
 * de filtros e busca" fixes the dark rendering precisely: *"campo de busca arredondado, fundo
 * navy, borda clara fina, placeholder `Buscar artigos...` e ícone à direita, **dentro** do
 * campo"*, and then supersedes what the mockup draws: *"no render é um círculo vazado … sem
 * cabo de lupa; usar ícone de lupa na implementação"*. The handle is therefore asserted here,
 * because the mockup is the thing a reader would copy from and it has no handle.
 *
 * ── Why the two surfaces are asserted against DOCUMENTED_PAIRS ──────────────────────────────
 *
 * A second surface is where an uncertified colour pair enters a library: the dark variant is
 * copied, one token is swapped for whatever looks right on a pale page, and the result renders
 * plausibly while clearing nothing FR-017 scored. Pinning each variant's (text, fill) to a pair
 * that `contrast.test.ts` already puts through WCAG AA means an invented combination fails here
 * rather than in an audit — and it keeps working when a pair is added, because the list is read
 * rather than restated.
 *
 * There is no `white` token and this test does not want one: `PALETTE`'s own note records that
 * `#FFFFFF` has no custom property behind it. The light surface is `--color-claro`, the
 * palette's light-surface token, sitting on the white page rather than pretending to be it.
 *
 * ── Why this test calls the component instead of rendering it ───────────────────────────────
 *
 * CLR-003 keeps this package's stack at `node` with no DOM (vitest.config.ts states it), so
 * nothing here renders. A React function component is a plain function returning a plain
 * object, so calling it and walking `props.children` asserts the tree the component builds —
 * the same move as `button.test.ts`, `chip.test.ts` and `card.test.ts`. What it cannot prove is
 * that the cascade paints it: that is the workbench (FR-016) and feature 003's Playwright.
 */

const SOURCE_PATH = fileURLToPath(new URL('../src/components/SearchInput.tsx', import.meta.url))

/** A complete hex run, matched anywhere — the colour fence's own pattern (FR-002). */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])/

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly style?: Record<string, unknown>
  readonly [key: string]: unknown
}>

function field(surface?: 'navy' | 'light'): AnyElement {
  return SearchInput({
    label: 'Buscar artigos',
    placeholder: 'Buscar artigos...',
    ...(surface === undefined ? {} : { surface }),
  }) as AnyElement
}

/** Every element in the tree, in document order, the root included. */
function elementsOf(node: ReactNode): AnyElement[] {
  if (!isValidElement(node)) return []
  const element = node as AnyElement
  const children = element.props.children
  const nested = Array.isArray(children) ? children : [children]
  return [element, ...nested.flatMap(elementsOf)]
}

function styleOf(node: AnyElement): Record<string, unknown> {
  const style = node.props.style
  expect(style, 'the element must carry its identity as a style object').toBeDefined()
  return style as Record<string, unknown>
}

/** The one `<input>` the field wraps. Exactly one, or the assertions below choose a winner. */
function inputOf(root: AnyElement): AnyElement {
  const inputs = elementsOf(root).filter((element) => element.type === 'input')
  expect(inputs, 'the field must render exactly one <input>').toHaveLength(1)
  return inputs[0] as AnyElement
}

function svgOf(root: AnyElement): AnyElement {
  const svgs = elementsOf(root).filter((element) => element.type === 'svg')
  expect(svgs, 'the field must render exactly one icon').toHaveLength(1)
  return svgs[0] as AnyElement
}

/** `var(--color-navy)` → `navy`, so a style value can be looked up in DOCUMENTED_PAIRS. */
function tokenNameOf(value: unknown): string | undefined {
  return DOCUMENTED_PAIRS.flatMap((pair) => [pair.fg, pair.bg]).find(
    (token) => `var(${colourProperty(token)})` === value,
  )
}

describe('SearchInput — the dark field on navy (FR-006)', () => {
  it('fills navy behind a thin light border — "fundo navy, borda clara fina"', () => {
    const style = styleOf(field('navy'))
    expect(style.background).toBe('var(--color-navy)')
    expect(style.border).toBe('1px solid var(--color-claro)')
  })

  it('sets the input text in the light token, because an input inherits neither colour nor face', () => {
    const style = styleOf(inputOf(field('navy')))
    // No browser lets an <input> inherit `color` or `font-family` from its wrapper. Leaving
    // either unset hands the one field a user types into to the UA stylesheet — which on the
    // navy fill means near-black text on near-black.
    expect(style.color).toBe('var(--color-claro)')
    expect(style.fontFamily).toBe('var(--font-body)')
  })

  it('is the surface a caller gets without asking — navy is the base (FR-011)', () => {
    expect(styleOf(field()).background).toBe(styleOf(field('navy')).background)
    expect(styleOf(inputOf(field())).color).toBe(styleOf(inputOf(field('navy'))).color)
  })
})

describe('SearchInput — the light field on white pages (FR-006)', () => {
  it('inverts to a light fill with a navy border, rather than restating the dark one', () => {
    const style = styleOf(field('light'))
    expect(style.background).toBe('var(--color-claro)')
    expect(style.border).toBe('1px solid var(--color-navy)')
  })

  it('sets the input text in navy — the light surface pair, not the dark one carried over', () => {
    expect(styleOf(inputOf(field('light'))).color).toBe('var(--color-navy)')
  })

  it('actually differs from the dark field in fill AND text, not in one of the two', () => {
    // A variant that swaps the fill and keeps the foreground is the failure mode this exists
    // for: it renders as light-on-light and every other assertion above still passes.
    expect(styleOf(field('light')).background).not.toBe(styleOf(field('navy')).background)
    expect(styleOf(inputOf(field('light'))).color).not.toBe(
      styleOf(inputOf(field('navy'))).color,
    )
  })
})

describe('SearchInput — both surfaces are combinations FR-017 has scored', () => {
  for (const surface of ['navy', 'light'] as const) {
    it(`the ${surface} surface uses a pair from DOCUMENTED_PAIRS, at body size`, () => {
      const root = field(surface)
      const fg = tokenNameOf(styleOf(inputOf(root)).color)
      const bg = tokenNameOf(styleOf(root).background)
      expect(fg, 'the input colour must be a documented palette token').toBeDefined()
      expect(bg, 'the field fill must be a documented palette token').toBeDefined()
      // Body size, not large: a placeholder and a typed query are read, never displayed.
      const documented = DOCUMENTED_PAIRS.some(
        (pair) => pair.fg === fg && pair.bg === bg && pair.size === 'small',
      )
      expect(
        documented,
        `${fg} on ${bg} is not in DOCUMENTED_PAIRS at small size, so nothing has scored it`,
      ).toBe(true)
    })
  }
})

describe('SearchInput — rounded, with the magnifier the mockup lacks', () => {
  it('rounds through the radius token the contract assigns to inputs', () => {
    // layout.css: "sm for chips and inputs, md for cards and buttons". An inline pill radius
    // would be a third step nobody could apply consistently.
    expect(styleOf(field('navy')).borderRadius).toBe('var(--radius-sm)')
  })

  it('draws a magnifier — a lens AND a handle, superseding the mockup circle', () => {
    const icon = svgOf(field('navy'))
    const parts = elementsOf(icon).map((element) => element.type)
    expect(parts, 'the lens').toContain('circle')
    // artigos.md: the render is "um círculo vazado … sem cabo de lupa; usar ícone de lupa na
    // implementação". Without this, copying the mockup yields a circle that reads as a dot.
    expect(
      parts.includes('line') || parts.includes('path'),
      'the magnifier needs a handle; the mockup circle alone is the superseded render',
    ).toBe(true)
  })

  it('places the icon inside the field and after the input — "ícone à direita, dentro do campo"', () => {
    const order = elementsOf(field('navy')).map((element) => element.type)
    expect(order.indexOf('svg')).toBeGreaterThan(order.indexOf('input'))
  })

  it('paints the icon in the field foreground via currentColor, so it flips with the surface', () => {
    const icon = svgOf(field('light'))
    // A hard-coded stroke would need a colour per surface and would be wrong on one of them.
    const strokes = elementsOf(icon).map((element) => element.props.stroke)
    expect(strokes.some((stroke) => stroke === 'currentColor')).toBe(true)
    // …and `currentColor` only resolves if the field sets `color` on the shell, since the
    // input's own colour does not reach a sibling.
    expect(styleOf(field('light')).color).toBe('var(--color-navy)')
    expect(styleOf(field('navy')).color).toBe('var(--color-claro)')
  })

  it('hides the icon from assistive tech, which reads the field by its label instead', () => {
    expect(svgOf(field('navy')).props['aria-hidden']).toBe(true)
    const input = inputOf(field('navy'))
    expect(input.props['aria-label']).toBe('Buscar artigos')
    expect(input.props.placeholder).toBe('Buscar artigos...')
    // A placeholder is not an accessible name: it disappears the moment a character is typed.
    expect(input.props['aria-label']).not.toBe(input.props.placeholder)
  })

  it('is a search field, not a bare text box', () => {
    expect(inputOf(field('navy')).props.type).toBe('search')
  })
})

describe('SearchInput — the rules every component in this package keeps', () => {
  it('resolves every colour through a token — no literal reaches any style object', () => {
    for (const surface of ['navy', 'light'] as const) {
      for (const element of elementsOf(field(surface))) {
        for (const [property, value] of Object.entries(element.props.style ?? {})) {
          if (typeof value !== 'string') continue
          expect(`${property}: ${value}`).not.toMatch(HEX_COLOUR)
        }
      }
    }
    const source = readFileSync(SOURCE_PATH, 'utf8')
    expect(source).not.toMatch(HEX_COLOUR)
    // CLR-001: the raw pink follows no organization's theme.
    expect(source).not.toContain('--color-rosa-raw')
  })

  it('stays a server component — an uncontrolled field ships no JavaScript (FR-014)', () => {
    // The field takes no handler: the query lives in the island that composes it, the same
    // split Chip makes for filter state.
    expect(readFileSync(SOURCE_PATH, 'utf8')).not.toContain('use client')
  })
})
