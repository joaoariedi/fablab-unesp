import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { HeaderNav } from '../src/shell/HeaderNav'
import { DESKTOP_TABS, TABLET_TABS, type ShellTab } from '../src/shell/tabs'

/**
 * T028 / FR-008, US3 — the header bar.
 *
 * US3 decides three states and this file asserts the two structural halves of them:
 * *"desktop shows six tabs and **no menu button**; tablet shows `PROJETOS · CALENDÁRIO ·
 * AULAS · ARTIGOS`; mobile shows a five-position bottom bar … plus a menu button top-right
 * with the logo left"*. The bottom bar is T029 and the menu island is T030; what belongs to
 * *this* component is the bar itself, the six desktop tabs, and the fact that **which tabs
 * appear at which width is decided by the cascade rather than by JavaScript**.
 *
 * ── Why "expressed in CSS" is asserted, and not left to review ───────────────────────────────
 *
 * The tempting implementation is a breakpoint hook: read the width, pick `DESKTOP_TABS` or
 * `TABLET_TABS`, render one of them. It looks identical in every screenshot, and it costs
 * `'use client'` on the whole header to express a media query (plan § Sketch 5, FR-014). The
 * only thing that can tell the two apart from a `node` test is that the correct one emits the
 * union of the sets *plus a stylesheet*, and the wrong one emits a subset plus a hook — so the
 * assertions below are: all six anchors are always in the tree, no width is ever read in JS,
 * and the switching rules exist as real declarations at the design targets.
 *
 * ── Why the media queries are re-checked here ───────────────────────────────────────────────
 *
 * `tests/layout-tokens.test.ts` already rejects any `@media` that is not mobile-first at
 * 390/834/1440 — but it walks `.css` files under `src/`, and this component's rules travel in
 * a `.tsx`. FR-012's guard therefore does not reach them, and restating it below is the only
 * thing that keeps `min-width: 800px` out of this file.
 *
 * ── Why the component is called rather than rendered ────────────────────────────────────────
 *
 * CLR-003 keeps this package at `node` with no DOM (vitest.config.ts states it), so nothing
 * here renders. A React function component is a plain function returning a plain object, so
 * calling it and walking `props.children` asserts the tree it builds — the move
 * `tabs.test.ts`, `card.test.ts` and `logo-chip.test.ts` all make. What it cannot prove is
 * that the cascade actually shows and hides at those widths: that is feature 003's Playwright
 * (plan § "What these tests can and cannot prove").
 */

const SOURCE_PATH = fileURLToPath(new URL('../src/shell/HeaderNav.tsx', import.meta.url))

/** A complete hex run, matched anywhere — the colour fence's own pattern (FR-002). */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])/

/** The three design targets (layout.css). Any other width in a query is a magic number. */
const DESIGN_TARGETS = new Set(['390', '834', '1440'])

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly className?: string
  readonly [key: string]: unknown
}>

function header(menu?: ReactNode): AnyElement {
  return HeaderNav(menu === undefined ? {} : { menu }) as AnyElement
}

/** Every element in the tree, depth-first — the walk `tabs.test.ts` uses, minus the DOM. */
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

/** The element whose children contain `needle`, or `undefined` if it is not in the tree. */
function parentOf(element: AnyElement, needle: ReactNode): AnyElement | undefined {
  return [element, ...descendants(element)].find((node) => {
    const children = node.props.children
    const list = Array.isArray(children) ? children : [children]
    return list.includes(needle)
  })
}

function childrenOf(element: AnyElement): ReactNode[] {
  const children = element.props.children
  return (Array.isArray(children) ? children : [children]) as ReactNode[]
}

function tabsOf(element: AnyElement): AnyElement[] {
  return descendants(element).filter((node) => node.type === 'a')
}

function labelsOf(tabs: readonly ShellTab[]): string[] {
  return tabs.map((tab) => tab.label)
}

function classesOf(element: AnyElement): string[] {
  return (element.props.className ?? '').split(/\s+/).filter((name) => name !== '')
}

