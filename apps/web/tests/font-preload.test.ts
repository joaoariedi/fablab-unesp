import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, it, vi } from 'vitest'

/**
 * T015 made `FrontendLayout` **async** (it now reads the organization through the tenancy
 * choke point), and an async component cannot go through `renderToStaticMarkup` — React
 * throws "A component suspended while responding to synchronous input". The fix is to await
 * the component as the plain function it is and render the element it returns.
 *
 * The two mocks exist for the same reason `frontend-layout.test.ts` has them: the layout now
 * calls `getTenantScopedPayloadForRSC()`, which resolves a host. With no request there is no
 * host, so the real call throws `TenantUnresolvedError`, the layout turns that into
 * `notFound()`, and this suite would be asserting a 404 instead of a preload. The mock stands
 * in for a resolved tenant whose record simply carries no theme — which is FR-004's default
 * case, and the one where the preload still has to be emitted.
 */
const mocks = vi.hoisted(() => ({
  getTenantScopedPayloadForRSC: vi.fn(async () => ({
    tenantId: 'org-test',
    findByID: async () => ({}),
  })),
}))

vi.mock('next/navigation', () => ({
  notFound: (): never => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  },
}))

vi.mock('../lib/tenancy', async () => ({
  ...(await import('../lib/tenancy/errors')),
  getTenantScopedPayloadForRSC: mocks.getTenantScopedPayloadForRSC,
}))

const { default: FrontendLayout } = await import('../app/(frontend)/layout')

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
async function renderLayout(): Promise<string> {
  const element = await FrontendLayout({ children: createElement('main', null, 'conteúdo') })
  return renderToStaticMarkup(element)
}

/** The single `<link>` tag whose href is `href`, or undefined when none was emitted. */
function findLinkTag(markup: string, href: string): string | undefined {
  const tags = markup.match(/<link\b[^>]*>/g) ?? []
  return tags.find((tag) => tag.includes(`href="${href}"`))
}

/**
 * `packages/ui/src/tokens/typography.css` — the file whose `@font-face` the preload exists to
 * front-run. Read rather than restated: the two constants above are the *expectation*, and a
 * test that only checks the layout's copy of a path against the test's own copy of the same
 * path stays green when T010 renames the asset and the preload starts warming bytes nobody
 * requests. That is the failure mode this suite's own header claims to cover ("the href must
 * be the same absolute path @font-face requests") and, until now, did not.
 */
const TYPOGRAPHY_CSS = new URL(
  '../../../packages/ui/src/tokens/typography.css',
  import.meta.url,
).pathname

/** `apps/web/public` — what Next serves at `/`, so an absolute href resolves under it. */
const PUBLIC_DIR = new URL('../public', import.meta.url).pathname

/** The first family named by `--font-display`, i.e. the face the layout must preload. */
function displayFamilyFromTokens(css: string): string {
  const declaration = /--font-display:\s*'([^']+)'/.exec(css)
  const family = declaration?.[1]
  if (family === undefined) {
    throw new Error(
      `No --font-display declaration naming a quoted family in ${TYPOGRAPHY_CSS}. ` +
        'Without it there is no way to know which face the preload should point at.',
    )
  }
  return family
}

/** The `url()` the `@font-face` for `family` requests. */
function fontFaceUrlFor(css: string, family: string): string {
  const blocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? []
  const block = blocks.find((candidate) => candidate.includes(`font-family: '${family}'`))
  if (block === undefined) {
    throw new Error(
      `No @font-face for '${family}' in ${TYPOGRAPHY_CSS}; found ${blocks.length} block(s). ` +
        'The token layer names a face it never declares, so nothing would load it.',
    )
  }
  const source = /url\('([^']+)'\)/.exec(block)
  const url = source?.[1]
  if (url === undefined) {
    throw new Error(`The @font-face for '${family}' declares no quoted url(): ${block}`)
  }
  return url
}

describe('the frontend layout preloads the display face', () => {
  it('emits a preload link for the display WOFF2', async () => {
    const markup = await renderLayout()
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

  it('declares the attributes that make the preload reusable', async () => {
    const tag = findLinkTag(await renderLayout(), DISPLAY_FACE_HREF) ?? ''
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

  it('hoists the preload into <head>, ahead of the body', async () => {
    const markup = await renderLayout()
    const linkAt = markup.indexOf(DISPLAY_FACE_HREF)
    const bodyAt = markup.indexOf('<body')
    expect(linkAt, `${DISPLAY_FACE_HREF} is absent from the rendered layout`).toBeGreaterThan(-1)
    expect(
      linkAt,
      'The preload is emitted after <body> opens, so the browser discovers it no earlier ' +
        'than the stylesheet it was meant to beat.',
    ).toBeLessThan(bodyAt)
  })

  it('preloads the exact path the display @font-face requests', async () => {
    const css = readFileSync(TYPOGRAPHY_CSS, 'utf8')
    const family = displayFamilyFromTokens(css)
    const declaredUrl = fontFaceUrlFor(css, family)

    expect(
      declaredUrl,
      `The layout preloads ${DISPLAY_FACE_HREF} but the @font-face for '${family}' asks for ` +
        `${declaredUrl}. Two paths, one of them warmed and the other awaited: the preload ` +
        'costs a request and saves nothing. The layout repeats this path deliberately ' +
        '(the token layer is CSS, so there is no value to import) — this assertion is what ' +
        'makes the repetition safe.',
    ).toBe(DISPLAY_FACE_HREF)

    expect(
      findLinkTag(await renderLayout(), declaredUrl),
      `The rendered layout has no preload for ${declaredUrl}, the path @font-face requests.`,
    ).toBeDefined()
  })

  it('preloads a file that is actually served', async () => {
    const declaredUrl = DISPLAY_FACE_HREF
    const served = join(PUBLIC_DIR, declaredUrl)
    expect(
      existsSync(served),
      `${declaredUrl} resolves to ${served}, which does not exist. Next serves apps/web/` +
        'public at /, so both the preload and the @font-face would 404 — and a 404 preload ' +
        'is silent in the browser as well as in a markup assertion.',
    ).toBe(true)
  })

  it('preloads only the display face, not the body face', async () => {
    // Sketch 8 asks for one preload. A second one for Comfortaa would split the same
    // connection budget and delay the face that renders the headings.
    const markup = await renderLayout()
    expect(
      findLinkTag(markup, BODY_FACE_HREF),
      'The body face is preloaded too. Two font preloads compete for the same early ' +
        'bandwidth; Comfortaa swaps in acceptably via font-display: swap.',
    ).toBeUndefined()
  })
})
