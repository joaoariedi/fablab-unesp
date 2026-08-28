import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * T007 / FR-002, CLR-001 — the colour fence, TypeScript half.
 *
 * FR-002 is "zero hexadecimal literals in any component", and CLR-001 adds the harder half:
 * `--color-rosa-raw` is the *default* for `--color-primary`, never an accent. A component
 * painted with the raw pink renders **identically** to a correct one for CITe, passes every
 * test, and fails to co-brand only once a second organization exists. Neither failure has a
 * runtime symptom, so lint is the only instrument that can see them.
 *
 * ── Why four selectors and not one ──────────────────────────────────────────────────────
 *
 * The plan's round 2 measured a `Literal`-only rule and found it caught `'#EE703E'` and
 * missed `` `#EE703E` `` entirely. styled-jsx ships with Next — no install, no import — so
 * `` <style jsx>{`.chip{color:#EE703E}`}</style> `` is a natural reach for component CSS and
 * is invisible to both a `Literal` selector and to the `.css` script (T007b), which does not
 * read `.tsx`. Every template case below is probed for that reason, not for symmetry.
 *
 * ── Why the exemptions are directories ──────────────────────────────────────────────────
 *
 * `tokens/**` is the one place a colour may be written. `apps/web/tests/**` and
 * `packages/ui/tests/**` must be able to do the forbidden thing: T016 needs two organizations
 * with *different* `primaryColor` hexes, and this very file writes hex probes on purpose. The
 * tenancy fence in the same config already exempts `apps/web/tests/**` for that reason — the
 * precedent existed. Keeping every exemption a **path** keeps it visible in review, where a
 * per-line `eslint-disable` would not be.
 *
 * Assertions here are **executed**: every probe is a real file run through the repo's real
 * ESLint from the repo root, the way `pnpm lint` runs it. No `--rule`, no `--config` — a flag
 * would make this file assert a configuration it invented rather than the one that ships.
 * Messages are filtered to `no-restricted-syntax` because the recommended config also fires
 * (unused vars, `@ts-nocheck`) and folding those in would make the fence pass or fail for
 * reasons unrelated to colour.
 */

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const ESLINT_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'eslint')

/** ESLint over a handful of files is fast; a cold start on a loaded machine is not. */
const ESLINT_TIMEOUT_MS = 120_000

const FENCE_RULE = 'no-restricted-syntax'

/** Probe directory name, shared by every location so cleanup is one glob per location. */
const PROBE_DIR = '__colour_probe__'

/**
 * Where the fence must bite, and where it must not.
 *
 * Both halves are load-bearing. A fence that only covers `packages/ui/src` leaves `apps/web`
 * — which owns the layout, the theme resolution and every page — free to write hexes, and
 * `apps/web` is where a hex is most likely to be typed under deadline. A fence that covers
 * the exempt directories makes T016's two-organization fixture unwritable and this file
 * self-defeating.
 */
const FENCED = {
  'packages/ui/src': join(REPO_ROOT, 'packages', 'ui', 'src', PROBE_DIR),
  'apps/web': join(REPO_ROOT, 'apps', 'web', PROBE_DIR),
} as const

const EXEMPT = {
  'packages/ui/src/tokens': join(REPO_ROOT, 'packages', 'ui', 'src', 'tokens', PROBE_DIR),
  'packages/ui/tests': join(REPO_ROOT, 'packages', 'ui', 'tests', PROBE_DIR),
  'apps/web/tests': join(REPO_ROOT, 'apps', 'web', 'tests', PROBE_DIR),
} as const

const ALL_PROBE_DIRS = [...Object.values(FENCED), ...Object.values(EXEMPT)]

interface Probe {
  /** File stem; also the test-case label. */
  readonly name: string
  /** Every extension a module can carry — see EXTENSION_FORBIDDEN for why this is not ts|tsx. */
  readonly ext: 'ts' | 'tsx' | 'mts' | 'cts' | 'js' | 'jsx' | 'mjs' | 'cjs'
  readonly body: string
}

/**
 * `@ts-nocheck` keeps a probe invisible to `tsc`. `apps/web` and `packages/ui` both run a
 * real `tsc --noEmit` in the same worker pool, and a probe must be inert to every gate except
 * the one it is aimed at.
 */
