import type { CSSProperties, ReactElement } from 'react'

/**
 * T025 / FR-006 — the category tab bar.
 *
 * `visual-identity.md` § "Chips/tabs de filtro": *"texto display em caps, item ativo
 * sublinhado/rosa"*. `projetos.md` and `artigos.md` § "Barra de filtros e busca" fix the same
 * bar and agree with each other: *"Tabs de categoria em caps display, alinhadas à esquerda …
 * Ativo: `TODOS`, em rosa com sublinhado rosa curto; inativos em branco sem sublinhado"*, plus
 * *"Seleção única (uma categoria por vez)"*.
 *
 * ── Why the accent is `--color-primary` and not the pink behind it ──────────────────────────
 *
 * FR-003 names the three things the per-organization accent drives: *CTAs, **active tabs** and
 * card titles*. This is the second, so it is one of the exact places CLR-001's trap bites: the
 * private raw pink renders identically to `--color-primary` for CITe, so a bar painted with
 * the default looks perfect and stops co-branding only once a second organization exists. That
 * token's name is therefore not spelled in this file, not even in a comment.
 *
 * ── Why activeness is derived, and never a per-item flag ────────────────────────────────────
 *
 * "Uma categoria por vez" is a property of the bar. As a per-item `active?: boolean` the
 * invariant becomes a convention every call site can break — two pink tabs is a state the
 * design does not have, and it renders without complaint. Comparing `activeHref` to each
 * item's own `href` makes single selection structural: there is one `activeHref`, so at most
 * one item can match, and "nothing selected" is expressible rather than defaulting to the
 * first tab (an unfiltered listing is a real state — `TODOS` is a link like any other).
 *
 * ── Why it is a bar of links and not a client component ─────────────────────────────────────
 *
 * A tab bar is the classic place client state appears for no reason. The selection here *is*
 * the URL: each tab links to the filtered listing, the server renders it, and the bar stays
 * inert markup with no handler and no state (FR-014). That is also what makes the filter
 * shareable and back-button-correct for free.
 *
 * ── Why the identity is a style object and not a CSS module ─────────────────────────────────
 *
 * The trade `Button`, `Chip` and `SearchInput` document: CLR-003 keeps this package's tests at
 * `node` with no DOM, so a class name would be assertable only as file text — a check that a
 * string appears in two files, which stays green when the rule behind it is wrong. As style
 * objects the decision is data, and `tests/tabs.test.ts` reads the decision itself.
 */

/** One tab: the label as written, and where it goes. */
export interface TabItem {
  /**
   * The category name in its natural case, e.g. `Cultura maker`. The caps are the component's
   * job — see `TAB_STYLE`.
   */
  readonly label: string
  /** The filtered listing this tab navigates to, e.g. `/artigos?categoria=cultura-maker`. */
  readonly href: string
}

export interface TabsProps {
  /**
   * The landmark's accessible name, e.g. `Categorias de artigos`. Required: a page can carry
   * several navigation landmarks (this bar plus the header nav, FR-008), and unnamed ones read
   * as "navigation, navigation" in a screen reader's landmark list.
   */
  readonly label: string
  /** The tabs, in the order the design fixes them. Rendered as given; nothing is sorted. */
  readonly items: readonly TabItem[]
  /**
   * The `href` of the current listing. Omitted — or pointing at something not in `items` — is
   * a bar with nothing selected, which is a real state and not an error.
   */
  readonly activeHref?: string
}

/** The row. Left-aligned, because "alinhadas à esquerda" is decided, not incidental. */
export const TABS_STYLE: CSSProperties = {
  display: 'flex',
  // Explicit rather than relying on the flex default: this is the decided alignment, and a
  // container that centres its tabs is the mistake a later layout change makes silently.
  justifyContent: 'flex-start',
  alignItems: 'center',
  gap: 'var(--space-6)',
  // The bar scrolls sideways instead of wrapping into a second row: below the tablet target
  // the five categories do not fit, and `artigos.md` turns them into "chips horizontais
  // roláveis" rather than a two-line bar.
  flexWrap: 'nowrap',
  overflowX: 'auto',
}

/** A tab at rest: caps in the display face, light ink, no rule. */
export const TAB_STYLE: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-base)',
  // The component shouts, not the caller. A category label is CMS data arriving in natural
  // case, so there is nothing at the call site to capitalise; `text-transform` also leaves the
  // accessible name and the copyable text intact, which pre-capsing the string does not.
  // (`Button`'s labels are copy written at the call site, hence its opposite choice.)
  textTransform: 'uppercase',
  // `--color-claro` is the palette's text-on-dark token. The mockups say "branco"; there is no
  // white token and this is not the place to invent one — `tokens/index.ts` records why.
  color: 'var(--color-claro)',
  // An anchor is underlined by default, which would make every tab read as the selected one.
  textDecoration: 'none',
  // The bar is `nowrap`, and without this a two-word category breaks across lines inside its
  // own tab as the row is squeezed.
  whiteSpace: 'nowrap',
}

/** The current tab — "sublinhado/rosa", both halves at once, never one without the other. */
export const ACTIVE_TAB_STYLE: CSSProperties = {
  ...TAB_STYLE,
  // The per-organization accent (FR-003), never the private raw default behind it (CLR-001).
  color: 'var(--color-primary)',
  textDecoration: 'underline',
  // The rule takes the text colour by default, which is what makes it the *pink* underline the
  // mockups draw without naming a second colour that could drift from the first.
  textUnderlineOffset: 'var(--space-1)',
}

/**
 * A single-selection tab bar: caps display text, the current item underlined in the accent.
 *
 * A server component — no state, no handler, nothing that needs the client (FR-014). The
 * selection travels in the URL, so the page the tab links to is what does the filtering.
 *
 * @example
 * <Tabs
 *   label="Categorias de artigos"
 *   items={[{ label: 'Todos', href: '/artigos' }, { label: 'Educação', href: '/artigos?categoria=educacao' }]}
 *   activeHref="/artigos"
 * />
 */
export function Tabs({ label, items, activeHref }: TabsProps): ReactElement {
  return (
    <nav aria-label={label} style={TABS_STYLE}>
      {items.map((item) => {
        const current = item.href === activeHref
        return (
          <a
            key={item.href}
            href={item.href}
            // `page` and not `true`: these anchors navigate, and `page` is the token that says
            // the destination is the document being shown. Colour and underline are the whole
            // visual signal, and neither reaches assistive tech.
            aria-current={current ? 'page' : undefined}
            style={current ? ACTIVE_TAB_STYLE : TAB_STYLE}
          >
            {item.label}
          </a>
        )
      })}
    </nav>
  )
}
