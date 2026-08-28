import type { CSSProperties, ReactElement } from 'react'

import { ISO_SHAPES, ISO_VIEWBOX, type IsoPrimitive, type IsoShapeName } from './geometry'

/**
 * T035 / FR-015 — the renderer for the isometric shape vocabulary.
 *
 * Deliberately thin: every decision about what a shape *is* lives in `geometry.ts`, where the
 * suite can read it (CLR-003 gives this package no DOM and no JSX transform, so nothing here
 * can be unit-tested — which is the argument for this file holding as little as possible).
 * What is left is the SVG spelling of that data.
 *
 * ── Colour comes from the call site, always ─────────────────────────────────────────────────
 *
 * Nothing here names a colour. Every part paints with `currentColor` and differs only in
 * opacity, so a shape takes the `color` of whatever it is placed in — `--color-teal` in the
 * footer composition, `--color-primary` on an accent surface — and one asset serves every
 * context. This is what keeps FR-002 true for artwork: there is no attribute on this component
 * through which a hex could arrive.
 *
 * ── Sizing ─────────────────────────────────────────────────────────────────────────────────
 *
 * `size` is a CSS length, defaulting to `1em` so a shape set inline matches the text beside it.
 * The viewBox is square and shared across the vocabulary (see `geometry.ts`), so shapes stack
 * and align without per-shape nudging.
 *
 * A server component: no state, no handler, nothing that needs the client (FR-014).
 */

export interface IsoShapeProps {
  /** Which shape to draw. A typo is a compile error, not an empty box. */
  readonly name: IsoShapeName
  /** Any CSS length. Defaults to `1em` — inline with the surrounding text. */
  readonly size?: string
  /**
   * The accessible name. **Omit it for decoration**, which is the common case: the shapes are
   * ornament, and an unnamed decorative graphic must be hidden from assistive technology
   * rather than announced as "image".
   */
  readonly title?: string
}

/**
 * Stroke weight in viewBox units. `nonScalingStroke` is deliberately NOT used: these are
 * drawings, not icons overlaid on a map, and a hairline that stays 1px while the shape grows
 * to 96px reads as a different asset at each size.
 */
const STROKE_WIDTH = 1.5

/** `[[1, 2], [3, 4]]` → `"1,2 3,4"`, the only spelling SVG accepts for points. */
function pointsAttribute(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(' ')
}

function renderPrimitive(primitive: IsoPrimitive, key: number): ReactElement {
  const filled = primitive.paint === 'fill'
  // One shared paint set: the shade is an alpha on the inherited colour, never a colour.
  const paint = {
    fill: filled ? 'currentColor' : 'none',
    fillOpacity: filled ? primitive.shade : undefined,
    stroke: filled ? 'none' : 'currentColor',
    strokeOpacity: filled ? undefined : primitive.shade,
    strokeWidth: filled ? undefined : STROKE_WIDTH,
    strokeLinecap: filled ? undefined : ('round' as const),
    strokeLinejoin: filled ? undefined : ('round' as const),
  }

  if (primitive.kind === 'circle') {
    const [cx, cy] = primitive.center
    return <circle key={key} cx={cx} cy={cy} r={primitive.radius} {...paint} />
  }
  if (primitive.kind === 'polyline') {
    return <polyline key={key} points={pointsAttribute(primitive.points)} {...paint} />
  }
  return <polygon key={key} points={pointsAttribute(primitive.points)} {...paint} />
}

/**
 * One shape from the vocabulary, drawn in the inherited colour.
 *
 * @example <IsoShape name="cubeWireframe" size="var(--space-6)" />
 */
export function IsoShape({ name, size = '1em', title }: IsoShapeProps) {
  const style: CSSProperties = { width: size, height: size, display: 'block' }
  return (
    <svg
      viewBox={`0 0 ${ISO_VIEWBOX} ${ISO_VIEWBOX}`}
      style={style}
      // Named or hidden, never in between: a graphic with neither is announced as an unlabelled
      // image by every screen reader, which is worse than silence for ornament.
      role={title === undefined ? undefined : 'img'}
      aria-hidden={title === undefined ? true : undefined}
      aria-label={title}
      focusable={false}
    >
      {ISO_SHAPES[name].map(renderPrimitive)}
    </svg>
  )
}
