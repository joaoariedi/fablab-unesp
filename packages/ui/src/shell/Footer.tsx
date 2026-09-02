import type { ReactElement } from 'react'

import type { IsoShapeName } from '../shapes/geometry'
import { IsoShape } from '../shapes/IsoShape'

/**
 * T034 / FR-010, US1 — the institutional footer, on every page.
 *
 * `home.md` § *Footer institucional* decides it: *"três pilares com ícones outline, em linha:
 * `APRENDA FAZENDO` · `COMPARTILHE CONHECIMENTO` · `DESENVOLVA PROJETOS REAIS`; separadores
 * verticais entre os pilares e composição de slabs isométricos … no canto direito. A faixa do
 * rodapé usa um navy mais claro que o fundo da página"*. `artigos.md` and `aulas.md` restate
 * it per page and add the compact arrangements — the pillars stack on mobile, *"um por linha,
 * **sem divisórias verticais**"*.
 *
 * A server component: no state, no handler, no width read anywhere (FR-014). Which way the
 * pillars run at each design target is `FOOTER_CSS`, not JavaScript — the same decision, for
 * the same reason, that `HeaderNav.tsx` documents at length.
 *
 * ── Why the icons are the three outline members of the FR-015 vocabulary ────────────────────
 *
 * The mockups name three pictograms — *"grupo de pessoas"*, *"cubo wireframe"*, *"estrela/
 * sparkle"* (`biblioteca-3d.md`, `artigos.md`, `aulas.md`). Only the middle one exists in the
 * shape vocabulary FR-015 froze: there is no figure shape at all, and `sparkle` is a **filled**
 * solid, so drawing a pillar with it would contradict the word FR-010 actually requires —
 * *outline* icons. The vocabulary holds exactly three stroke-drawn shapes, and they are what
 * the pillars use.
 *
 * The alternative was to add a people icon and an outline sparkle to `shapes/geometry.ts`,
 * which is T035's file and not this task's to edit. **This is a divergence from the mockups'
 * pictograms and it is deliberate**: the requirement's "outline" is satisfied and every icon
 * still comes from the one reviewed vocabulary. If the designer wants the figure and the star,
 * they enter as two new members of `ISO_SHAPES` and this table changes to name them — one
 * edit, no new asset pipeline, and `tests/footer.test.ts` keeps the outline rule honest.
 *
 * ── Why the band's navy is mixed rather than tokenised ──────────────────────────────────────
 *
 * The band is *"um navy mais claro que o fundo"* and `biblioteca-3d.md` leaves the **exact
 * tone (proposta) with the designer**. An eighth palette entry would freeze an unanswered
 * question into `tokens/palette.css` — which is T036's file besides — and a literal would be a
 * colour outside the token layer, which is exactly what FR-002 and the colour fence forbid.
 * `color-mix()` of two existing tokens keeps the single definition of both: change
 * `--color-navy` and the band follows, and when the designer settles the tone it becomes one
 * token and one edit here.
 */

/** The class names, in one place: the markup and `FOOTER_CSS` must agree, and a typo in either
 *  is an unstyled element or a breakpoint that switches nothing. */
const CLASS = {
  footer: 'fl-footer',
  pillars: 'fl-footer__pillars',
  pillar: 'fl-footer__pillar',
  icon: 'fl-footer__icon',
  label: 'fl-footer__label',
  composition: 'fl-footer__composition',
  piece: 'fl-footer__piece',
} as const

/** One institutional pillar: the promise, and the outline shape that stands beside it. */
export interface FooterPillar {
  /**
   * The label in **sentence case**, as `concept.md` § *Pilares* writes it.
   *
   * The mockups set it in caps and `.${CLASS.label}` does that with `text-transform`. Storing
   * it uppercased would put presentation into the copy — and hand a screen reader a string
   * some engines spell out letter by letter.
   */
  readonly label: string
  /** An **outline** member of the FR-015 vocabulary — see the divergence note above. */
  readonly icon: IsoShapeName
}

/**
 * The three pillars, in the order `concept.md` and `home.md` both write them.
 *
 * Exported so the workbench (FR-016) and the suite read the decision instead of retyping it;
 * the order is part of the decision, not an implementation detail.
 */
export const FOOTER_PILLARS: readonly FooterPillar[] = [
  // Advance, the "keep going" marker of the mockups: learning by doing is the next step, taken.
  { label: 'Aprenda fazendo', icon: 'doubleChevron' },
  // The wireframe cube — the mockups' own choice, and the platform's open-knowledge object.
  { label: 'Compartilhe conhecimento', icon: 'cubeWireframe' },
  // The isometric ground plane: where a real project is laid out before it is built.
  { label: 'Desenvolva projetos reais', icon: 'gridLines' },
]

/** One piece of the corner ornament. `colour` is set as `color` on the wrapper because
 *  `IsoShape` paints in `currentColor` — the only door a colour can enter the artwork by, and
 *  it only accepts a token (FR-002). */
interface CompositionPiece {
  readonly shape: IsoShapeName
  readonly colour: string
  readonly size: string
}

