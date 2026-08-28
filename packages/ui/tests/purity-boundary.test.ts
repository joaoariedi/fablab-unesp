import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
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

/**
 * `src/tokens/**` is inside the boundary and must stay inside it.
 *
 * It is called out separately because it is the one directory in `src/**` that other fences
 * *exempt* — the colour fence has to let a hex be written somewhere, and that somewhere is
 * here. An exemption written one clause too wide takes the purity clause with it, and the
 * result reads correctly in review: the config still names `packages/ui/src/**`, and `tokens/`
 * is quietly outside it. Tokens are the most tempting place to reach for a Node builtin too —
 * "just read the palette off disk at build time" is a one-line change away.
 */
const TOKENS_PROBE_DIR = join(PACKAGE_DIR, 'src', 'tokens', '__eslint_probe__')

/** ESLint over a handful of files is fast, but a cold start on a loaded machine is not. */
const ESLINT_TIMEOUT_MS = 120_000

/**
 * The boundary's instruments — plural, because one rule cannot see every form of the reach.
 *
 * `no-restricted-imports` matches `ImportDeclaration` and `export … from`. A dynamic
 * `import()` is an `ImportExpression` and is neither, so the rule is blind to it by
 * construction (measured: `await import('payload')` in `src/**` produced zero findings while
 * every static probe below was red). The deny-by-default clause therefore has to be re-stated
 * in `no-restricted-syntax` for that form.
 *
 * Probes assert that the boundary REFUSED the module, not which rule did the refusing.
 * Pinning to a single rule id would turn a correct change of instrument into a failure, and —
 * worse — would let a form slip through the moment it needs a different rule, which is exactly
 * how the dynamic-import hole survived the first two rounds of this file.
 */
const BOUNDARY_RULES: ReadonlySet<string> = new Set([
  'no-restricted-imports',
  'no-restricted-syntax',
])

/**
 * Modules a component in `src/**` must not be able to reach.
 *
 * `next/headers`, `next/server` and `next/cache` are the *server* APIs — the ones that make a
 * component unrenderable anywhere but inside a Next request. `next/link` is deliberately not
 * on this list: it is a client-safe component and banning it would be copying the
 * `packages/game` block rather than mirroring it.
 *
 * **The general-form entries below are the point of this list, not padding.** The first
 * attempt at this boundary was rejected because rule and probe were written from the same
 * short list, so each confirmed the other and neither described FR-018:
 *
 *   - "no IO" was `node:*` plus a hand-picked bare list whose only IO member was `fs` — the
 *     one probed here. Measured: bare `https`, `net`, `stream` and `worker_threads` were
 *     ALLOWED, so a component could do network IO straight through the gate that exists to
 *     forbid IO. They are probed now, and every Node builtin is swept below.
 *   - "no Next server APIs" was the four specifiers probed here, so `next/og` — server/edge
 *     only, and a plausible reach for a UI package building an OG card — and bare `next`
 *     itself were both allowed. Both are probed now.
 *
 * This is feature 000's method-name lesson twice over: a rule that matches a form the problem
 * does not take. A probe list is only evidence when it contains specifiers nobody wrote the
 * rule against.
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
  // Next is deny-by-default: the package root and a server-only entry point no enumeration
  // of "the server APIs" would have thought to include.
  'next',
  'next/og',
  // Bare builtins that are not `fs`. Network and concurrency, i.e. the IO that the rejected
  // first attempt let through while reporting a green "no IO" boundary.
  'https',
  'http',
  'net',
  'stream',
  'worker_threads',
]

/**
 * Every Node builtin, taken from Node itself rather than retyped.
 *
 * The sweep below asserts the "no IO" clause as the general rule it claims to be: nothing a
 * browser cannot provide is importable from `src/**`. Deriving the list from
 * `builtinModules` is what makes it survive a Node release adding a module — and reading it
 * here, in `tests/**`, is itself the scope assertion this file makes further down.
 */
const NODE_BUILTINS: readonly string[] = builtinModules

