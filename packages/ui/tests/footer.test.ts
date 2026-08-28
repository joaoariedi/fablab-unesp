import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { ISO_SHAPES, type IsoShapeName } from '../src/shapes/geometry'
import { FOOTER_PILLARS, Footer } from '../src/shell/Footer'

/**
 * T034 / FR-010, US1 — the institutional footer.
 *
 * FR-010 is one sentence with three assertable halves: *"three pillars with **outline icons**
 * (Aprenda fazendo / Compartilhe conhecimento / Desenvolva projetos reais) plus the
 * **isometric composition**"*. `home.md` § *Footer institucional* adds the arrangement —
 * *"três pilares … em linha … separadores verticais entre os pilares e composição de slabs
 * isométricos … no canto direito"* — and `aulas.md` § *Adaptação mobile* the compact one:
 * *"pilares empilhados, um por linha, **sem divisórias verticais**"*.
 *
 * ── Why "outline" is asserted through the geometry and not through a class name ─────────────
 *
 * "Outline icon" is the one word of FR-010 that a reviewer cannot check by reading the markup:
 * every shape in the FR-015 vocabulary renders as the same `<svg>`, and the difference between
 * a solid and an outline is `paint: 'stroke'` in `shapes/geometry.ts`. So the icons are
 * followed back to their primitives here. Naming a filled cube `fl-footer__icon--outline`
 * would otherwise satisfy any structural check while shipping the wrong drawing.
 *
 * ── Why the component is called rather than rendered ────────────────────────────────────────
 *
 * CLR-003 keeps this package at `node` with no DOM. A React function component is a plain
 * function returning a plain object, so calling it and walking `props.children` asserts the
 * tree it builds — the move `header-nav.test.ts` and `card.test.ts` both make. Calling it at
 * all is also the FR-014 assertion: a component holding state throws outside a renderer, so a
 * footer that grew a hook fails every case below rather than one.
 *
 * What this cannot prove is that a browser paints the pillars in a row at 834 and stacks them
 * at 390, or that the composition lands in the corner — plan § *"What these tests can and
 * cannot prove"* leaves that to feature 003's Playwright. The cascade is read from the text.
 */

const SOURCE_PATH = fileURLToPath(new URL('../src/shell/Footer.tsx', import.meta.url))

/** A complete hex run, matched anywhere — the colour fence's own pattern (FR-002). */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])/

/** The design targets a `.tsx` stylesheet may mention. 390 is the base layer, never a query. */
const WIDE_TARGETS = new Set(['834', '1440'])

/** FR-010's three pillars, verbatim from the requirement, in the order it writes them. */
const CANONICAL_PILLARS = [
  'Aprenda fazendo',
  'Compartilhe conhecimento',
  'Desenvolva projetos reais',
] as const

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly className?: string
  readonly style?: Record<string, unknown>
  readonly [key: string]: unknown
}>

function footer(): AnyElement {
  return Footer() as AnyElement
}

/** Every element in the tree, depth-first — the walk the sibling shell suites use. */
function descendants(element: AnyElement): AnyElement[] {
  const found: AnyElement[] = []
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child as ReactNode)
      return
    }
    if (!isValidElement(node)) return
    const typed = node as AnyElement
    found.push(typed)
    visit(typed.props.children)
  }
  visit(element.props.children)
  return found
}

function classesOf(element: AnyElement): string[] {
  return (element.props.className ?? '').split(/\s+/).filter((name) => name !== '')
}

/** Every `IsoShape` in a subtree, in document order. Matched by component identity, not name. */
function shapesOf(element: AnyElement): AnyElement[] {
  return [element, ...descendants(element)].filter(
    (node) => typeof node.type === 'function' && (node.type as { name?: string }).name === 'IsoShape',
  )
}

/** The text a subtree renders, joined — the pillar label as a reader would hear it. */
function textOf(element: AnyElement): string {
  const parts: string[] = []
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child as ReactNode)
      return
    }
    if (typeof node === 'string') {
      parts.push(node)
      return
    }
    if (isValidElement(node)) visit((node as AnyElement).props.children)
  }
  visit(element.props.children)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/** The stylesheet the component ships with itself, read out of its own tree. */
