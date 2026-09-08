import type { CSSProperties, ReactElement } from 'react'

/**
 * T010 / FR-029, FR-022, FR-023, CLR-003 — the numbered pagination control.
 *
 * CLR-003: *"one mechanism — numbered pagination (`‹ 1 2 3 … ›`) — on all five listings, at
 * **12 items per page**"*. `biblioteca-3d.md` § *Paginação* is the only page spec that draws
 * it: *"(centralizada abaixo da lista): `‹` · `1` (ativo, chip rosa) · `2` · `3` · `4` · `5` ·
 * `...` · `124` · `›`"*, with § *Adaptação tablet* reducing it to *"`‹ 1 2 3 ... 124 ›`"*.
 *
 * ── Why anchors, and why that is the whole point of the component ───────────────────────────
 *
 * A `<button onClick={goTo}>` bar renders identically and behaves identically under a mouse,
 * and loses all three things CLR-003 bought: page 4 has no URL to share or index, the route
 * that hosts it needs `'use client'`, and the back button stops meaning anything. None of that
 * has a runtime symptom — which is why `tests/pagination.test.ts` asserts the element *type*
 * rather than any behaviour, and why the plan's file table records this file as
 * *"Numbered pages, links only — no client boundary"*.
 *
 * The component therefore never knows how to navigate. It is handed `hrefFor`, so the URL
 * grammar (`?pagina=n`, plus whatever filter and search state the listing carries) stays in
 * `apps/web/lib/public/params.ts` where one parser owns it — this file would otherwise be a
 * second place that has to agree about what a listing URL looks like.
 *
 * ── Why the window slides instead of clamping ───────────────────────────────────────────────
 *
 * The mockup prints five numbers on page 1 (`1 2 3 4 5 … 124`). A window that only clamped
 * `page ± 2` to the range prints `1 2 3 … 124` there and `1 … 122 123 124` at the end — three
 * links where the middle gets five, so the bar changes width as the visitor pages through it
 * and the targets move under the cursor. Sliding keeps the count fixed at {@link WINDOW_SIZE}.
 *
 * The tablet reduction is deliberately *not* a prop. It is the same window drawn narrower, so
 * it belongs to the cascade; a `size` prop would put a breakpoint decision at every call site,
 * where five listings can disagree about it.
 *
 * ── Why the surface is a parameter (FR-028) ─────────────────────────────────────────────────
 *
 * This control is specified on a *light* page and used on navy ones. Ink that is right on navy
 * is invisible on white, and the naive fix — keeping the accent for the current page — is the
 * one thing FR-028 forbids, since small pink text on white is the pair `contrast.test.ts`
 * refuses to certify. So the light surface takes the mockup at its word: *"chip rosa"* is a
 * pink **fill** with navy ink, which is the documented pair `{ fg: 'navy', bg: 'rosaRaw' }`.
 * The same split `SearchInput` makes, for the same reason.
 */

/** The gap between two runs of pages. A marker, never a link — there is no page `…`. */
export const PAGE_GAP = '…'

/** A position in the control: a page to link, or the gap between two runs. */
export type PageSlot = number | typeof PAGE_GAP

/** Which background the control sits on: the navy base, or a white content page. */
export type PaginationSurface = 'navy' | 'light'

/**
 * Items per page, fixed by CLR-003 at twelve.
 *
 * *"Twelve divides evenly into the 3-, 2- and 1-column grids, so no breakpoint ends on a
 * ragged row"* — a decision, not an incidental default. `apps/web/lib/public/listing.ts`
 * queries with the same number and `tests/pagination.test.ts` holds the two copies together:
 * a query taking 12 rows while the control numbers by a different divisor produces an empty
 * last page and nothing anywhere is red.
 */
export const ITEMS_PER_PAGE = 12

/**
 * How many numbers the window prints around the current page.
 *
 * Five, because that is what the mockup draws. Odd on purpose: an even count has no centre, so
 * the current page would sit off-centre and the bar would appear to shift direction at the ends.
 */