/**
 * The isometric composition of the corner (FR-010, FR-015).
 *
 * `home.md` calls for *"slabs isométricos rosa/azul"* and `biblioteca-3d.md` for *"chevrons »
 * extrudados + cubos"* in *"rosa/laranja/teal"* — the same ornament, described from two
 * mockups. Both lists start with the pink, and the pink of an accent is `--color-primary`,
 * never the raw default behind it (CLR-001): the ornament follows an organization's theme.
 */
const COMPOSITION: readonly CompositionPiece[] = [
  { shape: 'slab', colour: 'var(--color-primary)', size: 'var(--space-10)' },
  { shape: 'cubeFilled', colour: 'var(--color-azul)', size: 'var(--space-9)' },
  { shape: 'doubleChevron', colour: 'var(--color-teal)', size: 'var(--space-8)' },
  { shape: 'slab', colour: 'var(--color-laranja)', size: 'var(--space-7)' },
]

/** The pillar icon, one step above body size so it reads as a pictogram and not as punctuation. */
const ICON_SIZE = 'var(--space-7)'

/**
 * The band, mobile-first: 390 is the base, 834 and 1440 are additive (FR-012).
 *
 * The three arrangements are the ones the page docs decided: stacked with the icon *left* at
 * 390 (`home.md` § mobile), three across with the icon *above* the label at 834 (§ tablet),
 * and the desktop row of `artigos.md` — icon left, label beside it, vertical dividers between.
 *
 * Exported so the workbench can render the decision without a browser.
 */
export const FOOTER_CSS = `
.${CLASS.footer} {
  position: relative;
  overflow: hidden;
  /* A navy lighter than the page, mixed from the two tokens rather than invented — the exact
     tone is still (proposta) with the designer (biblioteca-3d.md). */
  background: color-mix(in srgb, var(--color-navy) 86%, var(--color-claro));
  color: var(--color-claro);
  font-family: var(--font-body);
  /* The extra room at the bottom is where the ornament sits when the pillars are stacked;
     without it the composition would be drawn over the last label. */
  padding: var(--space-9) var(--space-6) var(--space-11);
}
.${CLASS.pillars} {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  margin: 0;
  padding: 0;
  list-style: none;
}
.${CLASS.pillar} {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--space-4);
  flex: 1 1 0;
}
.${CLASS.icon} {
  flex: none;
  color: var(--color-claro);
}
.${CLASS.label} {
  font-family: var(--font-display);
  font-size: var(--text-base);
  text-transform: uppercase;
  line-height: 1.2;
}
.${CLASS.composition} {
  position: absolute;
  inset-inline-end: var(--space-6);
  inset-block-end: var(--space-4);
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  /* Ornament: it must never eat a click aimed at what is under it. */
  pointer-events: none;
}
@media (min-width: 834px) {
  .${CLASS.pillars} {
    flex-direction: row;
    gap: var(--space-7);
  }
  .${CLASS.pillar} {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }
  .${CLASS.pillar} + .${CLASS.pillar} {
    border-inline-start: 1px solid var(--color-claro);
    padding-inline-start: var(--space-7);
  }
  .${CLASS.footer} {
    padding: var(--space-10) var(--space-8);
  }
}
@media (min-width: 1440px) {
  .${CLASS.pillar} {
    flex-direction: row;
    align-items: center;
    gap: var(--space-4);
  }
  .${CLASS.label} {
    font-size: var(--text-lg);
  }
}
`

function renderPillar(pillar: FooterPillar): ReactElement {
  return (
    <li key={pillar.label} className={CLASS.pillar}>
      {/* Decoration, so no `title`: `IsoShape` then hides it from assistive technology, and the
          label beside it is already the accessible name of the pillar. */}
      <span className={CLASS.icon}>
        <IsoShape name={pillar.icon} size={ICON_SIZE} />
      </span>
      <span className={CLASS.label}>{pillar.label}</span>
    </li>
  )
}

function renderPiece(piece: CompositionPiece, index: number): ReactElement {
  return (
    <span key={`${piece.shape}-${index}`} className={CLASS.piece} style={{ color: piece.colour }}>
      <IsoShape name={piece.shape} size={piece.size} />
    </span>
  )
}

/**
 * The institutional footer: three pillars and the isometric composition.
 *
 * @example <Footer />
 */
export function Footer(): ReactElement {
  return (
    <footer className={CLASS.footer}>
      {/* A list, not three divs: three peers announced as "list, 3 items" is what lets a
          screen-reader user skip past them. */}
      <ul className={CLASS.pillars}>{FOOTER_PILLARS.map(renderPillar)}</ul>
      <div className={CLASS.composition} aria-hidden={true}>
        {COMPOSITION.map(renderPiece)}
      </div>
      {/* Last, and position-independent: React 19 hoists a precedence-carrying <style> into
          <head> and dedupes it by href, so a footer on every page emits one stylesheet. */}
      <style href="fablab-footer" precedence="default">
        {FOOTER_CSS}
      </style>
    </footer>
  )
}
