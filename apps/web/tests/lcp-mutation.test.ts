import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The LCP budget has to be watched failing before it counts (T016, SC-006, SC-012).
 *
 * `scripts/lcp-budget.sh` has never been observed red. A performance gate that has only ever
 * been green is evidence of nothing: a build that serves an error page, a Lighthouse run that
 * reports no LCP audit, a URL list that quietly went empty — each of those is a gate that
 * passes hardest exactly when it has stopped measuring. `scripts/lcp-mutation.sh` is the
 * counter-proof: it plants a deliberately oversized hero on the Home, runs the real budget
 * gate, and requires it to go red **naming the URL and the measured value**.
 *
 * "Exit code alone is not accepted" is the whole point, and it is the thing this file spends
 * most of its assertions on. A missing database, a failed build, a server that never answers
 * and a syntax error in the mutation itself all exit non-zero. If the proof accepts any
 * non-zero status it certifies the budget as failable on a run where the budget never
 * measured anything — the same false assurance as a harness with no scoped collections, which
 * is exactly what `isolation-mutation.sh` learnt the hard way.
 *
 * So the script is exercised two ways:
 *
 *   1. its verdict function directly, sourced, against fixture output — the accepted failure,
 *      the wrong-reason failure, the failure that names another page, and the "measured value"
 *      that does not actually exceed the budget;
 *   2. the whole thing end to end against a stub `pnpm`, `curl` and `npx` on PATH. The stub
 *      `pnpm` reports, at BUILD time, how big the largest asset under `public/` is and whether
 *      the Home renders it — which is what proves the mutation is in place while the gate runs
 *      rather than merely somewhere in the script's prose.
 *
 * And the working tree must come back. A mutation script that leaves a 12 MB PNG and a
 * rewritten Home behind is one `git commit -a` away from shipping them.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..')
const SCRIPT = join(ROOT, 'scripts', 'lcp-mutation.sh')
const HOME_PAGE = join(ROOT, 'apps', 'web', 'app', '(frontend)', 'page.tsx')

type Run = { status: number; stdout: string; stderr: string; output: string }

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'lcp-mutation-test-'))
}

