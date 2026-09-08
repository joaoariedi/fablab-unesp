import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * US7 / FR-016 — a component added here must reach the workbench, and this is where you find out.
 *
 * ── Why this gate is duplicated on purpose ──────────────────────────────────────────────────
 *
 * `apps/web/tests/workbench.test.ts` §3 already asserts exactly this, and asserts it better: it
 * *renders* the page and walks the tree, where this file can only read text. This one exists
 * because of **where** it fails, not what it checks.
 *
 * Measured, four times, across two features: a component is written in `packages/ui`, its author
 * runs `packages/ui`'s suite — the natural thing to do, and 817 tests of it — and ships. The
 * gate that catches the omission lives in the *other* package, so it is invisible from the
 * directory the work happened in. Each time, the rejection was the same four assertions:
 *
 *   * feature 003 run 2, T011 — `CardProjeto`, `EmptyState`, `ListingGrid`
 *   * feature 003 run 3, T010 — `Pagination`
 *   * feature 003 run 5, T021 — `ModelViewer`
 *   * feature 003 run 5, T023 — `CalendarDayPanel`
 *
 * By the third occurrence it was written in `tasks.md` and restated in the launch note, and it
 * happened twice more. A convention with no mechanism behind it produces exactly that — the
 * same conclusion `component-barrel.test.ts` records for the barrel, in the same words.
 *
 * ── Why reading the file is enough, and where it stops ──────────────────────────────────────
 *
 * This cannot prove a specimen shows a component's *states*, or that it renders at three
 * breakpoints; §3 and §4 of the web-side gate own those, and this file deliberately does not
 * restate them. It answers one question — "is this component mentioned in the workbench at
 * all?" — early enough to be useful. A green run here is not a claim that the workbench is
 * right; a red one is a claim that it is definitely wrong.
 *
 * Reading across the workspace rather than importing it: `pagination.test.ts` reads
 * `apps/web/lib/public/listing.ts` the same way, for the same reason — a constant that must
 * agree with one in another package is held together by a test, not by a dependency edge that
 * the purity boundary forbids.
 */

const UI_SRC = fileURLToPath(new URL('../src', import.meta.url))
const WORKBENCH = fileURLToPath(
  new URL('../../../apps/web/app/(frontend)/workbench/page.tsx', import.meta.url),
)

/** The same three directories `apps/web/tests/workbench.test.ts` derives its list from. */
const COMPONENT_DIRS = ['components', 'shell', 'shapes']

/** Every component the library ships, by name. Derived from the directory, never listed. */
function libraryComponents(): string[] {
  return COMPONENT_DIRS.flatMap((dir) =>
    readdirSync(`${UI_SRC}/${dir}`)
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => name.replace(/\.tsx$/, '')),
  ).sort()
}

/** The names imported from `@fablab/ui` by the workbench page. */
function importedByWorkbench(source: string): Set<string> {
  const names = new Set<string>()
  for (const block of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@fablab\/ui'/g)) {
    for (const name of block[1]!.split(',')) names.add(name.trim().replace(/^type\s+/, ''))
  }
  return names
}

describe('US7 — every component reaches the workbench (packages/ui side)', () => {
  it('can see the workbench page at all', () => {
    // Without this the two assertions below pass vacuously the day the route moves, which is
    // the failure mode of every cross-package path in this repo.
    expect(
      existsSync(WORKBENCH),
      `no workbench page at ${WORKBENCH}. If the route moved, move this path with it — a gate ` +
        'reading a file that is not there is not a gate.',
    ).toBe(true)
  })

  it('finds components to check, so an empty library cannot satisfy the rule', () => {
    expect(libraryComponents().length).toBeGreaterThan(5)
  })

  it('names every component of the library somewhere in the workbench', () => {
    const source = readFileSync(WORKBENCH, 'utf8')
    const imported = importedByWorkbench(source)
    const missing = libraryComponents().filter((name) => !imported.has(name))

    expect(
      missing,
      `these components are in packages/ui/src and are not imported by the workbench: ` +
        `${missing.join(', ')}.\n\n` +
        'US7 is "every component is visible in its states at all three breakpoints", so a ' +
        'component the workbench omits is one nobody reviews. Add a specimen to ' +
        'apps/web/app/(frontend)/workbench/page.tsx — in its states, not one apiece — and note ' +
        'that apps/web/tests/workbench.test.ts §3 and §4 check more than this file can: they ' +
        'render the page, and they require more than one specimen where a component has ' +
        'states. This gate is here so you find out in the package you are working in.',
    ).toEqual([])
  })
})