function probeSource(probe: Probe): string {
  return `// @ts-nocheck\n${probe.body}\n`
}

const BACKTICK = String.fromCharCode(96)

/** `` `text` `` as source, without fighting nested backticks in this file. */
function template(text: string): string {
  return `${BACKTICK}${text}${BACKTICK}`
}

/**
 * Every shape a colour can take in TypeScript. Each entry names a form that a `Literal`-only
 * rule was measured to miss, or a form CLR-001 forbids by name.
 */
const FORBIDDEN: readonly Probe[] = [
  {
    name: 'hex-in-a-string-literal',
    ext: 'ts',
    body: "export const brand = '#EE703E'",
  },
  {
    name: 'three-digit-hex',
    ext: 'ts',
    // A component author writing shorthand. Missing this would leave the rule matching the
    // long form only — a fence that fails on the spelling, not on the value.
    body: "export const brand = '#fff'",
  },
  {
    name: 'eight-digit-hex-with-alpha',
    ext: 'ts',
    body: "export const brand = '#EE703EFF'",
  },
  {
    name: 'hex-inside-a-compound-css-value',
    ext: 'ts',
    // The shape FR-006 guarantees somebody writes: the primary button is specified as a
    // "hard offset shadow", which is a four-part CSS value with the colour in the middle of
    // it. An ANCHORED `Literal[value=/^#...$/]` selector matches only a string that is
    // *nothing but* a colour, so this evades it — measured against the shipped config, which
    // reported zero findings for all three compound probes below.
    body: "export const shadow = { boxShadow: '4px 4px 0 #191C37' }",
  },
  {
    name: 'shorthand-hex-inside-a-compound-css-value',
    ext: 'ts',
    body: "export const outline = { border: '1px solid #fff' }",
  },
  {
    name: 'hex-in-a-jsx-style-prop',
    ext: 'tsx',
    // The same miss at the call site it actually reaches. An inline `style` object is the
    // path of least resistance inside a component, and its value is a plain Literal — so
    // neither the template selector nor the `.css` script (T007b, which does not read
    // `.tsx`) can see it. Nothing at all was guarding this.
    body:
      'export function Probe() {\n' +
      "  return <div style={{ boxShadow: '4px 4px 0 #191C37' }} />\n" +
      '}',
  },
  {
    name: 'hex-in-a-template-literal',
    ext: 'ts',
    body: `export const rule = ${template('color: #EE703E')}`,
  },
  {
    name: 'hex-in-styled-jsx',
    ext: 'tsx',
    // The exact shape round 2 measured as escaping BOTH halves of the fence: invisible to a
    // `Literal` selector, and in a `.tsx` the `.css` script never reads.
    body:
      'export function Probe() {\n' +
      `  return <style jsx>{${template('.chip { color: #EE703E; }')}}</style>\n` +
      '}',
  },
  {
    name: 'rosa-raw-in-a-string-literal',
    ext: 'ts',
    // CLR-001: the private default. Renders identically to `--color-primary` for CITe.
    body: "export const accent = 'var(--color-rosa-raw)'",
  },
  {
    name: 'rosa-raw-in-a-template-literal',
    ext: 'ts',
    body: `export const accent = ${template('color: var(--color-rosa-raw)')}`,
  },
]

/**
 * The same forbidden value, in every OTHER extension a module can carry.
 *
 * Measured against the shipped config before this list existed: in `apps/web`, a hex in a
 * `.mjs` or a `.mts` file produced ZERO `no-restricted-syntax` findings, and a `.jsx` file was
 * not linted AT ALL — while the byte-identical `.ts` file beside it was refused. The colour
 * block's `files` read `*.{ts,tsx}` while the purity block one screen below already read
 * `*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}`, carrying a comment that records that exact measurement
 * for *imports*. The colour fence simply never inherited it.
 *
 * FR-002 is "zero hexadecimal literals in any component", and `.jsx` is not an exotic
 * spelling for a React component — it is the default one outside TypeScript. `.mjs`/`.cjs`
 * are what a build helper or a codegen output lands as, and `.mts`/`.cts` are TypeScript that
 * ESLint visits happily. A fence that refuses a value in one spelling and permits it in the
 * next is not a fence; it is a naming convention.
 *
 * These run over the FENCED locations only, deliberately. An exemption probe would assert
 * nothing: a `.jsx` file matched by no config object's `files` is not linted anywhere in this
 * repo, so "it reported no colour error" is equally true of a working exemption and of a
 * hole. The exemptions are proven with the ts/tsx probes above, which ARE linted everywhere.
 */
