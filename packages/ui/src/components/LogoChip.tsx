import type { CSSProperties, ReactElement } from 'react'

/**
 * T018 / FR-007, US4 — the canonical logo, as one component.
 *
 * `visual-identity.md` § Logo, decided in round 2 (2026-08-23): the header chip is the
 * **laranja** extruded rectangle carrying `FAB ◆ LAB` over `CITE BAURU`, with the isometric
 * cube **between** the two words — the lockup rendered in `design/criar-conta-passo-1.png`.
 * The same chip exists over the other palette colours for posters and non-header material,
 * and the **rosa** variant of the old map mockup "fica como registro": it survives as a record
 * of a superseded round, not as something a caller can land on by accident.
 *
 * US4's whole point is that every surface renders *this*, never a per-page image. So the
 * component takes no `src`, no `variant="image"`, and no way to substitute artwork: the only
 * choice a call site has is which palette colour the chip is printed on.
 *
 * ── Why the default is a default parameter and not a `||` fallback ──────────────────────────
 *
 * `colour = DEFAULT_LOGO_CHIP_COLOUR` catches the call the type system cannot: JS call sites
 * and `<LogoChip colour={org.chipColour} />` where the field is unset both pass `undefined`,
 * which a default parameter resolves and a `colour || …` written on a preceding line does not
 * (it also swallows `''`, silently painting the canonical chip for a genuinely wrong value —
 * the same class of quiet-wrong the palette's `-raw` naming exists to prevent). US4's error
 * case is "the pink must not be **reachable** as the header default", and `undefined` is the
 * commonest way an unintended value arrives.
 *
 * ── Why the cube is drawn here rather than imported from the shape vocabulary ───────────────
 *
 * T035 ships an isometric cube in `src/shapes/`, and reusing it looks obviously right. It is
 * a phase inversion: that vocabulary is **P2** and this chip is **P1**, so the canonical logo
 * — the one thing US4 says must render on every surface — would stop rendering if the P2 work
 * slipped or changed shape. The cube below is also not an ornament from that vocabulary: it is
 * a glyph of the lockup, sized in `em` against the wordmark beside it, and it moves when the
 * logo's typography moves, not when the ornament set does. It is deliberately NOT the `◆`
 * character: `--font-display` is Aldo, whose coverage of that codepoint nobody has verified,
 * and a missing glyph renders as a notdef box in the middle of the brand.
 *
 * ── Why the identity is a style object and not a CSS module ─────────────────────────────────
 *
 * The trade `Button` and `Chip` document: CLR-003 keeps this package's tests at `node` with no
 * DOM, so a class name would be assertable only as file text — a check that a string appears in
 * two files, which stays green when the rule behind it is wrong. As style objects the decision
 * is data, and `tests/logo-chip.test.ts` reads the decision itself.
 *
 * Every colour resolves through a token (FR-002). The lockup's type sizes are the values left
 * open in plan § "Open for the designer, not for the plan" — both lines are `--font-display`,
 * so they differentiate by size and tracking alone; the tokens below are that first answer.
 */

/**
 * A palette colour the chip may be printed on.
 *
 * `azul`, `teal`, `amarelo` and `claro` are the poster/non-header versions of
 * `visual-identity.md` § Logo. `primary` is the accent — the *only* pink this library has, and
 * a per-organization one (CLR-001): a co-branded poster chip, never the header. There is no
 * `rosa` member, because there is no `--color-rosa`; the raw pink is private and lint rejects
 * it outside `src/tokens/`.
 *
 * `navy` is absent on purpose. The monochrome navy lockup of `visual-identity.md` is a
 * *flat* mark for light backgrounds, not an extruded chip, and shipping it here would give it
 * the hard navy shadow — the mark drawn wrong under a name that looks right.
 */
export type LogoChipColour = 'laranja' | 'azul' | 'teal' | 'amarelo' | 'claro' | 'primary'

/** The round-2 header decision, named so `HeaderNav` and the workbench can say "the canonical
 *  one" without repeating the literal. */
export const DEFAULT_LOGO_CHIP_COLOUR: LogoChipColour = 'laranja'

/** Fill and ink per colour. The ink is not decorative: it is the half of the pair that has to
 *  clear 3:1 at display size (FR-017), which is why `azul` — 2.71:1 against navy — takes claro
 *  while every other fill in the palette is light enough to take navy. */
const CHIP_PAINT: Record<LogoChipColour, { readonly fill: string; readonly ink: string }> = {
  laranja: { fill: 'var(--color-laranja)', ink: 'var(--color-navy)' },
  azul: { fill: 'var(--color-azul)', ink: 'var(--color-claro)' },
  teal: { fill: 'var(--color-teal)', ink: 'var(--color-navy)' },
  amarelo: { fill: 'var(--color-amarelo)', ink: 'var(--color-navy)' },
  claro: { fill: 'var(--color-claro)', ink: 'var(--color-navy)' },
  primary: { fill: 'var(--color-primary)', ink: 'var(--color-navy)' },
}

