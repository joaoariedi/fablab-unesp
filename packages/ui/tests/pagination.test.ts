import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import {
  ITEMS_PER_PAGE,
  PAGE_GAP,
  Pagination,
  pageWindow,
  totalPagesFor,
  type PageSlot,
  type PaginationSurface,
} from '../src/components/Pagination'

/**
 * T010 / FR-029, FR-022, FR-023, CLR-003 — the numbered pagination control.
 *
 * CLR-003: *"one mechanism — numbered pagination (`‹ 1 2 3 … ›`) — on all five listings, at
 * **12 items per page**"*, chosen because it *"is linkable and indexable, which `CARREGAR MAIS`
 * is not, since page 4 of a listing would have no URL; and it needs no client component on
 * pages that would otherwise be fully server-rendered"*. `biblioteca-3d.md` § *Paginação* draws
 * it: *"(centralizada abaixo da lista): `‹` · `1` (ativo, chip rosa) · `2` · `3` · `4` · `5` ·
 * `...` · `124` · `›`"*, and § *Adaptação tablet* reduces it to *"`‹ 1 2 3 ... 124 ›`"*.
 *
 * ── Why the anchor-vs-button assertion is the load-bearing one ──────────────────────────────
 *
 * A `<button onClick>` pagination renders identically, behaves identically under a mouse, and
 * breaks all three things CLR-003 bought: the page has no URL to share, the route needs
 * `'use client'`, and a crawler cannot reach page 2. None of that has a runtime symptom inside
 * this suite, so the element TYPE is asserted directly rather than inferred from behaviour —
 * paired with a scan of the source for the directive, which is the other half of the same
 * decision (`islands.test.ts` owns the repo-wide version; this pins THIS file).
 *
 * ── Why the window is asserted at 124 pages and not at 3 ────────────────────────────────────
 *
 * Measured on this feature's own Run 2: the projetos page's ellipsis branch only ever saw
 * `totalPages` 2 and 3, where the gap is unreachable — deleting the gap push passed 27/27.
 * Every window case below therefore uses a listing long enough for a gap to exist, and the
 * contiguous case is asserted separately as the other direction (a control that prints `…`
 * between 2 and 3 is just as wrong).
 *
 * ── Why this test calls the component instead of rendering it ───────────────────────────────
 *
 * CLR-003 keeps this package's stack at `node` with no DOM (`vitest.config.ts` states it), so
 * nothing here renders. A React function component is a plain function returning a plain
 * object, so calling it and walking `props.children` asserts the tree it builds — the same move
 * as `tabs.test.ts`, `card.test.ts` and `search-input.test.ts`. Calling it at all is also the
 * FR-024 assertion: a component that grew a hook throws outside a renderer.
 */

const SOURCE_PATH = fileURLToPath(new URL('../src/components/Pagination.tsx', import.meta.url))

/** The data layer's copy of the same "12", which this component's constant must not drift from. */
const LISTING_SOURCE = fileURLToPath(
  new URL('../../../apps/web/lib/public/listing.ts', import.meta.url),
)

/** A complete hex run, matched anywhere — the colour fence's own pattern (FR-002, FR-027). */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])/

/** FR-022's floor, written unconditionally rather than under a breakpoint. */
const MIN_TARGET = '44px'

/**
 * `source` with its comments removed, so a text scan is asked about CODE only.
 *
 * `islands.test.ts` documents the failure this closes, and measured it twice: a docblock that
 * explains why a component is NOT a client component naturally names `onClick` and
 * `outline: none` in order to forbid them, and a whole-text scan then reads that prose as the
 * violation. The strip is deliberately textual rather than a parse — over-stripping can only
 * hide a real occurrence, and each scan below is paired with a behavioural assertion that would
 * still be red; under-stripping is the direction that turns correct documentation into a
 * failure, and that is the direction this closes.
 */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly style?: Record<string, unknown>
  readonly [key: string]: unknown
}>

/** `/projetos?pagina=n` — the shape `listingHref` produces, so hrefs are checked as data. */
const hrefFor = (n: number): string => `/projetos?pagina=${n}`

