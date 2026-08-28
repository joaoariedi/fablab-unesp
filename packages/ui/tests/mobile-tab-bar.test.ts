import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { MobileTabBar } from '../src/shell/MobileTabBar'
import { MOBILE_TABS, TABLET_TABS, type ShellTab } from '../src/shell/tabs'

/**
 * T029 / FR-008, US3 — the mobile bottom bar.
 *
 * US3 decides it in one clause: *"mobile shows a five-position bottom bar (`… · PERFIL`) that
 * **appears on scroll**"*. Three things are therefore asserted here and nowhere else — the
 * five positions with `PERFIL` last, the bar being *at the bottom* and only at the mobile
 * target, and the reveal being **scroll-driven CSS rather than JavaScript**.
 *
 * ── Why "appears on scroll" is asserted as CSS, and why that is not a weaker test ───────────
 *
 * The obvious implementation is a scroll listener: `'use client'`, `useState`, and a class
 * toggled from `window.scrollY`. It would look identical in a screenshot and it would make
 * the shell's second client island — which plan § Sketch 5 forecloses in as many words
 * (*"Only `MenuSheet` toggles, so only `MenuSheet` is a client island"*) and SC-007 audits.
 * A scroll-driven animation (`animation-timeline: scroll()`) expresses the same reveal with
 * zero shipped JavaScript, so the assertions below are: the bar starts concealed, a scroll
 * timeline drives it back, and no scroll position is ever read in JS.
 *
 * ── Why the component is called rather than rendered ────────────────────────────────────────
 *
 * CLR-003 keeps this package at `node` with no DOM (vitest.config.ts states it), so nothing
 * here renders. A React function component is a plain function returning a plain object, so
 * calling it and walking `props.children` asserts the tree it builds — the move
 * `header-nav.test.ts`, `tabs.test.ts` and `card.test.ts` all make. What it cannot prove is
 * that the cascade actually reveals the bar as a real browser scrolls: that is feature 003's
 * Playwright (plan § "What these tests can and cannot prove").
 */

const SOURCE_PATH = fileURLToPath(new URL('../src/shell/MobileTabBar.tsx', import.meta.url))

/** A complete hex run, matched anywhere — the colour fence's own pattern (FR-002). */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])/

/** The three design targets (layout.css). Any other width in a query is a magic number. */
const DESIGN_TARGETS = new Set(['390', '834', '1440'])

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly className?: string
  readonly [key: string]: unknown
}>

/** The bar as a visitor sees it. Defaults to signed OUT — the state FR-009 protects. */
function bar(isSignedIn = false): AnyElement {
  return MobileTabBar({ isSignedIn }) as AnyElement
}

/** Every element in the tree, depth-first — the walk `header-nav.test.ts` uses, minus the DOM. */
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

/** The bar's own navigation landmark, and the class the cascade addresses it by. */
function navOf(element: AnyElement): AnyElement {
  const navs = [element, ...descendants(element)].filter((node) => node.type === 'nav')
  expect(navs, 'the bottom bar is exactly one navigation landmark').toHaveLength(1)
  return navs[0] as AnyElement
}

/** The stylesheet the component ships with itself, read out of its own tree. */
function styleTextOf(element: AnyElement): string {
  const styles = [element, ...descendants(element)].filter((node) => node.type === 'style')
  expect(styles, 'the bar rules must travel with the component, as one <style>').toHaveLength(1)
  const text = childrenOf(styles[0] as AnyElement).join('')
  expect(typeof text).toBe('string')
  return text.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** The `{ … }` block opened at `open`, brace-counted. A lazy `[\s\S]*?}` regex stops at the
 *  first inner `}`, which silently truncates every nested at-rule (@media, @keyframes) and
 *  makes the assertions over them pass or fail on where a brace happened to land. */
function blockAt(css: string, open: number): { readonly body: string; readonly end: number } {
  let depth = 0
  for (let cursor = open; cursor < css.length; cursor += 1) {
    if (css[cursor] === '{') depth += 1
    else if (css[cursor] === '}') {
      depth -= 1
      if (depth === 0) return { body: css.slice(open + 1, cursor), end: cursor }
    }
  }
  expect.fail(`unbalanced block: ${css.slice(open, open + 60)}`)
}

interface Layer {
  /** The media condition, or `null` for the base (mobile-first) layer. */
  readonly condition: string | null
  readonly css: string
}

/** The stylesheet split into its base layer and one layer per `@media` block. */
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
    const { body, end } = blockAt(css, open)
    found.push({ condition: css.slice(at + '@media'.length, open).trim(), css: body })
    cursor = end + 1
  }
  return [{ condition: null, css: base }, ...found]
}

