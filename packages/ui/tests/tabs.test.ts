import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { Tabs, type TabItem } from '../src/components/Tabs'

/**
 * T025 / FR-006 — the category tab bar.
 *
 * `visual-identity.md` § "Chips/tabs de filtro": *"texto display em caps, item ativo
 * sublinhado/rosa"*. `projetos.md` and `artigos.md` § "Barra de filtros e busca" fix the same
 * bar precisely and agree with each other: *"Tabs de categoria em caps display, alinhadas à
 * esquerda … Ativo: `TODOS`, em rosa com sublinhado rosa curto; inativos em branco sem
 * sublinhado"*, and `artigos.md` adds *"Seleção única (uma categoria por vez)"*.
 *
 * Four separate claims live in that sentence, and each is asserted below rather than trusted
 * to review: the face (display), the casing (caps), the active ink (`--color-primary`) and
 * the active rule (underline). The last two are asserted *together* on the same item —
 * "sublinhado/rosa" is one state with two halves, and a tab that is pink without a rule, or
 * ruled without the accent, is the failure mode nobody catches from a screenshot because each
 * half looks deliberate on its own.
 *
 * ── Why `--color-primary` and not the pink behind it ────────────────────────────────────────
 *
 * FR-003 names three things the per-organization accent drives: *CTAs, **active tabs** and
 * card titles*. This is the second of the three, so it is one of the exact places CLR-001's
 * trap bites: `--color-rosa-raw` renders IDENTICALLY to `--color-primary` for CITe, passes
 * every visual check, and stops co-branding only once a second organization exists. The
 * equality on the token name is the only thing that can tell those apart today, which is why
 * it is an equality and is paired with an explicit `not.toBe` on the raw name.
 *
 * ── Why single selection is asserted as a count over the whole bar ──────────────────────────
 *
 * "Uma categoria por vez" is a property of the *bar*, not of an item, so an item-level
 * assertion cannot express it. Deriving `active` from `activeHref === item.href` makes the
 * invariant structural — but only as long as nothing later adds a second source of activeness
 * (a per-item `active` flag is the obvious "helpful" addition), so the count is asserted
 * across the rendered children where such an addition would show up.
 *
 * ── Why this test calls the component instead of rendering it ───────────────────────────────
 *
 * CLR-003 keeps this package's stack at `node` with no DOM (vitest.config.ts states it), so
 * nothing here renders. A React function component is a plain function returning a plain
 * object, so calling it and walking `props.children` asserts the tree the component builds —
 * the same move as `button.test.ts`, `chip.test.ts`, `card.test.ts` and `search-input.test.ts`.
 * What it cannot prove is that the cascade paints it: that is the workbench (FR-016) and
 * feature 003's Playwright.
 */

const SOURCE_PATH = fileURLToPath(new URL('../src/components/Tabs.tsx', import.meta.url))

/** A complete hex run, matched anywhere — the colour fence's own pattern (FR-002). */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])/

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly style?: Record<string, unknown>
  readonly [key: string]: unknown
}>

/** The canonical bar from `artigos.md`, in its documented order. `TODOS` is the active one. */
const CATEGORIES: readonly TabItem[] = [
  { label: 'Todos', href: '/artigos' },
  { label: 'Cultura maker', href: '/artigos?categoria=cultura-maker' },
  { label: 'Educação', href: '/artigos?categoria=educacao' },
  { label: 'Tecnologia', href: '/artigos?categoria=tecnologia' },
  { label: 'Inovação social', href: '/artigos?categoria=inovacao-social' },
]

function bar(activeHref?: string): AnyElement {
  return Tabs({
    label: 'Categorias de artigos',
    items: CATEGORIES,
    ...(activeHref === undefined ? {} : { activeHref }),
  }) as AnyElement
}

/** Every element in the tree, depth-first — the walk `card.test.ts` uses, minus the DOM. */
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

/** The tab items themselves: the anchors, in document order. */
function tabsOf(element: AnyElement): AnyElement[] {
  return descendants(element).filter((node) => node.type === 'a')
}

function styleOf(element: AnyElement): Record<string, unknown> {
  const style = element.props.style
  expect(style, 'every tab must carry its identity as a style object').toBeDefined()
  return style as Record<string, unknown>
}

function activeTab(element: AnyElement): AnyElement {
  const active = tabsOf(element).filter((tab) => tab.props['aria-current'] !== undefined)
  expect(active, 'exactly one tab must be marked current').toHaveLength(1)
  return active[0] as AnyElement
}