const EXTENSION_FORBIDDEN: readonly Probe[] = [
  // `const`, not `export const`: a `.cjs` probe is parsed as CommonJS, where an `export`
  // statement is a parse error — and a probe that fails to parse would report a fatal
  // message with a null ruleId, i.e. it would look exactly like a fence that did not fire.
  { name: 'hex-in-an-mts-module', ext: 'mts', body: "const brand = '#EE703E'" },
  { name: 'hex-in-a-cts-module', ext: 'cts', body: "const brand = '#EE703E'" },
  { name: 'hex-in-a-js-module', ext: 'js', body: "const brand = '#EE703E'" },
  { name: 'hex-in-an-mjs-module', ext: 'mjs', body: "const brand = '#EE703E'" },
  { name: 'hex-in-a-cjs-module', ext: 'cjs', body: "const brand = '#EE703E'" },
  {
    name: 'hex-in-a-jsx-component',
    ext: 'jsx',
    // Real JSX, not a bare string, because this probe carries a second job: making `.jsx`
    // lintable at all means the config must also be able to PARSE it. A widening that
    // matches `.jsx` without enabling JSX syntax would turn every React component outside
    // TypeScript into a fatal parse error instead of a colour error.
    body:
      'export function Probe() {\n' +
      "  return <div style={{ boxShadow: '4px 4px 0 #191C37' }} />\n" +
      '}',
  },
]

/** Everything the fenced locations must refuse, in every spelling. */
const ALL_FENCED_FORBIDDEN: readonly Probe[] = [...FORBIDDEN, ...EXTENSION_FORBIDDEN]

/**
 * What must stay writable. The plan's risk table worried that a hex rule would fire on
 * legitimate non-colour strings and teach contributors to disable it; these are that worry
 * checked rather than asserted.
 */
const ALLOWED: readonly Probe[] = [
  {
    name: 'the-public-primary-token',
    ext: 'ts',
    body: "export const accent = 'var(--color-primary)'",
  },
  {
    name: 'the-public-primary-token-in-a-template',
    ext: 'ts',
    body: `export const accent = ${template('color: var(--color-primary)')}`,
  },
  {
    name: 'a-platform-token',
    ext: 'ts',
    body: "export const logo = 'var(--color-laranja)'",
  },
  {
    name: 'the-corrected-compound-shadow',
    ext: 'ts',
    // The exact string the error message tells a contributor to write instead. Widening the
    // match to find a colour *inside* a compound value must not also flag the fix.
    body: "export const shadow = { boxShadow: '4px 4px 0 var(--color-navy)' }",
  },
  {
    name: 'the-corrected-compound-shadow-in-a-template',
    ext: 'ts',
    body: `export const shadow = ${template('box-shadow: 4px 4px 0 var(--color-navy);')}`,
  },
  {
    name: 'a-hex-digest-that-is-not-a-colour',
    ext: 'ts',
    // A run of hex characters longer than any colour is a digest, not a colour. An
    // unanchored match with no trailing boundary finds `#0bfbc5f` inside this and the fence
    // starts firing on commit SHAs — which is how a rule earns a blanket eslint-disable.
    body: "export const fingerprint = '#0bfbc5fcb625d24344fcc'",
  },
  {
    name: 'a-fragment-href',
    ext: 'tsx',
    body: 'export function Probe() {\n  return <a href="#section-3">x</a>\n}',
  },
  {
    name: 'a-fragment-href-in-a-template',
    ext: 'ts',
    body: `export const href = ${template('#section-3')}`,
  },
]