function styleText(element: AnyElement): string {
  const styles = descendants(element).filter((node) => node.type === 'style')
  expect(styles, 'the footer rules must travel with the component, as one <style>').toHaveLength(1)
  const children = (styles[0] as AnyElement).props.children
  const text = (Array.isArray(children) ? children : [children]).join('')
  return text.replace(/\/\*[\s\S]*?\*\//g, '')
}

interface Layer {
  /** The media condition, or `null` for the base (mobile-first) layer. */
  readonly condition: string | null
  readonly css: string
}

/**
 * The stylesheet split into its base layer and one layer per `@media` block.
 *
 * Brace-counted rather than regexed, for the reason `header-nav.test.ts` records: a lazy
 * `[\s\S]*?}` stops at the first inner `}` and hands back a truncated block, so every
 * "revealed at 834" assertion would pass or fail on where a brace happened to land.
 */
function layers(css: string): Layer[] {
  const found: Layer[] = []
  let base = ''
  let cursor = 0
  while (cursor < css.length) {
    const at = css.indexOf('@media', cursor)
    if (at === -1) {
      base += css.slice(cursor)
      break
    }
    base += css.slice(cursor, at)
    const open = css.indexOf('{', at)
    expect(open, `@media with no block: ${css.slice(at, at + 40)}`).toBeGreaterThan(-1)
    let depth = 0
    let end = open
    for (; end < css.length; end += 1) {
      if (css[end] === '{') depth += 1
      else if (css[end] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    expect(depth, `unbalanced @media block: ${css.slice(at, at + 40)}`).toBe(0)
    found.push({
      condition: css.slice(at + '@media'.length, open).trim(),
      css: css.slice(open + 1, end),
    })
    cursor = end + 1
  }
  return [{ condition: null, css: base }, ...found]
}

function layerAt(css: string, condition: string | null): Layer {
  const match = layers(css).filter((layer) => layer.condition === condition)
  expect(match, `no layer for ${condition ?? 'the base'}`).toHaveLength(1)
  return match[0] as Layer
}

/**
 * Every declaration a layer makes for a selector that mentions `className`.
 *
 * Deliberately looser than the sibling suites' exact-selector lookup: the divider between
 * pillars is `.pillar + .pillar`, a combinator, and an exact match would silently find
 * nothing and report the rule missing.
 */
function declarationsFor(layer: Layer, className: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const rule of layer.css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (rule[1] ?? '').split(',').map((one) => one.trim())
    if (!selectors.some((one) => new RegExp(`\\.${className}(?![\\w-])`).test(one))) continue
    for (const declaration of (rule[2] ?? '').matchAll(/([-a-zA-Z]+)\s*:\s*([^;]+)/g)) {
      // Last wins, as the cascade resolves it for equal specificity.
      found.set(declaration[1] as string, (declaration[2] ?? '').trim())
    }
  }
  return found
}

describe('the three pillars (FR-010, US1)', () => {
  it('names exactly the three pillars the requirement names, in that order', () => {
    // The order is the decision: `home.md` writes them in one line, and a membership check
    // stays green with "Desenvolva projetos reais" first.
    expect(FOOTER_PILLARS.map((pillar) => pillar.label)).toEqual([...CANONICAL_PILLARS])
  })

  it('renders one pillar per entry and no fourth', () => {
    const pillars = descendants(footer()).filter((node) => node.type === 'li')
    expect(pillars).toHaveLength(FOOTER_PILLARS.length)
  })

  it('renders each label as text, in the order of the data', () => {
    const pillars = descendants(footer()).filter((node) => node.type === 'li')
    expect(pillars.map((pillar) => textOf(pillar).toLowerCase())).toEqual(
      FOOTER_PILLARS.map((pillar) => pillar.label.toLowerCase()),
    )
  })

  it('renders the caps of the mockup through the cascade, not through the data', () => {
    // `artigos.md`: *"rótulo em duas linhas caps"*. Uppercasing the strings themselves would
    // put presentation into the copy and hand a screen reader "A P R E N D A" spelling on
    // some engines — text-transform is the layer that owns it.
    expect(FOOTER_PILLARS.map((pillar) => pillar.label)).not.toEqual(
      FOOTER_PILLARS.map((pillar) => pillar.label.toUpperCase()),
    )
    const css = styleText(footer())
    const label = declarationsFor(layerAt(css, null), 'fl-footer__label')
    expect(label.get('text-transform')).toBe('uppercase')
  })

  it('groups the pillars in a list, inside the contentinfo landmark', () => {
    // Three peers, so a list: a screen reader announces "list, 3 items" and lets a user skip
    // it. Three loose <div>s announce nothing at all.
    const tree = footer()
    expect(tree.type).toBe('footer')
    expect(descendants(tree).filter((node) => node.type === 'ul')).toHaveLength(1)
  })
})

describe('the pillar icons are outlines (FR-010, FR-015)', () => {
  const iconOf = (pillar: AnyElement): AnyElement => {
    const shapes = shapesOf(pillar)
    expect(shapes, `pillar "${textOf(pillar)}" carries exactly one icon`).toHaveLength(1)
    return shapes[0] as AnyElement
  }

  const pillars = (): AnyElement[] => descendants(footer()).filter((node) => node.type === 'li')

  it('draws every icon from the FR-015 vocabulary rather than a one-off asset', () => {
    const found = pillars()
    expect(found, 'a vacuous loop asserts nothing').toHaveLength(FOOTER_PILLARS.length)
    for (const pillar of found) {
      const name = iconOf(pillar).props.name as IsoShapeName
      expect(Object.keys(ISO_SHAPES)).toContain(name)
    }
  })

  it('draws every icon entirely in strokes — the word "outline" in FR-010', () => {
    // The assertion that a class name cannot fake: a solid and an outline are the same
    // element with different geometry, so the primitives are what gets asked.
    const found = pillars()
    expect(found, 'a vacuous loop asserts nothing').toHaveLength(FOOTER_PILLARS.length)
    for (const pillar of found) {
      const name = iconOf(pillar).props.name as IsoShapeName
      const primitives = ISO_SHAPES[name]
      expect(primitives.length, `${name} draws nothing`).toBeGreaterThan(0)
      for (const primitive of primitives) {
        expect(primitive.paint, `${name} is filled, so it is not an outline icon`).toBe('stroke')
      }
    }
  })

  it('gives each pillar a different icon', () => {
    const names = pillars().map((pillar) => iconOf(pillar).props.name)
    expect(new Set(names).size).toBe(FOOTER_PILLARS.length)
  })

  it('keeps the icons decorative — the label already says it', () => {
    // `IsoShape` hides an untitled shape from assistive technology; a title here would make a
    // screen reader read every pillar twice.
    const found = pillars()
    expect(found, 'a vacuous loop asserts nothing').toHaveLength(FOOTER_PILLARS.length)
    for (const pillar of found) {
      expect(iconOf(pillar).props.title).toBeUndefined()
    }
  })
})

describe('the isometric composition (FR-010, FR-015)', () => {
  const composition = (): AnyElement => {
    const found = descendants(footer()).filter((node) =>
      classesOf(node).includes('fl-footer__composition'),
    )
    expect(found, 'the footer carries exactly one isometric composition').toHaveLength(1)
    return found[0] as AnyElement
  }

  it('composes several shapes rather than one — it is a composition', () => {
    // `home.md`: *"composição de slabs isométricos"*; `biblioteca-3d.md`: *"chevrons »
    // extrudados + cubos"*. Both are plural, and a single cube in the corner is not it.
    expect(shapesOf(composition()).length).toBeGreaterThanOrEqual(3)
  })

  it('hides the whole ornament from assistive technology', () => {
    expect(composition().props['aria-hidden']).toBe(true)
  })

  it('takes every colour from a token, and the pink from the themed one (FR-002, CLR-001)', () => {
    // Each piece is coloured by setting `color` on its wrapper: `IsoShape` paints in
    // `currentColor`, so this is the only place a colour can enter the artwork — which is
    // exactly why it is asserted to be a `var()` and never a value.
    const colours = [composition(), ...descendants(composition())]
      .map((node) => node.props.style?.color)
      .filter((colour): colour is string => typeof colour === 'string')
    expect(colours.length, 'the composition sets no colour at all').toBeGreaterThanOrEqual(2)
    for (const colour of colours) expect(colour).toMatch(/^var\(--color-[a-z-]+\)$/)
    expect(new Set(colours).size, 'a multi-colour composition, per the mockups').toBeGreaterThan(1)
    // The mockups' rosa is the ACCENT, so it must follow an organization's theme (CLR-001).
    expect(colours).toContain('var(--color-primary)')
    expect(colours).not.toContain('var(--color-rosa-raw)')
  })

  it('sits in the corner of the band, positioned by the cascade', () => {
    const css = styleText(footer())
    const rules = declarationsFor(layerAt(css, null), 'fl-footer__composition')
    expect(rules.get('position')).toBe('absolute')
    // "no canto **direito**" (home.md, biblioteca-3d.md) — the inline-end side, so the rule
    // still lands correctly if the platform is ever rendered right-to-left.
    expect(rules.has('inset-inline-end')).toBe(true)
  })
})

describe('the band and the compact arrangement (FR-012, FR-002)', () => {
  it('stacks the pillars at 390 and lines them up from 834', () => {
    const css = styleText(footer())
    expect(declarationsFor(layerAt(css, null), 'fl-footer__pillars').get('flex-direction')).toBe(
      'column',
    )
    expect(
      declarationsFor(layerAt(css, '(min-width: 834px)'), 'fl-footer__pillars').get(
        'flex-direction',
      ),
    ).toBe('row')
  })

  it('draws the vertical dividers only where the pillars are side by side', () => {
    // `aulas.md` § mobile: *"pilares empilhados, um por linha, **sem divisórias verticais**"*.
    // A divider declared in the base layer is a stray line above every stacked pillar.
    const css = styleText(footer())
    expect(declarationsFor(layerAt(css, null), 'fl-footer__pillar').has('border-inline-start')).toBe(
      false,
    )
    expect(
      declarationsFor(layerAt(css, '(min-width: 834px)'), 'fl-footer__pillar').get(
        'border-inline-start',
      ),
    ).toBeTypeOf('string')
  })

  it('paints the band from the navy token rather than a new colour', () => {
    // *"A faixa do rodapé usa um navy mais claro que o fundo da página"* (home.md). The exact
    // tone is still **(proposta)** with the designer (biblioteca-3d.md), so it is derived from
    // the two tokens here instead of being invented as a hex that would outlive the question.
    const background = declarationsFor(layerAt(styleText(footer()), null), 'fl-footer').get(
      'background',
    )
    expect(background).toBeTypeOf('string')
    expect(background).toContain('var(--color-navy)')
  })

  it('writes every media query mobile-first, at a design target', () => {
    // `layout-tokens.test.ts` enforces this over `.css` files and cannot reach a stylesheet
    // that travels in a `.tsx`; restating it is what keeps `min-width: 800px` out of here.
    const queries = layers(styleText(footer())).filter((layer) => layer.condition !== null)
    expect(queries.length).toBeGreaterThan(0)
    for (const layer of queries) {
      const match = /^\(min-width:\s*(\d+)px\)$/.exec(layer.condition as string)
      expect(match, `not a mobile-first design target: @media ${layer.condition}`).not.toBeNull()
      expect(WIDE_TARGETS).toContain((match as RegExpExecArray)[1])
    }
  })

  it('writes no colour of its own (FR-002, CLR-001)', () => {
    const code = readFileSync(SOURCE_PATH, 'utf8')
    expect(code).not.toMatch(HEX_COLOUR)
    expect(code).not.toContain('--color-rosa-raw')
  })

  it('stays a server component — no directive, no hook (FR-014)', () => {
    // Calling `Footer()` above already proves it: a `useState` resolves through React's
    // dispatcher, which is null outside a renderer, so a footer that grew one would throw.
    // This adds the directive, which has no runtime symptom under `node` at all.
    const code = readFileSync(SOURCE_PATH, 'utf8')
    expect(code).not.toMatch(/^\s*['"]use client['"]/)
  })
})
