import type { CSSProperties, ReactNode } from 'react'

/**
 * T020 / FR-006 — the base content card.
 *
 * `visual-identity.md` § "Direção de arte da UI": *"Cards com contorno fino claro/colorido,
 * cantos levemente arredondados, título em display rosa/claro, corpo em Comfortaa; tag de
 * categoria em chip rosa; rodapé do card com avatar pixel (mesmo rosto do boneco em
 * miniatura) + @handle + nível + curtidas (♥) + ação."*
 *
 * The trailing "+ ação" of that sentence is deliberately absent: T020 lists avatar, handle,
 * level and likes, and the action is a *like button* — the one part of this card that is
 * genuinely interactive and therefore an island of its own (FR-014). Putting it here would
 * turn every static card into a client component, which is the exact failure US6 names.
 *
 * ── Why the title colour is a token name and not a colour ───────────────────────────────────
 *
 * FR-003 puts three surfaces under `--color-primary`: CTAs, active tabs and **card titles**.
 * `--color-primary` and the private raw pink token paint the same colour for CITe, so writing
 * the wrong one renders identically and stays wrong until a second organization exists (CLR-001). The
 * token name is the whole assertion.
 *
 * ── Why the category chip is drawn here rather than composed from `Chip` ────────────────────
 *
 * `Chip` (T021) is the *filter and status* chip — caps display text, teal for status, an
 * active/underlined state. The category tag is a solid accent label with none of those states,
 * and the two are only superficially similar. When `Chip` lands, the question to ask is
 * whether it grows a `category` variant; until then this stays a shape built from the same
 * tokens, not a second colour decision. Nothing here defines a colour — every value resolves
 * through the token layer (FR-002).
 *
 * A server component: no state, no handler, nothing that needs the client (FR-014).
 */

/** The card's author strip, as the footer renders it. */
export interface CardAuthor {
  /**
   * The pixel avatar, passed in rather than built here — `PixelImage` (T027) owns the integer
   * scale clamp (SC-008), and a card that rendered its own `<img>` would be a second place
   * where a fractional scale could enter. Optional: a card may have no author art yet.
   */
  readonly avatar?: ReactNode
  /** Without the leading `@` — the card adds it. A handle that already carries one is kept as is. */
  readonly handle: string
  /** 1–10, matching the ten levels SkillPips draws (decided 2026-08-23, superseding the mockup's six). */
  readonly level: number
}

export interface CardProps {
  readonly title: string
  /** The category tag, e.g. `PROJETO`. Caps is the caller's, as the mockups render it. */
  readonly category: string
  readonly author: CardAuthor
  readonly likes: number
  /**
   * "contorno fino claro/colorido". `claro` is the default because the base page is navy
   * (FR-011); `primary` is the accented card, and follows the organization's theme.
   */
  readonly outline?: CardOutline
  /** The body, set in `--font-body` by the card. */
  readonly children?: ReactNode
}

export type CardOutline = 'claro' | 'primary'

/**
 * The two outline colours, by token. A record rather than a conditional so the set of legal
 * outlines is one readable list — and so `outline` can never resolve to the private raw pink
 * token (CLR-001), which would pin every organization's card to CITe's default.
 */
export const CARD_OUTLINE_COLOURS: Record<CardOutline, string> = {
  claro: 'var(--color-claro)',
  primary: 'var(--color-primary)',
}

/** The card surface (FR-006), exported so the workbench (FR-016) can read it rather than restate it. */
export function cardStyle(outline: CardOutline = 'claro'): CSSProperties {
  return {
    // "contorno fino": 1px. The width is the requirement, so it is written where a test reads it.
    border: `1px solid ${CARD_OUTLINE_COLOURS[outline]}`,
    // "cantos levemente arredondados" — the md step, shared with the button. An inline 12px
    // here would be a second definition of the same decision, free to drift.
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-5)',
    // "corpo em Comfortaa". Set on the card so the body and the footer inherit it; the title
    // opts back out to the display face below.
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
    // Claro on navy — a documented pair, scored by contrast.test.ts.
    color: 'var(--color-claro)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  }
}

/** "título em display" — in the per-organization accent (FR-003). */
export const CARD_TITLE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-lg)',
  color: 'var(--color-primary)',
  margin: 0,
}

/** "tag de categoria em chip": accent fill, navy label — the documented pair, at the small radius. */
export const CARD_CATEGORY_STYLE: CSSProperties = {
  alignSelf: 'flex-start',
  background: 'var(--color-primary)',
  color: 'var(--color-navy)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-3)',
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-xs)',
}

export const CARD_FOOTER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  fontSize: 'var(--text-sm)',
}

/**
 * The handle as the footer prints it.
 *
 * Idempotent on purpose: content arrives from a Payload field where an author may or may not
 * have typed the `@`, and `@@ariedi` is the kind of defect that ships because it looks like a
 * data problem in review.
 *
 * @example formatHandle('ariedi') // '@ariedi'
 */
export function formatHandle(handle: string): string {
  return handle.startsWith('@') ? handle : `@${handle}`
}

/**
 * A function returning the footer element, NOT a `<CardFooter />` component. A nested component
 * would only be expanded by a renderer, and this package has none (CLR-003) — calling it keeps
 * the whole tree readable to a `node` test, which is the only place this card is verified until
 * feature 003 brings Playwright.
 */
function cardFooter({ avatar, handle, level }: CardAuthor, likes: number) {
  return (
    <footer style={CARD_FOOTER_STYLE}>
      {avatar}
      <span>{formatHandle(handle)}</span>
      {/* Plain text, not SkillPips (T022): the pips are the skill *sheet*'s ten-segment bar,
          and ten pips in a card footer would compete with the title for the eye. */}
      <span>{`Nível ${level}`}</span>
      <span>{'♥ '}{likes}</span>
    </footer>
  )
}

/**
 * The base content card: thin outline, soft corners, display title, category chip, author footer.
 *
 * @example
 * <Card title="BRAÇO ROBÓTICO" category="PROJETO" likes={42}
 *       author={{ avatar: <PixelImage … />, handle: 'ariedi', level: 7 }}>
 *   Um braço de 5 eixos impresso em PLA.
 * </Card>
 */
export function Card({ title, category, author, likes, outline = 'claro', children }: CardProps) {
  return (
    <article style={cardStyle(outline)}>
      <span style={CARD_CATEGORY_STYLE}>{category}</span>
      <h3 style={CARD_TITLE_STYLE}>{title}</h3>
      {children}
      {cardFooter(author, likes)}
    </article>
  )
}
