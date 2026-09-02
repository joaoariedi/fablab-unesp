import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import type { ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CARD_OUTLINE_COLOURS } from '../../../packages/ui/src/components/Card'
import {
  DEFAULT_LOGO_CHIP_COLOUR,
  LOGO_CHIP_COLOURS,
} from '../../../packages/ui/src/components/LogoChip'
import { percentOf } from '../../../packages/ui/src/components/ProgressBar'
import { SKILL_PIP_COUNT } from '../../../packages/ui/src/components/SkillPips'
import { ISO_SHAPE_NAMES } from '../../../packages/ui/src/shapes/geometry'

/**
 * T037 / FR-016, US7 — the component workbench: every component, in its states, at all three
 * design targets, **at a route that actually exists**.
 *
 * ── Why the three widths are iframes and not three fixed-width divs ─────────────────────────
 *
 * Which tabs the header shows, whether the footer pillars run in a row, whether the mobile bar
 * exists at all — every one of those is a `@media (min-width: …)` query (HeaderNav.tsx,
 * Footer.tsx, MobileTabBar.tsx all say so explicitly). A media query answers to the
 * **viewport**, not to the width of the box a component is placed in, so a page that renders
 * the shell inside three fixed-width `<div>`s shows the same desktop layout three times and
 * US7's "at all three breakpoints" is satisfied in wording only. An `<iframe>` carries its own
 * viewport, which is why the workbench is an index of three frames of itself.
 *
 * ── What this test can and cannot prove (plan § *What these tests can and cannot prove*) ────
 *
 * CLR-003 locks the stack at Vitest with no DOM, so nothing here renders. A server component is
 * a plain function returning a plain object, so calling the page and walking the tree it
 * returns asserts *what the workbench puts on the page* — which components, with which props.
 * Whether the browser paints them legibly is what the workbench itself is for, and feature
 * 003's Playwright is where it becomes machine-checkable.
 */

const mocks = vi.hoisted(() => {
  /** `notFound()` throws and never returns; a mock that returns lets the page fall through to a
   *  render the real runtime would never reach. */
  const NOT_FOUND = new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  return {
    NOT_FOUND,
    notFound: vi.fn((): never => {
      throw NOT_FOUND
    }),
  }
})

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const UI_SRC = join(REPO_ROOT, 'packages', 'ui', 'src')
const ROUTE_PARTS = ['app', '(frontend)', 'workbench', 'page.tsx']
const PAGE_PATH = join(import.meta.dirname, '..', ...ROUTE_PARTS)
const LAYOUT_TOKENS = join(UI_SRC, 'tokens', 'layout.css')

/** The page module's public shape — only what this test drives. */
interface WorkbenchModule {
  readonly default: (props?: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>
  }) => Promise<ReactNode> | ReactNode
  readonly WORKBENCH_ROUTE: string
  readonly WORKBENCH_FRAME_PARAM: string
  readonly WORKBENCH_TARGETS: readonly { readonly name: string; readonly width: number }[]
}

/** Imported lazily so a missing page fails the existence assertion below with a message that
 *  names the file, rather than crashing the whole suite at collection time. */
const loadPage = async (): Promise<WorkbenchModule> =>
  (await import('../app/(frontend)/workbench/page')) as unknown as WorkbenchModule

type AnyElement = ReactElement<Record<string, unknown>>

function isElement(node: unknown): node is AnyElement {
  return typeof node === 'object' && node !== null && 'type' in node && 'props' in node
}

/** Every element in the tree, including those passed as props (`menu={<MenuSheet />}`) rather
 *  than as children — the header takes its island exactly that way. */
function collect(node: unknown, found: AnyElement[] = []): AnyElement[] {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, found)
    return found
  }
  if (!isElement(node)) return found
  found.push(node)
  for (const value of Object.values(node.props ?? {})) collect(value, found)
  return found
}

/** The component name of an element, or `undefined` for an intrinsic tag like `<div>`. */
function componentName(element: AnyElement): string | undefined {
  return typeof element.type === 'function'
    ? ((element.type as { name?: string }).name ?? undefined)
    : undefined
}

/** How many frames a subtree holds. */
const frameCount = (node: unknown): number =>
  collect(node).filter((element) => element.type === 'iframe').length

