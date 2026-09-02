import type { CSSProperties } from 'react'

/**
 * T026 / FR-013, SC-008 — pixel art without a canvas.
 *
 * The constitution excludes a canvas/WebGL renderer in v1, and DOM/CSS meets the need: an
 * `<img>` plus `image-rendering: pixelated` hands the sprite to the browser's nearest-neighbour
 * scaler. That scaler is sharp at whole multiples and only at whole multiples — at 4.375x a
 * source pixel covers 4 device pixels here and 5 there, and the art reads as muddy rather than
 * as pixel art. Clamping inside the component means no caller has to know that.
 *
 * ── Why the clamp is a separate exported function ───────────────────────────────────────────
 *
 * SC-008 is asserted as arithmetic, not as pixels. CLR-003 locks this package's test stack at
 * `node` with no `jsdom`/`happy-dom`, so a criterion phrased as "a fractional width never
 * reaches the DOM" could not execute — there is no DOM here to reach. Extracting `clampScale()`
 * is what makes the criterion testable at all (plan round 2); `pixel.test.ts` sweeps the
 * function, and `pixel-image.test.ts` asserts that this component actually calls it, which
 * testing the function alone cannot prove.
 *
 * A server component: no state, no handler, nothing that needs the client (FR-014).
 */

export interface PixelImageProps {
  /** Path to the sprite, as authored — no runtime resizing happens anywhere but the browser. */
  readonly src: string
  /**
   * The sprite's intrinsic width in source pixels (16 for avatars and station icons, larger
   * for the hero art). The scale is measured against this, so it is not optional: a hard-coded
   * 16 would pass every avatar and quietly halve the hero.
   */
  readonly baseWidth: number
  /** The width the layout would like. Honoured only where it is already a whole multiple. */
  readonly targetWidth: number
  /** Pixel art is content here — avatars and station icons — so the alt text is required. */
  readonly alt: string
}

/** The smallest scale that still shows the art. See `clampScale` for why 0 is not an option. */
const MIN_SCALE = 1

/**
 * The whole-number scale factor a sprite of `baseWidth` may be drawn at inside `targetWidth`.
 *
 * Clamps *down* to the nearest whole multiple rather than rounding to it: rounding 95/16 up to
 * 6 draws a 16px sprite at 96px inside a 95px slot, and the browser then re-samples it back
 * down — the exact blur the clamp exists to prevent.
 *
 * Never returns 0. Below the base size, `Math.floor` alone would yield a 0px-wide image — the
 * sprite disappears — and a fractional scale would blur it in the other direction. 1x overflows
 * the requested box, and that is the deliberate trade: the art stays legible and the layout
 * clips it, instead of the layout fitting and the art turning to mush.
 *
 * Degenerate input returns 1 rather than propagating: a `baseWidth` of 0 or an unmeasured
 * `NaN` width would otherwise reach the element as `width={NaN}` or `width={Infinity}`, which
 * React drops silently — a sprite that vanishes with no error anywhere.
 *
 * @example clampScale(70, 16) // 4 — a 16px sprite drawn at 64px, not at 70px
 */
export function clampScale(targetWidth: number, baseWidth: number): number {
  if (!Number.isFinite(targetWidth) || !Number.isFinite(baseWidth) || baseWidth <= 0) {
    return MIN_SCALE
  }
  return Math.max(MIN_SCALE, Math.floor(targetWidth / baseWidth))
}

/**
 * Nearest-neighbour scaling, exported so the workbench (FR-016) can read the same value the
 * component sets. Without it the whole-multiple width is still smoothed by the default
 * bilinear filter — the same blur arriving by a different route.
 */
export const PIXEL_IMAGE_STYLE: CSSProperties = { imageRendering: 'pixelated' }

/**
 * A pixel-art sprite drawn at the largest whole multiple of its own size that fits.
 *
 * Height is deliberately left off: with only `width` set the browser keeps the intrinsic
 * aspect ratio, so a second dimension here could only disagree with the first.
 *
 * @example <PixelImage src="/pixel/avatar.png" alt="Avatar de ariedi" baseWidth={16} targetWidth={70} />
 */
export function PixelImage({ src, baseWidth, targetWidth, alt }: PixelImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      width={baseWidth * clampScale(targetWidth, baseWidth)}
      style={PIXEL_IMAGE_STYLE}
    />
  )
}