/**
 * React is the whole point of the package; a boundary that banned it would be wrong.
 *
 * `next/link` and `next/image` are the deny-by-default rule's only exemptions: both render on
 * the client, so neither costs the package its reusability. They are asserted because a regex
 * written slightly wrong — or a `!next/link` negation, which `group` does NOT honour
 * (measured) — bans them along with the server APIs and breaks every consumer.
 */
const ALLOWED_IN_SRC = ['react', 'react/jsx-runtime', 'next/link', 'next/image']

/** What T011 needs from `tests/**`, verbatim: read the filesystem, shell out to git. */
const ALLOWED_IN_TESTS = ['node:fs', 'node:child_process', 'node:path']

/**
 * One specifier per clause, probed inside `src/tokens/**` rather than beside it.
 *
 * The full sweep above already establishes *which* specifiers leak; the question here is
 * whether the directory is inside the fence at all, so one representative of each deny list
 * is the whole assertion.
 */
const TOKENS_FORBIDDEN_STATIC = ['payload', 'next/headers', 'node:fs', 'net']

/** A probe whose body is not a plain static import — the module reach in another form. */
interface ShapeProbe {
  /** File stem, also the test-case label. */
  readonly name: string
  readonly body: string
}

/**
 * The same forbidden modules, reached through `await import(…)` instead of `import … from`.
 *
 * This is feature 000's method-name lesson in its third costume. The first attempt at this
 * boundary matched the wrong *specifiers*; this matches the wrong *syntax*. A component that
 * wants the current organization does not care which form it uses — and the dynamic form is
 * the one a contributor reaches for precisely when the static one is refused, because the
 * lint error names the module and says nothing about the shape. One `await` and the fence
 * reports green.
 *
 * The specifiers are drawn from all four clauses (Payload, Next server APIs, prefixed and
 * bare Node builtins) so a fix that closes the hole for one deny list and not the others
 * cannot pass.
 */
const DYNAMIC_FORBIDDEN: readonly ShapeProbe[] = [
  { name: 'dynamic-payload', body: "export const load = async () => await import('payload')\n" },
  {
    name: 'dynamic-payloadcms',
    body: "export const load = async () => await import('@payloadcms/db-postgres')\n",
  },
  {
    name: 'dynamic-next-headers',
    body: "export const load = async () => await import('next/headers')\n",
  },
  { name: 'dynamic-next-og', body: "export const load = async () => await import('next/og')\n" },
  {
    name: 'dynamic-node-fs',
    body: "export const load = async () => await import('node:fs/promises')\n",
  },
  // Bare, not prefixed: the same asymmetry that let the rejected first attempt report a green
  // "no IO" boundary while `net` was importable.
  { name: 'dynamic-bare-net', body: "export const load = async () => await import('net')\n" },
  {
    name: 'dynamic-server-only',
    body: "export const load = async () => await import('server-only')\n",
  },
  // A source that is not a plain string. Without these the rule above is a speed bump rather
  // than a boundary: `import('pay' + 'load')` is one line, and an allowlist any variable
  // defeats does not constrain anyone who wanted to get past it. They also cost nothing to
  // refuse — `packages/ui` has no use for a module specifier it computes at runtime.
  {
    name: 'dynamic-computed',
    body: 'export const load = async (name: string) => await import(name)\n',
  },
  {
    name: 'dynamic-concatenated',
    body: "export const load = async () => await import('pay' + 'load')\n",
  },
  { name: 'dynamic-template', body: 'export const load = async () => await import(`payload`)\n' },
]

/**
 * Dynamic imports the boundary must NOT touch, or it stops being a boundary and becomes a ban.
 *
 * `React.lazy(() => import('./Heavy'))` is the reason code splitting exists and is ordinary in
 * a component package. A relative specifier cannot escape the fence in any case — everything
 * it can reach is itself under `src/**` and fenced by the same block — so the rule has no
 * reason to refuse it, and a rule that refuses it would be routed around with a disable
 * comment on the first real component that needs it.
 */