/** The deepest element that still holds *every* frame — the box a narrow window has to scroll.
 *  `collect` throws parenthood away and this container is defined entirely by what it contains,
 *  so the search is separate. */
function frameRow(node: unknown): AnyElement | undefined {
  const total = frameCount(node)
  if (total === 0) return undefined
  const search = (current: unknown): AnyElement | undefined => {
    if (!isElement(current)) return undefined
    for (const value of Object.values(current.props ?? {})) {
      for (const child of Array.isArray(value) ? value.flat(Infinity) : [value]) {
        const deeper = search(child)
        if (deeper !== undefined) return deeper
      }
    }
    return current.type !== 'iframe' && frameCount(current) === total ? current : undefined
  }
  return search(node)
}

/** An element's inline style, as a plain bag this test can read property by property. */
const styleOf = (element: AnyElement | undefined): Record<string, unknown> =>
  (element?.props.style ?? {}) as Record<string, unknown>

const renderIndex = async (): Promise<AnyElement[]> => collect(await (await loadPage()).default({}))

const renderFrame = async (width: number): Promise<AnyElement[]> => {
  const page = await loadPage()
  return collect(
    await page.default({
      searchParams: Promise.resolve({ [page.WORKBENCH_FRAME_PARAM]: String(width) }),
    }),
  )
}

/** Every prop object the workbench passed to a given component, across the frame. */
const propsFor = (elements: AnyElement[], name: string): Record<string, unknown>[] =>
  elements.filter((element) => componentName(element) === name).map((element) => element.props)

/** The `.tsx` files under a `packages/ui/src` directory, by component name. Derived rather than
 *  listed: a component added to the library must appear in the workbench without anyone
 *  remembering to widen this test. */
const componentsIn = (directory: string): string[] =>
  readdirSync(join(UI_SRC, directory))
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => basename(file, '.tsx'))

const LIBRARY_COMPONENTS = ['components', 'shell', 'shapes'].flatMap(componentsIn)

/** `--bp-mobile: 390px;` → 390. The stylesheet is the source of truth for the design targets
 *  (layout-tokens.test.ts uses the same arrangement); the workbench must not carry a second
 *  copy that can drift from it. */
function breakpointFromTokens(name: string): number {
  const css = readFileSync(LAYOUT_TOKENS, 'utf8')
  const match = new RegExp(`--bp-${name}:\\s*(\\d+)px`).exec(css)
  expect(match, `layout.css declares no --bp-${name}`).not.toBeNull()
  return Number(match?.[1])
}

