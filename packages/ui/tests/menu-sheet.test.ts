import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as React from 'react'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { LogoChip } from '../src/components/LogoChip'
import { MenuSheet } from '../src/shell/MenuSheet'
import { MENU_TABS, type ShellTab } from '../src/shell/tabs'

/**
 * T030 / FR-008, US6 — the compact menu, the shell's one client island.
 *
 * `home.md` § Componentes (`MenuDrawer`, decided round 4 and confirmed round 5, 2026-08-24):
 * *"só nas versões compactas (tablet/mobile), botão no topo **à direita** da barra, com o
 * **logo à esquerda** … lista com **todas as abas** (`BIBLIOTECA 3D · PROJETOS · CALENDÁRIO ·
 * AULAS · INSTAGRAM · ARTIGOS`), `INSTAGRAM` como link externo"*. Four things are therefore
 * asserted here and nowhere else: every tab is reachable from the menu (the half of SC-005
 * that the two compact-bar tests can only state negatively), the button/logo arrangement in
 * both states, the toggle actually toggling, and the island staying *one* island — a real
 * `<button>` with `aria-expanded`, and no width read in JavaScript.
 *
 * ── Why the hook dispatcher is faked rather than the component rendered ─────────────────────
 *
 * CLR-003 keeps this package at `node` with no DOM and adds no test renderer, so the move
 * every other suite here makes — call the component, walk `props.children` — is the only one
 * available. It stops working the moment a component holds state: `useState` resolves through
 * React's current dispatcher, which is null outside a renderer, so calling `MenuSheet()`
 * throws before it builds anything.
 *
 * `FakeHookDispatcher` supplies that one hook and nothing else. It buys two things a
 * source-text check could not: the tree is asserted in *both* states from the real component
 * (not from a testing-only export written to be easy to assert), and the click handler is
 * *invoked*, so "the button toggles" is executed behaviour rather than the word `setOpen`
 * appearing in the file. What it cannot prove is that React re-renders on that update, or
 * that the sheet visually covers the page — a browser question, and feature 003's Playwright
 * (plan § "What these tests can and cannot prove").
 */

const SOURCE_PATH = fileURLToPath(new URL('../src/shell/MenuSheet.tsx', import.meta.url))

/** A complete hex run, matched anywhere — the colour fence's own pattern (FR-002). */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])/

/** The three design targets (layout.css). Any other width in a query is a magic number. */
const DESIGN_TARGETS = new Set(['390', '834', '1440'])

/**
 * Where React 19 keeps the hook dispatcher the fake below stands in for.
 *
 * Private, and named so nobody mistakes it for API. It is read defensively — if a React
 * upgrade moves it, `mount()` fails with that sentence rather than with a null dereference
 * somewhere inside the component.
 */
const INTERNALS_KEY = '__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE'

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly className?: string
  readonly [key: string]: unknown
}>

/**
 * The one hook `MenuSheet` is allowed to use, with the state pinned by the test.
 *
 * A named fake rather than an inline object literal: it records the updates the component
 * pushes, which is what makes the toggle assertable, and a component reaching for a *second*
 * hook fails loudly here ("dispatcher.useEffect is not a function") instead of quietly
 * becoming a bigger island than US6 allows.
 */
class FakeHookDispatcher {
  /** Every value passed to the setter, in call order — a boolean or an updater function. */
  readonly updates: unknown[] = []

  constructor(private readonly state: boolean) {}

  /** React calls this with the initial state; the fake ignores it — the state under test is
   *  the one the constructor was given, so both branches can be asserted from one component. */
  readonly useState = (): [boolean, (next: unknown) => void] => [
    this.state,
    (next: unknown): void => {
      this.updates.push(next)
    },
  ]
}

interface Mounted {
  readonly tree: AnyElement
  readonly dispatcher: FakeHookDispatcher
}

/** The component's tree with `open` forced to `isOpen`. The dispatcher is restored afterwards
 *  even on failure — leaking a fake dispatcher would break every later file in the run. */
