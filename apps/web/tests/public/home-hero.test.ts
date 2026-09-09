import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

/**
 * T025 / FR-009, SC-006 — the Home's pixel-art hero, as a measurement.
 *
 * `plan.md` § Sketch 8 fixes the shape (*"AVIF with a WebP fallback … it IS the LCP element,
 * so it is never lazy and is preloaded in `<head>`"*) and `home.md` § *Hero — v2* fixes the
 * art. The task adds the part a screenshot cannot show: *"**Record the measured byte counts**
 * — they are a deliverable, not an assumption"*.
 *
 * ── Why this suite renders the page instead of walking its tree ─────────────────────────────
 *
 * `<link>` is a hoistable resource in React 19: it is moved into `<head>` and de-duplicated at
 * render time. A tree walk would therefore assert on an element React may drop or rewrite —
 * the reason `font-preload.test.ts` renders too, for the preload this one sits beside.
 *
 * ── Why the byte counts are asserted against the files on disk ──────────────────────────────
 *
 * `scripts/lcp-budget.sh` (T015) measures the *page*, in CI, with a browser. It is the gate and
 * this is not trying to be a second one. What it cannot do is notice that the hero was
 * re-exported at quality 90 and grew by 300 KB while still passing on a fast runner — the
 * budget then holds by luck of the machine. So the numbers below are the ones actually measured
 * when the derivatives were generated, and the suite compares them to `statSync`. Re-encoding
 * the art is allowed; re-encoding it without re-recording what it now weighs is not.
 */

/** What Next serves at `/`, so an absolute href in the markup resolves under it. */
const PUBLIC_DIR = new URL('../../public', import.meta.url).pathname

/** The Home itself, read as text for the one claim only its source can settle (FR-024). */
const PAGE_SOURCE = join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'page.tsx')

/**
 * The measured weight of every hero derivative, in bytes.
 *
 * Produced from `docs/product/design/home-desktop.png` — the designer's delivered v2 art —
 * with the mockup's own chrome cropped away (`extract({ left: 430, top: 104, width: 1106,
 * height: 920 })`: the drawn header band, which `HeaderNav` renders for real, and the drawn
 * headline column, which this page renders as HTML). The recipe, so the numbers are
 * reproducible rather than folklore:
 *
 *   sharp(art).extract({ left: 430, top: 104, width: 1106, height: 920 })
 *     .resize({ width: W })
 *     .avif({ quality: 55, effort: 9, chromaSubsampling: '4:4:4' })   // 4:4:4, see below
 *     .webp({ quality: 72, effort: 6 })
 *
 * `chromaSubsampling: '4:4:4'` is not a default worth losing: 4:2:0 averages colour over 2×2
 * blocks, and this art is single-pixel pink and teal edges on navy — exactly what that average
 * destroys. Quality 55 rather than 65 was chosen by measurement, not taste: 65 costs 61 KB more
 * (204 KB against 143 KB) for a difference the nearest-neighbour upscale hides.
 */
const HERO_BYTES: Readonly<Record<string, number>> = {
  '/hero/mapa-1106.avif': 143_436,
  '/hero/mapa-834.avif': 95_615,
  '/hero/mapa-1106.webp': 186_744,
  '/hero/mapa-834.webp': 119_880,
  // The dedicated mobile composition, cropped from `design/home-mobile.png` at one width. See
  // § "draws the dedicated mobile art" for why it is one candidate and not a ladder.
  '/hero/cena-mobile-432.avif': 37_527,
  '/hero/cena-mobile-432.webp': 55_698,
}

/**
 * The ceiling per format, in bytes — arithmetic, not a round number anyone liked.
 *
 * `scripts/lcp-budget.sh` throttles to 1638 kbps, i.e. ~205 KB/s. 160 KB of AVIF is ~0.8s of
 * the 2.5s LCP budget, leaving the HTML, the display font and the connection setup the rest.
 *
 * The WebP ceiling is deliberately looser, and the reason is which visitor pays it. The gate
 * measures with Chrome, which takes the AVIF; the WebP exists only for browsers that cannot
 * decode AVIF. Squeezing it under 160 KB means visibly degrading the art (quality 72 → 58) for
 * exactly the visitors already getting the worse format, to satisfy a number nothing measures
 * on their behalf. 200 KB is ~0.9s of the same budget — still inside it, with the HTML and the
 * font paid for.
 */