/**
 * The tenancy fence lives in the same `no-restricted-syntax` rule, and ESLint flat config
 * REPLACES a rule's options when a later config object names the same rule — it does not
 * merge them. A colour block added after the tenancy block would therefore delete the
 * tenancy selectors for every file both blocks match, silently, with a green lint run and no
 * diff anywhere near `lib/tenancy`. This probe is the regression guard for exactly that.
 */
const TENANCY_PROBE: Probe = {
  name: 'tenancy-fence-still-fires',
  ext: 'ts',
  body: 'export function handler(req) {\n  return req.payload\n}',
}

function probeFileName(probe: Probe): string {
  return `${probe.name}.${probe.ext}`
}

function writeProbes(dir: string, probes: readonly Probe[]): void {
  mkdirSync(dir, { recursive: true })
  for (const probe of probes) {
    writeFileSync(join(dir, probeFileName(probe)), probeSource(probe), 'utf8')
  }
}

interface EslintMessage {
  readonly ruleId: string | null
  readonly message: string
  readonly fatal?: boolean
}

interface EslintResult {
  readonly filePath: string
  readonly messages: readonly EslintMessage[]
}

/** Runs the repo's own ESLint against the repo's own `eslint.config.mjs`, from the root. */
function lintProbeDirs(): readonly EslintResult[] {
  let stdout: string
  try {
    stdout = execFileSync(ESLINT_BIN, ['--format', 'json', ...ALL_PROBE_DIRS], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: ESLINT_TIMEOUT_MS,
    })
  } catch (error) {
    const failure = error as { status?: number | null; stdout?: string; stderr?: string }
    // Exit 1 is "found errors" — the expected case here. Exit 2 is "could not run at all"
    // (bad config, unmatched path); reporting that as "no findings" would turn a broken
    // harness into a green fence.
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

function messagesFor(dir: string, probe: Probe): readonly EslintMessage[] {
  const path = join(dir, probeFileName(probe))
  const result = results.find((entry) => entry.filePath === path)
  if (!result) {
    throw new Error(
      `eslint reported nothing for ${path} — the config matches no such file, so this ` +
        `probe proves nothing. Linted files:\n${results.map((e) => e.filePath).join('\n')}`,
    )
  }
  return result.messages
}

function fenceMessagesFor(dir: string, probe: Probe): readonly EslintMessage[] {
  return messagesFor(dir, probe).filter((message) => message.ruleId === FENCE_RULE)
}

/** `[location, probe name, directory, probe]` — the first two are the `it.each` title. */
type Case = readonly [string, string, string, Probe]

function casesOver(
  locations: Readonly<Record<string, string>>,
  probes: readonly Probe[],
): readonly Case[] {
  return Object.entries(locations).flatMap(([label, dir]) =>
    probes.map((probe): Case => [label, probe.name, dir, probe]),
  )
}

const FENCED_CASES = casesOver(FENCED, ALL_FENCED_FORBIDDEN)
const EXEMPT_CASES = casesOver(EXEMPT, FORBIDDEN)
const ALLOWED_CASES = casesOver(FENCED, ALLOWED)

beforeAll(() => {
  for (const dir of Object.values(FENCED)) {
    writeProbes(dir, [...ALL_FENCED_FORBIDDEN, ...ALLOWED])
  }
  writeProbes(FENCED['apps/web'], [TENANCY_PROBE])
  for (const dir of Object.values(EXEMPT)) {
    writeProbes(dir, FORBIDDEN)
  }
  results = lintProbeDirs()
}, ESLINT_TIMEOUT_MS)

afterAll(() => {
  for (const dir of ALL_PROBE_DIRS) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('the colour fence bites where components live (FR-002, CLR-001)', () => {
  it.each(FENCED_CASES)('%s rejects %s', (label, _name, dir, probe) => {
    const messages = fenceMessagesFor(dir, probe)
    expect(
      messages.length,
      `${probeFileName(probe)} must be a ${FENCE_RULE} error under ${label}; ` +
        `eslint reported: ${JSON.stringify(messagesFor(dir, probe))}`,
    ).toBeGreaterThan(0)
  })

  it.each(FENCED_CASES)('%s explains why %s is refused', (label, _name, dir, probe) => {
    // A bare "Using 'Literal' is not allowed" teaches nothing and the next contributor's fix
    // is a targeted eslint-disable. The message must name the token to reach for instead —
    // the same standard the tenancy and purity fences in this repo already meet.
    const [first] = fenceMessagesFor(dir, probe)
    expect(first?.message ?? '', `${probeFileName(probe)} under ${label}`).toMatch(/--color-/)
  })

  it.each(ALLOWED_CASES)('%s leaves %s alone', (label, _name, dir, probe) => {
    const messages = fenceMessagesFor(dir, probe)
    expect(
      messages,
      `${probeFileName(probe)} is legitimate under ${label} and must not fire the fence — ` +
        'a rule that flags fragment hrefs and public tokens teaches contributors to disable it',
    ).toEqual([])
  })
})

describe('the exemptions are directories, and they hold (round 3)', () => {
  it.each(EXEMPT_CASES)('%s may still write %s', (label, _name, dir, probe) => {
    const messages = fenceMessagesFor(dir, probe)
    expect(
      messages,
      `${label} is exempt on purpose: tokens/ is the one place a colour is defined, and the ` +
        'test directories must be able to do the forbidden thing (T016 needs two ' +
        `organizations with different primaryColor hexes). eslint reported: ${JSON.stringify(messages)}`,
    ).toEqual([])
  })
})

describe('adding the colour selectors did not delete the tenancy selectors', () => {
  it('still rejects req.payload in apps/web', () => {
    const messages = fenceMessagesFor(FENCED['apps/web'], TENANCY_PROBE)
    expect(
      messages.map((message) => message.message).join('\n'),
      'ESLint flat config REPLACES a rule\'s options rather than merging them, so a colour ' +
        'block naming no-restricted-syntax after the tenancy block silently disarms the ' +
        'tenancy fence for every file both match',
    ).toMatch(/getTenantScopedPayload/)
  })
})

describe('the probes are evidence, not noise', () => {
  it('parses every probe', () => {
    // A syntax error surfaces as a fatal message with a null ruleId, which would make a
    // "fires the fence" assertion fail for the wrong reason and an "exempt" assertion pass
    // for the wrong reason. Name it explicitly instead.
    const fatal = results.flatMap((result) =>
      result.messages
        .filter((message) => message.fatal)
        .map((message) => `${result.filePath}: ${message.message}`),
    )
    expect(fatal, 'probe files must parse; a parse error makes every other case meaningless')
      .toEqual([])
  })

  it('probes every surface the plan measured', () => {
    // Guards the it.each blocks against passing vacuously if a list is emptied by a refactor.
    expect(FORBIDDEN.filter((probe) => probe.body.includes(BACKTICK)).length).toBeGreaterThan(2)
    expect(FENCED_CASES.length).toBe(ALL_FENCED_FORBIDDEN.length * 2)
    expect(EXEMPT_CASES.length).toBe(FORBIDDEN.length * 3)
  })

  it('probes every extension the config claims a module can carry', () => {
    // The config states the extension set once, as a constant, and three blocks share it.
    // This is the assertion that the colour fence is judged against the SAME set: without it,
    // widening the constant later would leave the new spelling probed by nothing and the
    // suite would stay green over the hole it just opened.
    const config = readFileSync(join(REPO_ROOT, 'eslint.config.mjs'), 'utf8')
    // Any brace list of bare lowercase extensions, wherever it is written: the config states
    // the set as a constant now, but it used to be spelled inline in each `files` glob and a
    // regex tied to one spelling would go quietly vacuous if it moved back.
    const declared = new Set<string>(
      [...config.matchAll(/\{([a-z]{2,4}(?:,[a-z]{2,4})+)\}/g)].flatMap((match) =>
        (match[1] ?? '').split(','),
      ),
    )
    const probed = new Set<string>(ALL_FENCED_FORBIDDEN.map((probe) => probe.ext))
    expect(declared.size, 'no extension globs found in eslint.config.mjs — regex has rotted')
      .toBeGreaterThan(1)
    expect(
      [...declared].filter((ext) => !probed.has(ext)),
      'an extension the config names is an extension a component can be written in; ' +
        'each one needs a probe here or the fence is unmeasured for that spelling',
    ).toEqual([])
  })
})