function navOf(element: AnyElement): AnyElement {
  const navs = descendants(element).filter((node) => node.type === 'nav')
  expect(navs, 'the header carries exactly one navigation landmark').toHaveLength(1)
  return navs[0] as AnyElement
}

/** The stylesheet the component ships with itself, read out of its own tree. */
function styleTextOf(element: AnyElement): string {
  const styles = descendants(element).filter((node) => node.type === 'style')
  expect(styles, 'the breakpoint rules must travel with the component, as one <style>').toHaveLength(1)
  const text = childrenOf(styles[0] as AnyElement).join('')
  expect(typeof text).toBe('string')
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
 * Brace-counted rather than regexed: a lazy `[\s\S]*?}` stops at the first inner `}`, which
 * would silently hand back a truncated media block and make every "revealed at 1440"
 * assertion below pass or fail on where the closing brace happened to land.
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
    found.push({ condition: css.slice(at + '@media'.length, open).trim(), css: css.slice(open + 1, end) })
    cursor = end + 1
  }
  return [{ condition: null, css: base }, ...found]
}

function layerAt(css: string, condition: string | null): Layer {
  const match = layers(css).filter((layer) => layer.condition === condition)
  expect(match, `no layer for ${condition ?? 'the base'}`).toHaveLength(1)
  return match[0] as Layer
}

