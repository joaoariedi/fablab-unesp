import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import * as React from 'react'
import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { LISTING_GRID_COLUMNS } from '../src/components/ListingGrid'
import { PROJECT_CAROUSEL_CSS, ProjectCarousel } from '../src/components/ProjectCarousel'

/**
 * T026 / FR-009, FR-022, FR-023, FR-024, US1 — the Home's `ÚLTIMOS PROJETOS` carousel.
 *
 * `home.md` § *Card `ÚLTIMOS PROJETOS`*: *"**Decidido (2026-08-23):** o card é um **carrossel**
 * de vários projetos; o mockup mostra apenas um slide"*. `plan.md` § Sketch 6 lists it as one of
 * the four islands the feature is allowed — *"the Home carousel, decided 2026-08-23"* — so this
 * file has to prove the directive buys something a server component could not have emitted.
 *
 * ── What "it scrolls" is allowed to mean here ───────────────────────────────────────────────
 *
 * The track is a real overflow container with scroll snapping, so a visitor with no JavaScript,
 * a touch screen or a keyboard already reaches every slide. The island adds the two arrow
 * controls the mockup draws, and nothing else. That ordering is deliberate: an island whose
 * content is unreachable without it would put the Home's only content section behind a bundle,
 * on the one page SC-006 measures.
 *
 * ── Why the handlers are invoked rather than read ───────────────────────────────────────────
 *
 * CLR-003 keeps this package at `node` with no DOM (`vitest.config.ts`), so the instrument is
 * `menu-sheet.test.ts`'s: stand a fake hook dispatcher in React's slot, call the component, and
 * then *call the handler it returned*. Asserting that the word `scrollBy` appears in the source
 * would stay green against a control wired to the wrong direction, wired to the wrong element,
 * or wired to nothing — which is exactly how `ModelViewer` shipped an error path that could
 * never fire (tasks.md § Run 5).
 */

const SOURCE_PATH = fileURLToPath(new URL('../src/components/ProjectCarousel.tsx', import.meta.url))
const LAYOUT_TOKENS = fileURLToPath(new URL('../src/tokens/layout.css', import.meta.url))

/** A complete hex run, matched anywhere — the colour fence's own pattern (FR-027). */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])/

/** The three design targets (layout.css). Any other width in a query is a magic number. */
const DESIGN_TARGETS = new Set(['390', '834', '1440'])

/** FR-022, in as many words: *"Touch targets are at least 44×44px on the compact breakpoints"*. */
const MIN_TOUCH_TARGET = 44

/** Where React 19 keeps the hook dispatcher the fake below stands in for. Read defensively so a
 *  React upgrade fails with that sentence rather than a null dereference inside the component. */
const INTERNALS_KEY = '__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE'

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly className?: string
  readonly [key: string]: unknown
}>

/**
 * The scrollable track, with only the two members the handler is allowed to touch.
 *
 * A named fake rather than an inline literal: it records what it was asked to scroll, which is
 * the whole assertion, and a component reaching for a third DOM member (`scrollLeft`, a width
 * measured from `getBoundingClientRect`) fails loudly here instead of silently in a browser.
 */
class FakeTrack {
  readonly scrolled: { left?: number; behavior?: string }[] = []

  constructor(readonly clientWidth: number) {}

  readonly scrollBy = (options: { left?: number; behavior?: string }): void => {
    this.scrolled.push(options)
  }
}

/** The one hook this island is allowed. A second one fails as "dispatcher.useX is not a
 *  function" rather than quietly making the island bigger than plan § Sketch 6 allows. */
class FakeHookDispatcher {
  constructor(private readonly ref: { current: unknown }) {}

  readonly useRef = (): { current: unknown } => this.ref
}

interface Mounted {
  readonly tree: AnyElement
  readonly track: FakeTrack | null
}

/** The component's tree, with the ref already holding `track` — which is what it holds by the
 *  time a visitor can press anything. The dispatcher is restored even on failure: leaking a
 *  fake would break every later file in the run. */
