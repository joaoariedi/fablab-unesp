import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * T007b / FR-002, CLR-001 — the colour fence, CSS half.
 *
 * ESLint does not lint `.css` at all, and CSS Modules is where a component's colour is
 * actually written. The TypeScript half (T007) therefore guards the surface a hex is
 * *least* likely to appear on. This script guards the other one.
 *
 * ── The assertion this file exists for ──────────────────────────────────────────────────
 *
 * `grep` exits **1 when it finds nothing**, which is this gate's SUCCESS case. The plan's
 * round 2 measured the first draft returning exit 1 on a clean tree *and* on a dirty one —
 * a gate that cannot tell pass from fail, the same defect class as feature 000's
 * `grep | head`. So `passes on a clean tree` below is not a smoke test; it is the
 * regression guard for the exact bug this task was written to avoid, and it is worthless
 * unless a *dirty* tree is proven to exit 1 in the same file. Both are asserted.
 *
 * ── Why violations are probed in a fixture tree, not in this repo ───────────────────────
 *
 * The script is self-locating (it resolves the repo root from its own path), so a probe
 * proving "a hex in `packages/ui/src` fails the gate" would have to write a hex into the
 * real `packages/ui/src`. Vitest runs this package's test files in one worker pool: the
 * T007 fence test lints those very directories and the token tests read them, so a probe
 * living there for the length of a `spawnSync` is a race with a green-or-red outcome that
 * depends on scheduling. The fixture is a byte-for-byte copy of the shipped script placed
 * in a throwaway tree of the same shape — the same file, the same code path, no race.
 * The clean case is additionally run against the **real** script in the **real** repo,
 * because that is the invocation CI makes.
 */

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SCRIPT = join(REPO_ROOT, 'scripts', 'check-colour-tokens.sh')

interface Run {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

/** Invokes the gate the way CI does — `bash <script>` — and captures both streams. */
function runGate(script: string, cwd: string): Run {
  const result = spawnSync('bash', [script], { cwd, encoding: 'utf8' })
  if (result.error) throw result.error
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function writeFile(root: string, relative: string, body: string): void {
  const path = join(root, relative)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body, 'utf8')
}

/** A throwaway tree shaped like the repo, carrying a byte-identical copy of the script. */
function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'colour-fence-css-'))
  mkdirSync(join(root, 'scripts'), { recursive: true })
  copyFileSync(SCRIPT, join(root, 'scripts', 'check-colour-tokens.sh'))
  return root
}

function fixtureScript(root: string): string {
  return join(root, 'scripts', 'check-colour-tokens.sh')
}

interface Probe {
  /** Path relative to the fixture root; also the `it.each` label. */
  readonly file: string
  /** The substring the failure report must quote, so a reviewer sees *what* was written. */
  readonly value: string
  readonly body: string
}

/**
 * Every shape a raw colour takes in CSS, plus the one CLR-001 forbids by name.
 *
 * `--color-rosa-raw` is the round 2 hole this task closes: the private default was banned
 * only in TypeScript, leaving it free in `.css` — the single file type a component would
 * ever write it in. A `Card.module.css` reaching for it renders *identically* to a correct
 * one for CITe and fails to co-brand only once a second organization exists.
 */