const DYNAMIC_ALLOWED: readonly ShapeProbe[] = [
  { name: 'dynamic-relative', body: "export const load = async () => await import('./sibling')\n" },
  {
    name: 'dynamic-relative-parent',
    body: "export const load = async () => await import('../sibling')\n",
  },
]

/**
 * The same forbidden modules reached through `require(…)` — the boundary's CommonJS blind spot.
 *
 * Both instruments in this fence are stated against ESM syntax. `no-restricted-imports` visits
 * `ImportDeclaration`, `export … from` and `import x = require(…)`; `PURITY_SELECTORS` visits
 * `ImportExpression`. A bare `require(…)` call is none of those — it is an ordinary
 * `CallExpression` — so every deny list in the config is blind to it by construction, exactly
 * as it was blind to `await import(…)` before that clause existed.
 *
 * Measured against the config before this suite covered it, in `packages/ui/src/`:
 *
 *   req-payload.cjs      const p = require('payload')       -> ZERO boundary findings
 *   req-node-fs.cjs      const fs = require('node:fs')      -> ZERO boundary findings
 *   req-next-headers.js  const h = require('next/headers')  -> ZERO boundary findings
 *   req-in-ts.ts         const p = require('payload')       -> ZERO boundary findings
 *
 * `@typescript-eslint/no-require-imports` did fire on all four, and that is the trap rather
 * than the mitigation: it is a *style* rule about syntax, it says nothing about the boundary,
 * and the one-line fix a contributor writing legitimate CommonJS reaches for is
 * `// eslint-disable-next-line @typescript-eslint/no-require-imports` — which leaves the
 * module reach fenced by nothing at all. A boundary that survives only because an unrelated
 * rule happens to overlap it is not a boundary; it is a coincidence, and it is asserted here
 * on `BOUNDARY_RULES` specifically so the coincidence cannot be mistaken for coverage.
 *
 * This form became reachable when the `files` glob widened past `*.{ts,tsx}`: `.cjs` and `.js`
 * are where `require` is the *natural* spelling, not an exotic one, and they are now in scope.
 *
 * Specifiers are drawn from all four clauses so a fix that closes one deny list cannot pass.
 */
const REQUIRE_FORBIDDEN: readonly ShapeProbe[] = [
  { name: 'require-payload', body: "export const load = () => require('payload')\n" },
  {
    name: 'require-payloadcms',
    body: "export const load = () => require('@payloadcms/db-postgres')\n",
  },
  { name: 'require-next-headers', body: "export const load = () => require('next/headers')\n" },
  { name: 'require-next-og', body: "export const load = () => require('next/og')\n" },
  { name: 'require-node-fs', body: "export const load = () => require('node:fs')\n" },
  // Bare, not prefixed: the asymmetry that let the rejected first attempt report a green
  // "no IO" boundary while `net` was importable.
  { name: 'require-bare-net', body: "export const load = () => require('net')\n" },
  { name: 'require-server-only', body: "export const load = () => require('server-only')\n" },
  // A specifier that is not a plain string, for the same reason the dynamic clause refuses
  // one: an allowlist that `const n = 'net'` defeats does not constrain anybody who wanted
  // past it, and `packages/ui` has no use for a module name it computes at runtime.
  { name: 'require-computed', body: 'export const load = (name: string) => require(name)\n' },
  { name: 'require-concatenated', body: "export const load = () => require('pay' + 'load')\n" },
  { name: 'require-template', body: 'export const load = () => require(`payload`)\n' },
]

/**
 * `require('./sibling')` must stay legal, for the reason the relative dynamic import does.
 *
 * Everything a relative specifier can reach is itself under `src/**` and fenced by the same
 * block, so refusing it buys nothing and costs the rule its credibility — a fence that fires
 * on ordinary local code is one contributors learn to blanket-disable, taking the clauses
 * above with it.
 */
const REQUIRE_ALLOWED: readonly ShapeProbe[] = [
  { name: 'require-relative', body: "export const load = () => require('./sibling')\n" },
  { name: 'require-relative-parent', body: "export const load = () => require('../sibling')\n" },
]

