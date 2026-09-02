import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { LOGIN_HREF, MENU_TABS, MOBILE_TABS, type ShellTab } from '@fablab/ui'

/**
 * FR-008 / US3 — every destination the shell offers has a route behind it.
 *
 * Measured before this existed: only `/` and `/workbench` were route files while the nav
 * pointed at seven more, so every tab in the rendered shell was a 404. The components were
 * complete and their suites green; the navigation was simply unwalkable.
 *
 * The expected set is DERIVED from the same data the shell renders, never retyped. A tab
 * added to `tabs.ts` tomorrow fails this immediately rather than shipping as a dead link —
 * which is the whole reason the tab sets were extracted into data in the first place.
 *
 * External destinations are skipped: `INSTAGRAM` leaves the site by design and carries the
 * `external` flag, so demanding a local route for it would be asserting the opposite of what
 * the data says.
 */

const FRONTEND_DIR = fileURLToPath(new URL('../app/(frontend)', import.meta.url))

/** Every internal destination the shell can send a visitor to. */
function internalDestinations(): string[] {
  const fromTabs = [...MOBILE_TABS, ...MENU_TABS]
    .filter((tab: ShellTab) => tab.external !== true)
    .map((tab: ShellTab) => tab.href)
  return [...new Set([...fromTabs, LOGIN_HREF])].sort()
}

/** `/projetos` → `app/(frontend)/projetos/page.tsx`; `/` → `app/(frontend)/page.tsx`. */
function routeFileFor(href: string): string {
  return join(FRONTEND_DIR, href.replace(/^\//, ''), 'page.tsx')
}

describe('every shell destination has a route (FR-008, US3)', () => {
  it('resolves each internal tab href to a page file', () => {
    const missing = internalDestinations().filter((href) => !existsSync(routeFileFor(href)))
    expect(
      missing,
      `these destinations render in the shell but 404 when clicked:\n  ${missing.join('\n  ')}`,
    ).toEqual([])
  })

  it('has destinations to check — an empty tab set would pass the rule above vacuously', () => {
    expect(internalDestinations().length).toBeGreaterThan(4)
  })

  it('skips external destinations rather than demanding a local route for them', () => {
    expect(internalDestinations()).not.toContain('/instagram')
  })
})
