import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * T005 / FR-012 — layout tokens: the three design targets, the spacing scale, the radii
 * and the hard offset shadow.
 *
 * FR-012's wording is the whole point: 390 / 834 / 1440 are *design targets taken from the
 * mockups*, "expressed as tokenised breakpoints rather than magic numbers". So two things
 * have to be true, and only the second one has teeth:
 *
 *   1. the three widths are defined, once each, as named tokens here; and
 *   2. **no other stylesheet in the package invents a width of its own.**
 *
 * (1) alone is the failure family this plan keeps producing — a token that exists, that
 * every component ignores, and that no test can tell apart from one that is used. Plain CSS
 * cannot substitute a custom property into a media query (`@media (min-width: var(--x))`
 * does not resolve; the tokens are declarations, and media queries are evaluated before the
 * cascade), and CLR-003 adds no PostCSS to fix that. So the token cannot enforce itself
 * through the cascade, and the enforcement has to be this test: every pixel width in every
 * media query under `src/` must be one of the three values defined below.
 */

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url))
const LAYOUT_PATH = fileURLToPath(new URL('../src/tokens/layout.css', import.meta.url))

/** The three design targets, in the order the mockups are drawn at. */
const BREAKPOINT_TOKENS = ['--bp-mobile', '--bp-tablet', '--bp-desktop'] as const
const DESIGN_TARGETS = [390, 834, 1440] as const

const SPACING_TOKENS = Array.from({ length: 12 }, (_, i) => `--space-${i + 1}`)

function readLayout(): string {
  return readFileSync(LAYOUT_PATH, 'utf8')
}

/** Comments may say anything — including a number. Strip them before asserting on values. */
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

function pixels(value: string): number {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value)
  expect(match, `expected a px length, got "${value}"`).not.toBeNull()
  return Number(match![1])
}

describe('packages/ui/src/tokens/layout.css', () => {
  it('exists and is readable — styles.css @imports it, and a dangling @import is silent', () => {
    expect(() => readLayout()).not.toThrow()
  })

  it('defines the three design targets as named tokens with the mockup values', () => {
    const tokens = declarations(readLayout())
    const values = BREAKPOINT_TOKENS.map((name) => {
      expect(tokens.has(name), `${name} is not defined`).toBe(true)
      return pixels(tokens.get(name)!)
    })
    expect(values).toEqual([...DESIGN_TARGETS])
  })

  it('defines each design target exactly once — a second definition is a fork', () => {
    const body = stripComments(readLayout())
    for (const target of DESIGN_TARGETS) {
      const occurrences = body.match(new RegExp(`\\b${target}px\\b`, 'g')) ?? []
      expect(occurrences, `${target}px appears ${occurrences.length} times`).toHaveLength(1)
    }
  })

  it('defines a full --space-1 … --space-12 scale, strictly increasing, in px', () => {
    const tokens = declarations(readLayout())
    const scale = SPACING_TOKENS.map((name) => {
      expect(tokens.has(name), `${name} is not defined`).toBe(true)
      return pixels(tokens.get(name)!)
    })
    for (let i = 1; i < scale.length; i++) {
      // A scale that repeats or dips gives two names to one gap, which is the
      // `--color-rosa` mistake in spacing form: picking the wrong one looks identical.
      expect(scale[i]!, `--space-${i + 1} must exceed --space-${i}`).toBeGreaterThan(scale[i - 1]!)
    }
  })

  it('defines --radius-sm and --radius-md, with sm the smaller of the two', () => {
    const tokens = declarations(readLayout())
    expect(tokens.has('--radius-sm'), '--radius-sm is not defined').toBe(true)
    expect(tokens.has('--radius-md'), '--radius-md is not defined').toBe(true)
    expect(pixels(tokens.get('--radius-sm')!)).toBeLessThan(pixels(tokens.get('--radius-md')!))
  })

  it('defines --shadow-hard as a hard offset: a real offset and a zero blur', () => {
    const shadow = declarations(readLayout()).get('--shadow-hard')
    expect(shadow, '--shadow-hard is not defined').toBeDefined()
    // "Hard" is the whole design decision (visual-identity.md § Botões: "sombra dura
    // deslocada"). A blur radius would make it a soft shadow under a token that promises
    // it is not, so the offsets must be non-zero and the third length must be 0.
    const lengths = shadow!.match(/-?\d+(?:\.\d+)?px/g) ?? []
    expect(lengths.length, `expected at least 3 lengths in "${shadow}"`).toBeGreaterThanOrEqual(3)
    // Guarded by the length assertion directly above.
    expect(Number.parseFloat(lengths[0]!)).not.toBe(0)
    expect(Number.parseFloat(lengths[1]!)).not.toBe(0)
    expect(Number.parseFloat(lengths[2]!), 'blur must be 0 for a hard shadow').toBe(0)
  })

  it('takes its shadow colour from a palette token, never a literal', () => {
    const shadow = declarations(readLayout()).get('--shadow-hard') ?? ''
    expect(shadow).toMatch(/var\(--color-[a-z-]+\)/)
  })

  it('declares tokens only — no selector here may style anything', () => {
    // Same guardrail as styles.css: `tokens/` is exempt from the colour fence, so a rule
    // that actually paints something would hide here where nothing scans it.
    const body = stripComments(readLayout())
    const selectors = [...body.matchAll(/([^{}]+)\{/g)].map((m) => m[1]!.trim())
    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) {
      expect(selector, `${selector} is not a token-defining selector`).toMatch(/^:root$/)
    }
  })

  it('is the only source of breakpoint widths: no media query under src/ invents one', () => {
    const allowed = new Set(DESIGN_TARGETS.map(String))
    const offenders: string[] = []
    for (const file of cssFilesUnder(SRC_DIR)) {
      const body = stripComments(readFileSync(file, 'utf8'))
      for (const query of body.matchAll(/@media[^{]+/g)) {
        for (const width of query[0].matchAll(/(\d+(?:\.\d+)?)px/g)) {
          if (!allowed.has(width[1]!)) offenders.push(`${file}: ${query[0].trim()}`)
        }
      }
    }
    expect(offenders, 'media queries must use the 390 / 834 / 1440 targets').toEqual([])
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
