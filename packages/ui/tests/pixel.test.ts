import { describe, expect, it } from 'vitest'

import { clampScale } from '../src/components/PixelImage'

/**
 * T027 / FR-013, SC-008 — the integer clamp that keeps pixel art crisp.
 *
 * The constitution excludes a canvas/WebGL renderer in v1, so pixel art is drawn by the
 * browser's own image scaler with `image-rendering: pixelated`. That works at whole multiples
 * and only at whole multiples: at 4.375x every source pixel lands on 4 or 5 device pixels
 * depending where it falls, and the art reads as muddy rather than sharp. `clampScale()` is
 * the one place that decision is made, so this file is where SC-008 is actually enforced.
 *
 * ── Why this asserts a function and never a component ──────────────────────────────────────
 *
 * SC-008's first wording was "a fractional width never reaches the DOM", which could not
 * execute: CLR-003 locks this package's stack at `node` with no `jsdom`/`happy-dom`, so there
 * is no DOM here to reach. Round 2 extracted the clamp from `PixelImage` precisely so the
 * criterion becomes arithmetic — this file imports the function and calls it, and nothing in
 * it renders. That `PixelImage` passes the clamped value to `width` is a component contract
 * the workbench (FR-016) and feature 003's Playwright cover.
 */

/** A 16px sprite — the avatar/station-icon base size the pixel assets are authored at. */
const SPRITE = 16

describe('clampScale() — integer scale factors only (FR-013, SC-008)', () => {
  it('returns the exact multiple when the target is one', () => {
    // The uninteresting half, and the half that must not regress: an integer request is
    // honoured rather than nudged, so a 4x sprite is drawn at 4x and not 3x.
    expect(clampScale(SPRITE, SPRITE)).toBe(1)
    expect(clampScale(SPRITE * 2, SPRITE)).toBe(2)
    expect(clampScale(SPRITE * 4, SPRITE)).toBe(4)
    expect(clampScale(SPRITE * 10, SPRITE)).toBe(10)
  })

  it('clamps a fractional ratio DOWN, never to the nearest', () => {
    // 70/16 = 4.375 and 95/16 = 5.9375. Rounding is the plausible wrong implementation and
    // the second case is what separates them: `Math.round` returns 6, which draws a 16px
    // sprite at 96px inside a 95px slot — the art is then scaled *up* past its box and the
    // browser re-samples it, which is the exact blur the clamp exists to prevent.
    expect(clampScale(70, SPRITE)).toBe(4)
    expect(clampScale(95, SPRITE)).toBe(5)
    expect(clampScale(SPRITE * 3 - 1, SPRITE)).toBe(2)
  })

  it('tolerates a fractional target width, as a CSS layout produces', () => {
    // Widths arriving from a fluid grid are rarely whole: 48.9 must behave exactly as 48 does,
    // not produce a fractional scale of its own.
    expect(clampScale(48.9, SPRITE)).toBe(3)
    expect(clampScale(63.999, SPRITE)).toBe(3)
    expect(clampScale(SPRITE * 2.5, SPRITE)).toBe(2)
  })

  it('never returns a fractional scale for any width across a run', () => {
    // The property behind every case above, swept rather than sampled: one bad branch that
    // returns `target / base` unclamped for some range is invisible to a handful of literals.
    for (let targetWidth = 1; targetWidth <= 200; targetWidth += 0.5) {
      const scale = clampScale(targetWidth, SPRITE)
      expect(Number.isInteger(scale)).toBe(true)
    }
  })

  it('floors to 1 when the target is smaller than the base, rather than to 0 or a fraction', () => {
    // `Math.floor` alone returns 0 here, which renders a 0px-wide image — the sprite vanishes.
    // A ratio of 0.5 would shrink it by half-pixels, which is the blur in the other direction.
    // 1x overflows the requested box, and that is the deliberate trade: the art stays legible
    // and the layout clips it, instead of the layout fitting and the art turning to mush.
    expect(clampScale(SPRITE / 2, SPRITE)).toBe(1)
    expect(clampScale(1, SPRITE)).toBe(1)
    expect(clampScale(SPRITE - 0.001, SPRITE)).toBe(1)
  })

  it('never scales past the requested width once the sprite fits in it', () => {
    // The invariant a caller relies on: the drawn width is a whole multiple that fits. Stated
    // separately from the literals above because it is what "clamp" means, and it holds for
    // every target at or above the base — the sub-base case is the documented exception.
    for (let targetWidth = SPRITE; targetWidth <= 400; targetWidth += 1) {
      expect(SPRITE * clampScale(targetWidth, SPRITE)).toBeLessThanOrEqual(targetWidth)
    }
  })

  it('works for a base size other than 16, since assets are authored at several', () => {
    // Hard-coding the sprite size inside the clamp would pass every case above and fail the
    // hero art, which is not 16px wide.
    expect(clampScale(96, 32)).toBe(3)
    expect(clampScale(100, 32)).toBe(3)
    expect(clampScale(24, 32)).toBe(1)
  })
})