const WINDOW_SIZE = 5

export interface PaginationProps {
  /** The page being shown, 1-based. Out-of-range values narrow to a page that exists. */
  readonly page: number
  /** How many pages the listing has. `1` or fewer renders nothing. */
  readonly totalPages: number
  /**
   * The URL for a page number, e.g. `(n) => listingHref('/projetos', { ...params, page: n })`.
   * The whole of FR-029's "the page number is a URL parameter" clause lives at the call site,
   * because that is where the rest of the listing's URL state already is.
   */
  readonly hrefFor: (page: number) => string
  /** Defaults to `'navy'` — the base background every page starts from (FR-011). */
  readonly surface?: PaginationSurface
  /**
   * The landmark's accessible name. Defaults to `Paginação`; pass one when a page carries two
   * paged listings, so a screen reader's landmark list does not read "navigation, navigation".
   */
  readonly label?: string
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

/**
 * How many pages `totalItems` fills, at {@link ITEMS_PER_PAGE} each.
 *
 * Never zero: an empty listing still has a page to be on, and a `totalPages` of 0 would make
 * every caller's clamp produce page 0 — a URL the parser then has to rescue.
 *
 * @example totalPagesFor(13) // 2
 */
export function totalPagesFor(totalItems: number, itemsPerPage = ITEMS_PER_PAGE): number {
  return Math.max(1, Math.ceil(Math.max(0, totalItems) / itemsPerPage))
}

/** The numbers the window covers: {@link WINDOW_SIZE} of them, slid to stay inside the range. */
function windowRun(current: number, last: number): number[] {
  const start = clamp(current - Math.floor(WINDOW_SIZE / 2), 1, Math.max(1, last - WINDOW_SIZE + 1))
  const end = Math.min(last, start + WINDOW_SIZE - 1)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

/**
 * The slots the control prints: the first page, the window around the current one, the last
 * page, and a gap marker wherever pages are missing between them.
 *
 * A `Set` and not a concatenation: on a short listing the first and last pages are already
 * inside the window, and two links to page 1 would mean two elements carrying `aria-current`.
 *
 * @example pageWindow(60, 124) // [1, '…', 58, 59, 60, 61, 62, '…', 124]
 */
export function pageWindow(page: number, totalPages: number): readonly PageSlot[] {
  const last = Math.max(1, Math.trunc(totalPages))
  const current = clamp(Math.trunc(page), 1, last)
  const visible = [...new Set([1, ...windowRun(current, last), last])].sort((a, b) => a - b)

  const slots: PageSlot[] = []
  let previous = 0
  for (const number of visible) {
    // Only where a page is actually missing: a `…` printed between 2 and 3 claims pages the
    // listing does not have, which is as wrong as omitting it between 5 and 124.
    if (previous !== 0 && number - previous > 1) slots.push(PAGE_GAP)
    slots.push(number)
    previous = number
  }
  return slots
}

/** The row, centred below the list as every page spec draws it. */
export const PAGINATION_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: 'var(--space-2)',
  paddingTop: 'var(--space-8)',
  fontFamily: 'var(--font-display)',
}

/**
 * Geometry shared by every target in the bar.
 *
 * FR-022's 44×44 is written unconditionally rather than under a breakpoint: a target that is
 * only large below 834 is a rule nobody can check on the device in their hand. There is no
 * `outline: none` here, and there must never be — the focus ring is the only signal a keyboard
 * visitor gets (FR-023), and removing it has no symptom at all for a mouse user.
 */
const TARGET: CSSProperties = {
  minWidth: '44px',
  minHeight: '44px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  // An anchor is underlined by default, which would make every page read as the current one.
  textDecoration: 'none',
}

/** Ink per surface. The current page's treatment differs in kind, not only in value — see below. */
const SURFACES: Record<PaginationSurface, { readonly ink: string }> = {
  // `--color-claro` is the palette's text-on-dark token; there is no white token, and
  // `tokens/index.ts` records why one is not invented here.
  navy: { ink: 'var(--color-claro)' },
  light: { ink: 'var(--color-navy)' },
}

/** A page the visitor is not on. */
export function pageStyle(surface: PaginationSurface): CSSProperties {
  return { ...TARGET, color: SURFACES[surface].ink }
}

/**
 * The page being shown.
 *
 * On navy it is "sublinhado/rosa", the pair `Tabs` and `Chip` already use for a current item.
 * On white it is the mockup's *"chip rosa"* — the accent as the FILL with navy ink, because
 * pink small text on white is what FR-028 forbids and what `contrast.test.ts` will not certify.
 * The accent is `--color-primary` on both, never the private raw default behind it (CLR-001):
 * for CITe the two render identically, so nothing but this line separates a themed control
 * from one frozen at the default.
 */
export function currentPageStyle(surface: PaginationSurface): CSSProperties {
  if (surface === 'light') {
    return {
      ...TARGET,
      background: 'var(--color-primary)',
      color: 'var(--color-navy)',
      borderRadius: 'var(--radius-sm)',
    }
  }
  return {
    ...TARGET,
    color: 'var(--color-primary)',
    textDecoration: 'underline',
    textUnderlineOffset: 'var(--space-1)',
  }
}

/** The gap marker: the surface's ink, and none of the target geometry — it is not a target. */
export function gapStyle(surface: PaginationSurface): CSSProperties {
  return { color: SURFACES[surface].ink }
}

/** One step of the bar — `‹` and `›` — as an anchor, with the name its glyph does not carry. */
function step(
  direction: 'anterior' | 'proxima',
  href: string,
  surface: PaginationSurface,
): ReactElement {
  const previous = direction === 'anterior'
  return (
    <a
      key={direction}
      href={href}
      // Announced, `‹` is "single left-pointing angle quotation mark". The label is the control.
      aria-label={previous ? 'Página anterior' : 'Próxima página'}
      style={pageStyle(surface)}
    >
      {previous ? '‹' : '›'}
    </a>
  )
}

/**
 * Numbered pagination, as anchors (FR-029, CLR-003).
 *
 * A server component: no state, no handler, nothing that needs the client (FR-014). The page
 * being shown *is* the URL, so the server renders the listing and this control stays inert
 * markup that a crawler and a shared link both reach.
 *
 * @example
 * <Pagination page={2} totalPages={12} hrefFor={(n) => listingHref('/projetos', { ...params, page: n })} />
 */
export function Pagination({
  page,
  totalPages,
  hrefFor,
  surface = 'navy',
  label = 'Paginação',
}: PaginationProps): ReactElement | null {
  // One page is not a choice, and a control offering it is noise the design does not draw.
  const last = Math.trunc(totalPages)
  if (last <= 1) return null
  const current = clamp(Math.trunc(page), 1, last)

  return (
    <nav aria-label={label} style={PAGINATION_STYLE}>
      {/* Absent rather than disabled at the ends: a `‹` on page 1 either links to page 1 — a
          control that does nothing — or to page 0, a URL the listing then has to rescue. */}
      {current > 1 ? step('anterior', hrefFor(current - 1), surface) : null}
      {pageWindow(current, last).map((slot, index) =>
        slot === PAGE_GAP ? (
          // Announced, "…" is read as "ellipsis" or spelled out; the numbers either side
          // already tell a reader the run is not contiguous.
          <span key={`gap-${index}`} aria-hidden={true} style={gapStyle(surface)}>
            {PAGE_GAP}
          </span>
        ) : (
          <a
            key={slot}
            href={hrefFor(slot)}
            // `page`, not `true`: these anchors navigate, and `page` is the token that says the
            // destination is the document being shown.
            aria-current={slot === current ? 'page' : undefined}
            style={slot === current ? currentPageStyle(surface) : pageStyle(surface)}
          >
            {slot}
          </a>
        ),
      )}
      {current < last ? step('proxima', hrefFor(current + 1), surface) : null}
    </nav>
  )
}