/** Every colour the chip is printed on, iterable — the workbench (FR-016) renders this list
 *  rather than a hand-kept copy of it. */
export const LOGO_CHIP_COLOURS = Object.keys(CHIP_PAINT) as readonly LogoChipColour[]

/** Geometry shared by every colour: an extruded rectangle, hard-shadowed, display type. */
const CHIP_BASE: CSSProperties = {
  display: 'inline-block',
  padding: 'var(--space-2) var(--space-3)',
  // The chip step of the two radii the design defines (layout.css). The lockup reads as a
  // printed sticker; `--radius-md` would round it into a button.
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  // The token, not `4px 4px 0 …` inline: a second definition is free to drift soft, and
  // `--shadow-hard`'s 0 blur is what makes the chip read as extruded rather than lifted.
  boxShadow: 'var(--shadow-hard)',
  fontFamily: 'var(--font-display)',
  // Set on the chip, not on the anchor variant, so the link never inherits the browser's blue.
  textDecoration: 'none',
  lineHeight: 1,
}

/** The chip's full identity for one colour, exported for the workbench and for any composition
 *  that needs to reason about the logo without rendering it. */
export function logoChipStyle(colour: LogoChipColour = DEFAULT_LOGO_CHIP_COLOUR): CSSProperties {
  const paint = CHIP_PAINT[colour] ?? CHIP_PAINT[DEFAULT_LOGO_CHIP_COLOUR]
  return { ...CHIP_BASE, background: paint.fill, color: paint.ink }
}

/** `FAB ◆ LAB` — the cube is a flex child between the words, so no glyph and no margin hack
 *  decides the spacing. */
const WORDMARK_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  fontSize: 'var(--text-xl)',
}

/** `CITE BAURU` — same face, subordinate by size and tracking alone (plan § "Open for the
 *  designer"). Tracked out so the shorter line optically matches the wordmark's width. */
const LOGOTYPE_STYLE: CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-xs)',
  letterSpacing: '0.18em',
  marginTop: 'var(--space-1)',
}

/**
 * The isometric cube of the lockup, in the chip's own ink.
 *
 * `currentColor` throughout, with the three faces separated by opacity alone — the same rule
 * the shape vocabulary follows, and what keeps FR-002 true for artwork: there is no attribute
 * here through which a colour could arrive. `1em` sizes it against the wordmark, so the two
 * scale together.
 *
 * **An element factory, deliberately not a component**, and named in camelCase to say so at
 * the call site. As `<LogoCube />` the cube is an unrendered element of type *function* in the
 * chip's tree, and CLR-003 gives this package no renderer to resolve it — so "the cube sits
 * between FAB and LAB", the one thing round 2 actually decided, becomes unassertable without
 * adding a DOM dependency the plan excludes. Called as a function it is a plain `<svg>` node
 * in the returned tree, which `tests/logo-chip.test.ts` reads directly. It is private and
 * childless, so nothing is lost: no state, no memo boundary, no separate fiber worth having.
 */
function logoCube(): ReactElement {
  return (
    <svg
      // Decoration: the lockup is read from its own text, and an announced "image" beside
      // "FAB LAB CITE BAURU" is noise in every screen reader that reaches the header.
      aria-hidden={true}
      focusable={false}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      style={{ display: 'block', flex: 'none' }}
    >
      <polygon points="12,2 21,7 12,12 3,7" fill="currentColor" />
      <polygon points="3,7 12,12 12,22 3,17" fill="currentColor" fillOpacity={0.55} />
      <polygon points="21,7 12,12 12,22 21,17" fill="currentColor" fillOpacity={0.8} />
    </svg>
  )
}

export interface LogoChipProps {
  /** Which palette colour the chip is printed on. Omit it for the canonical header chip. */
  readonly colour?: LogoChipColour
  /**
   * Where the logo goes. The header passes `"/"` (FR-009); a poster or a footer mark passes
   * nothing and gets an inert chip rather than a link to the page it is already on.
   */
  readonly href?: string
}

/**
 * The canonical `FAB ◆ LAB / CITE BAURU` chip.
 *
 * A server component, and an inert one: no state, no handler, nothing that needs the client
 * (FR-014). The words are real text, so the lockup is selectable, translatable and readable by
 * assistive technology without an `alt` string to keep in sync.
 *
 * @example <LogoChip href="/" />           // the header chip, laranja
 * @example <LogoChip colour="amarelo" />   // a poster chip, non-header use
 */
export function LogoChip({ colour = DEFAULT_LOGO_CHIP_COLOUR, href }: LogoChipProps = {}) {
  const Wrapper = href === undefined ? 'span' : 'a'
  return (
    <Wrapper href={href} style={logoChipStyle(colour)}>
      <span style={WORDMARK_STYLE}>
        <span>FAB</span>
        {logoCube()}
        <span>LAB</span>
      </span>
      <span style={LOGOTYPE_STYLE}>CITE BAURU</span>
    </Wrapper>
  )
}
