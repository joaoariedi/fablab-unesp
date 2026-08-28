import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { clampScale, PixelImage } from '../src/components/PixelImage'

/**
 * T026 / FR-013, SC-008 — pixel art drawn by the browser, at whole multiples only.
 *
 * The constitution excludes a canvas/WebGL renderer in v1 (FR-013), so the sprites are `<img>`
 * elements scaled by the browser with `image-rendering: pixelated`. That scaler is sharp at
 * whole multiples and muddy everywhere else: at 4.375x a source pixel lands on 4 device pixels
 * or 5 depending where it falls, and the art reads as blurred. `clampScale()` is the single
 * place that decision is made, and this file asserts that the component actually *uses* it —
 * the requested width never reaches the element unless it already was a whole multiple.
 *
 * ── Why this test calls the component instead of rendering it ───────────────────────────────
 *
 * CLR-003 keeps the stack at `node` with no `jsdom`/`happy-dom` (vitest.config.ts states it),
 * so nothing in this package renders. A React function component is a plain function returning
 * a plain object, so calling it and reading `element.props` asserts what the component puts on
 * the element — the same move `button.test.ts` makes, and the reason the plan extracted
 * `clampScale()` in the first place. The exhaustive arithmetic sweep over the clamp is T027's
 * `pixel.test.ts`; what is asserted here is the wiring between the two, which no amount of
 * testing the function alone can prove.
 *
 * What it cannot prove: that the cascade paints it crisply. That is the workbench (FR-016) and
 * feature 003's Playwright.
 */

const PIXEL_IMAGE_SOURCE_PATH = fileURLToPath(
  new URL('../src/components/PixelImage.tsx', import.meta.url),
)

/** A 16px sprite — the size the avatar and station-icon art is authored at. */
const SPRITE = 16

/** The element the component returns, typed enough to read its props without `any`. */
function pixelImage(targetWidth: number): ReactElement<{
  readonly src?: string
  readonly alt?: string
  readonly width?: number
  readonly style?: Record<string, unknown>
}> {
  return PixelImage({
    src: '/pixel/avatar.png',
    alt: 'Avatar de ariedi',
    baseWidth: SPRITE,
    targetWidth,
  })
}

describe('clampScale() — the extracted clamp (FR-013, SC-008)', () => {
  it('clamps DOWN to the nearest whole multiple rather than rounding to it', () => {
    // 70/16 = 4.375, and rounding is the plausible wrong implementation. 95/16 = 5.9375 is the
    // case that separates them: `Math.round` gives 6, which draws a 16px sprite at 96px inside
    // a 95px slot — scaled up past its box, re-sampled, and blurred all over again.
    expect(clampScale(70, SPRITE)).toBe(4)
    expect(clampScale(95, SPRITE)).toBe(5)
  })

  it('honours an exact multiple instead of nudging it', () => {
    expect(clampScale(SPRITE * 4, SPRITE)).toBe(4)
  })

  it('floors to 1 below the base size, never to 0 or a fraction', () => {
    // `Math.floor` alone returns 0 here, which is a 0px-wide image: the sprite vanishes.
    expect(clampScale(SPRITE / 2, SPRITE)).toBe(1)
  })
})

describe('PixelImage — the clamp actually reaches the element (FR-013)', () => {
  it('draws at a whole multiple of the base width, not at the width requested', () => {
    // The wiring assertion. A component that passes `targetWidth` straight through satisfies
    // every case in T027's clamp suite and still renders muddy art.
    expect(pixelImage(70).props.width).toBe(64)
    expect(pixelImage(95).props.width).toBe(80)
  })

  it('never emits a width that is not a whole multiple of the base, across a run', () => {
    // Swept rather than sampled: a branch that falls back to the raw target for some range is
    // invisible to a pair of literals.
    for (let targetWidth = SPRITE; targetWidth <= 400; targetWidth += 0.5) {
      const width = pixelImage(targetWidth).props.width as number
      expect(Number.isInteger(width / SPRITE)).toBe(true)
      expect(width).toBeLessThanOrEqual(targetWidth)
    }
  })

  it('asks the browser for the nearest-neighbour scaler', () => {
    // Without this the whole-multiple width is still smoothed by the default bilinear filter,
    // which is the same blur arriving by a different route.
    expect(pixelImage(64).props.style?.imageRendering).toBe('pixelated')
  })

  it('is an <img>, not a canvas — FR-013 excludes a canvas/WebGL renderer in v1', () => {
    expect(pixelImage(64).type).toBe('img')
    // The element check above is the primary assertion; this scans for the APIs a canvas
    // implementation cannot avoid, so a renderer smuggled in behind an `<img>` wrapper still
    // trips. Matched as *code* — `getContext(`, a `<canvas` tag, a WebGL context name — rather
    // than as the bare words, which appear in the file's own comment explaining the exclusion.
    const source = readFileSync(PIXEL_IMAGE_SOURCE_PATH, 'utf8')
    expect(source).not.toMatch(/getContext\(|<canvas|WebGL(?:2?RenderingContext|Renderer)/)
  })

  it('carries the caller`s src and alt through untouched', () => {
    // Pixel art is content here (avatars, station icons), not decoration: an alt the component
    // swallowed is a maker with no name in a screen reader.
    expect(pixelImage(64).props.src).toBe('/pixel/avatar.png')
    expect(pixelImage(64).props.alt).toBe('Avatar de ariedi')
  })

  it('stays a server component — a static image needs no client island (FR-014)', () => {
    expect(readFileSync(PIXEL_IMAGE_SOURCE_PATH, 'utf8')).not.toContain('use client')
  })
})
