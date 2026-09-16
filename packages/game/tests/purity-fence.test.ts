import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * T004 / SC-005 / FR-005 — the purity fence around `packages/game` still bites.
 *
 * Feature 000 created this package empty and fenced it in the same commit, because an empty
 * directory enforces nothing and a README enforces less. Feature 005 is the commit that
 * fills it: the moment real rules land, the pressure the fence exists to resist becomes
 * real too. `levelFor` needs `regrasXp`, `regrasXp` lives in a Payload collection, and
 * `import { getPayload } from 'payload'` is one line away and works at the terminal. Nothing
 * else in the repo would notice — the package would simply stop being testable without a
 * database and stop being the place the economy can be reasoned about.
 *
 * So this file asserts the fence as a **regression gate**, not as new behaviour: the config
 * block predates this feature, and what 005 adds is the first code with a motive to breach it.
 *
 * Assertions are **executed, not read off the config.** Every probe is a real file run through
 * the repo's real `eslint.config.mjs` from the repo root — no `--rule`, no `--config` — because
 * a config can name a pattern and match nothing while reading as correct. A test that greps the
 * config for the string `'payload'` would pass against a block whose `files` glob matches zero
 * files, which is precisely the failure mode `packages/ui/tests/purity-boundary.test.ts` was
 * rewritten three times to close.
 *
 * MEASURED HOLES, recorded here because they are the next contributor's route around this
 * fence and closing them is a config change this task is scoped out of (tasks.md T004:
 * "eslint.config.mjs (assert only)"). Run against the shipping config in
 * `packages/game/tests/`, with every static probe below red:
 *
 *   await import('payload')          -> ZERO boundary findings  (ImportExpression, not
 *                                       ImportDeclaration — `no-restricted-imports` is blind
 *                                       to it by construction, and `packages/game` has no
 *                                       `no-restricted-syntax` block the way `packages/ui` does)
 *   require('payload')               -> ZERO boundary findings  (an ordinary CallExpression.
 *                                       `@typescript-eslint/no-require-imports` does fire, but
 *                                       that is a style rule about syntax that names no
 *                                       alternative; a targeted disable comment leaves the
 *                                       module reach fenced by nothing)
 *   import 'payload' from a .js file -> ZERO boundary findings  (the block's `files` reads
 *                                       `packages/game/**\/*.ts`, while `packages/ui`'s reads
 *                                       every module extension after `.jsx` and `.mjs` were
 *                                       measured escaping it)
 *
 * They are not asserted below because an assertion that cannot go green is a broken gate, and
 * a skipped one is worse. They are stated because the *fix* is three lines mirroring the
 * `packages/ui` blocks, and the reason to write it is on this page rather than in a reviewer's
 * memory.
 */

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
const ESLINT_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'eslint')

/**
 * Both halves of the package are probed, because the fence covers both and that is unusual.
 *
 * `packages/ui`'s boundary stops at `src/**` on purpose — its tests must keep `node:fs` and
 * `git ls-files`. `packages/game`'s does not stop, and must not: a rules test that reaches for
 * Payload to build a fixture reintroduces the database dependency the package exists to avoid,
 * one directory over from where anyone would look for it. Probing `src/` alone would leave that
 * difference undefended and indistinguishable, in review, from a copy of the `ui` block.
 */
const SRC_PROBE_DIR = join(PACKAGE_DIR, 'src', '__eslint_probe__')
const TESTS_PROBE_DIR = join(PACKAGE_DIR, 'tests', '__eslint_probe__')

/** ESLint over a handful of files is fast; a cold start on a loaded machine is not. */
const ESLINT_TIMEOUT_MS = 120_000

/**
 * The fence's instruments — asserted as a set, not pinned to one rule id.
 *
 * Today the whole block is `no-restricted-imports`. Tomorrow the dynamic-import hole recorded
 * above gets closed and half of it becomes `no-restricted-syntax`, exactly as it did for
 * `packages/ui`. A probe pinned to a single rule id would turn that correct change into a red
 * suite, and — worse — would report green for a form that quietly needed the other rule.
 * What SC-005 asks is that the module was REFUSED, not which rule refused it.
 */
const FENCE_RULES: ReadonlySet<string> = new Set(['no-restricted-imports', 'no-restricted-syntax'])

/**
 * Modules `packages/game` must not be able to reach.
 *
 * The list deliberately reaches past the two specifiers the config block was written against.
 * `packages/ui`'s first boundary was rejected for exactly this: rule and probe were drafted
 * from the same short list, so each confirmed the other and neither described the requirement.
 * Here the config names five globs (`payload`, `payload/*`, `@payloadcms/*`, `next`, `next/*`)
 * and the probes below name twelve specifiers, including four nobody wrote the rule against:
 *
 *   - `@payloadcms/next/utilities` — TWO path segments. `group` patterns are gitignore-style,
 *     and in `packages/ui`'s block a single `@payloadcms/*` was judged insufficient and paired
 *     with `@payloadcms/*\/*`. This block carries only the one-segment form, so whether the
 *     deeper specifier is caught is a question the config's text does not answer.
 *   - `next/og`, `next/cache`, `next/navigation` — server and framework entry points no
 *     enumeration of "the Next APIs" would have thought to list, and the shape that let
 *     `next/og` through `packages/ui`'s first draft.
 */
