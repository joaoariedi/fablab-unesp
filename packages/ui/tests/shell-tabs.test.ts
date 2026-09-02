import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { DESKTOP_TABS, MENU_TABS, MOBILE_TABS, TABLET_TABS, type ShellTab } from '../src/shell/tabs'

/**
 * T027b / FR-008 — the three shell tab sets, plus the menu set, as data.
 *
 * The order and the membership are decided, not incidental. `concept.md` (designer,
 * 2026-08-23, corrected in rounds 3 and 5) fixes all four sets in one sentence:
 * *"navegação canônica **desktop** … nesta ordem: `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO ·
 * AULAS · INSTAGRAM · ARTIGOS` … nas versões compactas, `BIBLIOTECA 3D` e `INSTAGRAM` saem da
 * barra e vivem no **menu** … **tablet**: `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS`;
 * **mobile (barra inferior)**: `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS · PERFIL`"*.
 * `calendario.md` § `HeaderPrincipal` and `home.md` § `MenuDrawer` restate the same four sets.
 *
 * ── Why this file exists beside `tests/shell.test.ts` ───────────────────────────────────────
 *
 * `shell.test.ts` is T032's deliverable and asserts the sets *through the shell components*
 * once `HeaderNav`/`MobileTabBar`/`MenuSheet` exist. This file is T027b's own RED: it asserts
 * the extracted data on its own, before any component imports it, and it is the test that
 * proves the extraction did what it was for.
 *
 * ── Why the extraction is itself asserted, and not just assumed ─────────────────────────────
 *
 * The reason the sets live in a plain `.ts` rather than inside `HeaderNav.tsx` is mechanical:
 * a test that imports a `.tsx` pulls JSX into Vitest's module graph, and CLR-003 locks the
 * stack — no JSX transform is configured here and no dependency may be added to get one. So
 * "it is a `.ts`" is not a filing convention, it is the acceptance criterion, and the last
 * describe block below reads the module's own source to check that it did not quietly re-open
 * the door by importing a `.tsx` for a type. This very file importing it and running is the
 * other half of that proof.
 */

const TABS_SOURCE_PATH = fileURLToPath(new URL('../src/shell/tabs.ts', import.meta.url))

/** The canonical desktop order, verbatim from `concept.md`. Six items, no menu button. */
const CANONICAL_DESKTOP = [
  'BIBLIOTECA 3D',
  'PROJETOS',
  'CALENDÁRIO',
  'AULAS',
  'INSTAGRAM',
  'ARTIGOS',
] as const

/** The tablet bar: the desktop order minus the two that move into the menu. */
const CANONICAL_TABLET = ['PROJETOS', 'CALENDÁRIO', 'AULAS', 'ARTIGOS'] as const

/** The mobile bottom bar: the tablet four, then `PERFIL` in the fifth position. */
const CANONICAL_MOBILE = ['PROJETOS', 'CALENDÁRIO', 'AULAS', 'ARTIGOS', 'PERFIL'] as const

/** The two that must never appear in a compact bar (US3 error case, SC-005). */
const MENU_ONLY = ['BIBLIOTECA 3D', 'INSTAGRAM'] as const

function labelsOf(tabs: readonly ShellTab[]): string[] {
  return tabs.map((tab) => tab.label)
}

/** Every set in one place, so the shared invariants are swept rather than sampled. */
const ALL_SETS: ReadonlyArray<readonly [name: string, tabs: readonly ShellTab[]]> = [
  ['DESKTOP_TABS', DESKTOP_TABS],
  ['TABLET_TABS', TABLET_TABS],
  ['MOBILE_TABS', MOBILE_TABS],
  ['MENU_TABS', MENU_TABS],
]

describe('desktop set — six tabs in the canonical order (FR-008, SC-004)', () => {
  it('is exactly the designer\'s six, in order', () => {
    // `toEqual` on the whole array rather than membership checks: the order IS the decision
    // ("nesta ordem"), and a set assertion would stay green with AULAS and CALENDÁRIO swapped
    // — which is precisely the drift rounds 2 and 3 had to correct in the mockups.
    expect(labelsOf(DESKTOP_TABS)).toEqual([...CANONICAL_DESKTOP])
  })

  it('has six positions and no more — the desktop bar carries no menu button', () => {
    expect(DESKTOP_TABS).toHaveLength(6)
  })
})

describe('tablet set — four tabs (FR-008, SC-005)', () => {
  it('is exactly PROJETOS · CALENDÁRIO · AULAS · ARTIGOS, in order', () => {
    expect(labelsOf(TABLET_TABS)).toEqual([...CANONICAL_TABLET])
  })

  it('keeps the desktop relative order — round 3 corrected the inverted compact bar', () => {
    // The round-2 mockup ordered the compact bar `PROJETOS · AULAS · CALENDÁRIO · ARTIGOS`.
    // Round 3 fixed it "para seguir a do desktop", so the compact set must be a *subsequence*
    // of the desktop set: same items in the same relative order, just fewer of them. Asserting
    // the literal above alone would not say why that literal is the right one.
    const desktopPositions = labelsOf(TABLET_TABS).map((label) =>
      labelsOf(DESKTOP_TABS).indexOf(label),
    )
    expect(desktopPositions).not.toContain(-1)
    expect([...desktopPositions].sort((a, b) => a - b)).toEqual(desktopPositions)
  })
})