function mount(children: ReactNode, track: FakeTrack | null = new FakeTrack(900)): Mounted {
  const internals = (React as unknown as Record<string, { H: unknown } | undefined>)[INTERNALS_KEY]
  expect(internals, `React no longer exposes ${INTERNALS_KEY}; this fake needs it`).toBeTypeOf(
    'object',
  )
  const shared = internals as { H: unknown }
  const previous = shared.H
  shared.H = new FakeHookDispatcher({ current: track })
  try {
    return { tree: ProjectCarousel({ label: 'Últimos projetos', children }) as AnyElement, track }
  } finally {
    shared.H = previous
  }
}

/** Every element in the tree, depth-first — the walk the sibling suites use. */
function everyElement(node: ReactNode, found: AnyElement[] = []): AnyElement[] {
  if (Array.isArray(node)) {
    for (const child of node) everyElement(child, found)
    return found
  }
  if (typeof node !== 'object' || node === null || !('type' in node) || !('props' in node)) {
    return found
  }
  const element = node as AnyElement
  found.push(element)
  return everyElement((element.props.children ?? null) as ReactNode, found)
}

const elementsOfType = (tree: ReactNode, type: string): AnyElement[] =>
  everyElement(tree).filter((element) => element.type === type)

/** The buttons, in document order: the mockup draws `‹` then `›`. */
const controls = (tree: ReactNode): AnyElement[] => elementsOfType(tree, 'button')

const press = (control: AnyElement | undefined): void => {
  const handler = control?.props.onClick
  expect(handler, 'the control carries no onClick — nothing happens when it is pressed').toBeTypeOf(
    'function',
  )
  ;(handler as () => void)()
}

/** The declaration block of `selector` in the stylesheet, or `''` when it declares none. */
function rule(selector: string): string {
  const at = PROJECT_CAROUSEL_CSS.indexOf(`${selector} {`)
  if (at === -1) return ''
  return PROJECT_CAROUSEL_CSS.slice(at, PROJECT_CAROUSEL_CSS.indexOf('}', at))
}

/** The pixel value of a `--space-*` token, resolved from the token layer rather than retyped —
 *  a size asserted against a number copied out of layout.css cannot notice the scale changing. */
function spacePx(token: string): number {
  const found = new RegExp(`${token}:\\s*(\\d+)px`).exec(readFileSync(LAYOUT_TOKENS, 'utf8'))
  expect(found, `${token} is not declared in layout.css`).not.toBeNull()
  return Number(found?.[1])
}

const SLIDES = ['um', 'dois', 'três'].map((titulo) =>
  React.createElement('article', { key: titulo }, titulo),
)

describe('§1 — every project is a slide, in the order it was handed over (FR-011)', () => {
  it('wraps each child in its own list item, once', () => {
    const items = elementsOfType(mount(SLIDES).tree, 'li')

    expect(items).toHaveLength(SLIDES.length)
    expect(
      items.map((item) => (item.props.children as AnyElement)?.props?.children),
      'the slides are re-ordered or duplicated. The Home shows the LATEST projects, and the ' +
        'order is the reader\'s (FR-011, CLR-007) — a carousel that sorts is a second opinion.',
    ).toEqual(['um', 'dois', 'três'])
  })

  it('announces the slides as a list, so they can be skipped', () => {
    const lists = elementsOfType(mount(SLIDES).tree, 'ul')

    expect(
      lists,
      'three peers in three divs are announced one after another with no way out. A list is ' +
        'announced as "list, 3 items" and can be skipped in one gesture — the same choice ' +
        'Footer and ListingGrid make.',
    ).toHaveLength(1)
  })

  it('names the region for a screen reader', () => {
    const labelled = everyElement(mount(SLIDES).tree).filter(
      (element) => element.props['aria-label'] === 'Últimos projetos',
    )

    expect(labelled.length, 'nothing in the carousel carries the label it was given').toBeGreaterThan(0)
  })
})

