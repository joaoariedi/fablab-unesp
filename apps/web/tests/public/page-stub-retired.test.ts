import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T029 / FR-001, SC-001 — `PageStub` has no importer left among the five routes it was
 * written for.
 *
 * `spec.md` FR-001: *"The five placeholder routes from feature 001 render real pages;
 * `PageStub` has no remaining importer among them"*, and SC-001 asks for *"no `PageStub`
 * text anywhere"* on the six public pages. `checklists/requirements.md` CHK001 asks the
 * question this file answers: *"Is 'no remaining importer of `PageStub`' checkable by a
 * command rather than by reading?"* — until now it was not. Three of the five listings
 * (`artigos`, `aulas`, `biblioteca-3d`) each carry a one-line assertion inside their own
 * suite; `projetos` and `calendario` carry none, and nothing at all watched the tree as a
 * whole. A requirement about a *set* of routes needs a check that sees the set: a per-page
 * assertion cannot notice a route that was never given one, and that is exactly the gap a
 * regression would fall into.
 *
 * ── Why an account route is allowed to keep the stub ────────────────────────────────────
 *
 * `PageStub` is not dead code and this gate must not pretend it is. Feature 001 gave seven
 * routes a placeholder (`git show b8987e6` — `artigos`, `aulas`, `biblioteca-3d`,
 * `calendario`, `login`, `minha-conta`, `projetos`), because *"until a route file exists,
 * every tab in the shell is a 404"*. Feature 003's scope is the public pages, so it fills
 * five of them; the account routes belong to the account work and stayed stubs deliberately.
 * Asserting "no importer anywhere" would therefore be asserting something this feature never
 * claimed — a gate holding a wrong claim is worse than no gate.
 *
 * **004 T013 filled `/login` and 004 T034 filled `/minha-conta`**, so the inventory below is now
 * empty. That is the shape this gate was built for and not a weakening of it: an exact set with
 * nothing in it is the strictest this rule has ever been, and a placeholder coming back on any
 * page — or a new route shipped as one — still fails.
 *
 * **The vacuity probe had to change with it.** It used to read the one route still holding the
 * stub, which is no longer a thing that exists; deleting the probe would leave the inventory
 * rule free to go green on a scan that reads nothing, which is the failure it was added to
 * prevent. So it now exercises {@link importsPageStub} against sources it constructs — both
 * spellings that must be caught, and a page that merely mentions the word in prose, which must
 * not be. The detector is proven by what it answers, rather than by a stub nobody wants back.
 *
 * So the shape here is an *inventory*, not a ban: the set of files that reach for the stub
 * must be exactly the account routes still waiting for their feature. A stub reintroduced on
 * a public page fails; a brand-new route quietly shipped with a placeholder fails too, which
 * a hardcoded list of five would have missed.
 */

const FRONTEND_DIR = fileURLToPath(new URL('../../app/(frontend)', import.meta.url))

/**
 * The five routes feature 001 stubbed and feature 003 owns, named rather than derived.
 *
 * Deriving them from the shell's tab data (the way `nav-routes.test.ts` does) would make
 * the gate agree with whatever the tabs happen to say — and FR-001 is a claim about a fixed
 * historical set, not about today's navigation. `routeSourcesExist` below keeps the naming
 * honest: a renamed or deleted route fails loudly instead of dropping out of the check.
 */
const ROUTES_FEATURE_003_FILLED = [
  'projetos',
  'artigos',
  'aulas',
  'biblioteca-3d',
  'calendario',
] as const

/** The routes whose placeholder is still correct — **none**. `/login` left this list when 004
 *  T013 replaced its stub with the real form, and `/minha-conta` when 004 T034 replaced its own
 *  with the avatar, the skills panel and the maker's own content. Kept as a named constant
 *  rather than inlined as `[]`: the next feature that stubs a route ahead of itself declares it
 *  here, which is the conversation this inventory exists to force. */
const ROUTES_STILL_AWAITING_THEIR_FEATURE: readonly string[] = []