describe('mobile set — five positions ending PERFIL (FR-008, SC-005)', () => {
  it('is exactly the four compact tabs then PERFIL', () => {
    expect(labelsOf(MOBILE_TABS)).toEqual([...CANONICAL_MOBILE])
  })

  it('has five positions, the last of which is PERFIL', () => {
    // The bottom bar is a five-position bar by design; PERFIL is the account entry point on
    // mobile (FR-009), and it is LAST — a PERFIL that drifts to the front is a different bar.
    expect(MOBILE_TABS).toHaveLength(5)
    expect(MOBILE_TABS.at(-1)?.label).toBe('PERFIL')
  })

  it('opens the tablet four in the same order before PERFIL', () => {
    expect(labelsOf(MOBILE_TABS).slice(0, 4)).toEqual(labelsOf(TABLET_TABS))
  })
})

describe('menu set — all the tabs, including the two the compact bars drop (SC-005)', () => {
  it('carries every desktop tab, in the canonical order', () => {
    expect(labelsOf(MENU_TABS)).toEqual([...CANONICAL_DESKTOP])
  })

  it('contains BIBLIOTECA 3D and INSTAGRAM — the menu is the only place they live', () => {
    for (const label of MENU_ONLY) {
      expect(labelsOf(MENU_TABS)).toContain(label)
    }
  })
})

describe('the negative — BIBLIOTECA 3D and INSTAGRAM never reach a compact bar (US3 error case)', () => {
  it('keeps both out of the tablet bar', () => {
    for (const label of MENU_ONLY) {
      expect(labelsOf(TABLET_TABS)).not.toContain(label)
    }
  })

  it('keeps both out of the mobile bottom bar', () => {
    for (const label of MENU_ONLY) {
      expect(labelsOf(MOBILE_TABS)).not.toContain(label)
    }
  })
})

describe('shared invariants across all four sets', () => {
  it.each(ALL_SETS)('%s: every tab carries a non-empty label and href', (_name, tabs) => {
    expect(tabs.length).toBeGreaterThan(0)
    for (const tab of tabs) {
      expect(tab.label.trim()).not.toBe('')
      expect(tab.href.trim()).not.toBe('')
    }
  })

  it.each(ALL_SETS)('%s: no destination appears twice', (_name, tabs) => {
    const hrefs = tabs.map((tab) => tab.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('gives a label the same destination in every set it appears in', () => {
    // The sets overlap by four items. Written as four separate literal arrays they drift
    // silently — PROJETOS pointing at `/projetos` in the header and `/projeto` in the menu
    // renders identically and 404s only for whoever opened the menu.
    const destinationOf = new Map<string, string>()
    for (const [, tabs] of ALL_SETS) {
      for (const { label, href } of tabs) {
        const seen = destinationOf.get(label)
        if (seen === undefined) destinationOf.set(label, href)
        else expect(href, `"${label}" points at two different destinations`).toBe(seen)
      }
    }
  })

  it('keeps every destination inside the app — no organization URL is hardcoded here', () => {
    // `packages/ui` receives resolved values; it never knows an organization's own accounts
    // (FR-018, and the same reasoning as FR-003's per-organization `logoUrl`). An absolute
    // `https://instagram.com/<handle>` written here would send every future organization's
    // visitors to Fab Lab CITe's profile, and it would look correct in every screenshot.
    for (const [name, tabs] of ALL_SETS) {
      for (const { label, href } of tabs) {
        expect(href, `${name} → ${label}`).toMatch(/^\/[a-z0-9-]/)
      }
    }
  })

  it('marks exactly one tab as leaving the site, and it is INSTAGRAM', () => {
    // `concept.md`: *"Instagram | Link externo, abre em nova aba"* — the one tab whose
    // destination is not a page of this site. It is a flag rather than a URL shape precisely
    // because the assertion above forbids the URL from living in this package.
    for (const [name, tabs] of ALL_SETS) {
      const external = tabs.filter((tab) => tab.external === true).map((tab) => tab.label)
      const expected = labelsOf(tabs).includes('INSTAGRAM') ? ['INSTAGRAM'] : []
      expect(external, `${name}: wrong tabs marked external`).toEqual(expected)
    }
  })
})

describe('the extraction itself — a plain .ts, reachable with no JSX transform', () => {
  it('lives at src/shell/tabs.ts', () => {
    expect(existsSync(TABS_SOURCE_PATH), `${TABS_SOURCE_PATH} does not exist`).toBe(true)
  })

  it('imports nothing that resolves to a .tsx', () => {
    // The failure this guards is one `import type { TabItem } from '../components/Tabs'` away.
    // It typechecks, it looks tidy, and under a bundler that does not erase it — or from any
    // consumer that re-exports the module — the JSX file joins the graph and Vitest needs a
    // transform this package is not allowed to add (CLR-003).
    const source = readFileSync(TABS_SOURCE_PATH, 'utf8')
    const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1] ?? '')
    const jsxImports = specifiers.filter((specifier) => {
      if (!specifier.startsWith('.')) return false
      const target = resolve(dirname(TABS_SOURCE_PATH), specifier)
      return specifier.endsWith('.tsx') || existsSync(`${target}.tsx`)
    })
    expect(jsxImports, `tabs.ts imports JSX modules: ${jsxImports.join(', ')}`).toEqual([])
  })

  it('contains no JSX of its own — it is data, not markup', () => {
    const source = readFileSync(TABS_SOURCE_PATH, 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/<\/[A-Za-z]/)
    expect(code).not.toMatch(/<[A-Za-z][^>]*\/>/)
  })
})
