import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * T010 / FR-005, CLR-002 — the two `@font-face` declarations and the two family tokens.
 *
 * Three things can go wrong here and none of them is visible in a rendered page, which is
 * why each gets its own assertion rather than a "the tokens exist" check:
 *
 *   1. **A `url()` nothing serves.** A `@font-face` whose file is missing fails silently —
 *      the browser drops to the next family in the stack and the page still looks fine to
 *      whoever wrote the CSS. Sketch 8 fixes the location (`apps/web/public/fonts/`, served
 *      at `/fonts/`); this test resolves every `url()` against that directory on disk, so a
 *      typo or a moved asset is red rather than a quiet fallback.
 *   2. **A face with no `font-display`.** The default is `auto`, which in practice blocks
 *      text for up to 3s. `swap` is a stated requirement, not a preference (FR-005), and
 *      omitting it changes nothing a screenshot would catch on a warm cache.
 *   3. **A third family token.** CLR-002 deleted `--font-logotype` because with SquareFont
 *      gone it would hold the same value as `--font-display` — the `--color-rosa` trap in
 *      typography form: a component picking the wrong one renders identically, so no test
 *      downstream could ever tell. The only defence is that the name does not exist.
 */

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url))
const TYPOGRAPHY_PATH = fileURLToPath(new URL('../src/tokens/typography.css', import.meta.url))
/** Where Next serves `/fonts/` from (Sketch 8). T009 puts the converted WOFF2 here. */
const PUBLIC_FONTS_DIR = fileURLToPath(new URL('../../../apps/web/public/fonts', import.meta.url))

const FAMILY_TOKENS = ['--font-display', '--font-body'] as const

function readTypography(): string {
  return readFileSync(TYPOGRAPHY_PATH, 'utf8')
}

/** Comments may name anything — a deleted token, a face we do not ship. Strip them first. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Every `--token: value;` declaration in the file, as a map. Last write wins, as in CSS. */
function declarations(css: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of stripComments(css).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
    // Both groups are mandatory in the pattern above, so the assertions are safe. They are
    // required because the package typechecks tests/ under noUncheckedIndexedAccess (T001c).
    found.set(match[1]!, match[2]!.trim())
  }
  return found
}

/** The body of each `@font-face { … }` block, comments already removed. */
function fontFaceBlocks(css: string): string[] {
  return [...stripComments(css).matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]!)
}

/** One descriptor out of a `@font-face` body, e.g. `font-family` → `'Comfortaa'`. */
function descriptor(block: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(block)
  return match?.[1]?.trim()
}