const BYTE_CEILING: Readonly<Record<string, number>> = {
  avif: 160 * 1024,
  webp: 200 * 1024,
}

const { default: HomePage } = await import('../../app/(frontend)/page')

/** The Home as the server actually emits it. */
async function renderHome(): Promise<string> {
  return renderToStaticMarkup((await HomePage()) as never)
}

/** The first tag of `name` carrying every one of `must`, or undefined. */
function findTag(markup: string, name: string, ...must: string[]): string | undefined {
  const tags = markup.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? []
  return tags.find((tag) => must.every((needle) => tag.includes(needle)))
}

/**
 * The value of `attribute` on `tag`, or undefined when it is absent.
 *
 * Case-insensitive, and that is a finding rather than a convenience: React 19's
 * `renderToStaticMarkup` emits `srcSet`, `imageSrcSet`, `imageSizes` and `fetchPriority` in the
 * camel case they were written in. HTML attribute names are case-insensitive, so the browser
 * reads them correctly — but a case-sensitive assertion here would report a missing preload
 * hint that is in fact present, and the fix for that phantom is to delete a working attribute.
 */
function attr(tag: string, attribute: string): string | undefined {
  return new RegExp(`\\b${attribute}="([^"]*)"`, 'i').exec(tag)?.[1]
}

/** Every `/hero/...` path the markup asks the browser for, de-duplicated. */
function heroPathsIn(markup: string): string[] {
  return [...new Set([...markup.matchAll(/\/hero\/[A-Za-z0-9._-]+/g)].map((m) => m[0]))]
}

