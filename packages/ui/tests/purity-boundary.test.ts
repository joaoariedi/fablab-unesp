import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * T003 / FR-018 — the purity boundary around `packages/ui/src/**`.
 *
 * `@fablab/ui` receives resolved values as props or CSS custom properties. The way that
 * promise breaks is not malice, it is convenience: a component that needs the current
 * organization reaches for `next/headers` or `getPayload()` because both are one import away
 * and both work at the terminal. Nothing else in the repo would notice — the package would
 * simply stop being reusable and stop being renderable outside a Next server.
 *
 * The mechanism mirrors the `packages/game` block in the same file (imports are statically
 * visible and cannot be aliased across modules); the *list* is different, because unlike
 * `packages/game` this package is React and must keep React.
 *
 * **The scope is the load-bearing part.** The boundary covers `src/**` only. `tests/**` must
 * stay free to use `node:fs` and shell out to `git ls-files` — T011 asserts no SquareFont
 * artefact is tracked, which it can only do by reading the index. A boundary written against
 * `packages/ui/**` would pass review, look identical in the diff, and make that gate
 * unwritable.
 *
 * Assertions here are **executed**, not read off the config: every probe is a real file run
 * through the repo's real ESLint, because a config can name a pattern and still match nothing
 * (round 3's tsconfig matched one file while looking correct). Probes are asserted on
 * `no-restricted-imports` messages specifically rather than on "zero problems" — the base
 * recommended config also fires (unused vars, `@ts-nocheck`), and folding those into the
 * assertion would make it pass or fail for reasons unrelated to this boundary.
 */

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
const ESLINT_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'eslint')

const SRC_PROBE_DIR = join(PACKAGE_DIR, 'src', '__eslint_probe__')
const TESTS_PROBE_DIR = join(PACKAGE_DIR, 'tests', '__eslint_probe__')

/** ESLint over a handful of files is fast, but a cold start on a loaded machine is not. */
const ESLINT_TIMEOUT_MS = 120_000

const BOUNDARY_RULE = 'no-restricted-imports'

/**
 * Modules a component in `src/**` must not be able to reach.
 *
 * `next/headers`, `next/server` and `next/cache` are the *server* APIs — the ones that make a
 * component unrenderable anywhere but inside a Next request. `next/link` is deliberately not
 * on this list: it is a client-safe component and banning it would be copying the
 * `packages/game` block rather than mirroring it.
 *
 * The `node:` entries are FR-018's "no IO" clause. They are also exactly what `tests/**` needs,
 * which is why the scope assertion below exists.
 */
const FORBIDDEN_IN_SRC = [
  'payload',
  'payload/types',
  '@payloadcms/db-postgres',
  '@payloadcms/next/utilities',
  'next/headers',
  'next/server',
  'next/cache',
  'server-only',
  'node:fs',
  'node:fs/promises',
  'node:child_process',
  'fs',
]

/** React is the whole point of the package; a boundary that banned it would be wrong. */
const ALLOWED_IN_SRC = ['react', 'react/jsx-runtime']

/** What T011 needs from `tests/**`, verbatim: read the filesystem, shell out to git. */
const ALLOWED_IN_TESTS = ['node:fs', 'node:child_process', 'node:path']

interface EslintMessage {
  readonly ruleId: string | null
  readonly message: string
}

interface EslintResult {
  readonly filePath: string
  readonly messages: readonly EslintMessage[]
}

/**
 * `@ts-nocheck` keeps a probe invisible to `tsc`. Without it these files would break the
 * typecheck the moment they exist (`payload` is not a dependency of this package), and the
 * T001c suite runs a real `tsc --noEmit` over `src/**` — concurrently, in the same worker
 * pool. The probe must be inert to every gate except the one it is aimed at.
 */
function probeSource(moduleName: string): string {
  return `// @ts-nocheck\nimport * as probe from '${moduleName}'\n\nexport const used = probe\n`
}

/** Filesystem-safe file name for a module specifier: `@payloadcms/next` -> `payloadcms-next`. */
function probeFileName(moduleName: string): string {
  return `${moduleName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.ts`
}

function writeProbes(dir: string, moduleNames: readonly string[]): void {
  mkdirSync(dir, { recursive: true })
  for (const moduleName of moduleNames) {
    writeFileSync(join(dir, probeFileName(moduleName)), probeSource(moduleName), 'utf8')
  }
}

