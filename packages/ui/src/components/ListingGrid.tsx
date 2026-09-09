import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'

/**
 * T011 / FR-004, FR-021 — the grid the four listings share.
 *
 * `projetos.md` § *Grid de projetos*: *"**3 colunas** … gutter uniforme"*; § *Adaptação tablet*:
 * *"**2 colunas**; card mantém todos os campos"*; § *Adaptação mobile*: *"**1 coluna**, cards
 * empilhados em largura total"*. FR-004 states the same thing as "3/2/1", and `artigos.md`,
 * `aulas.md` and `biblioteca-3d.md` copy it — which is why it is a component and not three
 * pages' worth of `display: grid`.
 *
 * ── Why the column counts are exported data ─────────────────────────────────────────────────
 *
 * Written only inside the template string, "3/2/1" is a fact no caller can read and no test can
 * check except by matching text. As a record it is the decision, the stylesheet is generated
 * from it, and the suite pins the two together — the device `FOOTER_PILLARS` uses for the
 * pillars and `contracts/tokens.md` for the palette.
 *
 * ── Why the breakpoints are 834 and 1440, not the mockup's 768 and 1280 ─────────────────────
 *
 * The page docs describe tablet as 768–1279 and desktop as ≥1280, but feature 001 froze the
 * three design targets the mockups are actually drawn at — 390 / 834 / 1440 — as tokens, and
 * `tests/layout-tokens.test.ts` rejects any other width in a media query under `src/`. Two
 * columns from 834 and three from 1440 is the same arrangement expressed in the vocabulary the
 * package has.
 *
 * ── Why a list ──────────────────────────────────────────────────────────────────────────────
 *
 * Twelve peers announced as "list, 12 items" is what lets a screen-reader user skip the grid;
 * twelve unrelated `<article>`s in a `<div>` have to be walked one by one. The label is the
 * caller's because the grid does not know whether it holds projects or classes.
 *
 * A server component: no state, no handler, no width read anywhere (FR-024).
 */

const CLASS = {
  grid: 'fl-listing-grid',
  item: 'fl-listing-grid__item',
} as const

export interface ListingGridProps {
  /** The accessible name of the list, e.g. `Projetos` — what a reader hears before its items. */
  readonly label: string
  /** The cards. An empty page renders no items: the empty body is `EmptyState`, placed by the
   *  page, so four listings cannot end up with four wordings for "nothing here" (FR-017). */
  readonly children: ReactNode
}

/** Columns per design target — the 3/2/1 of FR-004, one entry per breakpoint token. */
export const LISTING_GRID_COLUMNS = { mobile: 1, tablet: 2, desktop: 3 } as const

/** `minmax(0, 1fr)` rather than `1fr`: a grid item's automatic minimum size is `auto`, so a long
 *  unbroken title (a URL, a slug) widens its column and the row overflows the page. */
function columns(count: number): string {
  return `repeat(${count}, minmax(0, 1fr))`
}

/** Mobile-first: 390 is the base layer, 834 and 1440 are additive (FR-021, layout tokens). */
export const LISTING_GRID_CSS = `
.${CLASS.grid} {
  display: grid;
  grid-template-columns: ${columns(LISTING_GRID_COLUMNS.mobile)};
  /* "gutter uniforme" — one gap for rows and columns. Separate row-gap/column-gap would be two
     numbers free to drift apart, and the mockup draws one. */
  gap: var(--space-6);
  margin: 0;
  padding: 0;
  list-style: none;
}
.${CLASS.item} {
  display: flex;
}
.${CLASS.item} > * {
  /* The cards in a row are as tall as the tallest; without this a two-line title leaves the
     card beside it short and the footers stop lining up. */
  flex: 1 1 auto;
}
@media (min-width: 834px) {
  .${CLASS.grid} {
    grid-template-columns: ${columns(LISTING_GRID_COLUMNS.tablet)};
  }
}
@media (min-width: 1440px) {
  .${CLASS.grid} {
    grid-template-columns: ${columns(LISTING_GRID_COLUMNS.desktop)};
  }
}
`

/**
 * The key `Children.toArray` already assigned, or the position for a non-element child.
 *
 * Not the index alone: an index key on a filtered list makes React reuse the DOM of the card
 * that used to be in that slot, which on a listing whose filter changes is a card wearing the
 * previous card's image.
 */
function keyFor(item: ReactNode, index: number): string {
  return isValidElement(item) && item.key !== null ? item.key : `item-${index}`
}

/**
 * The 3/2/1 listing grid.
 *
 * @example
 * <ListingGrid label="Projetos">
 *   {projetos.map((projeto) => <CardProjeto key={projeto.id} {...projeto} />)}
 * </ListingGrid>
 */
export function ListingGrid({ label, children }: ListingGridProps): ReactElement {
  return (
    <>
      <ul className={CLASS.grid} aria-label={label}>
        {Children.toArray(children).map((item, index) => (
          <li key={keyFor(item, index)} className={CLASS.item}>
            {item}
          </li>
        ))}
      </ul>
      {/* Outside the <ul>, not inside it: a `<ul>` may contain only `<li>`, and React 19 hoists
          a precedence-carrying <style> into <head> from wherever it sits. */}
      <style href="fablab-listing-grid" precedence="default">
        {LISTING_GRID_CSS}
      </style>
    </>
  )
}