/**
 * Every file extension a module under `src/**` can carry — the boundary's OTHER enumeration.
 *
 * The deny lists were made general (`builtinModules`, a deny-by-default Next regex) precisely
 * because an enumeration matches a form the problem does not take. The `files` glob is an
 * enumeration too, and it was still `*.{ts,tsx}`. Measured against that config, in
 * `packages/ui/src/`:
 *
 *   js-component.js   import * as p from 'payload'          -> ZERO findings
 *   jsx-component.jsx import { cookies } from 'next/headers' -> not linted at all
 *   mts-component.mts import * as fs from 'node:fs'          -> ZERO boundary findings
 *
 * `.jsx` is not an exotic spelling in a React package, it is the default one outside
 * TypeScript, and `.mjs`/`.cjs` are what a build helper or a codegen output lands as. Any of
 * them puts a component one rename away from the whole fence: the deny lists stay perfect and
 * stop being consulted. This is the same lesson as the `node:*` glob and the four Next
 * specifiers, moved one level out — from *what* the rule matches to *where* it looks.
 *
 * Both shapes are probed per extension, because the two clauses live in different rules
 * (`no-restricted-imports` and `no-restricted-syntax`) on different config blocks, and a scope
 * widened on one block only would leave the other half blind.
 */
const SRC_MODULE_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'] as const

interface ExtensionProbe {
  /** File name including the extension, also the test-case label. */
  readonly file: string
  readonly body: string
}

const EXTENSION_PROBES: readonly ExtensionProbe[] = SRC_MODULE_EXTENSIONS.flatMap((ext) => [
  {
    file: `ext-static-payload.${ext}`,
    body: "import * as probe from 'payload'\n\nexport const used = probe\n",
  },
  {
    file: `ext-dynamic-node-fs.${ext}`,
    body: "export const load = async () => await import('node:fs')\n",
  },
])

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
  // Deduplicated: the builtin sweep and the hand-written list deliberately overlap on `fs`
  // and the network builtins, and writing one probe twice would report it twice.
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
 * Runs the repo's own ESLint against the repo's own `eslint.config.mjs`, from the repo root —
 * what `pnpm lint` does, minus the rest of the tree. No `--rule`, no `--config`: a flag here
 * would make this test assert a configuration it invented rather than the one that ships.
 */
function lintProbeDirs(): readonly EslintResult[] {
  const args = ['--format', 'json', SRC_PROBE_DIR, TOKENS_PROBE_DIR, TESTS_PROBE_DIR]
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
  return messagesFor(dir, moduleName).filter(
    (message) => message.ruleId !== null && BOUNDARY_RULES.has(message.ruleId),
  )
}

/** Same filter, addressed by shape-probe stem rather than by module specifier. */
function boundaryMessagesForShape(dir: string, probe: ShapeProbe): readonly EslintMessage[] {
  const path = join(dir, `${probe.name}.ts`)
  const result = results.find((entry) => entry.filePath === path)
  if (!result) {
    throw new Error(
      `eslint reported nothing for ${path}. Linted files:\n` +
        results.map((entry) => entry.filePath).join('\n'),
    )
  }
  return result.messages.filter(
    (message) => message.ruleId !== null && BOUNDARY_RULES.has(message.ruleId),
  )
}

function writeExtensionProbes(dir: string, probes: readonly ExtensionProbe[]): void {
  mkdirSync(dir, { recursive: true })
  for (const probe of probes) {
    // `@ts-nocheck` on every probe for the same reason the others carry it: the T001c suite
    // runs a real `tsc --noEmit` over this package and `payload` is not a dependency of it.
    writeFileSync(join(dir, probe.file), `// @ts-nocheck\n${probe.body}`, 'utf8')
  }
}

/**
 * Boundary findings for a probe addressed by file name — MISSING IS A FAILURE, deliberately.
 *
 * A file ESLint never visits reports nothing, which is indistinguishable from a file it
 * cleared. Under `src/**` those two are the same defect (the module is unfenced either way),
 * so the strict lookup throws rather than returning an empty list: `.jsx` was invisible to
 * ESLint entirely, and a lenient helper would have called that a pass.
 */