const FORBIDDEN = [
  'payload',
  'payload/types',
  'payload/config',
  '@payloadcms/db-postgres',
  '@payloadcms/richtext-lexical',
  '@payloadcms/next/utilities',
  'next',
  'next/headers',
  'next/server',
  'next/cache',
  'next/navigation',
  'next/og',
]

/**
 * A fence that refuses local code is a ban, and a ban gets blanket-disabled.
 *
 * `packages/game` is rules split across modules — `rules.ts` re-exported by `index.ts` is
 * already two of them — so relative imports are the package's ordinary spelling, not an
 * exception to be argued for. Asserting they stay clean is what keeps a widened pattern
 * (`'*payload*'`, `'next*'`) from passing review as a tightening.
 */
const ALLOWED = ['./sibling', '../sibling']

/** A probe whose body is not a plain `import … from`. */
interface ShapeProbe {
  /** File stem, also the test-case label. */
  readonly name: string
  readonly body: string
}

/**
 * The two static forms that are NOT `import defaultExport from 'x'`, and both are traps.
 *
 * `import type` is the one a contributor actually writes first, and writes in good faith:
 * "it is only a type, it is erased at build time, it cannot be IO." It is still a hard
 * dependency on Payload's generated types — `packages/game` would stop compiling without a
 * database schema, and the pure-rules promise is about what the package NEEDS, not about what
 * survives to runtime. `no-restricted-imports` takes an `allowTypeImports` option that would
 * wave it through, so this is a live configuration choice and not a hypothetical.
 *
 * `export … from` is the re-export form. It is how a barrel file leaks a dependency without
 * ever naming it in an import statement, and it is the shape a rule matching only
 * `ImportDeclaration` would miss entirely.
 */
const STATIC_SHAPES: readonly ShapeProbe[] = [
  {
    name: 'type-only-payload',
    body: "import type { Where } from 'payload'\n\nexport type Filter = Where\n",
  },
  { name: 'reexport-next-server', body: "export { NextResponse } from 'next/server'\n" },
  { name: 'reexport-star-payload', body: "export * from 'payload'\n" },
]

interface EslintMessage {
  readonly ruleId: string | null
  readonly message: string
}

interface EslintResult {
  readonly filePath: string
  readonly messages: readonly EslintMessage[]
}

/**
 * `@ts-nocheck` keeps a probe invisible to `tsc`.
 *
 * `payload` is not a dependency of this package and `tsconfig.json` includes `src/**\/*.ts`,
 * so without it every probe under `src/` would break `pnpm typecheck` for as long as the file
 * exists — and the typecheck may well be running in the same worker pool. A probe must be
 * inert to every gate except the one it is aimed at.
 */
function probeSource(moduleName: string): string {
  return `// @ts-nocheck\nimport * as probe from '${moduleName}'\n\nexport const used = probe\n`
}

/** Filesystem-safe file name for a specifier: `@payloadcms/next` -> `payloadcms-next.ts`. */
function probeFileName(moduleName: string): string {
  return `${moduleName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.ts`
}

function writeProbes(dir: string, moduleNames: readonly string[]): void {
  mkdirSync(dir, { recursive: true })
  for (const moduleName of new Set(moduleNames)) {
    writeFileSync(join(dir, probeFileName(moduleName)), probeSource(moduleName), 'utf8')
  }
}

function writeShapeProbes(dir: string, probes: readonly ShapeProbe[]): void {
  mkdirSync(dir, { recursive: true })
  for (const probe of probes) {
    writeFileSync(join(dir, `${probe.name}.ts`), `// @ts-nocheck\n${probe.body}`, 'utf8')
  }
}

/**
 * Runs the repo's own ESLint against the repo's own config, from the repo root — `pnpm lint`
 * minus the rest of the tree. A `--rule` or `--config` flag here would make this suite assert
 * a configuration it invented rather than the one that ships.
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
    // Exit 1 is ESLint reporting errors — the expected case for most probes here. Exit 2 means
    // it could not run at all (bad config, unmatched path), and reading that as "no findings"
    // would turn a broken harness into a green fence.
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

/**
 * Findings for one probe file — MISSING IS A FAILURE, deliberately.
 *
 * A file ESLint never visits reports nothing, which is byte-identical, in JSON, to a file it
 * visited and cleared. Inside this package those two outcomes are the same defect: the module
 * is unfenced either way. `packages/ui` measured a `.jsx` probe that was not linted at all, and
 * a lenient lookup called it a pass. So the lookup throws, and names what WAS linted.
 */
