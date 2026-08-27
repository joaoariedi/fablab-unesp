import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * T001c / FR-018, FR-020 — `pnpm typecheck` in `packages/ui` must actually check something.
 *
 * Measured in review round 3: `include` was `["src/**\/*.ts"]`, `lib` omitted DOM, there was
 * no `jsx` setting and `@types/react` was absent. `tsc --listFiles` matched exactly ONE file
 * (`src/index.ts`), so the gate reported success having compiled no component and no test.
 * That is the worst kind of green — it is indistinguishable from a real pass at the terminal.
 *
 * Asserting the four config keys is necessary but not sufficient: a config can name `.tsx`
 * and still fail to compile one (missing `jsx`, missing React types, missing DOM lib). So the
 * load-bearing assertions here are EXECUTED, not read — the task's own acceptance wording:
 * "verify by breaking a component on purpose; tsc must exit non-zero". Each probe writes a
 * throwaway file, runs the real `tsc` against the real `tsconfig.json`, and deletes it again.
 *
 * The probes are deliberately paired. A checker that fails on the broken file but also fails
 * on the valid one proves nothing (it might be rejecting all JSX); a checker that passes the
 * valid one but ignores the broken one is the round-3 bug itself. Both directions are needed.
 */

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
const TSCONFIG_PATH = join(PACKAGE_DIR, 'tsconfig.json')
const PACKAGE_JSON_PATH = join(PACKAGE_DIR, 'package.json')
const TSC_BIN = join(PACKAGE_DIR, 'node_modules', '.bin', 'tsc')

/** `tsc` on a cold cache is slow enough that the 5s default would flake, not fail. */
const TSC_TIMEOUT_MS = 120_000

/** Probe directories, removed in `afterEach` even when an expectation throws. */
const SRC_PROBE_DIR = join(PACKAGE_DIR, 'src', '__tsc_probe__')
const TESTS_PROBE_DIR = join(PACKAGE_DIR, 'tests', '__tsc_probe__')

interface TsconfigShape {
  readonly compilerOptions?: {
    readonly lib?: readonly string[]
    readonly jsx?: string
  }
  readonly include?: readonly string[]
}

interface ManifestShape {
  readonly devDependencies?: Record<string, string>
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

interface TscResult {
  readonly exitCode: number
  readonly output: string
}

/**
 * Runs the package's own `tsc` against the package's own `tsconfig.json`, from the package
 * directory — exactly what `pnpm --filter @fablab/ui typecheck` does. No flags are passed,
 * because a flag here would be this test checking a config it invented rather than the one
 * that ships.
 */
function runTypecheck(): TscResult {
  try {
    const output = execFileSync(TSC_BIN, ['--noEmit'], {
      cwd: PACKAGE_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: TSC_TIMEOUT_MS,
    })
    return { exitCode: 0, output }
  } catch (error) {
    const failure = error as { status?: number | null; stdout?: string; stderr?: string }
    // `status` is null when the child was killed by a signal (timeout) rather than exiting.
    // Reporting that as 0 would turn an infrastructure failure into a silent pass.
    return {
      exitCode: failure.status ?? -1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    }
  }
}

function writeProbe(dir: string, fileName: string, source: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, fileName), source, 'utf8')
}

/** A component that is wrong in a way only a type checker can see — never a syntax error. */
const BROKEN_COMPONENT = `const answer: number = 'not a number'

export function BrokenProbe() {
  return <span>{answer}</span>
}
`

/**
 * Valid on three counts that the round-3 config failed independently: it is `.tsx` (so
 * `include` must match it), it uses the automatic runtime (so `jsx: react-jsx` and
 * `@types/react` must both be present), and it names `MouseEvent` (so `lib` must carry DOM).
 */
const VALID_COMPONENT = `interface ProbeProps {
  readonly label: string
  readonly onPress?: (event: MouseEvent) => void
}

export function ValidProbe({ label }: ProbeProps) {
  return <button type="button">{label}</button>
}
`

const BROKEN_TEST_HELPER = `export const answer: number = 'not a number'
`

describe('packages/ui/tsconfig.json', () => {
  afterEach(() => {
    rmSync(SRC_PROBE_DIR, { recursive: true, force: true })
    rmSync(TESTS_PROBE_DIR, { recursive: true, force: true })
  })

  describe('declared configuration', () => {
    it('includes .tsx sources — the pattern that matched zero files in round 3', () => {
      const { include } = readJson<TsconfigShape>(TSCONFIG_PATH)
      expect(include).toContain('src/**/*.tsx')
    })

    it('includes .ts sources', () => {
      const { include } = readJson<TsconfigShape>(TSCONFIG_PATH)
      expect(include).toContain('src/**/*.ts')
    })

    it('includes tests/ — five planned test files would otherwise never be checked', () => {
      const { include } = readJson<TsconfigShape>(TSCONFIG_PATH)
      expect(include).toContain('tests/**/*.ts')
    })

    it('sets jsx to the automatic runtime, matching apps/web', () => {
      const { compilerOptions } = readJson<TsconfigShape>(TSCONFIG_PATH)
      expect(compilerOptions?.jsx).toBe('react-jsx')
    })

    it('carries the DOM lib — components name browser types', () => {
      const { compilerOptions } = readJson<TsconfigShape>(TSCONFIG_PATH)
      expect(compilerOptions?.lib).toContain('DOM')
    })

    it('declares @types/react as a devDependency — pnpm does not install own peers', () => {
      const { devDependencies } = readJson<ManifestShape>(PACKAGE_JSON_PATH)
      expect(devDependencies ?? {}).toHaveProperty('@types/react')
    })
  })

  describe('executed behaviour', () => {
    it(
      'passes on the tree as committed — otherwise the probes below prove nothing',
      () => {
        const { exitCode, output } = runTypecheck()
        expect(exitCode, `tsc reported:\n${output}`).toBe(0)
      },
      TSC_TIMEOUT_MS,
    )

    it(
      'fails when a component under src/ is broken on purpose',
      () => {
        writeProbe(SRC_PROBE_DIR, 'Broken.tsx', BROKEN_COMPONENT)
        const { exitCode, output } = runTypecheck()
        expect(exitCode, 'a .tsx type error must fail the typecheck').not.toBe(0)
        // Guards against passing for the wrong reason: the failure must be THIS file's type
        // error, not "no inputs were found" or a missing module elsewhere.
        expect(output).toMatch(/Broken\.tsx/)
        expect(output).toMatch(/not assignable to type 'number'/)
      },
      TSC_TIMEOUT_MS,
    )

    it(
      'compiles a valid .tsx component using the automatic runtime, DOM types and React types',
      () => {
        writeProbe(SRC_PROBE_DIR, 'Valid.tsx', VALID_COMPONENT)
        const { exitCode, output } = runTypecheck()
        expect(exitCode, `a correct component must typecheck; tsc reported:\n${output}`).toBe(0)
      },
      TSC_TIMEOUT_MS,
    )

    it(
      'fails when a file under tests/ is broken on purpose',
      () => {
        writeProbe(TESTS_PROBE_DIR, 'broken-helper.ts', BROKEN_TEST_HELPER)
        const { exitCode, output } = runTypecheck()
        expect(exitCode, 'a type error under tests/ must fail the typecheck').not.toBe(0)
        expect(output).toMatch(/broken-helper\.ts/)
        expect(output).toMatch(/not assignable to type 'number'/)
      },
      TSC_TIMEOUT_MS,
    )
  })
})