function boundaryMessagesForFile(dir: string, file: string): readonly EslintMessage[] {
  const path = join(dir, file)
  const result = results.find((entry) => entry.filePath === path)
  if (!result) {
    throw new Error(
      `eslint reported nothing for ${path} — it was not linted at all, so nothing fences it. ` +
        `Linted files:\n${results.map((entry) => entry.filePath).join('\n')}`,
    )
  }
  return result.messages.filter(
    (message) => message.ruleId !== null && BOUNDARY_RULES.has(message.ruleId),
  )
}

/**
 * The same lookup for `tests/**`, where "not linted" IS the expected outcome for some
 * extensions and must not be read as a missing harness.
 */
function unfencedMessagesForFile(dir: string, file: string): readonly EslintMessage[] {
  const result = results.find((entry) => entry.filePath === join(dir, file))
  return (result?.messages ?? []).filter(
    (message) => message.ruleId !== null && BOUNDARY_RULES.has(message.ruleId),
  )
}

beforeAll(() => {
  writeProbes(SRC_PROBE_DIR, [...FORBIDDEN_IN_SRC, ...NODE_BUILTINS, ...ALLOWED_IN_SRC])
  writeShapeProbes(SRC_PROBE_DIR, [
    ...DYNAMIC_FORBIDDEN,
    ...DYNAMIC_ALLOWED,
    ...REQUIRE_FORBIDDEN,
    ...REQUIRE_ALLOWED,
  ])
  // `src/tokens/**` gets one probe of each clause rather than the full sweep: the question
  // there is whether the directory is inside the boundary at all, not which specifier leaks.
  writeProbes(TOKENS_PROBE_DIR, TOKENS_FORBIDDEN_STATIC)
  writeShapeProbes(TOKENS_PROBE_DIR, [...DYNAMIC_FORBIDDEN, ...REQUIRE_FORBIDDEN])
  writeProbes(TESTS_PROBE_DIR, ALLOWED_IN_TESTS)
  writeShapeProbes(TESTS_PROBE_DIR, [...DYNAMIC_FORBIDDEN, ...REQUIRE_FORBIDDEN])
  writeExtensionProbes(SRC_PROBE_DIR, EXTENSION_PROBES)
  writeExtensionProbes(TESTS_PROBE_DIR, EXTENSION_PROBES)
  results = lintProbeDirs()
}, ESLINT_TIMEOUT_MS)

afterAll(() => {
  rmSync(SRC_PROBE_DIR, { recursive: true, force: true })
  rmSync(TOKENS_PROBE_DIR, { recursive: true, force: true })
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

  it('refuses EVERY Node builtin, not the handful a reviewer thought of', () => {
    // The clause is "packages/ui does no IO", so the rule has to be derived from
    // `builtinModules`, not enumerated. Enumerations rot in two directions at once: a Node
    // release adds a module, and a reviewer's list omits the specifier an author actually
    // reaches for. Asserted as one set difference rather than 66 cases so the failure names
    // the modules that got through instead of the first one alphabetically.
    const reachable = NODE_BUILTINS.filter(
      (moduleName) => boundaryMessagesFor(SRC_PROBE_DIR, moduleName).length === 0,
    )
    expect(
      reachable,
      'these Node builtins are importable from packages/ui/src, so the "no IO" clause is ' +
        'matching a form the problem does not take — derive the rule from ' +
        "module.builtinModules rather than listing specifiers by hand: " +
        reachable.join(', '),
    ).toEqual([])
  })

  it('sweeps a builtin list big enough to be evidence', () => {
    // Guards the assertion above against passing vacuously: an empty or truncated
    // `builtinModules` would make the set difference trivially empty and the sweep silent.
    expect(NODE_BUILTINS.length).toBeGreaterThan(30)
  })

  it.each(ALLOWED_IN_SRC)('leaves `import from "%s"` alone under src/', (moduleName) => {
    const messages = boundaryMessagesFor(SRC_PROBE_DIR, moduleName)
    expect(
      messages,
      `'${moduleName}' is what this package is built from and must stay importable`,
    ).toEqual([])
  })
})