describe('T037 / FR-016, US7 — the component workbench', () => {
  describe('§1 — it is a real route, reachable in development', () => {
    it('exists at app/(frontend)/workbench/page.tsx', () => {
      expect(
        existsSync(PAGE_PATH),
        `no workbench page at ${PAGE_PATH}. FR-016 makes the workbench a route, and a route ` +
          'is a page.tsx under app/ — nothing else renders.',
      ).toBe(true)
    })

    it('has no path part beginning with "_", which route discovery drops everywhere', () => {
      const dropped = ROUTE_PARTS.filter((part) => part.startsWith('_'))
      expect(
        dropped,
        'a "_"-prefixed path part is filtered out by Next 16.3.3 route discovery ' +
          '(ignorePartFilter in dist/build/route-discovery.js) in EVERY environment. The ' +
          "first draft's _workbench/ was not a dev-only route; it was no route at all.",
      ).toEqual([])
    })

    it('default-exports the page component', async () => {
      expect(typeof (await loadPage()).default).toBe('function')
    })
  })

  describe('§2 — all three design targets, each with its own viewport', () => {
    it('takes its widths from the token layer, not from a second copy', async () => {
      const { WORKBENCH_TARGETS } = await loadPage()
      expect(
        WORKBENCH_TARGETS.map((target) => target.width),
        'the workbench frames do not match --bp-mobile/--bp-tablet/--bp-desktop. A width ' +
          'retyped here goes on reviewing a breakpoint the stylesheet no longer switches at.',
      ).toEqual(['mobile', 'tablet', 'desktop'].map(breakpointFromTokens))
    })

    it('renders one frame per design target, each a viewport of its own', async () => {
      const { WORKBENCH_TARGETS, WORKBENCH_FRAME_PARAM, WORKBENCH_ROUTE } = await loadPage()
      const frames = (await renderIndex()).filter((element) => element.type === 'iframe')

      expect(
        frames.length,
        'the workbench index does not render three iframes. A fixed-width <div> does not ' +
          'change the viewport, so the media queries in HeaderNav/Footer/MobileTabBar answer ' +
          'the reviewer’s window width and every "breakpoint" shows the same layout.',
      ).toBe(WORKBENCH_TARGETS.length)

      for (const target of WORKBENCH_TARGETS) {
        const frame = frames.find((element) => Number(element.props.width) === target.width)
        expect(frame, `no ${target.width}px frame among the workbench iframes`).toBeDefined()
        expect(
          String(frame?.props.src),
          `the ${target.name} frame does not load the workbench at ${target.width}px`,
        ).toBe(`${WORKBENCH_ROUTE}?${WORKBENCH_FRAME_PARAM}=${target.width}`)
      }
    })

    it('shows the specimens inside a frame, not the frame index again', async () => {
      const { WORKBENCH_TARGETS } = await loadPage()
      const width = WORKBENCH_TARGETS[0]?.width ?? 0
      const inside = await renderFrame(width)

      expect(
        inside.filter((element) => element.type === 'iframe'),
        'a frame of the workbench renders the frame index again, which nests the workbench ' +
          'inside itself until the browser stops it.',
      ).toEqual([])
    })

    it('keeps each frame at its named width, unclamped by the reviewer\u2019s window', async () => {
      const { WORKBENCH_TARGETS } = await loadPage()
      const frames = (await renderIndex()).filter((element) => element.type === 'iframe')

      for (const target of WORKBENCH_TARGETS) {
        const frame = frames.find((element) => Number(element.props.width) === target.width)
        for (const [property, value] of Object.entries(styleOf(frame))) {
          if (!/width/i.test(property)) continue
          expect(
            String(value),
            `the ${target.name} frame constrains ${property} to ${String(value)}, which resolves ` +
              'against the reviewer\u2019s window. A clamped iframe does not merely look smaller: ' +
              'its *inner* viewport becomes the clamped width, so HeaderNav\u2019s ' +
              '@media (min-width: 1440px) never matches and the desktop frame shows the tablet ' +
              'header. Three frames side by side (390 + 834 + 1440) exceed every laptop, so this ' +
              'fires on the first look, not in some edge case \u2014 and it defeats the one reason ' +
              'the workbench uses iframes at all.',
          ).not.toMatch(/%|vw/)
        }
      }
    })

    it('scrolls the frame row rather than squeezing the frames into it', async () => {
      const row = frameRow(await (await loadPage()).default({}))
      expect(row, 'no single element contains all three frames').toBeDefined()

      expect(
        String(styleOf(row).overflowX),
        'the row holding the frames does not scroll. Something has to give when 2664px of frame ' +
          'meets a 1440px window, and the only options are a scrollbar or a squeezed frame \u2014 ' +
          'and a squeezed frame is a wrong viewport, which is the previous test\u2019s failure.',
      ).toBe('auto')

      expect(
        String(styleOf(row).flexWrap),
        'the frame row wraps. A wrapped row puts the widest frame on a line of its own at the ' +
          'container\u2019s width, which is the clamp again by another route.',
      ).not.toBe('wrap')

      const figures = collect(row).filter((element) => element.type === 'figure')
      expect(figures.length, 'the frames are not in per-target wrappers').toBeGreaterThan(0)
      for (const figure of figures) {
        expect(
          Number(styleOf(figure).flexShrink),
          'a frame wrapper is allowed to shrink. Flex shrinks the <figure> but not the ' +
            'fixed-width <iframe> inside it, so the frames overlap each other instead of ' +
            'scrolling.',
        ).toBe(0)
      }
    })
  })

  describe('§3 — every component the library ships is in the frame', () => {
    it('has components to assert over, so this section cannot pass over an empty library', () => {
      expect(LIBRARY_COMPONENTS.length).toBeGreaterThan(5)
    })

    for (const width of [390, 834, 1440]) {
      it(`renders every library component at ${width}px`, async () => {
        const rendered = new Set(
          (await renderFrame(width)).map(componentName).filter((name) => name !== undefined),
        )
        const missing = LIBRARY_COMPONENTS.filter((name) => !rendered.has(name))

        expect(
          missing,
          `these components are in packages/ui/src but never reach the workbench: ` +
            `${missing.join(', ')}. US7 is "every component is visible in its states at all ` +
            'three breakpoints" — a component the workbench omits is one nobody reviews.',
        ).toEqual([])
      })
    }

    it('imports every component from @fablab/ui, never a local look-alike', async () => {
      // Was `packages/ui/src` — the PATH form. That was right about the intent (a component
      // defined in the page reviews nothing but itself) and wrong about the source: reaching
      // into the package bypasses the export map, which is exactly what let five components
      // ship with no legal import while every suite stayed green. The public surface is the
      // stricter requirement, and it is the one SC-009 actually states.
      const source = readFileSync(PAGE_PATH, 'utf8')
      const imported = new Set(
        [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@fablab\/ui'/g)]
          .flatMap((m) => m[1]!.split(','))
          .map((name) => name.trim().replace(/^type\s+/, '')),
      )
      const missing = LIBRARY_COMPONENTS.filter((name) => !imported.has(name))
      expect(
        missing,
        `these render in the workbench but are not imported from '@fablab/ui': ${missing.join(', ')}`,
      ).toEqual([])
    })
  })

  describe('§4 — and in its states, not one specimen apiece', () => {
    const frame = async () => renderFrame(390)

    it('shows the button enabled and disabled', async () => {
      const states = new Set(propsFor(await frame(), 'Button').map((props) => props.disabled === true))
      expect(states, 'the workbench shows only one button state').toEqual(new Set([true, false]))
    })

    it('shows both chip variants, and the filter chip selected as well as not', async () => {
      const chips = propsFor(await frame(), 'Chip')
      expect(new Set(chips.map((props) => props.variant))).toEqual(new Set(['filter', 'status']))
      expect(
        new Set(chips.filter((props) => props.variant === 'filter').map((props) => props.active === true)),
        'the filter chip is only shown in one selection state; the active one is a different ' +
          'colour and an underline, which is precisely what a reviewer checks.',
      ).toEqual(new Set([true, false]))
    })

    it('shows every card outline the component defines', async () => {
      const outlines = propsFor(await frame(), 'Card').map((props) => props.outline ?? 'claro')
      expect(new Set(outlines)).toEqual(new Set(Object.keys(CARD_OUTLINE_COLOURS)))
    })

    it('shows every logo-chip colour', async () => {
      const shown = new Set(
        propsFor(await frame(), 'LogoChip').map((props) => props.colour ?? DEFAULT_LOGO_CHIP_COLOUR),
      )
      const missing = LOGO_CHIP_COLOURS.filter((colour) => !shown.has(colour))
      expect(missing, `logo-chip colours never shown: ${missing.join(', ')}`).toEqual([])
    })

    it('shows the search field on both surfaces it supports', async () => {
      const surfaces = propsFor(await frame(), 'SearchInput').map((props) => props.surface ?? 'navy')
      expect(new Set(surfaces)).toEqual(new Set(['navy', 'light']))
    })

    it('shows the progress bar empty and full, not one arbitrary value', async () => {
      const percents = propsFor(await frame(), 'ProgressBar').map((props) =>
        percentOf(Number(props.value), props.max === undefined ? undefined : Number(props.max)),
      )
      expect(percents, 'the progress bar is shown at one value only').toContain(0)
      expect(percents).toContain(100)
    })

    it('shows the skill strip at both ends of its range', async () => {
      const levels = propsFor(await frame(), 'SkillPips').map((props) => Number(props.level))
      expect(levels).toContain(0)
      expect(levels).toContain(SKILL_PIP_COUNT)
    })

    it('shows a tab set with an active tab — the state the component exists to express', async () => {
      const active = propsFor(await frame(), 'Tabs').filter(
        (props) => typeof props.activeHref === 'string',
      )
      expect(active.length, 'no Tabs specimen carries activeHref').toBeGreaterThan(0)
    })

    it('shows the bottom bar signed out and signed in, the two destinations PERFIL has', async () => {
      const bars = propsFor(await frame(), 'MobileTabBar')
      expect(bars.length, 'no MobileTabBar specimen').toBeGreaterThan(0)

      const states = new Set(bars.map((props) => props.isSignedIn === true))
      expect(
        states,
        'the workbench shows the mobile bar in one session state only. `isSignedIn` is the ' +
          "bar's entire prop surface, and it is not cosmetic: PERFIL resolves through " +
          '`profileHref`, so signed out it goes to /login and signed in to Minha Conta. This ' +
          'bar is the only place in the product where that branch renders at all (MobileTabBar ' +
          "§ PERFIL), so a state the workbench omits is a destination nobody reviews — and " +
          'US7 is "every component is visible in its **states**", not one specimen apiece.',
      ).toEqual(new Set([true, false]))
    })

    it('shows every shape in the FR-015 vocabulary', async () => {
      const drawn = new Set(propsFor(await frame(), 'IsoShape').map((props) => props.name))
      const missing = ISO_SHAPE_NAMES.filter((name) => !drawn.has(name))
      expect(
        missing,
        `shapes in ISO_SHAPES that the workbench never draws: ${missing.join(', ')}. The ` +
          'vocabulary is reviewed here or nowhere.',
      ).toEqual([])
    })

    it('shows the pixel sprite at a whole-number scale it can actually reach', async () => {
      const sprites = propsFor(await frame(), 'PixelImage')
      expect(sprites.length, 'no PixelImage specimen').toBeGreaterThan(0)
      for (const props of sprites) {
        expect(String(props.src), 'a pixel specimen with no source renders a broken image').not.toBe('')
        expect(Number(props.baseWidth)).toBeGreaterThan(0)
      }
    })
  })
})

/**
 * T038 / FR-016 — the production guard.
 *
 * FR-016 promises the workbench is *unreachable in production*, not absent from the bundle:
 * App Router has no build-time page exclusion, so a guarded route still ships its module
 * (plan Sketch 9, revised round 2). "Unreachable" therefore means one thing a unit test can
 * actually observe — the page function refuses to render and raises Next's not-found signal.
 *
 * ── The honest reach of a Vitest test (round 3) ─────────────────────────────────────────────
 *
 * The earlier wording was "a production build 404s". Vitest starts no server and performs no
 * build, so nothing here proves what a deployed instance answers over HTTP; it proves the page
 * calls `notFound()` when `NODE_ENV` says production. That is the whole of the claim. A
 * build-level confirmation — request `/workbench` against `next start` and expect 404 — is a
 * step after the `build` job, not a unit test, and is deliberately not faked here.
 *
 * ── Why the env is stubbed rather than assigned ─────────────────────────────────────────────
 *
 * `vi.stubEnv` restores the previous value in `afterEach` via `unstubAllEnvs`. A bare
 * `process.env.NODE_ENV = 'production'` would leak into every file that runs after this one in
 * the same worker — and `vitest.config.ts` sets `fileParallelism: false`, so *every* other test
 * file is "after this one".
 *
 * ── This gate was watched failing ───────────────────────────────────────────────────────────
 *
 * Per tasks.md note 6, the guard line in `page.tsx` was deleted and this block observed going
 * red (three failures: no throw, `notFound` never called, searchParams awaited) before the line
 * was restored. A gate nobody has watched fail is not a gate.
 */
describe('T038 / FR-016 — unreachable in production', () => {
  beforeEach(() => {
    mocks.notFound.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('raises Next’s not-found signal when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const page = await loadPage()

    await expect(
      (async () => page.default({}))(),
      'the workbench rendered under NODE_ENV=production. FR-016 requires the route to be ' +
        'unreachable there — the module ships either way, so the guard is the only thing ' +
        'standing between a production visitor and the component gallery.',
    ).rejects.toThrow(mocks.NOT_FOUND.message)

    expect(
      mocks.notFound,
      'the page threw under production, but not by calling notFound(). Only Next’s own ' +
        'not-found signal renders a 404; any other error is a 500.',
    ).toHaveBeenCalled()
  })

  it('guards the frame gallery too, not only the index', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const page = await loadPage()

    await expect(
      page.default({
        searchParams: Promise.resolve({ [page.WORKBENCH_FRAME_PARAM]: '390' }),
      }),
      `?${'bp'}= reaches the specimen gallery in production. A guard on the index alone leaves ` +
        'every component visible one query parameter away.',
    ).rejects.toThrow(mocks.NOT_FOUND.message)
  })

  it('checks the environment before it reads the request', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const page = await loadPage()

    let awaited = false
    /** A thenable, not a Promise, so it can record whether the page ever awaited it. A rejected
     *  promise would prove the same ordering but leave an unhandled rejection behind. */
    const probe = {
      then(resolve: (value: Record<string, string>) => void): void {
        awaited = true
        resolve({})
      },
    } as unknown as Promise<Record<string, string | string[] | undefined>>

    await expect(page.default({ searchParams: probe })).rejects.toThrow(mocks.NOT_FOUND.message)
    expect(
      awaited,
      'the page awaited searchParams before the production guard ran. Work done ahead of the ' +
        'guard is work a production request can still trigger.',
    ).toBe(false)
  })

  it('does not fire outside production, or the workbench is unreachable everywhere', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const page = await loadPage()

    await expect(page.default({})).resolves.toBeDefined()
    expect(
      mocks.notFound,
      'the guard 404s the workbench in development as well, which is the one environment ' +
        'FR-016 exists to keep it reachable in.',
    ).not.toHaveBeenCalled()
  })
})