/**
 * Runs the repo's own ESLint against the repo's own `eslint.config.mjs`, from the repo root —
 * what `pnpm lint` does, minus the rest of the tree. No `--rule`, no `--config`: a flag here
 * would make this test assert a configuration it invented rather than the one that ships.
 */
function lintProbeDirs(): readonly EslintResult[] {
  const args = ['--format', 'json', SRC_PROBE_DIR, TESTS_PROBE_DIR]
  let stdout: string
  try {
    stdout = execFileSync(ESLINT_BIN, args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: ESLINT_TIMEOUT_MS,
    })
  } catch (error) {
    const failure = error as { status?: number | null; stdout?: string; stderr?: string }
    // ESLint exits 1 when it reports errors — the expected case for most probes here. Exit 2
    // means it could not run at all (bad config, unmatched path), and reporting that as "no
    // findings" would turn a broken harness into a green boundary.
    if (failure.status !== 1) {
      throw new Error(
        `eslint failed to run (exit ${String(failure.status)}):\n` +
          `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
      )
    }
    stdout = failure.stdout ?? ''
  }
  return JSON.parse(stdout) as EslintResult[]
}

let results: readonly EslintResult[]

function messagesFor(dir: string, moduleName: string): readonly EslintMessage[] {
  const path = join(dir, probeFileName(moduleName))
  const result = results.find((entry) => entry.filePath === path)
  if (!result) {
    throw new Error(
      `eslint reported nothing for ${path}. Linted files:\n` +
        results.map((entry) => entry.filePath).join('\n'),
    )
  }
  return result.messages
}

function boundaryMessagesFor(dir: string, moduleName: string): readonly EslintMessage[] {
  return messagesFor(dir, moduleName).filter((message) => message.ruleId === BOUNDARY_RULE)
}

beforeAll(() => {
  writeProbes(SRC_PROBE_DIR, [...FORBIDDEN_IN_SRC, ...ALLOWED_IN_SRC])
  writeProbes(TESTS_PROBE_DIR, ALLOWED_IN_TESTS)
  results = lintProbeDirs()
}, ESLINT_TIMEOUT_MS)

afterAll(() => {
  rmSync(SRC_PROBE_DIR, { recursive: true, force: true })
  rmSync(TESTS_PROBE_DIR, { recursive: true, force: true })
})

describe('packages/ui/src purity boundary (FR-018)', () => {
  it.each(FORBIDDEN_IN_SRC)('rejects `import from "%s"` under src/', (moduleName) => {
    const messages = boundaryMessagesFor(SRC_PROBE_DIR, moduleName)
    expect(
      messages.length,
      `importing '${moduleName}' from packages/ui/src must be an ESLint error; ` +
        `eslint reported: ${JSON.stringify(messagesFor(SRC_PROBE_DIR, moduleName))}`,
    ).toBeGreaterThan(0)
  })

  it.each(FORBIDDEN_IN_SRC)('explains why "%s" is refused, rather than just failing', (m) => {
    // A bare "'x' import is restricted from being used" teaches nothing. The `packages/game`
    // block carries a message naming the alternative; this one must too, or the next
    // contributor's fix is a targeted eslint-disable.
    const [first] = boundaryMessagesFor(SRC_PROBE_DIR, m)
    expect(first?.message ?? '').toMatch(/packages\/ui/)
  })

  it.each(ALLOWED_IN_SRC)('leaves `import from "%s"` alone under src/', (moduleName) => {
    const messages = boundaryMessagesFor(SRC_PROBE_DIR, moduleName)
    expect(
      messages,
      `'${moduleName}' is what this package is built from and must stay importable`,
    ).toEqual([])
  })
})

describe('the boundary is scoped to src/, not to the package (T011)', () => {
  it.each(ALLOWED_IN_TESTS)('leaves `import from "%s"` alone under tests/', (moduleName) => {
    const messages = boundaryMessagesFor(TESTS_PROBE_DIR, moduleName)
    expect(
      messages,
      `tests/ must keep '${moduleName}': T011 reads the git index to assert no SquareFont ` +
        'artefact is tracked, and cannot do that through a boundary written for components',
    ).toEqual([])
  })
})