describe('§2 — it scrolls without the bundle, and the island only adds the arrows', () => {
  it('makes the track a real overflow container with snap points', () => {
    const track = rule('.fl-carousel__trilho')

    expect(track, 'the track scrolls nothing: no overflow-x').toContain('overflow-x: auto')
    expect(
      track,
      'without scroll-snap-type a drag leaves a card cut in half at the edge, which is the ' +
        'one thing a carousel is supposed to prevent.',
    ).toContain('scroll-snap-type: x mandatory')
    expect(rule('.fl-carousel__slide')).toContain('scroll-snap-align: start')
  })

  it('shows as many slides at a time as the listing grid shows columns (FR-021)', () => {
    // The Home's carousel and the listing grid draw the same card at the same three widths; two
    // different slide counts would be two answers to one design question.
    expect(PROJECT_CAROUSEL_CSS).toContain(`/* slides: ${LISTING_GRID_COLUMNS.mobile} */`)
    expect(PROJECT_CAROUSEL_CSS).toContain(`/* slides: ${LISTING_GRID_COLUMNS.tablet} */`)
    expect(PROJECT_CAROUSEL_CSS).toContain(`/* slides: ${LISTING_GRID_COLUMNS.desktop} */`)
  })

  it('only ever breakpoints at the three design targets', () => {
    const widths = [...PROJECT_CAROUSEL_CSS.matchAll(/min-width:\s*(\d+)px/g)].map((m) => m[1]!)

    expect(widths.length, 'the carousel declares no breakpoint at all').toBeGreaterThan(0)
    expect(widths.filter((width) => !DESIGN_TARGETS.has(width))).toEqual([])
  })
})

describe('§3 — the arrows move the track, and are invoked to prove it', () => {
  it('draws two real buttons, each with an accessible name', () => {
    const buttons = controls(mount(SLIDES).tree)

    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      // Not `submit`: the Home's hero has no form, but a carousel dropped inside one later
      // would silently submit it — the default this repo's Button already refuses.
      expect(button.props.type).toBe('button')
      expect(
        String(button.props['aria-label'] ?? ''),
        `a control labelled only "${String(button.props.children)}" is announced as that ` +
          'glyph. The name is what a screen-reader user hears in place of the arrow.',
      ).not.toBe('')
    }
  })

  it('scrolls forward by exactly one screenful of track', () => {
    const { tree, track } = mount(SLIDES)

    press(controls(tree)[1])

    expect(
      track?.scrolled,
      'the forward control scrolled nothing, or scrolled by a hard-coded number. One ' +
        'screenful is what keeps the step honest at all three breakpoints: three cards at ' +
        '1440 and one at 390, from the same handler.',
    ).toEqual([{ left: 900, behavior: 'smooth' }])
  })

  it('scrolls back by the same amount, in the other direction', () => {
    const { tree, track } = mount(SLIDES)

    press(controls(tree)[0])

    expect(
      track?.scrolled,
      'the two controls do the same thing. A back arrow that scrolls forward is the defect ' +
        'no source-text check can see.',
    ).toEqual([{ left: -900, behavior: 'smooth' }])
  })

  it('does nothing when it is pressed before the track exists', () => {
    const { tree } = mount(SLIDES, null)

    // A ref is null until React attaches it, and it is null again after unmount. A handler that
    // dereferences it takes the whole page down on a press nobody could have predicted.
    expect(() => press(controls(tree)[1])).not.toThrow()
  })
})

describe('§4 — the house rules the Home inherits', () => {
  it('writes no colour of its own (FR-027)', () => {
    expect(HEX_COLOUR.test(readFileSync(SOURCE_PATH, 'utf8'))).toBe(false)
  })

  it('shows a focus ring on both the arrows and the track (FR-023)', () => {
    expect(rule('.fl-carousel__controle:focus-visible')).toContain('outline')
    expect(
      rule('.fl-carousel__trilho:focus-visible'),
      'the track is focusable so a keyboard can scroll it; a focusable element with no visible ' +
        'ring is a place the caret disappears into.',
    ).toContain('outline')
  })

  it('gives the arrows a touch target FR-022 accepts', () => {
    const control = rule('.fl-carousel__controle')
    const token = /min-block-size:\s*var\((--space-\d+)\)/.exec(control)?.[1]

    expect(token, `no min-block-size on the control:\n${control}`).toBeDefined()
    expect(control).toContain(`min-inline-size: var(${token})`)
    expect(spacePx(token ?? '--space-1')).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET)
  })
})