const FORBIDDEN: readonly Probe[] = [
  {
    file: 'packages/ui/src/components/Button.module.css',
    value: '#EE703E',
    body: '.button { background: #EE703E; }\n',
  },
  {
    file: 'packages/ui/src/components/Chip.module.css',
    value: '#fff',
    // Shorthand. A rule matching the six-digit form only fences the spelling, not the value.
    body: '.chip { color: #fff; }\n',
  },
  {
    file: 'apps/web/app/page.module.css',
    value: 'rgb(',
    body: '.page { background: rgb(238, 112, 62); }\n',
  },
  {
    file: 'apps/web/app/hero.module.css',
    value: 'hsla(',
    body: '.hero { box-shadow: 0 0 0 1px hsla(0, 0%, 0%, 0.5); }\n',
  },
  {
    file: 'packages/ui/src/components/Card.module.css',
    value: '--color-rosa-raw',
    body: '.card__title { color: var(--color-rosa-raw); }\n',
  },
  {
    file: 'packages/game/src/board.module.css',
    value: '#123456',
    // `pnpm-workspace.yaml` globs `apps/*` and `packages/*`, but the gate enumerated the two
    // directories that happened to hold CSS the day it was written. `packages/game` is a
    // workspace package that exists *today* and was scanned by nothing — measured: this file,
    // carrying a hex AND the private token, exited 0 with `PASS`. That is the script's own
    // "a gate that scans nothing reports PASS forever" failure, narrowed from a renamed root
    // to an unenumerated one, and an existence check cannot catch it: nothing is missing, the
    // list is merely short. The next package added is unfenced the same way.
    body: '.board { color: #123456; background: var(--color-rosa-raw); }\n',
  },
  {
    file: 'packages/game/src/pieces.module.css',
    value: '--color-rosa-raw',
    // The CLR-001 half of the same hole, probed separately because a probe asserts one
    // substring: a package outside the enumerated roots frees the private token as well as
    // the hex, which is the exact round 2 escape this task exists to close.
    body: '.piece { color: var(--color-rosa-raw); }\n',
  },
  {
    file: 'apps/web/app/tokens/theme.module.css',
    value: '#191C37',
    // A directory *named* tokens is not the token layer. The exemption is one reviewed
    // path — `packages/ui/src/tokens/` — and not any folder that adopts the name.
    body: '.theme { color: #191C37; }\n',
  },
]

/**
 * What must stay writable. A gate that fires on the token file it exists to protect, or on
 * build output every developer has locally, teaches contributors to delete it.
 */
const ALLOWED: readonly Probe[] = [
  {
    file: 'packages/ui/src/tokens/palette.css',
    value: '#EE9DC4',
    // The one place a colour may be written, and where `--color-rosa-raw` is *defined*.
    body: ':root { --color-laranja: #EE703E; --color-rosa-raw: #EE9DC4; }\n',
  },
  {
    file: 'packages/ui/src/components/Ok.module.css',
    value: 'var(--color-primary)',
    body: '.ok { color: var(--color-primary); border-color: var(--color-navy); }\n',
  },
  {
    file: 'apps/web/app/ok.module.css',
    value: 'var(--color-primary)',
    body: '.ok { background: var(--color-primary); }\n',
  },
  {
    file: 'packages/ui/src/components/Button.tsx',
    value: '#EE703E',
    // Not this gate's surface: a hex in TypeScript is T007's `no-restricted-syntax`. If it
    // showed up here the two halves would double-report, and `--include=*.css` would be
    // doing nothing.
    body: "export const brand = '#EE703E'\n",
  },
  {
    file: 'apps/web/.next/static/chunks/vendor.css',
    value: '#00000080',
    // Measured on this repo: a local `next build` leaves minified vendor CSS full of hexes
    // under `.next/`. Scanning it makes the gate fail for everyone who has ever run a
    // build, which is how a gate gets deleted rather than fixed.
    body: '.x{box-shadow:0 0 0 9999em #00000080;color:#fff}\n',
  },
  {
    file: 'apps/web/node_modules/some-pkg/dist/some-pkg.css',
    value: '#2dbfff',
    body: '.pkg { color: #2dbfff; }\n',
  },
]

let cleanRun: Run
let dirtyRun: Run
let repoRun: Run
let fixtureRoot: string

beforeAll(() => {
  expect(
    existsSync(SCRIPT),
    `${SCRIPT} does not exist — the CSS half of the fence runs nowhere and every ` +
      'assertion below is vacuous',
  ).toBe(true)

  fixtureRoot = makeFixture()
  for (const probe of ALLOWED) writeFile(fixtureRoot, probe.file, probe.body)
  cleanRun = runGate(fixtureScript(fixtureRoot), fixtureRoot)

  for (const probe of FORBIDDEN) writeFile(fixtureRoot, probe.file, probe.body)
  dirtyRun = runGate(fixtureScript(fixtureRoot), fixtureRoot)

  repoRun = runGate(SCRIPT, REPO_ROOT)
})

afterAll(() => {
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true })
})