describe('Tabs — the active item is underlined in the accent (FR-006, FR-003)', () => {
  it('paints the active tab in --color-primary, the per-organization accent', () => {
    // FR-003 lists "active tabs" among the three things the accent drives. Anything else
    // here is a tab that will not follow an organization's theme.
    expect(styleOf(activeTab(bar('/artigos'))).color).toBe('var(--color-primary)')
  })

  it('never reaches for the private raw pink, which renders identically today', () => {
    // The whole point of CLR-001's naming: for CITe these two are the same colour, so this
    // assertion is the only thing standing between a themed bar and one frozen at the default.
    const style = styleOf(activeTab(bar('/artigos')))
    expect(style.color).not.toBe('var(--color-rosa-raw)')
    expect(readFileSync(SOURCE_PATH, 'utf8')).not.toContain('--color-rosa-raw')
  })

  it('rules the active tab — "sublinhado/rosa" is one state with two halves', () => {
    // Asserted with the colour above, on the same item: pink-without-rule and rule-without-pink
    // each look deliberate in isolation, and only the pair is the decided state.
    expect(String(styleOf(activeTab(bar('/artigos'))).textDecoration)).toContain('underline')
  })

  it('leaves every other tab unmarked: no rule, no accent, light ink', () => {
    const inactive = tabsOf(bar('/artigos')).filter(
      (tab) => tab.props['aria-current'] === undefined,
    )
    expect(inactive).toHaveLength(CATEGORIES.length - 1)
    for (const tab of inactive) {
      const style = styleOf(tab)
      // "inativos em branco sem sublinhado" — a bar where every item is ruled and pink is a
      // bar with no selected state at all.
      expect(String(style.textDecoration)).not.toContain('underline')
      expect(style.color).not.toBe('var(--color-primary)')
      // `--color-claro` is the palette's text-on-dark token; there is no white token to reach
      // for, and `tokens/index.ts` records why one is not invented here.
      expect(style.color).toBe('var(--color-claro)')
    }
  })
})

describe('Tabs — caps in the display face (FR-006)', () => {
  it('sets its own caps rather than trusting the caller to shout', () => {
    // Same split `Chip` documents: a category label is CMS data arriving in natural case, so
    // the caller has nothing to capitalise. `text-transform` also leaves the accessible name
    // and the copyable text intact, which pre-capsing the string does not — and the fixture
    // above is deliberately written in natural case so a component that relied on the caller
    // would fail here.
    for (const tab of tabsOf(bar('/artigos'))) {
      expect(styleOf(tab).textTransform).toBe('uppercase')
      expect(styleOf(tab).fontFamily).toBe('var(--font-display)')
    }
  })

  it('keeps the label in the case it was given, so the accessible name is not shouted', () => {
    const labels = tabsOf(bar('/artigos')).map((tab) => tab.props.children)
    expect(labels).toEqual(CATEGORIES.map((item) => item.label))
  })
})

describe('Tabs — single selection (artigos.md: "uma categoria por vez")', () => {
  it('marks exactly one tab current, whichever item is the active one', () => {
    for (const item of CATEGORIES) {
      expect(activeTab(bar(item.href)).props.children).toBe(item.label)
    }
  })

  it('marks none when no item is active — an unfiltered bar is a real state', () => {
    // A bar with no `activeHref`, and one pointed at an href it does not contain, must both
    // render zero current items rather than defaulting to the first tab.
    for (const element of [bar(), bar('/artigos?categoria=inexistente')]) {
      const marked = tabsOf(element).filter((tab) => tab.props['aria-current'] !== undefined)
      expect(marked).toHaveLength(0)
      for (const tab of tabsOf(element)) {
        expect(styleOf(tab).color).toBe('var(--color-claro)')
      }
    }
  })
})

describe('Tabs — the structure a tab bar has to have', () => {
  it('is a landmark with a name, not an anonymous row of links', () => {
    const element = bar('/artigos')
    expect(element.type).toBe('nav')
    // Several bars can share a page (categories here, the header nav in T028); without a name
    // a screen reader's landmark list reads "navigation, navigation".
    expect(element.props['aria-label']).toBe('Categorias de artigos')
  })

  it('renders one anchor per item, in the documented order', () => {
    const tabs = tabsOf(bar('/artigos'))
    expect(tabs).toHaveLength(CATEGORIES.length)
    expect(tabs.map((tab) => tab.props.href)).toEqual(CATEGORIES.map((item) => item.href))
  })

  it('states the current item to assistive tech, not only to the eye', () => {
    // Underline plus colour is the entire visual signal and neither reaches a screen reader.
    // `page` rather than `true`: these anchors navigate, and `page` is the token that says so.
    expect(activeTab(bar('/artigos')).props['aria-current']).toBe('page')
  })

  it('lays the items out in a left-aligned row ("alinhadas à esquerda")', () => {
    const style = styleOf(bar('/artigos'))
    expect(style.display).toBe('flex')
    expect(style.justifyContent).toBe('flex-start')
  })
})

describe('Tabs — the rules every component in this package keeps', () => {
  it('resolves every colour through a token — no literal reaches any style object', () => {
    const element = bar('/artigos')
    for (const node of [element, ...tabsOf(element)]) {
      for (const [property, value] of Object.entries(styleOf(node))) {
        if (typeof value !== 'string') continue
        expect(`${property}: ${value}`).not.toMatch(HEX_COLOUR)
      }
    }
    // The fence would refuse a hex here too — this fails in the suite that owns the rule.
    expect(readFileSync(SOURCE_PATH, 'utf8')).not.toMatch(HEX_COLOUR)
  })

  it('renders a server component: the selection is a link, not client state (FR-014)', () => {
    // A tab bar is the classic place a `useState` appears for no reason. Selection here is
    // the URL, so the bar is inert markup and the page it links to does the filtering.
    const source = readFileSync(SOURCE_PATH, 'utf8')
    expect(source).not.toContain('use client')
    expect(source).not.toContain('useState')
    expect(source).not.toContain('onClick')
  })
})
