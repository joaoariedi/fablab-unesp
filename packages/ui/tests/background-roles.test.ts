import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * T036 / FR-011 — the background *roles*, and the two light surfaces that are not the same colour.
 *
 * FR-011 states four background rules and one persistence rule:
 *
 *   1. navy is the base;
 *   2. Biblioteca 3D and Aulas use a **white** content area;
 *   3. onboarding and Minha Conta use a **light** background; and
 *   4. the teal band persists on those pages, its items acting as filter tags.
 *
 * Rules 2 and 3 are the ones a token layer gets wrong. `docs/product/visual-identity.md`
 * § Paleta names them separately — "fundo branco" for the content area, "fundo claro" for
 * onboarding and Minha Conta — and they are different colours: `#FFFFFF` and `--color-claro`
 * (`#DCE7E3`). Collapsing them into one token renders *almost* right on every page, which is
 * the failure nobody reports: no test can distinguish a deliberate white from a light surface
 * once one name carries both. So both roles exist here and this file asserts they differ.
 *
 * Rule 4 is why `--surface-band` is a role of its own rather than a shade of the page. The
 * band *persists* onto the white and light pages, so a band that resolved through
 * `--surface-page` would turn white with them and the filter tags would vanish.
 *
 * ── Why role names at all (contracts/tokens.md § Colour) ────────────────────────────────────
 *
 * "Backgrounds are named by role rather than colour, so the white-background pages do not need
 * per-page overrides." A page sets `--surface-page` for its region and everything derived from
 * it follows — which is exactly why `--surface-card` is derived and `--surface-band` is not.
 */

const PALETTE_PATH = fileURLToPath(new URL('../src/tokens/palette.css', import.meta.url))

/** The white of the Biblioteca 3D / Aulas content area. Not a palette colour — see below. */
const WHITE = '#FFFFFF'

/** Comments may say anything, including a hex or a token name. Strip them before parsing. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Every `--token: value;` declaration in the file, as a map. Last write wins, as in CSS. */
function declarations(): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of stripComments(readFileSync(PALETTE_PATH, 'utf8')).matchAll(
    /(--[a-z0-9-]+)\s*:\s*([^;}]+)/g,
  )) {
    found.set(match[1]!, match[2]!.trim())
  }
  return found
}

/** The token a `var(--x)` value names, or `null` when the value is a literal. */
function referencedToken(value: string): string | null {
  return /^var\(\s*(--[a-z0-9-]+)\s*\)$/.exec(value)?.[1] ?? null
}

/** The role tokens FR-011 and `contracts/tokens.md` § Colour put on the package's surface. */
const ROLE_TOKENS = [
  '--surface-page',
  '--surface-card',
  '--surface-inverted',
  '--surface-light',
  '--surface-band',
  '--text-on-dark',
  '--text-on-light',
] as const

describe('background roles (T036 / FR-011)', () => {
  it('defines every role token — a background named by colour needs a per-page override', () => {
    const tokens = declarations()
    const missing = ROLE_TOKENS.filter((name) => !tokens.has(name))
    expect(missing, `role tokens palette.css does not define: ${missing.join(', ')}`).toEqual([])
  })

  it('bases the page on navy', () => {
    expect(declarations().get('--surface-page')).toBe('var(--color-navy)')
  })

  it('makes the inverted surface white — the Biblioteca 3D and Aulas content area', () => {
    // `#FFFFFF` is deliberately a literal and not a palette token: `palette.css` defines the
    // seven identity colours of FR-001 and white is not one of them, so a `--color-white`
    // would be an eighth colour smuggled into the palette (and `token-data.test.ts` would then
    // demand a `PALETTE.white` entry for a colour the identity does not contain).
    expect(declarations().get('--surface-inverted')!.toUpperCase()).toBe(WHITE)
  })

  it('makes the light surface claro — onboarding and Minha Conta', () => {
    expect(declarations().get('--surface-light')).toBe('var(--color-claro)')
  })

  it('keeps white and light apart: FR-011 names two surfaces, not one', () => {
    // The whole reason both tokens exist. If they ever resolve to the same thing, every
    // assertion above still passes and the distinction the requirement draws is gone.
    const tokens = declarations()
    expect(tokens.get('--surface-inverted')).not.toBe(tokens.get('--surface-light'))
  })

  it('gives the teal band its own role, so it survives onto the light pages', () => {
    // FR-011: "the teal band persists on those pages and its items act as filter tags". A band
    // resolved through `--surface-page` would go white with the content area underneath it and
    // the filter tags would disappear on exactly the two pages that need them.
    const tokens = declarations()
    expect(tokens.get('--surface-band')).toBe('var(--color-teal)')
    expect(referencedToken(tokens.get('--surface-band')!)).not.toBe('--surface-page')
  })

  it('derives the card from the page, so an inverted region needs no card override', () => {
    // visual-identity.md § Cards: on the white background "os cards são brancos com contorno
    // azul navy escuro e sombra" — the card is the page colour, separated by outline and the
    // hard shadow rather than by fill. Deriving it is what makes that free for a region that
    // only re-declares `--surface-page`.
    expect(declarations().get('--surface-card')).toBe('var(--surface-page)')
  })

  it('puts navy on the light surfaces and claro on the dark one (FR-017)', () => {
    // visual-identity.md § Paleta, round 2: "sobre fundo branco, os textos usam azul navy
    // escuro (não usar rosa em texto pequeno sobre branco)". Both directions are documented
    // AA pairs in `tokens/index.ts`; these two tokens are how a component gets them right
    // without picking a colour.
    const tokens = declarations()
    expect(tokens.get('--text-on-light')).toBe('var(--color-navy)')
    expect(tokens.get('--text-on-dark')).toBe('var(--color-claro)')
  })

  it('lets no role token reach for the private raw pink (CLR-001, FR-017)', () => {
    // A pink text role would be unenforceable by the colour fence — `tokens/` is its one
    // exemption — and small pink on white is the pair FR-017 forbids outright.
    const tokens = declarations()
    const pink = ROLE_TOKENS.filter((name) => (tokens.get(name) ?? '').includes('rosa'))
    expect(pink, `role tokens naming the raw pink: ${pink.join(', ')}`).toEqual([])
  })

  it('references only tokens palette.css declares — a dangling var() is silent', () => {
    // `var(--surface-inverse)` resolves to nothing and paints nothing; the cascade reports no
    // error. A typo in a role token would therefore ship an unstyled page and a green suite.
    const tokens = declarations()
    const dangling = ROLE_TOKENS.map((name) => referencedToken(tokens.get(name) ?? ''))
      .filter((referenced): referenced is string => referenced !== null)
      .filter((referenced) => !tokens.has(referenced))
    expect(dangling, `role tokens pointing at nothing: ${dangling.join(', ')}`).toEqual([])
  })

  it('writes the white exactly once — a second literal is a fork', () => {
    const occurrences = stripComments(readFileSync(PALETTE_PATH, 'utf8')).match(/#FFFFFF/gi) ?? []
    expect(occurrences, `#FFFFFF appears ${occurrences.length} times`).toHaveLength(1)
  })
})