/** Font families in a stack, unquoted: `'Comfortaa', system-ui` → `['Comfortaa', 'system-ui']`. */
function families(stack: string): string[] {
  return stack
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

describe('packages/ui/src/tokens/typography.css', () => {
  it('exists and is readable — styles.css @imports it, and a dangling @import is silent', () => {
    expect(() => readTypography()).not.toThrow()
  })

  it('declares exactly two faces — Aldo the Apache and Comfortaa (CLR-002)', () => {
    const declared = fontFaceBlocks(readTypography()).map((block) =>
      families(descriptor(block, 'font-family') ?? '')[0],
    )
    // Sorted so the assertion is about the set, not the order the blocks happen to be in.
    expect([...declared].sort()).toEqual(['Aldo the Apache', 'Comfortaa'])
  })

  it('gives every face font-display: swap — the default `auto` blocks text for seconds', () => {
    const blocks = fontFaceBlocks(readTypography())
    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) {
      const family = descriptor(block, 'font-family') ?? '(unnamed)'
      expect(descriptor(block, 'font-display'), `${family} has no font-display`).toBe('swap')
    }
  })

  it('serves every face from an absolute /fonts/ url in woff2 — no bundler resolves it', () => {
    for (const block of fontFaceBlocks(readTypography())) {
      const src = descriptor(block, 'src')
      expect(src, `${descriptor(block, 'font-family')} has no src`).toBeDefined()
      const urls = [...src!.matchAll(/url\((['"]?)([^'")]+)\1\)/g)].map((m) => m[2])
      expect(urls.length, `expected at least one url() in "${src}"`).toBeGreaterThan(0)
      for (const url of urls) {
        // Relative here would make packages/ui need an asset pipeline it does not have.
        expect(url, 'font url must be absolute').toMatch(/^\/fonts\//)
        expect(url, 'only WOFF2 ships').toMatch(/\.woff2$/)
      }
      expect(src).toMatch(/format\((['"]?)woff2\1\)/)
    }
  })

  it('points every url() at a file that actually exists — a missing face fails silently', () => {
    const missing: string[] = []
    for (const block of fontFaceBlocks(readTypography())) {
      for (const match of (descriptor(block, 'src') ?? '').matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
        const url = match[2]!
        const served = join(PUBLIC_FONTS_DIR, url.replace(/^\/fonts\//, ''))
        if (!existsSync(served)) missing.push(url)
      }
    }
    expect(missing, `no file under apps/web/public/fonts/ serves these`).toEqual([])
  })

  it('defines --font-display as Aldo over a condensed-sans fallback stack (FR-005)', () => {
    const stack = declarations(readTypography()).get('--font-display')
    expect(stack, '--font-display is not defined').toBeDefined()
    const stackFamilies = families(stack!)
    expect(stackFamilies[0]).toBe('Aldo the Apache')
    // FR-005 names the fallback shape: display → condensed sans. A stack of one family is
    // no fallback at all, and a generic terminator is what stops the browser guessing.
    expect(stackFamilies.length, `no fallback declared in "${stack}"`).toBeGreaterThan(2)
    expect(stackFamilies.slice(1).some((f) => /narrow|condensed/i.test(f))).toBe(true)
    expect(stackFamilies.at(-1)).toBe('sans-serif')
  })

  it('defines --font-body as Comfortaa over system-ui, sans-serif (FR-005)', () => {
    const stack = declarations(readTypography()).get('--font-body')
    expect(stack, '--font-body is not defined').toBeDefined()
    expect(families(stack!)).toEqual(['Comfortaa', 'system-ui', 'sans-serif'])
  })

  it('names no family it does not ship: every token stack starts with a declared face', () => {
    const css = readTypography()
    const shipped = new Set(
      fontFaceBlocks(css).map((block) => families(descriptor(block, 'font-family') ?? '')[0]),
    )
    for (const token of FAMILY_TOKENS) {
      const first = families(declarations(css).get(token) ?? '')[0]
      expect(shipped.has(first), `${token} leads with "${first}", which no @font-face declares`)
        .toBe(true)
    }
  })

  it('defines no --font-logotype anywhere under src/ — it would alias --font-display', () => {
    // CLR-002. Checked across the package, not just this file: the point is that the *name*
    // is unavailable to reach for, so a component cannot pick the wrong one of two equal
    // tokens. Deleting it here and reintroducing it in a component stylesheet is the case.
    const offenders = cssFilesUnder(SRC_DIR).filter((file) =>
      stripComments(readFileSync(file, 'utf8')).includes('--font-logotype'),
    )
    expect(offenders, '--font-logotype was deleted from the token contract').toEqual([])
  })

  it('is the only stylesheet under src/ that declares a face', () => {
    const offenders = cssFilesUnder(SRC_DIR).filter(
      (file) => file !== TYPOGRAPHY_PATH && stripComments(readFileSync(file, 'utf8')).includes('@font-face'),
    )
    expect(offenders, '@font-face belongs to the token layer alone').toEqual([])
  })

  it('declares tokens only — no selector here may style anything', () => {
    // `tokens/` is exempt from the colour fence, so a rule that actually paints something
    // would hide here where nothing scans it. Same guardrail as layout.css.
    const body = stripComments(readTypography()).replace(/@font-face\s*\{[^}]*\}/g, '')
    const selectors = [...body.matchAll(/([^{}]+)\{/g)].map((m) => m[1]!.trim())
    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) {
      expect(selector, `${selector} is not a token-defining selector`).toMatch(/^:root$/)
    }
  })
})

/** Walked rather than globbed: `tests/` may use `node:fs` (T003 scopes purity to `src/`). */
function cssFilesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...cssFilesUnder(full))
    else if (entry.name.endsWith('.css')) out.push(full)
  }
  return out
}
