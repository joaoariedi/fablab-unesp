import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * T004 / FR-001, CLR-001 — the palette as custom properties, and the one token that varies.
 *
 * Two invariants, and the second is the one with teeth:
 *
 *   1. the seven palette colours from FR-001 are defined here, once each; and
 *   2. **exactly one of them is per-organization**, and the pink is not reachable.
 *
 * CLR-001 splits the palette into platform-fixed colours and a single per-organization
 * accent. The failure mode it guards against is invisible: a CTA painted with the raw pink
 * renders *identically* to one painted with `--color-primary` for CITe — the default makes
 * them the same colour — passes every test, and fails to co-brand only once a second
 * organization exists. So the raw pink is named `--color-rosa-raw`, there is no
 * `--color-rosa` for anything to reach for, and this file is the only place the raw token
 * may appear at all.
 *
 * The lint half of that fence (T007/T007b) rejects the token in TypeScript and in CSS
 * outside `tokens/`. This test asserts the half that lives in the stylesheet: the token
 * shape, and that no other stylesheet in the package has started using it.
 */

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url))
const PALETTE_PATH = fileURLToPath(new URL('../src/tokens/palette.css', import.meta.url))

/** FR-001, verbatim. The 2026-08-23 decision makes these definitive. */
const PLATFORM_COLOURS: ReadonlyArray<readonly [string, string]> = [
  ['--color-navy', '#191C37'],
  ['--color-azul', '#3760AA'],
  ['--color-teal', '#74B7A5'],
  ['--color-amarelo', '#F8C810'],
  ['--color-laranja', '#EE703E'],
  ['--color-claro', '#DCE7E3'],
]

/** PRIVATE (CLR-001). The default for `--color-primary`, never the accent itself. */
const RAW_PINK = '#EE9DC4'

function readPalette(): string {
  return readFileSync(PALETTE_PATH, 'utf8')
}

/** Comments may say anything — including a hex, or the banned token name. Strip them first. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Every `--token: value;` declaration in the file, as a map. Last write wins, as in CSS. */
function declarations(css: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of stripComments(css).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
    found.set(match[1]!, match[2]!.trim())
  }
  return found
}

describe('packages/ui/src/tokens/palette.css', () => {
  it('exists and is readable — styles.css @imports it, and a dangling @import is silent', () => {
    expect(() => readPalette()).not.toThrow()
  })

  it('defines the six platform-fixed colours with the FR-001 values', () => {
    const tokens = declarations(readPalette())
    for (const [name, hex] of PLATFORM_COLOURS) {
      expect(tokens.has(name), `${name} is not defined`).toBe(true)
      expect(tokens.get(name)!.toUpperCase(), `${name} has the wrong value`).toBe(hex)
    }
  })

  it('defines the raw pink as --color-rosa-raw, the private default accent', () => {
    const tokens = declarations(readPalette())
    expect(tokens.has('--color-rosa-raw'), '--color-rosa-raw is not defined').toBe(true)
    expect(tokens.get('--color-rosa-raw')!.toUpperCase()).toBe(RAW_PINK)
  })

  it('defaults --color-primary to var(--color-rosa-raw), so an unthemed page is correct', () => {
    // FR-004: the default must cost no extra code path. `layout.tsx` overrides this one
    // declaration and nothing else; a page that never sets it is already CITe-branded.
    const primary = declarations(readPalette()).get('--color-primary')
    expect(primary, '--color-primary is not defined').toBeDefined()
    expect(primary).toMatch(/^var\(\s*--color-rosa-raw\s*\)$/)
  })

  it('has no --color-rosa: there is nothing for a component to reach for', () => {
    // The rename *is* the enforcement (contract § "There is no --color-rosa"). If the
    // public name comes back, the convention is back with it and the lint rule guards a
    // token nobody needs to use.
    const body = stripComments(readPalette())
    expect(declarations(body).has('--color-rosa'), '--color-rosa is defined').toBe(false)
    expect(body, 'something references var(--color-rosa)').not.toMatch(/var\(\s*--color-rosa\s*[,)]/)
  })

  it('defines each colour exactly once — a second literal is a fork', () => {
    const body = stripComments(readPalette())
    for (const hex of [...PLATFORM_COLOURS.map(([, value]) => value), RAW_PINK]) {
      const occurrences = body.match(new RegExp(hex, 'gi')) ?? []
      expect(occurrences, `${hex} appears ${occurrences.length} times`).toHaveLength(1)
    }
  })

  it('is the only stylesheet allowed to name the private token', () => {
    // CLR-001's silent failure, caught in the file type it would actually be written in:
    // component styling is CSS Modules, and a `var(--color-rosa-raw)` there renders
    // identically to `var(--color-primary)` for the only organization that exists today.
    const offenders = cssFilesUnder(SRC_DIR)
      .filter((file) => file !== PALETTE_PATH)
      .filter((file) => stripComments(readFileSync(file, 'utf8')).includes('--color-rosa-raw'))
    expect(offenders, 'the raw pink is private: use --color-primary').toEqual([])
  })

  it('names the private token exactly twice: its definition and the --color-primary default', () => {
    // Anything more is a second consumer inside `tokens/`, which is where the fence cannot
    // see it — `tokens/**` is exempt from both halves of the colour rule by design.
    const uses = stripComments(readPalette()).match(/--color-rosa-raw/g) ?? []
    expect(uses).toHaveLength(2)
  })

  it('declares tokens only — no selector here may style anything', () => {
    // `tokens/` is exempt from the colour fence, so a rule that actually paints something
    // would hide here where nothing scans it. Same guardrail as layout.css and styles.css.
    const body = stripComments(readPalette())
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