describe('the boundary holds for a dynamic import, not only a static one (FR-018)', () => {
  it.each(DYNAMIC_FORBIDDEN)('rejects `await import("…")` of $name under src/', (probe) => {
    const messages = boundaryMessagesForShape(SRC_PROBE_DIR, probe)
    expect(
      messages.length,
      `${probe.body.trim()} must be an ESLint error in packages/ui/src. ` +
        '`no-restricted-imports` matches ImportDeclaration only, so a deny list expressed ' +
        'solely through it is blind to this form — and this is the form a contributor ' +
        'reaches for once the static one is refused.',
    ).toBeGreaterThan(0)
  })

  it.each(DYNAMIC_FORBIDDEN)('rejects `await import("…")` of $name under src/tokens/', (probe) => {
    const messages = boundaryMessagesForShape(TOKENS_PROBE_DIR, probe)
    expect(
      messages.length,
      `${probe.body.trim()} must be an ESLint error in packages/ui/src/tokens too. Other ` +
        'fences exempt that directory (a hex has to be writable somewhere); the purity ' +
        'clause must not travel with the exemption.',
    ).toBeGreaterThan(0)
  })

  it.each(DYNAMIC_FORBIDDEN)('explains why $name is refused, rather than just failing', (probe) => {
    const [first] = boundaryMessagesForShape(SRC_PROBE_DIR, probe)
    expect(first?.message ?? '').toMatch(/packages\/ui/)
  })

  it.each(DYNAMIC_ALLOWED)('leaves the relative `await import("…")` of $name alone', (probe) => {
    const messages = boundaryMessagesForShape(SRC_PROBE_DIR, probe)
    expect(
      messages,
      `${probe.body.trim()} is ordinary code splitting — React.lazy(() => import('./Heavy')) ` +
        'is the reason the syntax exists, and a relative specifier cannot leave a fence that ' +
        'already covers everything it can reach. A rule that refuses it is a ban, not a ' +
        'boundary, and gets routed around with a disable comment.',
    ).toEqual([])
  })
})