/** Run a snippet with the script sourced, so its verdict is under test rather than its prose. */
function sourced(snippet: string): Run {
  const result = spawnSync('bash', ['-c', `source "$1" || exit 97\n${snippet}`, '_', SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  return { status: result.status ?? -1, stdout, stderr, output: stdout + stderr }
}

/** Output in the exact shape `scripts/lcp-budget.sh` produces when one page blows the budget. */
function budgetOutput(lines: string[]): string {
  const path = join(scratch(), 'budget.log')
  writeFileSync(path, `${lines.join('\n')}\n`)
  return path
}

const SLOW_HOME = 'FAIL: / — LCP 9800ms exceeds the 2500ms budget on the 4G profile (FR-025, SC-006).'
const FAST_LISTING = '── PASS  /projetos       LCP 1200ms (budget 2500ms)'

/**
 * A stub PATH for the pipeline run: `pnpm`, `curl` and `npx`.
 *
 * `pnpm build` is the interesting one — it is the moment the gate looks at the source tree, so
 * that is where the mutation has to be visible. It records the largest byte count under
 * `apps/web/public` and whether the Home page references a `.png` at all: a huge asset nobody
 * renders is a mutation that changes no LCP, and a rewritten page with no asset behind it is
 * the same nothing from the other direction.
 */
function stubBin(dir: string, log: string): string {
  const bin = join(dir, 'bin')
  mkdirSync(bin, { recursive: true })

  const write = (name: string, body: string) => {
    const path = join(bin, name)
    writeFileSync(path, `#!/usr/bin/env bash\n${body}`)
    chmodSync(path, 0o755)
  }

  write(
    'pnpm',
    [
      `echo "pnpm $*" >> "${log}"`,
      'case "$*" in',
      '  *build*)',
      `    echo "build-page-bytes:$(wc -c < "${HOME_PAGE}" | tr -d ' ')" >> "${log}"`,
      `    echo "build-page-png-refs:$(grep -c '\\.png' "${HOME_PAGE}" || true)" >> "${log}"`,
      `    largest="$(find "${join(ROOT, 'apps', 'web', 'public')}" -type f -printf '%s\\n' | sort -n | tail -1)"`,
      `    echo "build-largest-public-asset:\${largest:-0}" >> "${log}"`,
      '    ;;',
      'esac',
      'exit 0',
    ].join('\n'),
  )

  write('curl', `echo "curl $*" >> "${log}"\necho "\${FAKE_HTTP_CODE:-200}"\nexit 0\n`)

  write(
    'npx',
    [
      `echo "npx $*" >> "${log}"`,
      'out=""; url=""',
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    --output-path=*) out="${arg#--output-path=}" ;;',
      '    http://*) url="$arg" ;;',
      '  esac',
      'done',
      '[ -n "$out" ] || { echo "stub: no --output-path given" >&2; exit 3; }',
      // The Home is slow only when the test says so, which is how the "the budget passed with
      // an oversized hero" branch gets exercised at all.
      'if [ -n "${FAKE_SLOW_URL:-}" ] && [ "${url%${FAKE_SLOW_URL}}" != "$url" ]; then',
      '  lcp="${FAKE_SLOW_MS:-9800}"',
      'else',
      '  lcp=1200',
      'fi',
      'printf \'{"audits":{"largest-contentful-paint":{"numericValue":%s}},"categories":{"performance":{"score":0.05}}}\' "$lcp" > "$out"',
      'exit 0',
    ].join('\n'),
  )

  return bin
}

/** Everything git can see under the repo — the leftovers check, independent of any filename. */
function treeState(): string {
  return execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
}

function runMutation(env: Record<string, string> = {}): Run & { log: string; before: string } {
  const dir = scratch()
  const log = join(dir, 'calls.log')
  writeFileSync(log, '')
  const bin = stubBin(dir, log)
  const before = treeState()

  const result = spawnSync('bash', [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120_000,
    env: {
      ...process.env,
      ...env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      LCP_WAIT_ATTEMPTS: '3',
      LCP_WAIT_INTERVAL_S: '0.2',
    },
  })
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  return {
    status: result.status ?? -1,
    stdout,
    stderr,
    output: stdout + stderr,
    log: readFileSync(log, 'utf8'),
    before,
  }
}

/**
 * A constant's value, as the shell resolves it — `bash -c 'source …; echo "$NAME"'`, never a
 * regex over the source. `MAX_HERO_BYTES` is an arithmetic expansion of three other constants,
 * so a text scan would assert the expression and not the number, and would go on passing after
 * a factor changed underneath it.
 */
function shellConst(script: string, name: string): number {
  const out = spawnSync('bash', ['-c', `source "$1" || exit 97\nprintf '%s' "\${${name}}"`, '_', script], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  return Number((out.stdout ?? '').trim())
}

const BUDGET_SCRIPT = join(ROOT, 'scripts', 'lcp-budget.sh')

const logValue = (log: string, key: string): number =>
  Number(
    log
      .split('\n')
      .find((line) => line.startsWith(`${key}:`))
      ?.slice(key.length + 1) ?? Number.NaN,
  )

describe('the proof refuses a failure it did not cause (T016, SC-006)', () => {
  it('accepts a budget failure that names the mutated URL and its measured value', () => {
    const out = budgetOutput([FAST_LISTING, SLOW_HOME])
    const run = sourced(`assert_budget_failed_on_hero / 1 "${out}"`)
    expect(run.status, `a red budget naming / and 9800ms is the proof: ${run.output}`).toBe(0)
    expect(run.output).toMatch(/9800/)
  })

  it('rejects a non-zero exit that names no page at all', () => {
    // Exactly what a missing seed produces: the readiness probe gives up, nothing is measured,
    // and the script exits non-zero. Accepting this certifies a gate that never ran.
    const out = budgetOutput([
      'FAIL: http://127.0.0.1:3000/ never answered 200 as Host: localhost after 60 attempts (last status: 404).',
    ])
    const run = sourced(`assert_budget_failed_on_hero / 1 "${out}"`)
    expect(
      run.status,
      `a budget that never measured anything is not a budget that can fail: ${run.output}`,
    ).not.toBe(0)
    expect(
      run.output,
      'the refusal must say the exit code alone was not enough, or the next person "fixes" it ' +
        'by trusting the status. The phrase is asserted because the budget itself prints ' +
        '"last status: 404" on this path — matching that would be matching the wrong script',
    ).toMatch(/exit code alone/i)
  })

  it('rejects a failure that names a different page than the one it mutated', () => {
    const out = budgetOutput([
      'FAIL: /projetos — LCP 4200ms exceeds the 2500ms budget on the 4G profile (FR-025, SC-006).',
    ])
    const run = sourced(`assert_budget_failed_on_hero / 1 "${out}"`)
    expect(
      run.status,
      `the hero was planted on /, so a slow /projetos proves nothing about it: ${run.output}`,
    ).not.toBe(0)
  })

  it('rejects a "measured value" that does not actually exceed the budget', () => {
    const out = budgetOutput([
      'FAIL: / — LCP 100ms exceeds the 2500ms budget on the 4G profile (FR-025, SC-006).',
    ])
    const run = sourced(`assert_budget_failed_on_hero / 1 "${out}"`)
    expect(
      run.status,
      `100ms is inside the 2500ms budget — the number has to be read, not just matched: ${run.output}`,
    ).not.toBe(0)
  })

  it('rejects a budget that passed with the oversized hero in place', () => {
    const out = budgetOutput([FAST_LISTING, '── PASS  /               LCP 1100ms (budget 2500ms)'])
    const run = sourced(`assert_budget_failed_on_hero / 0 "${out}"`)
    expect(run.status, `a green budget under a 12 MB hero is the failure: ${run.output}`).not.toBe(0)
    expect(run.output, `the message must say the budget passed: ${run.output}`).toMatch(/passed/i)
  })
})

describe('the mutation is really in the tree while the gate runs (T016, SC-012)', () => {
  const run = runMutation({ FAKE_SLOW_URL: '/', FAKE_SLOW_MS: '9800' })

  it('passes when the budget goes red naming the Home and the measurement', () => {
    expect(run.status, `the proof should succeed here:\n${run.output}`).toBe(0)
    expect(
      run.output,
      `it must report the budget's own failure line as evidence, value included:\n${run.output}`,
    ).toMatch(/FAIL: \/ .*9800/)
  })

  it('builds with an oversized asset the Home actually renders', () => {
    const planted = logValue(run.log, 'build-largest-public-asset')
    expect(
      planted,
      `the planted hero must be big enough to blow a 2.5s budget on 4G:\n${run.log}`,
    ).toBeGreaterThan(shellConst(SCRIPT, 'MIN_HERO_BYTES'))
    // The bound this file did not have, and the reason T016 was rejected: an asset can be too
    // large to be MEASURED. See the section below for the arithmetic.
    expect(
      planted,
      `the planted hero is too big to finish loading inside Lighthouse's window:\n${run.log}`,
    ).toBeLessThan(shellConst(SCRIPT, 'MAX_HERO_BYTES'))
    expect(
      logValue(run.log, 'build-page-png-refs'),
      `an oversized asset no page renders changes no LCP:\n${run.log}`,
    ).toBeGreaterThan(0)
    expect(
      logValue(run.log, 'build-page-bytes'),
      `the Home was not mutated before the build — the gate measured the unmodified page:\n${run.log}`,
    ).not.toBe(readFileSync(HOME_PAGE).byteLength)
  })

  it('measures the Home through the real budget gate, on the 4G profile', () => {
    const measured = run.log
      .split('\n')
      .filter((line) => line.startsWith('npx ') && line.includes(' http://localhost:3000/ '))
    expect(measured.length, `the Home was not measured three times:\n${run.log}`).toBe(3)
    expect(measured[0], 'the mutation must not measure on a kinder network than the gate').toContain(
      'throttling.throughputKbps=1638',
    )
  })

  it('leaves the working tree exactly as it found it', () => {
    expect(
      treeState(),
      'the planted hero or the rewritten Home survived the run; one `git commit -a` ships them',
    ).toBe(run.before)
  })
})

describe('the planted hero must be too slow to pass AND fast enough to be measured (T016)', () => {
  /**
   * ── The defect this section exists for ────────────────────────────────────────────────────
   *
   * The plan sketched a 12 MB hero and the script built one: 2000 x 2000 x 3 bytes of
   * incompressible noise, measured at 12,021,354 bytes. `scripts/lcp-budget.sh` throttles at
   * 188,743 B/s, so that needs **63.7 seconds** on the wire, and Lighthouse abandons the load
   * at `maxWaitForLoad` = 45,000 ms. An image LCP entry is emitted on load-and-paint, so an
   * asset that never finishes loading is never an LCP candidate at all: the largest element
   * that *does* paint is the `<h1>` beside it, at a fine LCP. The budget would have reported
   * `── PASS  /`, and this script's verdict would have printed "the LCP budget PASSED with a
   * deliberately oversized hero" — blaming a gate that was measuring correctly, and leaving
   * `Performance budget can fail` permanently red.
   *
   * Nothing in the suite could show it: the npx stub's slowness comes from `FAKE_SLOW_URL`,
   * not from the asset, so the measured value is the same whether a hero was planted or not.
   * These cases assert the arithmetic instead, against the scripts' own constants.
   */
  const bytesPerSecond = shellConst(SCRIPT, 'THROTTLE_BYTES_PER_S')
  const loadCapMs = shellConst(SCRIPT, 'BUDGET_LOAD_CAP_MS')
  const seconds = (bytes: number): number => bytes / bytesPerSecond

  it('throttles and gives up on the same terms the budget it drives does', () => {
    // Two files, one profile. If the budget slows down or its cap moves, the window this
    // script sizes its asset inside moves with it — silently, unless something holds them
    // together. Same arrangement as ITEMS_PER_PAGE against lib/public/listing.ts.
    expect(
      bytesPerSecond,
      'the mutation assumes a different throughput than the gate it runs',
    ).toBe(shellConst(BUDGET_SCRIPT, 'LCP_THROTTLE_BYTES_PER_S'))
    expect(
      loadCapMs,
      'the mutation assumes a different load cap than the gate pins on the Lighthouse CLI',
    ).toBe(shellConst(BUDGET_SCRIPT, 'LCP_MAX_WAIT_MS'))
  })

  it('sizes the hero to blow the budget by a wide margin', () => {
    const edge = shellConst(SCRIPT, 'HERO_EDGE')
    const bytes = edge * edge * 3
    expect(
      seconds(bytes) * 1000,
      `a ${edge}px hero transfers in ${seconds(bytes).toFixed(1)}s; a hero a 4G connection can ` +
        'deliver inside the 2.5s budget mutates nothing and the gate stays green for the right reason',
    ).toBeGreaterThan(2500 * 4)
  })

  it('sizes it to finish loading well inside the window Lighthouse gives it', () => {
    const edge = shellConst(SCRIPT, 'HERO_EDGE')
    const bytes = edge * edge * 3
    expect(
      seconds(bytes) * 1000,
      `a ${edge}px hero needs ${seconds(bytes).toFixed(1)}s against a ${loadCapMs / 1000}s cap. ` +
        'An image that never finishes loading is never an LCP candidate, so the budget would ' +
        'measure the <h1> beside it and PASS — and this proof would accuse a working gate.',
    ).toBeLessThan(loadCapMs * 0.6)
  })

  it("refuses the plan's 12 MB hero, which is the size that could not be measured", () => {
    // The guard, driven rather than read. 2000px is what shipped and what was rejected.
    const oversized = 2000 * 2000 * 3
    expect(
      seconds(oversized) * 1000,
      'the arithmetic that condemned the original size',
    ).toBeGreaterThan(loadCapMs)
    expect(
      oversized,
      'MAX_HERO_BYTES would still admit the asset that cannot be measured',
    ).toBeGreaterThan(shellConst(SCRIPT, 'MAX_HERO_BYTES'))
  })

  it('leaves room between the two bounds, so the window is a window', () => {
    const min = shellConst(SCRIPT, 'MIN_HERO_BYTES')
    const max = shellConst(SCRIPT, 'MAX_HERO_BYTES')
    expect(
      max,
      `the floor (${min}) and the ceiling (${max}) leave no room; PNG overhead alone would ` +
        'push the generated asset out of a window this narrow',
    ).toBeGreaterThan(min * 2)
  })
})

describe('two runs must not share one working tree (T016)', () => {
  it('refuses to start on a Home that already carries the mutation marker', () => {
    // Measured during this task's review: a concurrent run of this script left the tree with a
    // half-mutated Home and corrupted two measurements. The damage is worse than a wrong
    // number — the loser's `restore` copies ITS backup over the winner's mutation, so a run can
    // be measuring the real Home while reporting on a planted hero.
    const original = readFileSync(HOME_PAGE, 'utf8')
    try {
      writeFileSync(HOME_PAGE, `${original}\n// MUTATED by scripts/lcp-mutation.sh\n`)
      const run = runMutation()
      expect(run.status, `a marked Home must refuse, not back itself up:\n${run.output}`).not.toBe(0)
      expect(run.output).toMatch(/already carries the mutation marker/)
    } finally {
      writeFileSync(HOME_PAGE, original)
    }
    expect(
      readFileSync(HOME_PAGE, 'utf8'),
      'the refusal path must not have rewritten the Home',
    ).toBe(original)
  })
})

describe('the proof fails loudly when the budget does not (T016)', () => {
  it('fails when the budget passes with the oversized hero, and still restores the tree', () => {
    const green = runMutation()
    expect(
      green.status,
      `a budget that stays green under a 12 MB hero is not measuring:\n${green.output}`,
    ).not.toBe(0)
    expect(green.output).toMatch(/passed|not measuring/i)
    expect(treeState(), 'the tree must be restored on the failure path too').toBe(green.before)
  })

  it('fails when the budget dies for an unrelated reason, exit code notwithstanding', () => {
    const dead = runMutation({ FAKE_HTTP_CODE: '404' })
    expect(
      dead.status,
      `a server that never answered is not a proof of anything:\n${dead.output}`,
    ).not.toBe(0)
    expect(
      dead.output,
      `the refusal must distinguish itself from a real red budget:\n${dead.output}`,
    ).toMatch(/exit code alone/i)
    expect(treeState(), 'the tree must be restored on the wrong-reason path too').toBe(dead.before)
  })
})

describe('the proof can be run by hand (T016)', () => {
  it('is executable and explains itself without mutating anything', () => {
    const before = treeState()
    const help = execFileSync(SCRIPT, ['--help'], { cwd: ROOT, encoding: 'utf8' })
    expect(help).toMatch(/lcp-mutation/)
    expect(treeState(), '--help planted something').toBe(before)
  })
})
