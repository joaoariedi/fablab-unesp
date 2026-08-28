import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
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

  /**
   * The three assertions above compare the manifest against `EXPECTED_EXPORTS` — a hardcoded
   * restatement of the manifest written by the same author. Measured on 2026-08-27: renaming
   * `src/styles.css` away leaves **all six** of those tests green while
   * `import '@fablab/ui/styles.css'` is broken for the app, because nothing here ever asks the
   * filesystem whether a target is real. That is the exact failure T001d names — "a dangling
   * `@import` is silent, so the test must assert each target exists on disk (`existsSync`), not
   * merely that the parsed paths match a hardcoded list" — and the export map is the same
   * shape of contract, so it earns the same rule.
   *
   * **The rule is derived, not listed.** A hardcoded "these targets are allowed to be missing"
   * set would be another restatement, and it would rot: nothing forces its removal once the
   * file lands. Instead the rule keys off the target's *directory*:
   *
   *   - the directory does not exist  → the module has not been written yet (`./tokens` is
   *     T006, `./components` is T032). Nothing to assert, and no exemption to retire later.
   *   - the directory *does* exist    → the entry file must be in it.
   *
   * This tightens itself with no edit. The moment T006 creates `packages/ui/src/tokens/`, that
   * subpath starts requiring `index.ts` — so a barrel landed as `tokens.ts`, or later renamed,
   * goes red against the task that did it rather than staying silent until a production build.
   */
  describe('export targets resolve to real files', () => {
    /** `'./src/styles.css'` → absolute path, relative to the package root. */
    function absoluteTarget(target: string): string {
      return fileURLToPath(new URL(`../${target.replace(/^\.\//, '')}`, import.meta.url))
    }

    it('points every export at a file that exists, once its directory is there', () => {
      const exports = readManifest(UI_PACKAGE_PATH).exports ?? {}
      expect(Object.keys(exports).length).toBeGreaterThan(0)

      const dangling: string[] = []
      for (const [subpath, target] of Object.entries(exports)) {
        const absolute = absoluteTarget(target)
        // A directory that does not exist yet means the module is a later task's, not a
        // defect. An EMPTY directory means exactly the same thing and must skip too: an
        // agent that creates `src/components/` before writing `index.ts` leaves precisely
        // that state, and treating it as a defect deadlocked the run — the phase gate
        // blocked Phase 2, and only Phase 3 could have satisfied it. An empty directory
        // carries no more information than an absent one.
        const parent = dirname(absolute)
        if (!existsSync(parent) || readdirSync(parent).length === 0) continue
        if (!existsSync(absolute) || !statSync(absolute).isFile()) {
          dangling.push(`"${subpath}" → ${target} (no file at ${absolute})`)
        }
      }

      expect(dangling, `export targets whose directory exists but whose file does not:\n${dangling.join('\n')}`).toEqual([])
    })

    it('ships the two entries this package already owns — the root barrel and the stylesheet', () => {
      // Guards the rule above against its own escape hatch: if `src/` itself vanished, every
      // target would be skipped as "not written yet" and the suite would pass over an empty
      // package. These two are T001's and T001d's own deliverables and must always be real.
      const exports = readManifest(UI_PACKAGE_PATH).exports ?? {}
      for (const subpath of ['.', './styles.css']) {
        const target = exports[subpath]
        expect(target, `export map lost its "${subpath}" entry`).toBeTypeOf('string')
        expect(existsSync(absoluteTarget(target ?? '')), `"${subpath}" → ${target} does not exist`).toBe(true)
      }
    })
  })
})

/**
 * T001 / FR-018 — "the app owns the React instance", asserted against the **installed tree**
 * rather than the declared text.
 *
 * Every assertion above reads `package.json` as a string: react is under `peerDependencies`,
 * it is absent from `dependencies`, and the two declared *ranges* name the same major. That
 * is the manifest restating itself, and it is blind to the failure the file's own opening
 * comment describes — two physical copies of React, and "Invalid hook call" for every hook in
 * the product.
 *
 * The gap is not hypothetical, because the declaration is not what decides the outcome.
 * pnpm's resolution also answers to `.npmrc` (`node-linker=hoisted`, `dedupe-peer-dependents`,
 * `resolution-mode`), to a root `pnpm.overrides` or workspace catalog entry, and to whether
 * `pnpm install` was ever run after the manifest was edited. Every one of those lives outside
 * `packages/ui/package.json`, leaves all six assertions above green, and can still hand the
 * package a second React.
 *
 * CLR-003 guarantees nothing else in this workspace can catch it: no test renders, so no test
 * ever calls a hook, so the duplicate is invisible until the product runs in a browser. The
 * check has to be a resolution check or it does not exist.
 *
 * Resolution is compared through `realpathSync` deliberately. Under pnpm both packages reach
 * React by a *symlink into the same store entry*, so the symlink paths differ
 * (`packages/ui/node_modules/react` vs `apps/web/node_modules/react`) while the instance is
 * one. Comparing the link paths would fail on a correct tree; comparing the real paths is what
 * "same instance" actually means to Node's module cache.
 */
describe('React instance identity (the installed tree, not the declared text)', () => {
  /** A directory whose module resolution we want to imitate — the `.js` is never read. */
  function requireFrom(directory: string): NodeJS.Require {
    return createRequire(join(directory, 'noop.js'))
  }

  /**
   * The real directory of the React that `directory` would load at runtime.
   *
   * `react/package.json` is used as the probe rather than `react` itself because React 19
   * exports it, and it pins the *package root* rather than whichever conditional entry point
   * the resolver happened to pick for this context.
   */
  function resolvedReactRoot(directory: string): string {
    return dirname(realpathSync(requireFrom(directory).resolve('react/package.json')))
  }

  const UI_SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url))
  const APP_DIR = fileURLToPath(new URL('../../../apps/web/', import.meta.url))

  it('resolves react from packages/ui at all — a peer the tree never linked is not usable', () => {
    // Not redundant with the identity assertion below: if this throws, that one throws too and
    // reports a resolution error instead of the duplicate-instance failure it exists to name.
    expect(() => resolvedReactRoot(UI_SRC_DIR)).not.toThrow()
    expect(() => resolvedReactRoot(APP_DIR)).not.toThrow()
  })

  it('loads the SAME physical react as apps/web — one instance, never two', () => {
    const fromUi = resolvedReactRoot(UI_SRC_DIR)
    const fromApp = resolvedReactRoot(APP_DIR)

    expect(
      fromUi,
      `packages/ui and apps/web resolve DIFFERENT React installations, so every hook in a\n` +
        `@fablab/ui component will throw "Invalid hook call" in the product:\n` +
        `  packages/ui -> ${fromUi}\n` +
        `  apps/web    -> ${fromApp}\n` +
        `The manifest can look perfectly correct while this is true — check .npmrc,\n` +
        `pnpm.overrides, the workspace catalog, and whether pnpm install has been re-run.`,
    ).toBe(fromApp)
  })
})