describe('§1 — the hero picture (FR-009, plan § Sketch 8)', () => {
  it('offers AVIF first, with a WebP fallback the <img> can actually use', async () => {
    const markup = await renderHome()

    expect(
      markup,
      'the Home renders no <picture>. A bare <img> can carry only one format, so either the ' +
        'AVIF is served to browsers that cannot decode it or the WebP is served to every ' +
        'browser — one of them broken, the other 43 KB heavier than it needs to be.',
    ).toContain('<picture')
    const source = findTag(markup, 'source', 'image/avif')
    expect(source, `no <source type="image/avif"> in:\n${markup}`).toBeDefined()

    const img = findTag(markup, 'img')
    expect(img, 'the <picture> has no <img>; a picture without one renders nothing').toBeDefined()
    // The fallback is the format EVERY target browser decodes. An AVIF here would make the
    // <source> decorative and break the browsers it exists for.
    expect(attr(img ?? '', 'src')).toMatch(/\.webp$/)
  })

  it('lets the browser pick a width, with honest `w` descriptors', async () => {
    // Scoped to the WIDE source. Since the dedicated mobile art landed there are two AVIF
    // sources, and the FIRST is the narrow one — order is the selection algorithm, so the
    // mobile pair has to precede the wide pair or the panorama claims every viewport. An
    // unscoped `findTag` here reads the mobile source and asserts the wrong element.
    const srcSet = attr(findTag(await renderHome(), 'source', 'image/avif', 'min-width') ?? '', 'srcset')

    // The `w` descriptor is what the browser selects on, so it must be the file's REAL
    // intrinsic width. The plan's sketch named the files `1440`; the delivered art is 1106
    // wide once the mockup's headline column is cropped off, and a file named for a width it
    // does not have is a descriptor that lies to the selection algorithm.
    expect(srcSet).toContain('/hero/mapa-1106.avif 1106w')
    expect(srcSet).toContain('/hero/mapa-834.avif 834w')
    // Without `sizes` the browser assumes 100vw anyway, but only after layout; stating it lets
    // the preload scanner choose the same candidate this element will.
    expect(
      attr(findTag(await renderHome(), 'source', 'image/avif', 'min-width') ?? '', 'sizes'),
    ).toBe('100vw')
  })

  it('draws the dedicated mobile art below the tablet target (home.md § Adaptação mobile)', async () => {
    // ── The gap this closes ─────────────────────────────────────────────────────────────────
    //
    // `home.md` records the mobile hero as **v2, oficial**, with the art delivered on
    // 2026-08-24, and strikes out the alternative the page shipped: "~~substituir o mapa
    // panorâmico por recorte vertical~~ **Decidido: superado pela arte mobile dedicada**". A
    // 390px visitor got the panorama under an overlaid panel — the superseded option — on the
    // one page for which bespoke mobile art was commissioned. No test could see it: §1 asserted
    // the four desktop derivatives and nothing asked whether a narrow viewport got any of them.
    const markup = await renderHome()

    for (const [type, file] of [
      ['image/avif', '/hero/cena-mobile-432.avif'],
      ['image/webp', '/hero/cena-mobile-432.webp'],
    ] as const) {
      const source = findTag(markup, 'source', type, 'max-width')
      expect(source, `no ${type} source for the mobile composition`).toBeDefined()
      expect(attr(source ?? '', 'srcset')).toContain(file)
    }
  })

  it('partitions the viewport, so no width matches two compositions or none', async () => {
    // The two arts are alternatives, not a ladder. If both sources could match, the first wins
    // and the other is dead markup; if neither matches at some width, the <img> fallback paints
    // the panorama on a phone. `max-width: 833` and `min-width: 834` meet exactly once, at the
    // shell's own `--bp-tablet`.
    const markup = await renderHome()
    const sources = markup.match(/<source\b[^>]*>/g) ?? []

    expect(sources.length, 'the <picture> lost a source').toBe(4)
    for (const source of sources) {
      expect(
        attr(source, 'media'),
        `a hero source carries no media condition, so it matches every viewport: ${source}`,
      ).toBeDefined()
    }
    expect(sources.filter((tag) => tag.includes('max-width: 833'))).toHaveLength(2)
    expect(sources.filter((tag) => tag.includes('min-width: 834'))).toHaveLength(2)
  })

  it('keeps the mobile candidate inside the budget the measurement left it', async () => {
    // T027 measured the Home at 3360ms against 2500ms and named the arithmetic: the LCP element
    // shares a 188,743 B/s link with ~229 KB of script and font bytes, so the hero's share is
    // roughly 40 KB. This asserts the FILE, not the markup — a source pointing at a 126 KB
    // derivative would satisfy every assertion above and lose the budget again.
    const bytes = statSync(join(PUBLIC_DIR, 'hero', 'cena-mobile-432.avif')).size
    expect(
      bytes,
      `the mobile hero is ${bytes} bytes. Above ~40 KB it cannot arrive inside what the ` +
        'budget has left after the scripts and fonts ahead of it — see docs/lcp-measurements.md.',
    ).toBeLessThan(45_000)
  })

  it('is never lazy, and is asked for first', async () => {
    const img = findTag(await renderHome(), 'img') ?? ''

    // The hero IS the LCP element. `loading="lazy"` defers the one image the metric measures,
    // which is the single most effective way to fail SC-006 while every other page passes.
    expect(img, `${img} lazy-loads the LCP element`).not.toContain('loading="lazy"')
    expect(attr(img, 'fetchpriority'), `${img} does not claim high fetch priority`).toBe('high')
    expect(attr(img, 'decoding')).toBe('async')
  })

  it('renders the art with nearest-neighbour scaling, not the default blur', async () => {
    const img = findTag(await renderHome(), 'img') ?? ''

    // The whole point of pixel art: the browser upscales this 1106px asset to fill a 1440+
    // viewport, and the default bilinear filter turns hard pixel edges into mush.
    expect(
      attr(img, 'style'),
      `${img} does not set image-rendering: pixelated, so the pixel art is smoothed`,
    ).toContain('image-rendering:pixelated')
  })

  it('reserves the space it will occupy', async () => {
    const img = findTag(await renderHome(), 'img') ?? ''

    // No intrinsic size means the hero is 0px tall until it decodes, everything below it jumps,
    // and the LCP candidate can be re-elected mid-load.
    expect(attr(img, 'width'), `${img} declares no width`).toBeDefined()
    expect(attr(img, 'height'), `${img} declares no height`).toBeDefined()
  })

  it('is a server component — the Home ships no client bundle for a picture', () => {
    const source = readFileSync(PAGE_SOURCE, 'utf8')

    expect(
      source.trimStart().startsWith("'use client'") || source.trimStart().startsWith('"use client"'),
      "a 'use client' on the Home turns the hero — an <img> and a <link> — into a client " +
        'bundle that has to load before the LCP element is even in the document (FR-024).',
    ).toBe(false)
  })
})

