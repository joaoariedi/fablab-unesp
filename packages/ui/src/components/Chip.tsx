import type { CSSProperties, ReactNode } from 'react'

/**
 * T021 / FR-006 — the two chips.
 *
 * `visual-identity.md` § "Chips/tabs de filtro" (round 5, 2026-08-24) decides both:
 *
 *   - **filter** — "texto display em caps, item ativo sublinhado/rosa";
 *   - **status** (`Público` on Minha Conta) — "**teal** da paleta — rodada 5: o verde
 *     saturado fora da paleta do mockup foi trocado pelo teal".
 *
 * The superseded green has no token and never gets one: `--color-teal`'s role comment in
 * `palette.css` already reads "hero band, progress detail, status chips", so the status chip
 * is the usage that token exists for. A chip is the one component where reaching for an
 * off-palette colour is *easy* — the mockup shows a green nobody can name — which is why the
 * fill below is asserted as an equality on the token rather than trusted to review.
 *
 * ── Why the props are a union and not a flat interface ──────────────────────────────────────
 *
 * `active` belongs to the filter chip alone. As one flat interface, `<Chip variant="status"
 * active>` compiles and renders an ordinary status chip — a call site that believes in an
 * active/inactive status distinction the design has not decided, failing silently and forever.
 * The union makes that a compile error, and costs one narrowing branch in the body.
 *
 * ── Why the identity is a style object and not a CSS module ─────────────────────────────────
 *
 * The same trade `Button` documents: CLR-003 keeps this package's tests at `node` with no DOM,
 * so a class name would be assertable only as file text — a check that a string appears in two
 * files, which stays green when the rule behind it is wrong. As style objects the decision is
 * data, and `tests/chip.test.ts` reads the decision itself.
 *
 * Every colour resolves through a token (FR-002), and the active filter uses `--color-primary`
 * rather than the private raw default behind it, which is what makes it follow an
 * organization's theme (CLR-001). The two are the same colour for CITe, so nothing but the
 * token name catches that mistake.
 */

/** Which chip: a filter tag, or a state badge. */
export type ChipVariant = 'filter' | 'status'

export type ChipProps =
  | {
      readonly variant: 'filter'
      readonly children: ReactNode
      /** Selected in the current filter set. Underlined and in the accent; both, never one. */
      readonly active?: boolean
    }
  | {
      readonly variant: 'status'
      readonly children: ReactNode
    }

/** Shared geometry. `--radius-sm` is the chip/input step of the two the design defines
 *  (layout.css); `--text-sm` keeps a chip subordinate to the content it labels. */
const CHIP_BASE: CSSProperties = {
  display: 'inline-block',
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  padding: 'var(--space-1) var(--space-3)',
  fontSize: 'var(--text-sm)',
}

/**
 * A filter tag, unselected: display caps on whatever surface it sits on, no fill.
 *
 * The fill is `transparent` and not `--color-navy`: filter chips also ride the teal hero band
 * (FR-011), where a navy fill would paint a rectangle the design does not have.
 */
export const FILTER_CHIP_STYLE: CSSProperties = {
  ...CHIP_BASE,
  background: 'transparent',
  color: 'var(--color-claro)',
  fontFamily: 'var(--font-display)',
  // The caller cannot capitalise this: a filter label is category data from the CMS, in
  // natural case. `text-transform` also leaves the accessible name and the copyable text
  // intact, which pre-capsing the string does not. (Button's labels are copy, hence its
  // opposite choice.)
  textTransform: 'uppercase',
  textDecoration: 'none',
}

/** The selected filter tag — "item ativo sublinhado/rosa", both halves at once. */
export const ACTIVE_FILTER_CHIP_STYLE: CSSProperties = {
  ...FILTER_CHIP_STYLE,
  // The per-organization accent, never the private raw default it falls back to (CLR-001).
  color: 'var(--color-primary)',
  textDecoration: 'underline',
}

/**
 * A status badge: teal fill, navy label.
 *
 * Platform identity, fixed for every organization — a status colour that followed
 * `theme.primaryColor` would mean the same state reads differently per lab. The pair is
 * `{ fg: 'navy', bg: 'teal', size: 'small' }` in `DOCUMENTED_PAIRS`, scored by
 * `contrast.test.ts`; body type, because a status word is read, not displayed.
 */
export const STATUS_CHIP_STYLE: CSSProperties = {
  ...CHIP_BASE,
  background: 'var(--color-teal)',
  color: 'var(--color-navy)',
  fontFamily: 'var(--font-body)',
}

/**
 * A filter tag or a status badge.
 *
 * A server component, and an inert one: it renders a `<span>` and takes no handler, so the
 * filtering state lives in the island that composes it (FR-014). `aria-current` carries the
 * active state, because underline-plus-colour reaches the eye and nothing else.
 *
 * @example <Chip variant="status">Público</Chip>
 */
export function Chip(props: ChipProps) {
  if (props.variant === 'status') {
    return <span style={STATUS_CHIP_STYLE}>{props.children}</span>
  }
  const active = props.active ?? false
  return (
    <span
      aria-current={active ? 'true' : undefined}
      style={active ? ACTIVE_FILTER_CHIP_STYLE : FILTER_CHIP_STYLE}
    >
      {props.children}
    </span>
  )
}
