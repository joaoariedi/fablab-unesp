'use client'
// The arrows the mockup draws move the track, and where a scroll container currently sits is
// not a URL: a link that re-rendered the Home to advance one card would throw the visitor back
// to the top of a full-viewport hero. That is real interactivity, and it is the whole of it —
// the slides themselves are server-rendered markup this island only wraps (FR-024, SC-012).

import { Children, useRef, type ReactElement, type ReactNode, type RefObject } from 'react'

import { LISTING_GRID_COLUMNS } from './ListingGrid'

/**
 * T026 / FR-009, FR-021, FR-022, FR-023, US1 — the Home's `ÚLTIMOS PROJETOS` carousel.
 *
 * `home.md` § *Card `ÚLTIMOS PROJETOS`*: *"**Decidido (2026-08-23):** o card é um **carrossel**
 * de vários projetos; o mockup mostra apenas um slide"*. It is one of the four islands
 * `plan.md` § Sketch 6 enumerates, and `tests/islands.test.ts` holds it to that entry.
 *
 * ── Why the content is reachable before the bundle is ───────────────────────────────────────
 *
 * The track is an ordinary overflow container with scroll snapping, so touch, a trackpad and
 * the keyboard already reach every slide with no JavaScript at all; the island adds the two
 * arrow controls and nothing else. The alternative — slides positioned by a `transform` this
 * component computes — would put the Home's only content section behind a hydration on the one
 * page SC-006 measures, and would render an empty box for a visitor whose bundle never arrives.
 *
 * ── Why the step is measured and not a constant ─────────────────────────────────────────────
 *
 * One press moves the track by exactly its own visible width, so the same handler advances
 * three cards at 1440 and one at 390 without ever learning the breakpoint it is at. A constant
 * — `320`, a card width — would be a fourth opinion about a layout the cascade already decides,
 * and would land mid-card at every width but the one it was measured on.
 *
 * ── Why the slide count is imported from `ListingGrid` ──────────────────────────────────────
 *
 * The carousel and the listings draw the same `CardProjeto` at the same three widths. Two
 * independently written counts would be two answers to one design question, and the one that
 * drifted would be the one nobody was looking at.
 *
 * @example
 *   <ProjectCarousel label="Últimos projetos">
 *     {projetos.map((projeto) => <CardProjeto key={projeto.slug} {...projeto} />)}
 *   </ProjectCarousel>
 */

/** The class names, in one place: the markup and `PROJECT_CAROUSEL_CSS` must agree, and a typo
 *  in either is an unstyled element or a track that scrolls nothing. */
const CLASS = {
  root: 'fl-carousel',
  trilho: 'fl-carousel__trilho',
  slide: 'fl-carousel__slide',
  controles: 'fl-carousel__controles',
  controle: 'fl-carousel__controle',
} as const

/**
 * The touch-target floor FR-022 fixes (44×44 on the compact breakpoints), as the token that
 * clears it. `--space-9` is 48px; the step below it is 32px and would miss.
 */
const TOUCH_TARGET = 'var(--space-9)'

/** One column's share of the track, once the gaps between `count` slides are taken out. */
function slideBasis(count: number): string {
  return count === 1
    ? '100%'
    : `calc((100% - ${count - 1} * var(--space-6)) / ${count})`
}

/**
 * The band's rules, mobile-first: 390 is the base, 834 and 1440 are additive (FR-021).
 *
 * Exported so the workbench and the suite read the decisions rather than a class name appearing
 * in two files — the trade `Footer`, `MenuSheet` and `ListingGrid` each record. The
 * `/* slides: N *\/` markers are what let the suite tie each breakpoint back to
 * `LISTING_GRID_COLUMNS` without parsing arithmetic.
 */
