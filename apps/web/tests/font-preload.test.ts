import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, it } from 'vitest'

import FrontendLayout from '../app/(frontend)/layout'

/**
 * T010b / FR-005 — the frontend layout preloads the **display** face.
 *
 * Sketch 8 rejected `next/font/local` so that typography stays wholly inside `packages/ui`
 * as plain `@font-face` with absolute `url('/fonts/…')`. The one thing that decision gives
 * up is the preload `next/font` emits for free, so it is added here deliberately. Aldo is
 * the face worth the hint: it renders the logo and every heading, i.e. the LCP text, and a
 * plain `@font-face` is only discovered after the stylesheet has been fetched and parsed.
 * Comfortaa is not preloaded — two preloads compete for the same connection and the body
 * face swaps in below the fold.
 *
 * The assertion is on **rendered markup**, not on the source of `layout.tsx`. A `<link>` in
 * React 19 is a hoistable resource: React moves it into `<head>` and de-duplicates it, so a
 * text match on the JSX would keep passing over output React had dropped or rewritten.
 *
 * Four attributes are asserted rather than just the href, because a preload missing any one
 * of them is worse than no preload at all — it warms nothing and costs a request:
 *   - `as="font"`     — without it the fetch has no destination and is not reused.
 *   - `crossorigin`   — fonts are fetched in anonymous CORS mode *even same-origin*; a
 *                       preload without it is a second, separate fetch.
 *   - `type=font/woff2` — lets a browser without WOFF2 skip the download.
 *   - the href must be the same absolute path `@font-face` requests (Sketch 8), or the
 *     preloaded bytes are never the ones the renderer waits on.
 */

const DISPLAY_FACE_HREF = '/fonts/aldo-the-apache.woff2'
const BODY_FACE_HREF = '/fonts/comfortaa.woff2'

/** The layout as the server actually emits it, children included. */
function renderLayout(): string {
  return renderToStaticMarkup(
    createElement(FrontendLayout, { children: createElement('main', null, 'conteúdo') }),
  )
}

/** The single `<link>` tag whose href is `href`, or undefined when none was emitted. */
function findLinkTag(markup: string, href: string): string | undefined {
  const tags = markup.match(/<link\b[^>]*>/g) ?? []
  return tags.find((tag) => tag.includes(`href="${href}"`))
}

describe('the frontend layout preloads the display face', () => {
  it('emits a preload link for the display WOFF2', () => {
    const markup = renderLayout()
    const tag = findLinkTag(markup, DISPLAY_FACE_HREF)
    expect(
      tag,
      `No <link href="${DISPLAY_FACE_HREF}"> in the rendered layout. The display face is ` +
        'discovered only after the stylesheet parses, which is exactly the round-trip the ' +
        'preload exists to remove. Rendered markup was:\n' +
        markup,
    ).toBeDefined()
    expect(tag, `${tag} is not rel="preload"`).toContain('rel="preload"')
  })

  it('declares the attributes that make the preload reusable', () => {
    const tag = findLinkTag(renderLayout(), DISPLAY_FACE_HREF) ?? ''
    expect(tag, `${tag} has no as="font"; the fetch has no destination and is not reused`).toContain(
      'as="font"',
    )
    expect(
      tag,
      `${tag} has no crossorigin; fonts are fetched anonymously even same-origin, so the ` +
        'preloaded response would not match the one @font-face asks for',
    ).toMatch(/crossorigin(="[^"]*")?/)
    expect(tag, `${tag} does not declare type="font/woff2"`).toContain('type="font/woff2"')
  })

  it('hoists the preload into <head>, ahead of the body', () => {
    const markup = renderLayout()
    const linkAt = markup.indexOf(DISPLAY_FACE_HREF)
    const bodyAt = markup.indexOf('<body')
    expect(linkAt, `${DISPLAY_FACE_HREF} is absent from the rendered layout`).toBeGreaterThan(-1)
    expect(
      linkAt,
      'The preload is emitted after <body> opens, so the browser discovers it no earlier ' +
        'than the stylesheet it was meant to beat.',
    ).toBeLessThan(bodyAt)
  })

  it('preloads only the display face, not the body face', () => {
    // Sketch 8 asks for one preload. A second one for Comfortaa would split the same
    // connection budget and delay the face that renders the headings.
    const markup = renderLayout()
    expect(
      findLinkTag(markup, BODY_FACE_HREF),
      'The body face is preloaded too. Two font preloads compete for the same early ' +
        'bandwidth; Comfortaa swaps in acceptably via font-display: swap.',
    ).toBeUndefined()
  })
})
