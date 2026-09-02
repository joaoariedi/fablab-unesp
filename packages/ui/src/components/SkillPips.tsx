import type { CSSProperties } from 'react'

/**
 * T022 / FR-006 — the skill level strip.
 *
 * `visual-identity.md` § "Barras de progresso": *"pips das skills representam **10 níveis**
 * (decidido; o mockup mostra 6 segmentos — superado)"*, repeated in spec.md § "Decisions taken
 * while writing this spec". The mockup's six segments are a superseded render, not a variant:
 * there is no prop here that brings them back, because a `count` prop would let a call site
 * re-introduce the number the decision removed.
 *
 * ── Why the count is exported ──────────────────────────────────────────────────────────────
 *
 * The scale is the requirement, and a level arriving from the API is scored against it
 * elsewhere (the card footer's "Nível 7", the workbench's states). A second `10` typed at
 * those call sites is a second definition free to drift back to 6 while this one stays right.
 *
 * ── Why the strip is fixed and only the fill moves ─────────────────────────────────────────
 *
 * Emitting one pip per level draws a correct-looking strip at level 10 and *nothing at all* at
 * level 0 — the state every new account is in, and the one FR-006 names explicitly ("empty at
 * level 0"). Ten pips always; `level` decides how many are painted.
 *
 * Colour comes from `--color-teal`, whose role comment in `palette.css` is "hero band,
 * progress detail, status chips". Deliberately not `--color-primary`: a skill level is
 * platform data about a learner, and CLR-001 keeps per-organization theming to CTAs, active
 * tabs and card titles — an accent here would repaint everyone's progress per lab.
 *
 * A server component: it holds no state and takes no handler (FR-014).
 */

/** The decided number of skill levels — 10, superseding the mockup's 6. */
export const SKILL_PIP_COUNT = 10

export interface SkillPipsProps {
  /**
   * The learner's level. Clamped to `0…SKILL_PIP_COUNT` rather than trusted: it arrives from
   * the API, and an out-of-range value must not grow or invert the strip.
   */
  readonly level: number
  /** The skill being scored, e.g. `Impressão 3D`. Ten boxes carry no accessible name. */
  readonly label: string
}

const STRIP_STYLE: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-1)',
  alignItems: 'center',
}

const PIP_BASE_STYLE: CSSProperties = {
  width: 'var(--space-2)',
  height: 'var(--space-3)',
  borderRadius: 'var(--radius-sm)',
}

const FILLED_PIP_STYLE: CSSProperties = {
  ...PIP_BASE_STYLE,
  background: 'var(--color-teal)',
  // The same thickness as the empty pip's outline, so a filled pip and an empty one occupy
  // identical space and the strip does not shift as a learner levels up.
  border: '1px solid var(--color-teal)',
}

const EMPTY_PIP_STYLE: CSSProperties = {
  ...PIP_BASE_STYLE,
  background: 'transparent',
  // Outlined, not invisible: at level 0 the outline IS the information — ten levels exist and
  // none are earned. An unbordered empty pip leaves a blank gap that says nothing.
  border: '1px solid var(--color-claro)',
}

/** `level` reduced to a whole number of earned pips within the scale. */
function earnedPips(level: number): number {
  if (!Number.isFinite(level)) return 0
  return Math.min(SKILL_PIP_COUNT, Math.max(0, Math.floor(level)))
}

/**
 * The ten-segment skill strip, empty at level 0.
 *
 * @example <SkillPips level={7} label="Impressão 3D" />
 */
export function SkillPips({ level, label }: SkillPipsProps) {
  const earned = earnedPips(level)
  return (
    <div
      role="meter"
      aria-label={`${label}: nível ${earned} de ${SKILL_PIP_COUNT}`}
      // The clamped value, never the raw one: otherwise the strip shows ten and the screen
      // reader announces twelve.
      aria-valuenow={earned}
      aria-valuemin={0}
      aria-valuemax={SKILL_PIP_COUNT}
      style={STRIP_STYLE}
    >
      {Array.from({ length: SKILL_PIP_COUNT }, (_, index) => (
        <span key={index} style={index < earned ? FILLED_PIP_STYLE : EMPTY_PIP_STYLE} />
      ))}
    </div>
  )
}
