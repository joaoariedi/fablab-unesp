import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * FR-006 / FR-018 — every component file is reachable through the package's public surface.
 *
 * The export map exposes `./components` and no deep paths, so a component the barrel does not
 * re-export has **no legal import anywhere in the product**: `@fablab/ui/src/components/Card`
 * fails with ERR_PACKAGE_PATH_NOT_EXPORTED. Measured on 2026-08-28: five of nine components
 * (Card, PixelImage, ProgressBar, SearchInput, SkillPips) were in exactly that state while
 * their own suites were green — each test imports its component by relative path, which
 * bypasses the public surface entirely. T037's workbench, whose job is "rendering every
 * component", could not have rendered any of them.
 *
 * The barrel's docstring already stated the rule and four tasks followed it while five did
 * not, which is what a convention with no mechanism behind it always produces. This derives
 * the expectation from the DIRECTORY rather than restating a list: a component added tomorrow
 * is covered with no edit here, and no exemption list can rot.
 */

const COMPONENTS_DIR = fileURLToPath(new URL('../src/components', import.meta.url))
const BARREL = fileURLToPath(new URL('../src/components/index.ts', import.meta.url))

/** Every component module on disk, by basename — the barrel itself is not one. */
function componentFiles(): string[] {
  return readdirSync(COMPONENTS_DIR)
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => name.replace(/\.tsx$/, ''))
    .sort()
}

/** The modules the barrel re-exports from, e.g. `./Card` → `Card`. */
function reExported(): string[] {
  const source = readFileSync(BARREL, 'utf8')
  const names = new Set<string>()
  for (const match of source.matchAll(/from\s+'\.\/([A-Za-z0-9_]+)'/g)) names.add(match[1]!)
  return [...names].sort()
}

describe('packages/ui/src/components/index.ts', () => {
  it('re-exports every component file — an unexported one has no legal import', () => {
    const missing = componentFiles().filter((name) => !reExported().includes(name))
    expect(
      missing,
      `these components exist but are unreachable through @fablab/ui/components:\n  ${missing.join('\n  ')}`,
    ).toEqual([])
  })

  it('re-exports nothing that is not there — a stale line is a build error waiting', () => {
    const files = componentFiles()
    const orphans = reExported().filter((name) => !files.includes(name))
    expect(orphans, `the barrel re-exports modules that do not exist: ${orphans.join(', ')}`).toEqual([])
  })

  it('finds components to check at all — an empty directory would pass both rules above', () => {
    // The escape hatch both assertions share: over an empty set, "nothing is missing" and
    // "nothing is orphaned" are trivially true. This feature has produced that vacuous pass
    // seven times, so the set-difference rules get an explicit non-emptiness guard.
    expect(componentFiles().length).toBeGreaterThan(0)
  })
})
