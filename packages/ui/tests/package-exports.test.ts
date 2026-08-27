import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * T001 / FR-018 — the package manifest is the contract between `@fablab/ui` and its consumer.
 *
 * Two things are asserted here, and both fail silently in production if they drift:
 *
 * 1. **React is a *peer*, never a dependency.** `apps/web` owns the React instance. If
 *    `packages/ui` declared React as a regular dependency, pnpm would install a *second*
 *    copy under the package's own `node_modules` and every hook would throw
 *    "Invalid hook call" at runtime — a failure no typecheck, lint or unit test in this
 *    workspace can see, because none of them render (plan § CLR-003).
 * 2. **The export map names all four public entries.** Anything not listed is unreachable
 *    from the app under Node's `exports` semantics — a deep import fails with
 *    ERR_PACKAGE_PATH_NOT_EXPORTED, not with a helpful message.
 *
 * This reads the manifest as text rather than importing it, for the same reason
 * `styles-entry.test.ts` reads CSS as text: there is no DOM and no bundler here, so file
 * content is the only evidence available.
 */

const UI_PACKAGE_PATH = fileURLToPath(new URL('../package.json', import.meta.url))
const WEB_PACKAGE_PATH = fileURLToPath(new URL('../../../apps/web/package.json', import.meta.url))

/** Only the shape this test asserts; the manifest carries more. */
interface Manifest {
  readonly dependencies?: Record<string, string>
  readonly devDependencies?: Record<string, string>
  readonly peerDependencies?: Record<string, string>
  readonly exports?: Record<string, string>
}

/**
 * The public surface, subpath → target. `./components` and `./tokens` are barrels;
 * `./styles.css` is the single stylesheet import the app makes (T001d).
 */
const EXPECTED_EXPORTS: Record<string, string> = {
  '.': './src/index.ts',
  './tokens': './src/tokens/index.ts',
  './components': './src/components/index.ts',
  './styles.css': './src/styles.css',
}

function readManifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest
}

/** `^19.2.0`, `>=19`, `19.x` — all reduce to the first major they name. */
function majorOf(range: string): string | undefined {
  return /(\d+)/.exec(range)?.[1]
}

describe('@fablab/ui package manifest', () => {
  describe('React ownership (the app owns the instance)', () => {
    it('declares react as a peer dependency', () => {
      const { peerDependencies } = readManifest(UI_PACKAGE_PATH)
      expect(peerDependencies).toBeDefined()
      expect(peerDependencies?.react).toBeTypeOf('string')
      expect(peerDependencies?.react).not.toBe('')
    })

    it('does NOT declare react as a runtime dependency — that would duplicate the instance', () => {
      const { dependencies } = readManifest(UI_PACKAGE_PATH)
      expect(dependencies ?? {}).not.toHaveProperty('react')
      expect(dependencies ?? {}).not.toHaveProperty('react-dom')
    })

    it('accepts the React major the app actually installs', () => {
      const peerRange = readManifest(UI_PACKAGE_PATH).peerDependencies?.react ?? ''
      const appRange = readManifest(WEB_PACKAGE_PATH).dependencies?.react ?? ''
      expect(appRange, 'apps/web must pin a react version for this check to mean anything').not.toBe('')
      expect(majorOf(peerRange)).toBe(majorOf(appRange))
    })
  })

  describe('export map', () => {
    it('exposes exactly the documented subpaths', () => {
      const { exports } = readManifest(UI_PACKAGE_PATH)
      expect(Object.keys(exports ?? {}).sort()).toEqual(Object.keys(EXPECTED_EXPORTS).sort())
    })

    it('points each subpath at its source file — no build step, Next transpiles', () => {
      const { exports } = readManifest(UI_PACKAGE_PATH)
      expect(exports).toEqual(EXPECTED_EXPORTS)
    })

    it('keeps every target inside ./src/ — nothing outside the package source is public', () => {
      const targets = Object.values(readManifest(UI_PACKAGE_PATH).exports ?? {})
      expect(targets.length).toBeGreaterThan(0)
      for (const target of targets) {
        expect(target).toMatch(/^\.\/src\//)
      }
    })
  })
})