describe('the boundary holds for require(), not only for the ESM forms (FR-018)', () => {
  it.each(REQUIRE_FORBIDDEN)('rejects `require("…")` of $name under src/', (probe) => {
    const messages = boundaryMessagesForShape(SRC_PROBE_DIR, probe)
    expect(
      messages.length,
      `${probe.body.trim()} must be an ESLint error in packages/ui/src. Both instruments in ` +
        'this fence are stated against ESM syntax — no-restricted-imports visits ' +
        'ImportDeclaration and import-equals, PURITY_SELECTORS visits ImportExpression — and a ' +
        'bare require() is an ordinary CallExpression, so every deny list is blind to it by ' +
        'construction. .cjs and .js are in the files glob now, and require is the natural ' +
        'spelling there.',
    ).toBeGreaterThan(0)
  })

  it.each(REQUIRE_FORBIDDEN)('rejects `require("…")` of $name under src/tokens/', (probe) => {
    const messages = boundaryMessagesForShape(TOKENS_PROBE_DIR, probe)
    expect(
      messages.length,
      `${probe.body.trim()} must be an ESLint error in packages/ui/src/tokens too: tokens are ` +
        'the most tempting place to read a palette off disk at build time, and the directory ' +
        'the other fences exempt.',
    ).toBeGreaterThan(0)
  })

  it.each(REQUIRE_FORBIDDEN)('refuses $name for the BOUNDARY reason, not a style one', (probe) => {
    // The load-bearing assertion of this whole describe. Before the clause existed,
    // `@typescript-eslint/no-require-imports` already fired on every probe here — a style
    // rule about syntax that says nothing about the boundary and names no alternative. A
    // contributor writing legitimate CommonJS silences it with one disable comment and the
    // module reach is then fenced by nothing. Requiring the message to name packages/ui is
    // what stops that coincidence from being read as coverage.
    const [first] = boundaryMessagesForShape(SRC_PROBE_DIR, probe)
    expect(first?.message ?? '').toMatch(/packages\/ui/)
  })

  it.each(REQUIRE_ALLOWED)('leaves the relative `require("…")` of $name alone', (probe) => {
    const messages = boundaryMessagesForShape(SRC_PROBE_DIR, probe)
    expect(
      messages,
      `${probe.body.trim()} cannot leave a fence that already covers everything a relative ` +
        'specifier can reach. A rule that refuses it is a ban rather than a boundary, and ' +
        'gets routed around with a disable comment that takes the real clauses with it.',
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

  it.each(REQUIRE_FORBIDDEN)('leaves the require() of $name alone under tests/', (probe) => {
    // Every clause added to this boundary is a fresh chance to write it one directory too
    // wide. `packages/ui/**` instead of `packages/ui/src/**` reads identically in review and
    // takes T011's `git ls-files` with it.
    const messages = boundaryMessagesForShape(TESTS_PROBE_DIR, probe)
    expect(
      messages,
      'the purity boundary stops at src/. A require() clause reaching tests/ would make T011 ' +
        'unwritable, and would do so silently.',
    ).toEqual([])
  })

  it.each(DYNAMIC_FORBIDDEN)('leaves the dynamic import of $name alone under tests/', (probe) => {
    // The dynamic-import clause is new, so it is the clause most likely to be written one
    // directory too wide — `packages/ui/**` instead of `packages/ui/src/**` reads identically
    // in review and takes T011's `git ls-files` with it.
    const messages = boundaryMessagesForShape(TESTS_PROBE_DIR, probe)
    expect(
      messages,
      'the purity boundary stops at src/. A copy of it reaching tests/ would make T011 ' +
        'unwritable, and would do so silently.',
    ).toEqual([])
  })
})

describe('the static clauses reach src/tokens/ as well (FR-018)', () => {
  it.each(TOKENS_FORBIDDEN_STATIC)('rejects `import from "%s"` under src/tokens/', (moduleName) => {
    const messages = boundaryMessagesFor(TOKENS_PROBE_DIR, moduleName)
    expect(
      messages.length,
      `importing '${moduleName}' from packages/ui/src/tokens must be an ESLint error: ` +
        'tokens are the most tempting place to read a palette off disk at build time, and ' +
        'the directory other fences exempt.',
    ).toBeGreaterThan(0)
  })
})

describe('the boundary covers every extension a module in src/ can have (FR-018)', () => {
  it.each(EXTENSION_PROBES)('refuses the forbidden module in $file under src/', (probe) => {
    const messages = boundaryMessagesForFile(SRC_PROBE_DIR, probe.file)
    expect(
      messages.length,
      `${probe.body.trim()} must be an ESLint error in packages/ui/src/${probe.file}. The deny ` +
        'lists were made general so no specifier could slip past them; the files glob is an ' +
        'enumeration in the same way, and a component is one rename away from leaving the ' +
        'fence entirely while every deny list still reads as correct.',
    ).toBeGreaterThan(0)
  })

  it('probes enough extensions to be evidence', () => {
    // Guards the sweep above against passing vacuously if the extension list is trimmed to
    // the two that already worked.
    expect(new Set(SRC_MODULE_EXTENSIONS).size).toBeGreaterThanOrEqual(8)
  })

  it.each(EXTENSION_PROBES)('still leaves $file alone under tests/', (probe) => {
    // The widening must move the boundary OUT by extension, never OUT by directory. A fix
    // applied to `packages/ui/**` instead of `packages/ui/src/**` passes every assertion
    // above and takes T011's `git ls-files` with it.
    const messages = unfencedMessagesForFile(TESTS_PROBE_DIR, probe.file)
    expect(
      messages,
      'the purity boundary stops at src/, whatever the file extension: tests/ reads the git ' +
        'index for T011 and cannot do that through a boundary written for components.',
    ).toEqual([])
  })
})
