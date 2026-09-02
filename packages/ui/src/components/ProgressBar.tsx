import type { CSSProperties } from 'react'

/**
 * T023 / FR-006 — the continuous progress bar, for missions and XP.
 *
 * `visual-identity.md` § "Barras de progresso": *"pips das skills representam 10 níveis
 * (decidido; o mockup mostra 6 segmentos — superado); **contínuas com % para missões e XP**"*.
 * That sentence is a split, not a description: a *skill* is ten discrete pips (`SkillPips`,
 * T022) and a *mission or XP* bar is continuous and carries its percentage as text. Both
 * halves are the requirement — a continuous bar with no printed number is the mission mockup's
 * `0%` state rendered as an empty rectangle nobody can tell from a component that failed.
 *
 * ── Why the progress arrives as value/max rather than as a percentage ───────────────────────
 *
 * The two callers count in different units. A mission is a fraction of its steps (the model is
 * still open — `tech-stack.md:73`), and XP is `5 XP por nível` (`aulas.md:132`), so 3 XP into a
 * level is 60%. Asking the call site for a percentage moves that arithmetic to four call sites
 * that will round four ways, and the one that floors shows `99%` on a finished mission.
 * `percentOf` is exported so the rounding has exactly one home — and so the width and the
 * printed label are the *same* number rather than two roundings free to drift apart.
 *
 * ── Why teal and not the accent ─────────────────────────────────────────────────────────────
 *
 * `--color-teal`'s role comment in `palette.css` already reads "hero band, **progress
 * detail**, status chips". Progress is platform data: a bar painted in `--color-primary` would
 * recolour a maker's own XP with whichever organization's page they happen to be reading
 * (CLR-001 keeps theming to CTAs, active tabs and card titles). The filled pips of `SkillPips`
 * make the same choice, which is what keeps the two bars reading as one family.
 *
 * A server component: no state, no handler, nothing that needs the client (FR-014).
 */

export interface ProgressBarProps {
  /** Progress in the caller's own units — mission steps done, or XP into the current level. */
  readonly value: number
  /**
   * The full scale, in those same units. Defaults to 100, so a caller that already thinks in
   * percent passes `value` alone.
   */
  readonly max?: number
  /** What is progressing, e.g. `Missão: primeira impressão`. The bar's accessible name. */
  readonly label: string
}

/** The scale a bare `value` is read against: `value` is already a percentage. */
const DEFAULT_MAX = 100

/**
 * `value` as a whole percentage of `max`, clamped to 0–100.
 *
 * Exported because it is the one rounding: the fill width and the printed label both come from
 * this call, so they cannot disagree. Degenerate input returns 0 rather than propagating —
 * `max = 0` is a mission whose steps are not modelled yet (`tech-stack.md:73`), and `0/0` would
 * reach the DOM as `width: NaN%`, which the cascade drops silently while the label reads "NaN%"
 * out loud.
 *
 * @example percentOf(3, 5) // 60
 */
export function percentOf(value: number, max: number = DEFAULT_MAX): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0
  return Math.round((clamp(value, max) / max) * 100)
}

/** `value` held inside the scale, so neither the paint nor `aria-valuenow` can leave it. */
function clamp(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), max)
}

/** The row: the track takes the width that is left, the percentage sits beside it. */
export const PROGRESS_BAR_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  // Claro on the navy base — a documented pair, scored by contrast.test.ts.
  color: 'var(--color-claro)',
}

/**
 * The empty track.
 *
 * Outlined rather than filled, for the reason the empty pips are: at 0% the outline is the only
 * thing on screen saying there is a bar. `overflow: hidden` is what makes the fill inherit the
 * rounded ends instead of poking square corners through them at 100%.
 */
export const PROGRESS_TRACK_STYLE: CSSProperties = {
  flex: 1,
  height: 'var(--space-2)',
  border: '1px solid var(--color-claro)',
  borderRadius: 'var(--radius-sm)',
  background: 'transparent',
  overflow: 'hidden',
}

/** The painted portion. Width is the only thing that moves; see `progressFillStyle`. */
export const PROGRESS_FILL_STYLE: CSSProperties = {
  height: '100%',
  background: 'var(--color-teal)',
  borderRadius: 'var(--radius-sm)',
}

/** The fill at a given percentage — exported so the workbench (FR-016) can read it. */
export function progressFillStyle(percent: number): CSSProperties {
  return { ...PROGRESS_FILL_STYLE, width: `${percent}%` }
}

/**
 * A continuous progress bar with its percentage printed beside it.
 *
 * @example <ProgressBar label="XP do nível" value={3} max={5} />   // a 60% bar reading "60%"
 */
export function ProgressBar({ value, max = DEFAULT_MAX, label }: ProgressBarProps) {
  const percent = percentOf(value, max)
  return (
    <div style={PROGRESS_BAR_STYLE}>
      <div
        role="progressbar"
        aria-label={label}
        // The caller's units, clamped: the track cannot paint 100% while a screen reader
        // announces 140 of 100.
        aria-valuenow={clamp(value, max)}
        aria-valuemin={0}
        aria-valuemax={max}
        // Without this a reader says "3 of 5" while the label beside it says 60%.
        aria-valuetext={`${percent}%`}
        style={PROGRESS_TRACK_STYLE}
      >
        <div style={progressFillStyle(percent)} />
      </div>
      {/* Hidden from assistive tech: the track above already announces the same number, and
          without this the bar is read as "60 percent, 60 percent". */}
      <span aria-hidden={true}>{`${percent}%`}</span>
    </div>
  )
}