export const PROJECT_CAROUSEL_CSS = `
.${CLASS.root} {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.${CLASS.trilho} {
  display: flex;
  gap: var(--space-6);
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-x: auto;
  /* Mandatory rather than proximity: a drag that stops between two cards would otherwise leave
     one cut in half at the edge, which is the single thing a carousel exists to prevent. */
  scroll-snap-type: x mandatory;
  /* The animation for the arrow controls, declared here rather than passed per call so a
     visitor who asked for less motion gets what they asked for (the query below). */
  scroll-behavior: smooth;
}
.${CLASS.trilho}:focus-visible {
  outline: var(--space-1) solid var(--color-primary);
  outline-offset: var(--space-1);
}
.${CLASS.slide} {
  /* slides: ${LISTING_GRID_COLUMNS.mobile} */
  flex: 0 0 ${slideBasis(LISTING_GRID_COLUMNS.mobile)};
  scroll-snap-align: start;
  display: flex;
}
.${CLASS.slide} > * {
  /* The cards in view are as tall as the tallest, exactly as they are in the grid. */
  flex: 1 1 auto;
}
.${CLASS.controles} {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}
.${CLASS.controle} {
  min-inline-size: ${TOUCH_TARGET};
  min-block-size: ${TOUCH_TARGET};
  background: transparent;
  border: 1px solid var(--color-claro);
  border-radius: var(--radius-sm);
  color: var(--color-claro);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  line-height: 1;
  cursor: pointer;
}
.${CLASS.controle}:focus-visible {
  outline: var(--space-1) solid var(--color-primary);
  outline-offset: var(--space-1);
}
@media (prefers-reduced-motion: reduce) {
  .${CLASS.trilho} {
    scroll-behavior: auto;
  }
}
@media (min-width: 834px) {
  .${CLASS.slide} {
    /* slides: ${LISTING_GRID_COLUMNS.tablet} */
    flex-basis: ${slideBasis(LISTING_GRID_COLUMNS.tablet)};
  }
}
@media (min-width: 1440px) {
  .${CLASS.slide} {
    /* slides: ${LISTING_GRID_COLUMNS.desktop} */
    flex-basis: ${slideBasis(LISTING_GRID_COLUMNS.desktop)};
  }
}
`

/**
 * One press = one screenful, in `direcao`.
 *
 * Hoisted out of the component and handed the ref, rather than closing over it: it keeps the
 * component inside the 50-line limit and makes the step a function a reader can check in one
 * place. `current` is null until React attaches the ref — and null again after unmount, which
 * is the press that would otherwise take the page down with a dereference.
 */
const deslizar =
  (trilho: RefObject<HTMLUListElement | null>, direcao: 1 | -1) =>
  (): void => {
    const alvo = trilho.current
    if (alvo === null) return
    alvo.scrollBy({ left: direcao * alvo.clientWidth, behavior: 'smooth' })
  }

export type ProjectCarouselProps = {
  /** The accessible name of the group, e.g. `Últimos projetos`. */
  readonly label: string
  /** The slides, already built — this package resolves no URLs and reads no collection. */
  readonly children: ReactNode
  /** Defaults to the Portuguese the rest of the visitor-facing surface uses. */
  readonly rotuloAnterior?: string
  readonly rotuloProximo?: string
}

export function ProjectCarousel({
  label,
  children,
  rotuloAnterior = 'Projetos anteriores',
  rotuloProximo = 'Próximos projetos',
}: ProjectCarouselProps): ReactElement {
  const trilho = useRef<HTMLUListElement | null>(null)

  return (
    <section
      className={CLASS.root}
      // `region` would add a landmark to a page that already has one per band; the group is
      // named so a screen reader announces what the arrows act on.
      aria-label={label}
      aria-roledescription="carrossel"
    >
      {/* Focusable, because a scroll container that only a mouse can reach is unreachable by
          keyboard — the arrows move it, but the track itself is the fallback that always works. */}
      <ul className={CLASS.trilho} ref={trilho} tabIndex={0}>
        {Children.map(children, (slide) => (
          <li className={CLASS.slide}>{slide}</li>
        ))}
      </ul>
      <div className={CLASS.controles}>
        <button
          type="button"
          className={CLASS.controle}
          aria-label={rotuloAnterior}
          onClick={deslizar(trilho, -1)}
        >
          ‹
        </button>
        <button
          type="button"
          className={CLASS.controle}
          aria-label={rotuloProximo}
          onClick={deslizar(trilho, 1)}
        >
          ›
        </button>
      </div>
      {/* React 19 hoists a precedence-carrying <style> into <head> and dedupes it by href, so
          one carousel and ten emit one stylesheet. */}
      <style href="fablab-project-carousel" precedence="default">
        {PROJECT_CAROUSEL_CSS}
      </style>
    </section>
  )
}