function control(
  page: number,
  totalPages: number,
  surface?: PaginationSurface,
): AnyElement | null {
  return Pagination({
    page,
    totalPages,
    hrefFor,
    ...(surface === undefined ? {} : { surface }),
  }) as AnyElement | null
}

/** The control, asserted non-null first so a `null` regression is one clear failure. */
function shown(page: number, totalPages: number, surface?: PaginationSurface): AnyElement {
  const element = control(page, totalPages, surface)
  expect(element, `Pagination rendered nothing for page ${page} of ${totalPages}`).not.toBeNull()
  return element as AnyElement
}

/** Every element in the tree, depth-first, the root excluded — `tabs.test.ts`'s walk. */
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

function anchors(element: AnyElement): AnyElement[] {
  return descendants(element).filter((node) => node.type === 'a')
}

/** The numbered anchors only — the steps carry a glyph, not a page number. */
function numbered(element: AnyElement): AnyElement[] {
  return anchors(element).filter((node) => typeof node.props.children === 'number')
}

function styleOf(element: AnyElement): Record<string, unknown> {
  const style = element.props.style
  expect(style, 'every page target must carry its identity as a style object').toBeDefined()
  return style as Record<string, unknown>
}

function currentOf(element: AnyElement): AnyElement {
  const marked = anchors(element).filter((node) => node.props['aria-current'] !== undefined)
  expect(marked, 'exactly one target must be marked as the page being shown').toHaveLength(1)
  return marked[0] as AnyElement
}

/** What the control prints, in document order: numbers as numbers, the gap as its marker. */
function slots(element: AnyElement): PageSlot[] {
  return descendants(element)
    .filter((node) => typeof node.props.children === 'number' || node.props.children === PAGE_GAP)
    .map((node) => node.props.children as PageSlot)
}