/** The value a layer gives `property` for `.selector`, or `undefined` if it says nothing. */
function declaredValue(layer: Layer, className: string, property: string): string | undefined {
  const bodies = [...layer.css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((rule) =>
      (rule[1] ?? '').split(',').some((selector) => selector.trim() === `.${className}`),
    )
    .map((rule) => rule[2] ?? '')
  const values = bodies.flatMap((body) =>
    [...body.matchAll(/([-a-zA-Z]+)\s*:\s*([^;]+)/g)]
      .filter((declaration) => declaration[1] === property)
      .map((declaration) => (declaration[2] ?? '').trim()),
  )
  // Last wins, as the cascade resolves it for equal specificity.
  return values.at(-1)
}

/** Every class name the markup actually puts on an element. */
function classesUsed(element: AnyElement): Set<string> {
  return new Set([element, ...descendants(element)].flatMap(classesOf))
}

/** Every class name the stylesheet writes a rule for. */
function classesStyled(css: string): Set<string> {
  const names = new Set<string>()
  for (const rule of css.matchAll(/([^{}@]+)\{[^{}]*\}/g)) {
    for (const selector of (rule[1] ?? '').split(',')) {
      for (const name of selector.matchAll(/\.([A-Za-z0-9_-]+)/g)) names.add(name[1] as string)
    }
  }
  return names
}

const MENU_SENTINEL = createElement('span', { key: 'menu', id: 'menu-island' })

describe('the desktop bar — the canonical six, from tabs.ts (FR-008, SC-004)', () => {
  it('renders one anchor per desktop tab, in the canonical order', () => {
    // The order IS the decision ("nesta ordem"); a membership check stays green with
    // CALENDÁRIO and AULAS swapped, which is the drift rounds 2 and 3 had to correct.
    expect(tabsOf(header()).map((tab) => tab.props.children)).toEqual(labelsOf(DESKTOP_TABS))
  })

  it('sends each tab to the destination the data gives it', () => {
    expect(tabsOf(header()).map((tab) => tab.props.href)).toEqual(
      DESKTOP_TABS.map((tab) => tab.href),
    )
  })

  it('has six positions and no seventh', () => {
    expect(tabsOf(header())).toHaveLength(6)
  })

  it('takes the labels from tabs.ts instead of retyping them', () => {
    // The failure this guards is a header whose labels agree with the data today and drift
    // from it at the next rename — the same "two literal arrays" defect tabs.ts was extracted
    // to prevent. Comments are stripped first: the sets are quoted in this file's own WHY.
    const code = readFileSync(SOURCE_PATH, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const label of labelsOf(DESKTOP_TABS)) {
      expect(code, `"${label}" is written into HeaderNav.tsx instead of imported`).not.toContain(
        label,
      )
    }
    expect(code).toMatch(/from\s+'\.\/tabs'/)
  })

  it('puts the logo first — "logo left" is the decided position (FR-008)', () => {
    // The stylesheet the component ships is not content, so it is skipped: React 19 hoists a
    // <style> with a precedence out of the flow entirely.
    const [first] = childrenOf(header()).filter(
      (child) => isValidElement(child) && (child as AnyElement).type !== 'style',
    )
    expect(isValidElement(first)).toBe(true)
    expect((first as AnyElement).type).toBeTypeOf('function')
    expect(((first as AnyElement).type as { name?: string }).name).toBe('LogoChip')
  })

  it('names its navigation landmark — a page carries more than one', () => {
    // FR-008's bar plus the category `Tabs` bar are two <nav>s on the same page; unnamed they
    // read as "navigation, navigation" in a screen reader's landmark list.
    expect(navOf(header()).props['aria-label']).toBeTypeOf('string')
    expect(navOf(header()).props['aria-label']).not.toBe('')
  })

  it('opens the one off-site tab in a new tab, and only that one', () => {
    // `concept.md`: *"Instagram | Link externo, abre em nova aba"*. The flag lives in the data
    // (tabs.ts) because the URL may not: `packages/ui` never knows an organization's account.
    const blank = tabsOf(header()).filter((tab) => tab.props.target === '_blank')
    const external = DESKTOP_TABS.filter((tab) => tab.external === true)
    expect(blank.map((tab) => tab.props.children)).toEqual(labelsOf(external))
    for (const tab of blank) {
      // Without `noopener` the opened page gets a handle on this one through `window.opener`.
      expect(String(tab.props.rel ?? '')).toContain('noopener')
    }
  })
})

describe('no menu button at desktop (FR-008, US3)', () => {
  it('renders no button of its own — the menu is T030s island, passed in', () => {
    expect(descendants(header()).filter((node) => node.type === 'button')).toEqual([])
  })

  it('renders nothing extra when no menu is given', () => {
    expect(descendants(header()).some((node) => node.type === 'button')).toBe(false)
  })

  it('hides the menu slot at the desktop target, in CSS rather than by omission', () => {
    // The negative US3 states is about the DESKTOP width only: the same header carries a menu
    // button at 390 and 834. Expressed by omitting the slot it would be a JavaScript decision
    // — and the header would need the width to make it.
    const bar = header(MENU_SENTINEL)
    const slot = parentOf(bar, MENU_SENTINEL)
    expect(slot, 'the menu passed in must be rendered').toBeDefined()
    const css = styleTextOf(bar)
    const [slotClass] = classesOf(slot as AnyElement)
    expect(slotClass, 'the menu slot must carry a class the cascade can hide').toBeTypeOf('string')
    expect(declaredValue(layerAt(css, '(min-width: 1440px)'), slotClass as string, 'display')).toBe(
      'none',
    )
    expect(declaredValue(layerAt(css, null), slotClass as string, 'display')).not.toBe('none')
  })
})

describe('the compact sets are the cascade, not JavaScript (FR-008, FR-014, US3)', () => {
  it('marks exactly the tabs the tablet bar drops', () => {
    // DESKTOP minus TABLET is BIBLIOTECA 3D and INSTAGRAM (SC-005). They are in the markup at
    // every width and hidden by CSS below 1440 — the union rendered once, the cascade choosing.
    const bar = header()
    const compactLabels = new Set(labelsOf(TABLET_TABS))
    const marked = tabsOf(bar).filter((tab) => classesOf(tab).length > 1)
    expect(marked.map((tab) => tab.props.children)).toEqual(
      labelsOf(DESKTOP_TABS).filter((label) => !compactLabels.has(label)),
    )
    expect(marked.length).toBeGreaterThan(0)
  })

  it('hides those tabs in the base layer and reveals them only at 1440', () => {
    const bar = header()
    const compactLabels = new Set(labelsOf(TABLET_TABS))
    const wide = tabsOf(bar).find((tab) => !compactLabels.has(String(tab.props.children)))
    const wideClass = classesOf(wide as AnyElement).at(-1) as string
    const css = styleTextOf(bar)
    expect(declaredValue(layerAt(css, null), wideClass, 'display')).toBe('none')
    // The tablet layer must NOT bring them back: that is the whole of SC-005's negative.
    const tablet = declaredValue(layerAt(css, '(min-width: 834px)'), wideClass, 'display')
    expect(tablet === undefined || tablet === 'none').toBe(true)
    const desktop = declaredValue(layerAt(css, '(min-width: 1440px)'), wideClass, 'display')
    expect(desktop).toBeTypeOf('string')
    expect(desktop).not.toBe('none')
  })

  it('hides the whole tab row below the tablet target — mobile navigates from the bottom bar', () => {
    const bar = header()
    const navClass = classesOf(navOf(bar))[0] as string
    const css = styleTextOf(bar)
    expect(declaredValue(layerAt(css, null), navClass, 'display')).toBe('none')
    const tablet = declaredValue(layerAt(css, '(min-width: 834px)'), navClass, 'display')
    expect(tablet).toBeTypeOf('string')
    expect(tablet).not.toBe('none')
  })

  it('never reads a viewport width in JavaScript', () => {
    // The breakpoint hook this component must not be. Each of these would also drag the whole
    // header across the client boundary for a decision the cascade makes for free.
    const source = readFileSync(SOURCE_PATH, 'utf8')
    for (const forbidden of ['use client', 'matchMedia', 'innerWidth', 'useState', 'useEffect']) {
      expect(source, `HeaderNav must stay a server component: found ${forbidden}`).not.toContain(
        forbidden,
      )
    }
  })
})

describe('the stylesheet itself (FR-012, FR-002)', () => {
  it('queries only the design targets, mobile-first, in px', () => {
    // A restatement of layout-tokens.test.ts, which cannot reach here: it walks `.css` files
    // under src/ and these rules live in a `.tsx`. Both clauses of FR-012 are checked —
    // direction as well as value — because `(max-width: 1440px)` is a desktop-first sheet
    // built entirely out of design targets.
    const css = styleTextOf(header())
    const conditions = layers(css)
      .map((layer) => layer.condition)
      .filter((condition): condition is string => condition !== null)
    expect(conditions.length).toBeGreaterThan(0)
    for (const condition of conditions) {
      const features = [...condition.matchAll(/\(\s*([a-z-]*width)\s*:\s*([^)]+?)\s*\)/g)]
      // Deny by default: a width condition this guard cannot parse — range syntax, for one —
      // is a finding rather than something to skip over.
      expect((condition.match(/width/g) ?? []).length, `unparsed width in ${condition}`).toBe(
        features.length,
      )
      for (const [, feature, value] of features) {
        expect(feature, `${condition} is desktop-first; FR-012 says min-width`).toBe('min-width')
        const px = /^(\d+)px$/.exec(value ?? '')
        expect(px, `${condition}: "${value}" is not a px length`).not.toBeNull()
        expect(DESIGN_TARGETS.has(px?.[1] as string), `${value} is not a design target`).toBe(true)
      }
    }
  })

  it('styles every class it uses and uses every class it styles', () => {
    // Both directions, because both failures are silent: a class in the markup with no rule is
    // an unstyled element, and a rule for a class nobody carries is a breakpoint that switches
    // nothing. The dangling `@import` lesson (styles-entry.test.ts) in class-name form.
    const bar = header(MENU_SENTINEL)
    const used = classesUsed(bar)
    const styled = classesStyled(styleTextOf(bar))
    expect([...used].filter((name) => !styled.has(name)), 'class with no rule').toEqual([])
    expect([...styled].filter((name) => !used.has(name)), 'rule for no class').toEqual([])
  })

  it('resolves every colour through a token — no hex reaches this file', () => {
    // The `.css` half of the fence (scripts/check-colour-tokens.sh) does not read `.tsx`, and
    // this component carries real CSS text, so the hex would sit in the one file type neither
    // half of FR-002 was written for. ESLint's TemplateElement selector is the other guard;
    // this is the one that fails in the same run as the component it belongs to.
    const source = readFileSync(SOURCE_PATH, 'utf8')
    expect(source).not.toMatch(HEX_COLOUR)
    expect(source).not.toContain('--color-rosa-raw')
  })
})