describe('the gate can tell a clean tree from a dirty one (round 2)', () => {
  it('exits 0 when there is nothing to report', () => {
    expect(
      cleanRun.status,
      'grep exits 1 when it matches nothing, and that is this gate\'s success case. ' +
        'Capture the hits and branch on emptiness; piping grep into the exit status makes ' +
        `a clean tree fail. stdout:\n${cleanRun.stdout}\nstderr:\n${cleanRun.stderr}`,
    ).toBe(0)
  })

  it('exits 1 when a raw colour is present', () => {
    expect(
      dirtyRun.status,
      `a tree carrying ${FORBIDDEN.length} violations must fail. ` +
        `stdout:\n${dirtyRun.stdout}\nstderr:\n${dirtyRun.stderr}`,
    ).toBe(1)
  })

  it('passes on this repository, run the way CI runs it', () => {
    // T045b's job is `bash scripts/check-colour-tokens.sh` from the repo root. If the tree
    // is clean and this is red, the gate is unusable and every later task is blocked by it.
    expect(
      repoRun.status,
      `stdout:\n${repoRun.stdout}\nstderr:\n${repoRun.stderr}`,
    ).toBe(0)
  })
})

describe('every raw-colour shape in CSS is reported (FR-002, CLR-001, SC-001)', () => {
  it.each(FORBIDDEN.map((probe) => [probe.file, probe] as const))(
    'names the file %s',
    (_label, probe) => {
      expect(
        dirtyRun.stderr,
        'SC-001 requires the failure to name the file. A gate that says only "raw colour ' +
          'found" costs the next contributor a manual hunt.',
      ).toContain(probe.file)
    },
  )

  it.each(FORBIDDEN.map((probe) => [probe.file, probe] as const))(
    'quotes the offending value in %s',
    (_label, probe) => {
      expect(
        dirtyRun.stderr,
        'SC-001 requires the failure to name the value, not just the file.',
      ).toContain(probe.value)
    },
  )

  it('reports on stderr, so a failing gate is not swallowed as ordinary output', () => {
    expect(dirtyRun.stderr.trim().length).toBeGreaterThan(0)
  })
})

describe('the exemptions hold, and are one reviewed path (CLR-001)', () => {
  it.each(ALLOWED.map((probe) => [probe.file, probe] as const))(
    'leaves %s alone',
    (_label, probe) => {
      const reported = `${dirtyRun.stdout}${dirtyRun.stderr}`
      expect(
        reported.includes(probe.file),
        `${probe.file} is legitimate and must not be reported, even on a dirty run. ` +
          `Report was:\n${reported}`,
      ).toBe(false)
    },
  )
})

describe('the gate cannot pass by scanning nothing', () => {
  it('fails loudly when a scan root is missing', () => {
    // grep exits 2 and prints to stderr when a path does not exist; `|| true` — which the
    // exit contract above requires — swallows that as cleanly as it swallows "no matches".
    // A renamed directory would then leave a gate that scans zero files and reports PASS
    // forever, which is the same false assurance as the round 2 bug, inverted.
    const empty = makeFixture()
    try {
      const run = runGate(fixtureScript(empty), empty)
      expect(
        run.status,
        `a tree with no packages/ui/src must not report PASS. stdout:\n${run.stdout}`,
      ).not.toBe(0)
      expect(`${run.stdout}${run.stderr}`).toContain('packages/ui/src')
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('scans relative to itself, not to the working directory', () => {
    // CI runs it from the repo root, but a developer runs it from wherever they are. A
    // cwd-relative scan would silently find no `.css` and pass.
    const elsewhere = runGate(SCRIPT, tmpdir())
    expect(
      elsewhere.status,
      `run from ${tmpdir()} the gate must still scan this repo and pass. ` +
        `stdout:\n${elsewhere.stdout}\nstderr:\n${elsewhere.stderr}`,
    ).toBe(0)
  })

  it('probes both halves of the fence, so no case list is vacuous', () => {
    expect(FORBIDDEN.length).toBeGreaterThan(5)
    expect(FORBIDDEN.some((probe) => probe.value === '--color-rosa-raw')).toBe(true)
    expect(ALLOWED.some((probe) => probe.file.startsWith('packages/ui/src/tokens/'))).toBe(true)
  })
})
