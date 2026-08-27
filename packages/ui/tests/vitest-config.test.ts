import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * T002 / FR-020 — `packages/ui` runs a real Vitest suite, not `--passWithNoTests`.
 *
 * Why this is worth asserting rather than assuming:
 *
 * 1. **`--passWithNoTests` makes an empty suite indistinguishable from a green one.**
 *    `pnpm test` at the root is `pnpm -r --no-bail test` (plan § "what was checked"), so the
 *    day a rename, a bad `include` or a deleted directory stops matching any file, CI stays
 *    green and reports success having executed nothing. That is the same vacuous-gate family
 *    the plan records three times over (a rule reachable from no pipeline, a job absent from
 *    branch protection, a tsconfig matching zero `.tsx`).
 * 2. **An `include` that matches nothing is invisible without execution.** Reading the config
 *    proves the glob is spelled the way we intended; it does not prove it finds the suite. The
 *    `vitest list` case below runs the real binary against the real config and compares what it
 *    discovers with what is on disk.
 * 3. **No DOM environment.** CLR-003 locks the stack and the plan states plainly that no
 *    `jsdom`/`happy-dom` is added — every assertion in this feature is data, arithmetic or file
 *    text. A config that quietly set `environment: 'jsdom'` would make the next test that
 *    renders a component look supported, and the constitution-compliance claim would be false.
 */

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
const CONFIG_PATH = fileURLToPath(new URL('../vitest.config.ts', import.meta.url))
const MANIFEST_PATH = fileURLToPath(new URL('../package.json', import.meta.url))
const TESTS_DIR = fileURLToPath(new URL('.', import.meta.url))

/** The single glob the suite lives under — five planned test files, all in `tests/`. */
const EXPECTED_INCLUDE = ['tests/**/*.test.ts']

/** Environments that would require a dependency CLR-003 refuses. */
const DOM_ENVIRONMENTS = ['jsdom', 'happy-dom', 'edge-runtime']
const DOM_PACKAGES = ['jsdom', 'happy-dom']

/** Only the fields asserted here; a Vitest config carries far more. */
interface UiVitestConfig {
  readonly test?: {
    readonly include?: readonly string[]
    readonly environment?: string
  }
}

/**
 * Imported lazily and guarded, so a missing config reports "the file does not exist" from the
 * case below rather than an unresolved-module crash that hides every other assertion.
 */
const config: UiVitestConfig | undefined = existsSync(CONFIG_PATH)
  ? ((await import('../vitest.config')).default as UiVitestConfig)
  : undefined

function testFilesOnDisk(): string[] {
  return readdirSync(TESTS_DIR)
    .filter((name) => name.endsWith('.test.ts'))
    .sort()
}

describe('packages/ui Vitest configuration', () => {
  it('exists as a real config file', () => {
    expect(existsSync(CONFIG_PATH), `expected a Vitest config at ${CONFIG_PATH}`).toBe(true)
  })

  it('collects the suite from tests/ and nowhere else', () => {
    expect(config?.test?.include).toEqual(EXPECTED_INCLUDE)
  })

  it('declares no DOM environment — CLR-003 adds no jsdom/happy-dom', () => {
    const environment = config?.test?.environment
    expect(environment === undefined || environment === 'node').toBe(true)
    expect(DOM_ENVIRONMENTS).not.toContain(environment)
  })

  it('is backed by no DOM dependency in the manifest', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const installed = { ...manifest.dependencies, ...manifest.devDependencies }
    for (const name of DOM_PACKAGES) {
      expect(installed, `${name} would contradict the no-DOM claim`).not.toHaveProperty(name)
    }
  })
})

describe('packages/ui test script', () => {
  const script = (
    JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as { scripts?: Record<string, string> }
  ).scripts?.test

  it('runs Vitest once, non-watching', () => {
    expect(script).toBeTypeOf('string')
    expect(script).toContain('vitest run')
  })

  it('does NOT pass --passWithNoTests — an empty suite must fail, not pass silently', () => {
    expect(script).not.toContain('--passWithNoTests')
    expect(script).not.toContain('passWithNoTests')
  })
})

describe('executed behaviour — the config finds the suite that is actually on disk', () => {
  it('discovers every tests/*.test.ts file', () => {
    const discovered = execFileSync('pnpm', ['exec', 'vitest', 'list', '--filesOnly'], {
      cwd: PACKAGE_DIR,
      encoding: 'utf8',
    })
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.endsWith('.test.ts'))
      .map((line) => line.replace(/^tests\//, ''))
      .sort()

    const onDisk = testFilesOnDisk()
    expect(onDisk.length, 'no test files on disk would make this assertion vacuous').toBeGreaterThan(0)
    expect(discovered).toEqual(onDisk)
  })
})