function layerAt(css: string, condition: string | null): Layer {
  const match = layers(css).filter((layer) => layer.condition === condition)
  expect(match, `no layer for ${condition ?? 'the base'}`).toHaveLength(1)
  return match[0] as Layer
}

/** The layer with every `@keyframes` block removed — those carry `from`/`to` selectors whose
 *  declarations would otherwise be read as if they belonged to a class rule. */
function withoutKeyframes(css: string): string {
  let out = ''
  let cursor = 0
  for (;;) {
    const at = css.indexOf('@keyframes', cursor)
    if (at === -1) return out + css.slice(cursor)
    out += css.slice(cursor, at)
    const open = css.indexOf('{', at)
    expect(open, '@keyframes with no block').toBeGreaterThan(-1)
    cursor = blockAt(css, open).end + 1
  }
}

function declarations(body: string, property: string): string[] {
  return [...body.matchAll(/([-a-zA-Z]+)\s*:\s*([^;]+)/g)]
    .filter((declaration) => declaration[1] === property)
    .map((declaration) => (declaration[2] ?? '').trim())
}

/** The value a layer gives `property` for `.className`, or `undefined` if it says nothing. */
function declaredValue(layer: Layer, className: string, property: string): string | undefined {
  const bodies = [...withoutKeyframes(layer.css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((rule) =>
      (rule[1] ?? '').split(',').some((selector) => selector.trim() === `.${className}`),
    )
    .map((rule) => rule[2] ?? '')
  // Last wins, as the cascade resolves it for equal specificity.
  return bodies.flatMap((body) => declarations(body, property)).at(-1)
}

/** The value a named keyframe list gives `property` at `offset` (`from`/`to`/`0%`/`100%`). */
function keyframeValue(css: string, name: string, offsets: readonly string[], property: string):
  | string
  | undefined {
  const at = css.indexOf(`@keyframes ${name}`)
  expect(at, `no @keyframes named ${name}`).toBeGreaterThan(-1)
  const open = css.indexOf('{', at)
  const { body } = blockAt(css, open)
  const frames = [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((frame) =>
    (frame[1] ?? '').split(',').some((selector) => offsets.includes(selector.trim())),
  )
  return frames.flatMap((frame) => declarations(frame[2] ?? '', property)).at(-1)
}

/** Every `@keyframes` name the stylesheet declares. */
function keyframeNames(css: string): string[] {
  return [...css.matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)].map((match) => match[1] as string)
}

/** Every class name the markup actually puts on an element. */
function classesUsed(element: AnyElement): Set<string> {
  return new Set([element, ...descendants(element)].flatMap(classesOf))
}

/** Every class name the stylesheet writes a rule for. */
function classesStyled(css: string): Set<string> {
  const names = new Set<string>()
  for (const rule of withoutKeyframes(css).matchAll(/([^{}@]+)\{[^{}]*\}/g)) {
    for (const selector of (rule[1] ?? '').split(',')) {
      for (const name of selector.matchAll(/\.([A-Za-z0-9_-]+)/g)) names.add(name[1] as string)
    }
  }
  return names
}

describe('five positions ending PERFIL (FR-008, US3, SC-004)', () => {
  it('renders one anchor per mobile tab, in the decided order', () => {
    // The order IS the decision; a membership check stays green with CALENDÁRIO and AULAS
    // swapped, which is the drift rounds 2 and 3 had to correct in the header.
    expect(tabsOf(bar()).map((tab) => tab.props.children)).toEqual(labelsOf(MOBILE_TABS))
  })

  it('has five positions and no sixth', () => {
    expect(tabsOf(bar())).toHaveLength(5)
  })

  it('ends on PERFIL — the fifth position is the account entry point', () => {
    expect(tabsOf(bar()).at(-1)?.props.children).toBe('PERFIL')
  })

  it('sends each tab to the destination the data gives it, for a signed-in maker', () => {
    // Signed in, every position matches the data exactly — including the account tab, whose
    // data href IS Minha Conta. The bar retypes nothing.
    expect(tabsOf(bar(true)).map((tab) => tab.props.href)).toEqual(MOBILE_TABS.map((tab) => tab.href))
  })

  it('changes exactly ONE destination when the visitor is signed out (FR-009)', () => {
    // The account position is the only one the session may move, and it must move: shipping
    // the data href unconditionally sent a signed-out visitor to the guarded account page.
    // Asserted as a diff rather than a value, so a bar that quietly rerouted a second tab is
    // red even if the account tab is right.
    const signedIn = tabsOf(bar(true)).map((tab) => tab.props.href)
    const signedOut = tabsOf(bar(false)).map((tab) => tab.props.href)
    const moved = signedIn.filter((href, i) => href !== signedOut[i])
    expect(moved, 'only the account position may follow the session').toHaveLength(1)
  })

  it('never shows BIBLIOTECA 3D or INSTAGRAM — they live in the menu only (SC-005)', () => {
    const shown = new Set(tabsOf(bar()).map((tab) => String(tab.props.children)))
    for (const label of ['BIBLIOTECA 3D', 'INSTAGRAM']) {
      expect(shown.has(label), `${label} must not reach a compact bar`).toBe(false)
    }
  })

  it('takes the labels from tabs.ts instead of retyping them', () => {
    // The failure this guards is a bar whose labels agree with the data today and drift from
    // it at the next rename — the "two literal arrays" defect tabs.ts was extracted to
    // prevent. Comments are stripped first: the sets are quoted in this file's own WHY.
    const code = readFileSync(SOURCE_PATH, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const label of labelsOf(MOBILE_TABS)) {
      expect(code, `"${label}" is written into MobileTabBar.tsx instead of imported`).not.toContain(
        label,
      )
    }
    expect(code).toMatch(/from\s+'\.\/tabs'/)
  })

  it('names its navigation landmark — a page carries more than one', () => {
    // The header's bar, the category `Tabs` bar and this one are three <nav>s on one page;
    // unnamed they read as "navigation, navigation, navigation" in a landmark list.
    const label = navOf(bar()).props['aria-label']
    expect(label).toBeTypeOf('string')
    expect(label).not.toBe('')
  })
})

describe('a bottom bar, at the mobile target only (FR-008, FR-012)', () => {
  it('is pinned to the bottom of the viewport in the base layer', () => {
    const css = styleTextOf(bar())
    const barClass = classesOf(navOf(bar()))[0] as string
    expect(declaredValue(layerAt(css, null), barClass, 'position')).toBe('fixed')
    expect(declaredValue(layerAt(css, null), barClass, 'bottom')).toBe('0')
  })

  it('is shown at 390 and hidden from the tablet target up', () => {
    // Above 390 the same destinations are in the header bar (T028); two navigations offering
    // the same four tabs at once is the failure, and it is a cascade decision, not a JS one.
    const css = styleTextOf(bar())
    const barClass = classesOf(navOf(bar()))[0] as string
    expect(declaredValue(layerAt(css, null), barClass, 'display')).not.toBe('none')
    expect(declaredValue(layerAt(css, '(min-width: 834px)'), barClass, 'display')).toBe('none')
  })

  it('queries only the design targets, mobile-first, in px', () => {
    // A restatement of layout-tokens.test.ts, which cannot reach here: it walks `.css` files
    // under src/ and these rules live in a `.tsx`. Direction is checked as well as value —
    // `(max-width: 834px)` is a desktop-first sheet built entirely out of design targets.
    const conditions = layers(styleTextOf(bar()))
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

  it('spreads the five positions across the bar rather than stacking them', () => {
    const css = styleTextOf(bar())
    const barClass = classesOf(navOf(bar()))[0] as string
    expect(declaredValue(layerAt(css, null), barClass, 'display')).toBe('flex')
  })
})

describe('it appears on scroll, in CSS (FR-008, FR-014, SC-007)', () => {
  it('drives the reveal from a scroll timeline', () => {
    const css = styleTextOf(bar())
    const barClass = classesOf(navOf(bar()))[0] as string
    const timeline = declaredValue(layerAt(css, null), barClass, 'animation-timeline')
    expect(timeline, 'the reveal must be driven by scroll position').toBeTypeOf('string')
    expect(timeline).toMatch(/^scroll\(/)
  })

  it('starts concealed and ends in place — the animation is what shows it', () => {
    const css = styleTextOf(bar())
    const barClass = classesOf(navOf(bar()))[0] as string
    const shorthand = declaredValue(layerAt(css, null), barClass, 'animation')
    expect(shorthand, 'the bar must run a named animation').toBeTypeOf('string')
    const declared = keyframeNames(css)
    const name = (shorthand ?? '').split(/\s+/).find((word) => declared.includes(word))
    expect(name, `no @keyframes among [${declared.join(', ')}] matches "${shorthand}"`).toBeTypeOf(
      'string',
    )
    const start = keyframeValue(css, name as string, ['from', '0%'], 'transform')
    const end = keyframeValue(css, name as string, ['to', '100%'], 'transform')
    expect(start, 'the first frame must hold the bar off-screen').toMatch(/translateY\(/)
    expect(start).not.toMatch(/translateY\(\s*0[a-z%]*\s*\)/)
    expect(end, 'the last frame must bring the bar to rest at the bottom').toMatch(
      /translateY\(\s*0[a-z%]*\s*\)/,
    )
  })

  it('holds the end state so a browser without scroll timelines still shows the bar', () => {
    // `animation-timeline` is ignored where it is unsupported, and the animation then runs on
    // the document timeline; `both` is what makes it settle on the revealed frame instead of
    // leaving the bar translated off-screen forever. Degrading to "always visible" is correct;
    // degrading to "unreachable navigation" is not.
    const css = styleTextOf(bar())
    const barClass = classesOf(navOf(bar()))[0] as string
    const shorthand = declaredValue(layerAt(css, null), barClass, 'animation') ?? ''
    const fill = declaredValue(layerAt(css, null), barClass, 'animation-fill-mode') ?? shorthand
    expect(/\b(both|forwards)\b/.test(fill), `animation must fill forwards: "${fill}"`).toBe(true)
  })

  it('never reads a scroll position or a width in JavaScript', () => {
    // The scroll listener this component must not be. Each of these would make the shell's
    // second client island to express something the cascade does for free (plan § Sketch 5).
    const source = readFileSync(SOURCE_PATH, 'utf8')
    for (const forbidden of [
      'use client',
      'addEventListener',
      'scrollY',
      'IntersectionObserver',
      'matchMedia',
      'innerWidth',
      'useState',
      'useEffect',
    ]) {
      expect(source, `MobileTabBar must stay a server component: found ${forbidden}`).not.toContain(
        forbidden,
      )
    }
  })
})

describe('the stylesheet itself (FR-002)', () => {
  it('styles every class it uses and uses every class it styles', () => {
    // Both directions, because both failures are silent: a class in the markup with no rule is
    // an unstyled element, and a rule for a class nobody carries is a breakpoint that switches
    // nothing.
    const rendered = bar()
    const used = classesUsed(rendered)
    const styled = classesStyled(styleTextOf(rendered))
    expect([...used].filter((name) => !styled.has(name)), 'class with no rule').toEqual([])
    expect([...styled].filter((name) => !used.has(name)), 'rule for no class').toEqual([])
  })

  it('resolves every colour through a token — no hex reaches this file', () => {
    // The `.css` half of the fence (scripts/check-colour-tokens.sh) does not read `.tsx`, and
    // this component carries real CSS text, so a hex would sit in the one file type neither
    // half of FR-002 was written for.
    const source = readFileSync(SOURCE_PATH, 'utf8')
    expect(source).not.toMatch(HEX_COLOUR)
    expect(source).not.toContain('--color-rosa-raw')
  })

  it('shares the tablet bars four destinations — one set, not two (SC-005)', () => {
    // MOBILE_TABS is TABLET_TABS plus PERFIL. Asserted through the rendered hrefs so that a
    // bar rebuilt from its own literal array fails here even if tabs.ts stays correct.
    const shown = tabsOf(bar()).map((tab) => tab.props.href)
    expect(shown.slice(0, TABLET_TABS.length)).toEqual(TABLET_TABS.map((tab) => tab.href))
  })
})