describe('§2 — the preload (plan § Sketch 8)', () => {
  it('preloads the hero as an image, at high priority', async () => {
    const markup = await renderHome()
    const link = findTag(markup, 'link', 'rel="preload"', 'as="image"')

    expect(
      link,
      'the LCP element is discovered only when the parser reaches the <picture>, which is ' +
        'after the stylesheet has been fetched and parsed. That round trip is what the ' +
        `preload removes — the same hint layout.tsx already spends on the display face.\n${markup}`,
    ).toBeDefined()
    expect(attr(link ?? '', 'fetchpriority'), `${link} does not claim high fetch priority`).toBe(
      'high',
    )
  })

  it('warms the candidate the <picture> will actually choose', async () => {
    const markup = await renderHome()
    const link = findTag(markup, 'link', 'rel="preload"', 'as="image"', 'min-width') ?? ''
    const source = findTag(markup, 'source', 'image/avif', 'min-width') ?? ''

    // A preload naming a single href would warm one width and leave the browser to download a
    // second — the hero paid for twice. `imagesrcset`/`imagesizes` are how a responsive
    // preload picks the same candidate the element will.
    expect(attr(link, 'imagesrcset')).toBe(attr(source, 'srcset'))
    expect(attr(link, 'imagesizes')).toBe(attr(source, 'sizes'))
    // And it must carry the same condition the source does, or it warms the panorama for every
    // viewport — a narrow visitor paying 143 KB for an image that never paints, which is worse
    // than not preloading at all.
    expect(attr(link, 'media')).toBe(attr(source, 'media'))
    // AVIF, not the WebP fallback: preloading the fallback downloads bytes that any browser
    // supporting AVIF will never use, and doubles the hero's cost on the ones that do.
    expect(attr(link, 'type')).toBe('image/avif')
  })
})

describe('§3 — the measured byte counts (T025, SC-006)', () => {
  it('serves every file the markup asks for', async () => {
    const paths = heroPathsIn(await renderHome())

    expect(paths.length, 'the Home requests no hero asset at all').toBeGreaterThan(0)
    for (const path of paths) {
      const served = join(PUBLIC_DIR, path)
      expect(
        existsSync(served),
        `${path} resolves to ${served}, which does not exist. Next serves apps/web/public at ` +
          '/, so the browser gets a 404 — and a 404 on a <source> falls through silently to ' +
          'the fallback, while a 404 on the preload is silent everywhere.',
      ).toBe(true)
    }
  })

  it('weighs exactly what T025 recorded', async () => {
    for (const [path, recorded] of Object.entries(HERO_BYTES)) {
      const actual = statSync(join(PUBLIC_DIR, path)).size
      expect(
        actual,
        `${path} is ${actual} bytes; T025 recorded ${recorded}. The byte counts are a ` +
          'deliverable of that task, so re-encoding the art means re-recording them here — ' +
          'a hero that silently doubled in weight is exactly what this number exists to catch.',
      ).toBe(recorded)
    }
  })

  it('keeps every derivative inside the 4G share the LCP budget can pay for', () => {
    for (const [path, bytes] of Object.entries(HERO_BYTES)) {
      const format = path.split('.').pop() ?? ''
      const ceiling = BYTE_CEILING[format]
      expect(ceiling, `no byte ceiling is recorded for a .${format} hero`).toBeDefined()
      expect(
        bytes,
        `${path} is ${(bytes / 1024).toFixed(0)} KB. At the 1638 kbps profile ` +
          'scripts/lcp-budget.sh throttles to (~205 KB/s) that is ' +
          `${(bytes / 1024 / 205).toFixed(1)}s of a 2.5s budget, before the HTML, the display ` +
          'font or the connection setup.',
      ).toBeLessThanOrEqual(ceiling ?? 0)
    }
  })

  it('earns the AVIF: each one is smaller than the WebP it falls back to', () => {
    for (const width of [1106, 834]) {
      const avif = HERO_BYTES[`/hero/mapa-${width}.avif`] ?? 0
      const webp = HERO_BYTES[`/hero/mapa-${width}.webp`] ?? 0
      expect(
        avif,
        `the ${width}w AVIF (${avif}) is not smaller than the WebP (${webp}). Two formats cost ` +
          'two exports and a <picture>; if the first is not cheaper, the second should just be ' +
          'served to everyone.',
      ).toBeLessThan(webp)
    }
  })
})