describe('Pagination — links, never buttons (CLR-003, FR-029)', () => {
  it('renders every page as an anchor with an href', () => {
    const element = shown(60, 124)
    expect(anchors(element).length).toBeGreaterThan(0)
    for (const anchor of anchors(element)) {
      expect(typeof anchor.props.href, `a page target with no href: ${JSON.stringify(anchor.props)}`).toBe('string')
    }
  })

  it('renders no button anywhere — a button page has no URL to share or index', () => {
    // The whole of CLR-003's rationale in one assertion. A `<button onClick>` bar looks and
    // behaves the same under a mouse, so nothing else here would notice the substitution.
    const kinds = descendants(shown(60, 124)).map((node) => node.type)
    expect(kinds).not.toContain('button')
    expect(kinds.filter((kind) => kind === 'a').length).toBeGreaterThan(0)
  })

  it('builds every href from the caller, so the page number is a URL parameter (FR-029)', () => {
    const element = shown(60, 124)
    for (const anchor of numbered(element)) {
      expect(anchor.props.href).toBe(hrefFor(anchor.props.children as number))
    }
  })

  it("carries no 'use client' — the control is markup the server emits", () => {
    // `islands.test.ts` owns the repo-wide inventory; this pins the decision at its own file,
    // where a reviewer of THIS diff would look.
    expect(readFileSync(SOURCE_PATH, 'utf8').trimStart()).not.toMatch(/^['"]use client['"]/)
  })

  it('uses no hook and no handler — it is callable outside a renderer', () => {
    // Over the code, not the prose: the docblock NAMES `onClick` in order to explain why this
    // control does not use one, and a whole-text scan reads that explanation as the violation.
    const source = code(SOURCE_PATH)
    expect(source).not.toMatch(/\buse(?:State|Effect|Ref|Reducer|Memo|Callback)\b/)
    expect(source).not.toMatch(/\son[A-Z]\w*=/)
    // The behavioural half, which no comment can satisfy: a component that grew a hook throws
    // outside a renderer, so every `shown(...)` call in this file is already the assertion.
    expect(shown(60, 124).type).toBe('nav')
  })
})

describe('Pagination — aria-current marks the page being shown (FR-029)', () => {
  it('marks exactly one target, and marks the current page', () => {
    for (const page of [1, 2, 60, 123, 124]) {
      const current = currentOf(shown(page, 124))
      expect(current.props.children).toBe(page)
    }
  })

  it("marks it 'page' and not 'true' — these anchors navigate to a document", () => {
    expect(currentOf(shown(60, 124)).props['aria-current']).toBe('page')
  })

  it('leaves every other page unmarked', () => {
    const others = numbered(shown(60, 124)).filter((node) => node.props.children !== 60)
    expect(others.length).toBeGreaterThan(0)
    for (const anchor of others) expect(anchor.props['aria-current']).toBeUndefined()
  })

  it('still marks one page when the caller passes a number outside the range', () => {
    // `params.ts` clamps before this component ever sees a page, but a control that silently
    // marks nothing is a listing with no visible "you are here" — and the failure arrives from
    // a stale bookmark, not from a developer's keyboard.
    for (const page of [0, -3, 999]) {
      const current = currentOf(shown(page, 124))
      expect([1, 124]).toContain(current.props.children)
    }
  })
})

describe('Pagination — the window and its gap (biblioteca-3d.md § Paginação)', () => {
  it('always prints the first and the last page, however far apart they are', () => {
    const printed = slots(shown(60, 124))
    expect(printed[0]).toBe(1)
    expect(printed[printed.length - 1]).toBe(124)
  })

  it('prints the current page with its neighbours', () => {
    expect(slots(shown(60, 124))).toEqual([1, PAGE_GAP, 58, 59, 60, 61, 62, PAGE_GAP, 124])
  })

  it('draws the run the mockup draws on the first page', () => {
    // `biblioteca-3d.md`: `‹` · `1` (ativo) · `2` · `3` · `4` · `5` · `...` · `124` · `›`.
    expect(slots(shown(1, 124))).toEqual([1, 2, 3, 4, 5, PAGE_GAP, 124])
  })

  it('slides rather than shrinking on the last page', () => {
    // A window that only clamped would print `1 … 123 124` — two links where the first page
    // gets five, and a bar whose width jumps as the visitor pages through.
    expect(slots(shown(124, 124))).toEqual([1, PAGE_GAP, 120, 121, 122, 123, 124])
  })

  it('prints a gap marker exactly where pages are missing', () => {
    // The non-vacuity guard for this whole block: measured on Run 2, deleting the gap push
    // from the projetos page passed 27/27 because no case had a gap to lose.
    expect(slots(shown(60, 124)).filter((slot) => slot === PAGE_GAP)).toHaveLength(2)
    expect(slots(shown(1, 124)).filter((slot) => slot === PAGE_GAP)).toHaveLength(1)
  })

  it('prints no gap when the run is contiguous', () => {
    // The other direction, and the one a "always print …" implementation gets wrong: a bar
    // reading `1 … 2 3` claims pages that do not exist.
    for (const totalPages of [2, 3, 4, 5]) {
      for (let page = 1; page <= totalPages; page += 1) {
        expect(slots(shown(page, totalPages))).toEqual(
          Array.from({ length: totalPages }, (_, index) => index + 1),
        )
      }
    }
  })

  it('never links a gap — there is no page "…"', () => {
    const gaps = descendants(shown(60, 124)).filter((node) => node.props.children === PAGE_GAP)
    expect(gaps).toHaveLength(2)
    for (const gap of gaps) {
      expect(gap.type).not.toBe('a')
      // Announced, "…" is read as "ellipsis" or spelled out; the numbers either side already
      // tell a reader the run is not contiguous.
      expect(gap.props['aria-hidden']).toBe(true)
    }
  })

  it('exposes the window as data, so a listing can reason about it without rendering', () => {
    expect(pageWindow(1, 124)).toEqual([1, 2, 3, 4, 5, PAGE_GAP, 124])
    expect(pageWindow(60, 124)).toEqual([1, PAGE_GAP, 58, 59, 60, 61, 62, PAGE_GAP, 124])
    expect(pageWindow(2, 3)).toEqual([1, 2, 3])
  })

  it('never repeats a page number, at any position in any length', () => {
    // The classic bug in a first-and-last-plus-window union: page 2 of 6 prints `1 1 2 3 4 6`
    // when the union is a concatenation rather than a set. Two links to page 1 is a duplicate
    // `aria-current` waiting for the visitor who lands on it.
    for (let totalPages = 1; totalPages <= 40; totalPages += 1) {
      for (let page = 1; page <= totalPages; page += 1) {
        const numbers = pageWindow(page, totalPages).filter(
          (slot): slot is number => slot !== PAGE_GAP,
        )
        expect(new Set(numbers).size, `page ${page} of ${totalPages} repeats a number`).toBe(
          numbers.length,
        )
        expect([...numbers].sort((a, b) => a - b), `page ${page} of ${totalPages} is unordered`).toEqual(numbers)
        expect(numbers).toContain(page)
      }
    }
  })
})

describe('Pagination — twelve items per page (FR-029, CLR-003)', () => {
  it('fixes the page size at twelve', () => {
    // "Twelve divides evenly into the 3-, 2- and 1-column grids, so no breakpoint ends on a
    // ragged row" — the number is a decision, not an incidental default.
    expect(ITEMS_PER_PAGE).toBe(12)
  })

  it('counts a partial last page, and never reports zero pages', () => {
    expect(totalPagesFor(0)).toBe(1)
    expect(totalPagesFor(1)).toBe(1)
    expect(totalPagesFor(12)).toBe(1)
    expect(totalPagesFor(13)).toBe(2)
    expect(totalPagesFor(24)).toBe(2)
    expect(totalPagesFor(25)).toBe(3)
  })

  it('agrees with the page size the listing reader queries with', () => {
    // Two copies of "12" that can drift is the whole risk of stating it here at all: the query
    // takes 12 rows and the control would number them by a different divisor, so the last page
    // is empty and nothing anywhere is red. This holds the copies together.
    const source = readFileSync(LISTING_SOURCE, 'utf8')
    const declared = /export const PAGE_SIZE\s*=\s*(\d+)/.exec(source)
    expect(
      declared,
      `apps/web/lib/public/listing.ts no longer declares PAGE_SIZE, so this check is blind. ` +
        `Point it at wherever the query's page size now lives.`,
    ).not.toBeNull()
    expect(Number(declared?.[1])).toBe(ITEMS_PER_PAGE)
  })
})

describe('Pagination — the structure a paging control has to have', () => {
  it('is a named landmark, not an anonymous row of links', () => {
    const element = shown(60, 124)
    expect(element.type).toBe('nav')
    // A listing page carries the header nav and the category tabs too; unnamed landmarks read
    // as "navigation, navigation" in a screen reader's landmark list.
    expect(element.props['aria-label']).toBe('Paginação')
  })

  it('takes a landmark name when a page shows more than one listing', () => {
    expect(
      (Pagination({ page: 1, totalPages: 4, hrefFor, label: 'Paginação de modelos' }) as AnyElement)
        .props['aria-label'],
    ).toBe('Paginação de modelos')
  })

  it('renders nothing at all when there is only one page', () => {
    // One page is not a choice, and a control offering it is noise the design does not draw.
    expect(control(1, 1)).toBeNull()
    expect(control(1, 0)).toBeNull()
  })

  it('offers a step to the previous and next page, as the mockup draws', () => {
    // `‹` and `›` either side of the numbers. They are anchors like the numbers, and they
    // carry a name — a bare glyph is announced as "single left-pointing angle quotation mark".
    const steps = anchors(shown(60, 124)).filter((node) => typeof node.props.children !== 'number')
    expect(steps).toHaveLength(2)
    expect(steps.map((step) => step.props['aria-label'])).toEqual([
      'Página anterior',
      'Próxima página',
    ])
    expect(steps.map((step) => step.props.href)).toEqual([hrefFor(59), hrefFor(61)])
  })

  it('drops the step that would point nowhere', () => {
    // A `‹` on page 1 either links to page 1 — a control that does nothing — or to page 0,
    // which is a URL the listing has to clamp. Neither is drawn; the step is simply absent.
    const first = anchors(shown(1, 124)).filter((node) => typeof node.props.children !== 'number')
    expect(first.map((step) => step.props['aria-label'])).toEqual(['Próxima página'])
    const last = anchors(shown(124, 124)).filter((node) => typeof node.props.children !== 'number')
    expect(last.map((step) => step.props['aria-label'])).toEqual(['Página anterior'])
  })

  it('gives every anchor a stable key, so React does not remount the bar on every page', () => {
    for (const anchor of anchors(shown(60, 124))) expect(anchor.key).not.toBeNull()
  })
})

describe('Pagination — reachable by keyboard and by thumb (FR-022, FR-023)', () => {
  it('gives every target at least 44x44, written unconditionally', () => {
    // A target that is only large below 834 is a rule nobody can check on the device in their
    // hand, so the floor is not behind a media query.
    for (const anchor of anchors(shown(60, 124))) {
      const style = styleOf(anchor)
      expect(style.minWidth).toBe(MIN_TARGET)
      expect(style.minHeight).toBe(MIN_TARGET)
    }
  })

  it('never suppresses the focus ring', () => {
    // FR-023: focus is visible on every interactive target. `outline: none` is the one line
    // that removes it, and it has no visual symptom for a mouse user at all.
    // Over the code for the same reason as the handler scan above — the style block's comment
    // spells `outline: none` out in order to forbid it.
    expect(code(SOURCE_PATH)).not.toMatch(/outline\s*:\s*['"]?none/)
    for (const anchor of anchors(shown(60, 124))) {
      expect(styleOf(anchor).outline).toBeUndefined()
    }
  })
})

describe('Pagination — the two surfaces it is drawn on (FR-027, FR-028)', () => {
  it('defaults to the navy base: light ink, the accent on the current page', () => {
    const element = shown(60, 124)
    expect(styleOf(currentOf(element)).color).toBe('var(--color-primary)')
    for (const anchor of numbered(element).filter((node) => node.props.children !== 60)) {
      expect(styleOf(anchor).color).toBe('var(--color-claro)')
    }
  })

  it('never reaches for the private raw pink, which renders identically today (CLR-001)', () => {
    expect(styleOf(currentOf(shown(60, 124))).color).not.toBe('var(--color-rosa-raw)')
    expect(readFileSync(SOURCE_PATH, 'utf8')).not.toContain('--color-rosa-raw')
  })

  it('writes no hexadecimal colour anywhere (FR-027)', () => {
    expect(readFileSync(SOURCE_PATH, 'utf8')).not.toMatch(HEX_COLOUR)
  })

  it('turns navy on a light page, and never prints small pink text on white (FR-028)', () => {
    // `biblioteca-3d.md` draws the active page as a "chip rosa" — the pink is the FILL and the
    // ink is navy. Painting the number pink instead is the exact thing FR-028 forbids, and on
    // white it is also the pair `contrast.test.ts` refuses to certify.
    const element = shown(60, 124, 'light')
    const current = styleOf(currentOf(element))
    expect(current.background).toBe('var(--color-primary)')
    expect(current.color).toBe('var(--color-navy)')
    for (const anchor of numbered(element).filter((node) => node.props.children !== 60)) {
      const style = styleOf(anchor)
      expect(style.color).toBe('var(--color-navy)')
      expect(style.color).not.toBe('var(--color-primary)')
    }
  })

  it('keeps the gap marker readable on whichever surface it sits on', () => {
    const inkOf = (surface: PaginationSurface): unknown => {
      const gap = descendants(shown(60, 124, surface)).find(
        (node) => node.props.children === PAGE_GAP,
      )
      return styleOf(gap as AnyElement).color
    }
    expect(inkOf('navy')).toBe('var(--color-claro)')
    expect(inkOf('light')).toBe('var(--color-navy)')
  })
})