function mount(isOpen: boolean): Mounted {
  const internals = (React as unknown as Record<string, { H: unknown } | undefined>)[INTERNALS_KEY]
  expect(internals, `React no longer exposes ${INTERNALS_KEY}; this fake needs it`).toBeTypeOf(
    'object',
  )
  const shared = internals as { H: unknown }
  const dispatcher = new FakeHookDispatcher(isOpen)
  const previous = shared.H
  shared.H = dispatcher
  try {
    return { tree: MenuSheet() as AnyElement, dispatcher }
  } finally {
    shared.H = previous
  }
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

function childrenOf(element: AnyElement): ReactNode[] {
  const children = element.props.children
  return (Array.isArray(children) ? children : [children]) as ReactNode[]
}

/** The element children of `element`, in markup order — text and `false` dropped. */
function childElementsOf(element: AnyElement): AnyElement[] {
  return childrenOf(element).filter((node): node is AnyElement => isValidElement(node))
}

function classesOf(element: AnyElement): string[] {
  return (element.props.className ?? '').split(/\s+/).filter((name) => name !== '')
}

function buttonsOf(tree: AnyElement): AnyElement[] {
  return [tree, ...descendants(tree)].filter((node) => node.type === 'button')
}

/** The id every menu button points at — asserted to be exactly one, because two buttons
 *  controlling two different ids is a sheet one of them never opens. */
function controlledId(tree: AnyElement): string {
  const ids = new Set(
    buttonsOf(tree)
      .map((button) => button.props['aria-controls'])
      .filter((id): id is string => typeof id === 'string'),
  )
  expect(ids.size, 'every menu button must name the same sheet in aria-controls').toBe(1)
  return [...ids][0] as string
}

/** The sheet itself, found through `aria-controls` rather than by class name: the wiring is
 *  the requirement, and a test that looked it up by class would pass with the id broken. */
function sheetOf(tree: AnyElement): AnyElement {
  const id = controlledId(tree)
  const matches = [tree, ...descendants(tree)].filter((node) => node.props.id === id)
  expect(matches, `aria-controls="${id}" must name exactly one element`).toHaveLength(1)
  return matches[0] as AnyElement
}

/** The button that lives in the header bar — the one the visitor opens the menu with. */
function triggerOf(tree: AnyElement): AnyElement {
  const inside = new Set(descendants(sheetOf(tree)))
  const outside = buttonsOf(tree).filter((button) => !inside.has(button))
  expect(outside, 'exactly one menu button belongs to the bar itself').toHaveLength(1)
  return outside[0] as AnyElement
}

function navOf(sheet: AnyElement): AnyElement {
  const navs = [sheet, ...descendants(sheet)].filter((node) => node.type === 'nav')
  expect(navs, 'the sheet lists its tabs in exactly one navigation landmark').toHaveLength(1)
  return navs[0] as AnyElement
}

function tabsOf(tree: AnyElement): AnyElement[] {
  return descendants(sheetOf(tree)).filter((node) => node.type === 'a')
}

function labelsOf(tabs: readonly ShellTab[]): string[] {
  return tabs.map((tab) => tab.label)
}

/** The stylesheet the component ships with itself, read out of its own tree. */
function styleTextOf(tree: AnyElement): string {
  const styles = [tree, ...descendants(tree)].filter((node) => node.type === 'style')
  expect(styles, 'the menu rules must travel with the component, as one <style>').toHaveLength(1)
  const text = childrenOf(styles[0] as AnyElement).join('')
  expect(typeof text).toBe('string')
  return text.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** The `{ … }` block opened at `open`, brace-counted. A lazy `[\s\S]*?}` regex stops at the
 *  first inner `}`, silently truncating every nested at-rule. */
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

function declarations(body: string, property: string): string[] {
  return [...body.matchAll(/([-a-zA-Z]+)\s*:\s*([^;]+)/g)]
    .filter((declaration) => declaration[1] === property)
    .map((declaration) => (declaration[2] ?? '').trim())
}

/** The value a layer gives `property` for the rules whose selector is exactly `selector`. */
function declaredFor(layer: Layer, selector: string, property: string): string | undefined {
  const bodies = [...layer.css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((rule) => (rule[1] ?? '').split(',').some((one) => one.trim() === selector))
    .map((rule) => rule[2] ?? '')
  // Last wins, as the cascade resolves it for equal specificity.
  return bodies.flatMap((body) => declarations(body, property)).at(-1)
}

function declaredValue(layer: Layer, className: string, property: string): string | undefined {
  return declaredFor(layer, `.${className}`, property)
}

/** Every class name the markup actually puts on an element. */
function classesUsed(tree: AnyElement): Set<string> {
  return new Set([tree, ...descendants(tree)].flatMap(classesOf))
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

/** The source with comments stripped — the decisions are quoted in this file's own WHY, and
 *  in the component's, so a text check has to read the code rather than the prose. */
function code(): string {
  return readFileSync(SOURCE_PATH, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/** The value the setter would produce, whether the component passes a boolean or an updater. */
function nextStateFrom(update: unknown, was: boolean): unknown {
  return typeof update === 'function' ? (update as (previous: boolean) => unknown)(was) : update
}

describe('all the tabs live here (FR-008, SC-005)', () => {
  it('lists one anchor per menu tab, in the canonical order', () => {
    // The order IS the decision; a membership check stays green with CALENDÁRIO and AULAS
    // swapped, which is the drift rounds 2 and 3 had to correct in the header.
    expect(tabsOf(mount(true).tree).map((tab) => tab.props.children)).toEqual(labelsOf(MENU_TABS))
  })

  it('carries BIBLIOTECA 3D and INSTAGRAM — the two the compact bars drop', () => {
    // The positive half of SC-005: `header-nav` and `mobile-tab-bar` assert these are absent
    // from the bars, which a menu missing them would also satisfy — with both destinations
    // unreachable at 390 and 834.
    const shown = new Set(tabsOf(mount(true).tree).map((tab) => String(tab.props.children)))
    for (const label of ['BIBLIOTECA 3D', 'INSTAGRAM']) {
      expect(shown.has(label), `${label} is reachable only from the menu`).toBe(true)
    }
  })

  it('sends each tab to the destination the data gives it', () => {
    expect(tabsOf(mount(true).tree).map((tab) => tab.props.href)).toEqual(
      MENU_TABS.map((tab) => tab.href),
    )
  })

  it('opens INSTAGRAM as an external link, safely', () => {
    const external = MENU_TABS.filter((tab) => tab.external === true)
    expect(
      external.length,
      'the menu set carries at least one off-site destination',
    ).toBeGreaterThan(0)
    const byHref = new Map(tabsOf(mount(true).tree).map((tab) => [tab.props.href, tab]))
    for (const tab of external) {
      const rendered = byHref.get(tab.href)
      expect(rendered?.props.target, `${tab.label} leaves the site`).toBe('_blank')
      // `noopener` is the security half — without it the opened page keeps a handle on this
      // one through `window.opener`; `noreferrer` is the privacy half.
      const rel = String(rendered?.props.rel ?? '')
      expect(rel).toContain('noopener')
      expect(rel).toContain('noreferrer')
    }
  })

  it('keeps the tabs in the markup while the menu is closed', () => {
    // The sheet is concealed with `hidden`, not unmounted: the destinations stay in the
    // document for assistive technology and for the cascade to reveal, and opening the menu
    // is not a render of six links.
    expect(tabsOf(mount(false).tree)).toHaveLength(MENU_TABS.length)
  })

  it('takes the labels from tabs.ts instead of retyping them', () => {
    for (const label of labelsOf(MENU_TABS)) {
      expect(code(), `"${label}" is written into MenuSheet.tsx instead of imported`).not.toContain(
        label,
      )
    }
    expect(code()).toMatch(/from\s+'\.\/tabs'/)
  })

  it('names its navigation landmark — a page carries more than one', () => {
    const label = navOf(sheetOf(mount(true).tree)).props['aria-label']
    expect(label).toBeTypeOf('string')
    expect(label).not.toBe('')
  })
})

describe('button top-right, logo left (FR-008)', () => {
  it('opens with a real button, not a clickable div', () => {
    const trigger = triggerOf(mount(false).tree)
    expect(trigger.type).toBe('button')
    // Without an explicit type a button submits the form it happens to sit in.
    expect(trigger.props.type).toBe('button')
    expect(String(trigger.props.children ?? '').trim(), 'the trigger needs a name').not.toBe('')
  })

  it('hugs the right-hand end of the bar it is slotted into', () => {
    // HeaderNav gives the menu the trailing slot; this rule is what keeps the button at the
    // right edge of that slot rather than at its start when the slot is wider than the button.
    const { tree } = mount(false)
    const css = styleTextOf(tree)
    const root = classesOf(tree)[0] as string
    expect(declaredValue(layerAt(css, null), root, 'display')).toBe('flex')
    expect(declaredValue(layerAt(css, null), root, 'justify-content')).toBe('flex-end')
  })

  it('repeats the logo-left / button-right arrangement inside the open sheet', () => {
    // The sheet covers the viewport, so the bar underneath it — and its logo — is not
    // visible while the menu is open. Without this row the lockup disappears exactly while
    // the visitor is navigating, and the button appears to jump to a different place.
    const { tree } = mount(true)
    const bar = childElementsOf(sheetOf(tree))[0] as AnyElement
    const inBar = childElementsOf(bar)
    expect(inBar[0]?.type, 'the logo is first, so it sits left').toBe(LogoChip)
    expect(inBar.at(-1)?.type, 'the button is last, so it sits right').toBe('button')
    const css = styleTextOf(tree)
    const barClass = classesOf(bar)[0] as string
    expect(declaredValue(layerAt(css, null), barClass, 'display')).toBe('flex')
    expect(declaredValue(layerAt(css, null), barClass, 'justify-content')).toBe('space-between')
  })

  it('renders the canonical logo once — never a second image', () => {
    const logos = descendants(mount(true).tree).filter((node) => node.type === LogoChip)
    expect(logos, 'US4: one shared component, and only one chip in this tree').toHaveLength(1)
  })

  it('exists only in the compact layouts', () => {
    // "sem botão de menu no desktop" (concept.md, round 4). HeaderNav hides its own slot at
    // 1440, but a call site that places the menu anywhere else would otherwise ship a desktop
    // menu button — the rule belongs to the component that must not appear.
    const { tree } = mount(false)
    const css = styleTextOf(tree)
    const root = classesOf(tree)[0] as string
    expect(declaredValue(layerAt(css, null), root, 'display')).not.toBe('none')
    expect(declaredValue(layerAt(css, '(min-width: 1440px)'), root, 'display')).toBe('none')
  })
})

describe('the shell’s one client island (FR-014, US6, SC-007)', () => {
  it('declares itself a client component and states why', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8')
    expect(source.trimStart()).toMatch(/^'use client'/)
    // SC-007: the directive must be argued for in the file, not just present. The reason has
    // to sit with it — before the imports — or it is a docblock nobody reads next to a
    // directive nobody questioned.
    const head = source.slice(0, source.search(/^import /m))
    expect(head, 'no comment states why this file ships JavaScript').toMatch(/\/\/|\/\*/)
    expect(head.toLowerCase()).toContain('toggle')
  })

  it('reports its state to assistive technology', () => {
    for (const isOpen of [false, true]) {
      const { tree } = mount(isOpen)
      const buttons = buttonsOf(tree)
      // Guarded, because "every button reports its state" is satisfied by a menu with no
      // buttons at all — the shape this suite fails against before the component exists.
      expect(buttons.length, `no menu button at open=${isOpen}`).toBeGreaterThan(0)
      for (const button of buttons) {
        expect(button.props['aria-expanded'], `aria-expanded at open=${isOpen}`).toBe(isOpen)
      }
    }
  })

  it('conceals the sheet when closed and shows it when open', () => {
    expect(Boolean(sheetOf(mount(false).tree).props.hidden)).toBe(true)
    expect(Boolean(sheetOf(mount(true).tree).props.hidden)).toBe(false)
  })

  it('keeps the class rule from defeating the hidden attribute', () => {
    // `[hidden] { display: none }` is a UA rule, and any author class rule outranks it. A
    // sheet styled `display: flex` is therefore permanently visible while carrying `hidden` —
    // the markup says closed, the screen says open, and nothing in the tree disagrees.
    const { tree } = mount(false)
    const css = styleTextOf(tree)
    const sheetClass = classesOf(sheetOf(tree))[0] as string
    expect(declaredValue(layerAt(css, null), sheetClass, 'display')).not.toBe('none')
    expect(declaredFor(layerAt(css, null), `.${sheetClass}[hidden]`, 'display')).toBe('none')
  })

  it('toggles the menu from every button it renders', () => {
    for (const isOpen of [false, true]) {
      const { tree, dispatcher } = mount(isOpen)
      // Same guard as above: a tree with no button flips nothing and would pass silently.
      expect(buttonsOf(tree).length, `no menu button at open=${isOpen}`).toBeGreaterThan(0)
      for (const button of buttonsOf(tree)) {
        const onClick = button.props.onClick
        expect(onClick, 'a menu button that does nothing').toBeTypeOf('function')
        ;(onClick as () => void)()
      }
      expect(dispatcher.updates, 'each button asks for one state change').toHaveLength(
        buttonsOf(tree).length,
      )
      for (const update of dispatcher.updates) {
        expect(nextStateFrom(update, isOpen), `open=${isOpen} must flip`).toBe(!isOpen)
      }
    }
  })

  it('covers the page it is opened over', () => {
    const { tree } = mount(true)
    const css = styleTextOf(tree)
    const sheetClass = classesOf(sheetOf(tree))[0] as string
    expect(declaredValue(layerAt(css, null), sheetClass, 'position')).toBe('fixed')
    expect(declaredValue(layerAt(css, null), sheetClass, 'inset')).toBe('0')
  })

  it('never reads a width or a scroll position in JavaScript', () => {
    // The island is the toggle and nothing else. Each of these would put a cascade decision
    // back into JS, on the class of device the compact layouts exist for.
    const source = readFileSync(SOURCE_PATH, 'utf8')
    for (const forbidden of [
      'matchMedia',
      'innerWidth',
      'addEventListener',
      'IntersectionObserver',
      'scrollY',
      'useEffect',
    ]) {
      expect(source, `the menu toggles; it does not measure: found ${forbidden}`).not.toContain(
        forbidden,
      )
    }
  })
})

describe('the stylesheet itself (FR-002, FR-012)', () => {
  it('styles every class it uses and uses every class it styles', () => {
    // Both directions, because both failures are silent: a class in the markup with no rule
    // is an unstyled element, and a rule for a class nobody carries switches nothing.
    const { tree } = mount(true)
    const used = classesUsed(tree)
    const styled = classesStyled(styleTextOf(tree))
    expect([...used].filter((name) => !styled.has(name)), 'class with no rule').toEqual([])
    expect([...styled].filter((name) => !used.has(name)), 'rule for no class').toEqual([])
  })

  it('resolves every colour through a token — no hex reaches this file', () => {
    // The `.css` half of the fence (scripts/check-colour-tokens.sh) does not read `.tsx`, and
    // this component carries real CSS text.
    const source = readFileSync(SOURCE_PATH, 'utf8')
    expect(source).not.toMatch(HEX_COLOUR)
    expect(source).not.toContain('--color-rosa-raw')
  })

  it('queries only the design targets, mobile-first, in px', () => {
    // A restatement of layout-tokens.test.ts, which cannot reach here: it walks `.css` files
    // under src/ and these rules live in a `.tsx`.
    const conditions = layers(styleTextOf(mount(false).tree))
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
})