describe('SC-009: built from the public surface only', () => {
  it('reaches into packages/ui through no relative or deep path', () => {
    // The criterion is that a page can be built "using only @fablab/ui exports". The first
    // draft imported sixteen deep relative paths into packages/ui/src, which bypass the
    // export map — so it would have rendered while proving nothing, at a moment when five
    // components genuinely had no legal import. Asserted as a pattern over the source rather
    // than a list of allowed specifiers, so a new deep import is caught without an edit here.
    const source = readFileSync(PAGE_PATH, 'utf8')
    const offenders = [...source.matchAll(/from\s+'([^']*packages\/ui[^']*)'/g)].map((m) => m[1])
    expect(
      offenders,
      `the workbench must import through '@fablab/ui', not reach into the package:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })

  it('does import from @fablab/ui — an empty page would satisfy the rule above', () => {
    const source = readFileSync(PAGE_PATH, 'utf8')
    expect(source).toMatch(/from\s+'@fablab\/ui'/)
  })
})

describe('the two tab bars do not paint on top of each other', () => {
  it('gives every MobileTabBar wrapper a containing block for fixed descendants', async () => {
    // MobileTabBar pins itself with `position: fixed; bottom: 0` and an opaque navy fill.
    // Two of them in one gallery resolve against the SAME viewport, land on identical pixels,
    // and the later one in the DOM hides the other completely — the workbench would show one
    // bar while claiming two states, which reads as coverage and is worse than showing one.
    //
    // Only a few properties make an ancestor a containing block for `position: fixed`:
    // transform, perspective, filter, will-change of those, or `contain` with layout+paint.
    // `position: relative` does NOT — which is why this asserts the property rather than
    // trusting that a wrapper exists. Measured: swapping `contain` for `position: relative`
    // left the whole suite green before this case was written.
    const elements = await renderFrame(390)
    const bars = elements.filter((el) => componentName(el) === 'MobileTabBar')
    expect(bars.length, 'both session states must be on the page').toBeGreaterThan(1)

    const wrappers = elements.filter((el) => {
      const children = (el.props as { children?: unknown }).children
      const list = Array.isArray(children) ? children : [children]
      return list.some((child) => isElement(child) && componentName(child) === 'MobileTabBar')
    })
    expect(wrappers.length, 'every bar must sit in its own wrapper').toBe(bars.length)

    for (const wrapper of wrappers) {
      const style = styleOf(wrapper)
      const contain = String(style.contain ?? '')
      const establishes =
        (contain.includes('layout') && contain.includes('paint')) ||
        contain.includes('strict') ||
        contain.includes('content') ||
        style.transform !== undefined ||
        style.perspective !== undefined ||
        style.filter !== undefined ||
        String(style.willChange ?? '').length > 0
      expect(
        establishes,
        `a MobileTabBar wrapper has style ${JSON.stringify(style)}, which does not contain a ` +
          'fixed descendant — the bars will stack on the same pixels and one becomes invisible.',
      ).toBe(true)
    }
  })

  it('labels each bar with the destination PERFIL resolves to', () => {
    // The two states differ ONLY by an href, and PERFIL is the label in both, so nothing
    // rendered distinguishes them. Without the destination in the title a reviewer sees two
    // identical bars and FR-009's branch stays unreviewable however correctly it is wired.
    const source = readFileSync(PAGE_PATH, 'utf8')
    expect(source).toMatch(/profileHref\(/)
  })
})
