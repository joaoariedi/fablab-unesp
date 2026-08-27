import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * T001d / FR-001 — `src/styles.css` is the entry the `./styles.css` export points at.
 *
 * The app gets ONE stylesheet import; this file is what makes that true. It is an
 * aggregator and nothing else: three `@import`s, no declarations of its own. A rule
 * written here would be a token defined outside `tokens/`, invisible to the colour
 * fence (T007b scans `.css` outside `tokens/`) — so "imports only" is a guardrail,
 * not tidiness.
 */

const STYLES_PATH = fileURLToPath(new URL('../src/styles.css', import.meta.url))

/** In cascade order: palette defines the colours the other two may reference. */
const EXPECTED_IMPORTS = [
  './tokens/palette.css',
  './tokens/typography.css',
  './tokens/layout.css',
]

/** `@import url('x')`, `@import "x"` and `@import 'x';` all reduce to the path. */
const IMPORT_RE = /@import\s+(?:url\(\s*)?["']([^"']+)["']/g

function readStyles(): string {
  return readFileSync(STYLES_PATH, 'utf8')
}

/** Comments may legitimately contain anything; strip them before looking for rules. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('packages/ui/src/styles.css', () => {
  it('exists and is readable — the ./styles.css export must resolve to a real file', () => {
    expect(() => readStyles()).not.toThrow()
  })

  it('imports palette, typography and layout, in that order and nothing else', () => {
    const paths = [...readStyles().matchAll(IMPORT_RE)].map((m) => m[1])
    expect(paths).toEqual(EXPECTED_IMPORTS)
  })

  it('carries no rules of its own — a declaration here would be a token outside tokens/', () => {
    const withoutImports = stripComments(readStyles()).replace(IMPORT_RE, '')
    // Anything left that is not whitespace or a stray `;`/`)` from a stripped import
    // is a selector, an at-rule or a declaration — all of which belong in tokens/.
    expect(withoutImports.replace(/[\s;)]/g, '')).toBe('')
  })

  it('imports only relative paths under ./tokens/ — no package or absolute URL', () => {
    const paths = [...readStyles().matchAll(IMPORT_RE)].map((m) => m[1])
    expect(paths.length).toBeGreaterThan(0)
    for (const path of paths) {
      expect(path).toMatch(/^\.\/tokens\/[a-z-]+\.css$/)
    }
  })
})