/**
 * True when a module reaches for the placeholder — by identifier or by module specifier.
 *
 * Both spellings are checked because either one alone is evadable: an `import * as stub`
 * carries no `PageStub` identifier, and a re-export through some future barrel file carries
 * no `page-stub` path. Neither is hypothetical enough to leave open in a gate whose whole
 * job is to notice a placeholder coming back.
 */
function importsPageStub(source: string): boolean {
  return /\bPageStub\b/.test(source) || /page-stub/.test(source)
}

/** Every `.tsx` under `app/(frontend)`, as paths relative to it, with `/` separators. */
function frontendModules(): string[] {
  return readdirSync(FRONTEND_DIR, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.tsx'))
    .map((entry) => relative('', entry).split(sep).join('/'))
    .sort()
}

/** The relative paths of the frontend modules that still reach for the placeholder. */
function modulesImportingPageStub(): string[] {
  return frontendModules().filter((module) =>
    importsPageStub(readFileSync(join(FRONTEND_DIR, module), 'utf8')),
  )
}

describe('the placeholder is retired from the pages feature 003 owns (FR-001, SC-001)', () => {
  it('finds all five route files where the requirement says they are', () => {
    const missing = ROUTES_FEATURE_003_FILLED.filter(
      (route) => !existsSync(join(FRONTEND_DIR, route, 'page.tsx')),
    )

    expect(
      missing,
      'FR-001 names five routes from feature 001, and these have no `page.tsx`:\n  ' +
        `${missing.join('\n  ')}\n` +
        'A renamed route would otherwise pass every assertion below by not existing.',
    ).toEqual([])
  })

  it('leaves no importer of `PageStub` among the five', () => {
    const offenders = ROUTES_FEATURE_003_FILLED.filter((route) =>
      importsPageStub(readFileSync(join(FRONTEND_DIR, route, 'page.tsx'), 'utf8')),
    )

    expect(
      offenders,
      'these routes still render the feature-001 placeholder:\n  ' +
        `${offenders.join('\n  ')}\n` +
        'FR-001: the five placeholder routes render real pages, and SC-001 wants no ' +
        '`PageStub` text anywhere across the six public pages.',
    ).toEqual([])
  })

  it('accounts for every remaining importer in the frontend tree, not just the five', () => {
    expect(
      modulesImportingPageStub(),
      'the placeholder survives only where its feature has not shipped, and no route is ' +
        'waiting any more (`/login` shipped in 004 T013, `/minha-conta` in 004 T034). Any ' +
        'module listed here is either a page that regressed, or a new route that shipped as ' +
        'a stub.',
    ).toEqual(ROUTES_STILL_AWAITING_THEIR_FEATURE)
  })

  it('detects a real importer — the rule above would pass vacuously on a broken scan', () => {
    const modules = frontendModules()

    expect(modules.length, 'the scan found no frontend modules at all').toBeGreaterThan(10)
    expect(
      modules,
      'the five routes must be inside what the scan reads, or the inventory rule ' +
        'above is asserting nothing about them',
    ).toEqual(expect.arrayContaining(ROUTES_FEATURE_003_FILLED.map((r) => `${r}/page.tsx`)))
    // No route holds the stub any more, so the detector is proven against sources built here —
    // both evadable spellings it must catch, and the false positive it must not raise.
    expect(
      importsPageStub("import { PageStub } from '../../../lib/page-stub'"),
      'the detector no longer recognises an import of the placeholder, so a stub coming back ' +
        'on any page would read as clean',
    ).toBe(true)
    expect(
      importsPageStub("import * as stub from '../../lib/page-stub'"),
      'the detector misses a namespace import, which carries no `PageStub` identifier — the ' +
        'reason it checks the module specifier as well',
    ).toBe(true)
    expect(
      importsPageStub('export default function Page() { return <p>Página real</p> }'),
      'the detector fires on a page that never mentions the placeholder, which would make the ' +
        'inventory above unsatisfiable rather than strict',
    ).toBe(false)
  })
})