function messagesFor(dir: string, file: string): readonly EslintMessage[] {
  const path = join(dir, file)
  const result = results.find((entry) => entry.filePath === path)
  if (!result) {
    throw new Error(
      `eslint reported nothing for ${path} — it was not linted at all, so nothing fences it. ` +
        `Linted files:\n${results.map((entry) => entry.filePath).join('\n')}`,
    )
  }
  return result.messages
}

/**
 * The same lookup, narrowed to the fence's own rules.
 *
 * The base recommended config fires here too — `@ts-nocheck` trips `ban-ts-comment` on every
 * probe — and folding those findings into the assertion would make this suite pass or fail for
 * reasons that have nothing to do with SC-005. `require('payload')` is the case that proves the
 * point: it draws a `no-require-imports` error and ZERO fence findings, so an assertion counting
 * all messages would report that hole as covered.
 */
function fenceMessagesFor(dir: string, file: string): readonly EslintMessage[] {
  return messagesFor(dir, file).filter(
    (message) => message.ruleId !== null && FENCE_RULES.has(message.ruleId),
  )
}

const PROBE_DIRS: readonly { readonly label: string; readonly dir: string }[] = [
  { label: 'src', dir: SRC_PROBE_DIR },
  { label: 'tests', dir: TESTS_PROBE_DIR },
]

beforeAll(() => {
  for (const { dir } of PROBE_DIRS) {
    writeProbes(dir, [...FORBIDDEN, ...ALLOWED])
    writeShapeProbes(dir, STATIC_SHAPES)
  }
  results = lintProbeDirs()
}, ESLINT_TIMEOUT_MS)

afterAll(() => {
  for (const { dir } of PROBE_DIRS) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe.each(PROBE_DIRS)('packages/game/$label purity fence (SC-005, FR-005)', ({ dir }) => {
  it.each(FORBIDDEN)('refuses `import from "%s"`', (moduleName) => {
    const file = probeFileName(moduleName)
    expect(
      fenceMessagesFor(dir, file).length,
      `importing '${moduleName}' from packages/game must be an ESLint error. The economy is ` +
        'pure functions over injected rules (FR-005); a module reach here is what makes it ' +
        `untestable without a database. eslint reported: ${JSON.stringify(messagesFor(dir, file))}`,
    ).toBeGreaterThan(0)
  })

  it.each(FORBIDDEN)('explains why "%s" is refused, rather than just failing', (moduleName) => {
    // A bare "'x' import is restricted from being used" teaches nothing, and the fix it
    // suggests to a contributor under deadline is an eslint-disable comment. The message has
    // to name the alternative — pass the data in as an argument — or the fence buys one
    // afternoon and then gets routed around.
    const [first] = fenceMessagesFor(dir, probeFileName(moduleName))
    expect(first?.message ?? '').toMatch(/packages\/game is pure rules/)
    expect(first?.message ?? '').toMatch(/arguments/)
  })

  it.each(STATIC_SHAPES)('refuses the $name form', (probe) => {
    const file = `${probe.name}.ts`
    expect(
      fenceMessagesFor(dir, file).length,
      `${probe.body.trim()} must be an ESLint error in packages/game. A type-only import is ` +
        'still a hard dependency on a Payload schema, and a re-export leaks one without ever ' +
        `writing an import statement. eslint reported: ${JSON.stringify(messagesFor(dir, file))}`,
    ).toBeGreaterThan(0)
  })

  it.each(ALLOWED)('leaves the relative import "%s" alone', (moduleName) => {
    expect(
      fenceMessagesFor(dir, probeFileName(moduleName)),
      `'${moduleName}' is how this package is split into modules — index.ts re-exports ` +
        'rules.ts today. A fence that refuses local code is a ban, and a ban gets ' +
        'blanket-disabled, taking the clauses above with it.',
    ).toEqual([])
  })
})

describe('the fence probes more than the config was written against (SC-005)', () => {
  it('names specifiers outside the five globs the config block lists', () => {
    // Guards the sweep above against the failure that got packages/ui's first boundary
    // rejected: rule and probe drafted from one short list, each confirming the other. The
    // config names `payload`, `payload/*`, `@payloadcms/*`, `next`, `next/*`; these four are
    // the ones whose outcome that text does not settle on its own.
    expect(FORBIDDEN).toEqual(
      expect.arrayContaining(['@payloadcms/next/utilities', 'next/og', 'next/cache', 'payload/config']),
    )
  })

  it('probes both halves of the package, not only src', () => {
    // packages/ui's boundary deliberately stops at src/**; this one does not, and the
    // difference is the whole point of the tests/ probes. Losing them would leave a rules test
    // free to build a fixture out of Payload, one directory from where anyone would look.
    expect(PROBE_DIRS.map(({ label }) => label)).toEqual(['src', 'tests'])
  })
})
