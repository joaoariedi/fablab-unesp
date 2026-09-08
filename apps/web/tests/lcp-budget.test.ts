import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The LCP budget gate has to be a gate (T015, FR-025, SC-006).
 *
 * `scripts/lcp-budget.sh` is the only thing standing between the roadmap's 2.5s promise and a
 * hero nobody weighed. Every way it can silently stop measuring is a way the promise quietly
 * becomes a wish, and all of them are invisible from a green CI badge:
 *
 *   * measuring before the server serves real content — Lighthouse scores a 404 page at a
 *     magnificent LCP, so a gate that does not wait for a real 200 passes hardest exactly when
 *     the seed failed (the plan calls this out: without the seeded domains every route 404s);
 *   * asserting the composite performance score instead of LCP — the score moves for a dozen
 *     reasons that are not the metric the requirement names;
 *   * averaging the three runs, or averaging across pages — an average lets the Home hide
 *     behind five cheap pages, and the Home is the page at risk;
 *   * treating a missing `largest-contentful-paint` audit as zero — the gate that can never
 *     fail, arrived at by arithmetic rather than by decision.
 *
 * So this exercises the script by RUNNING it, twice over:
 *
 *   1. its measurement functions directly, sourced (the script runs `main` only when executed,
 *      the standard bash main-guard), against report fixtures written here;
 *   2. the whole pipeline end to end against a stub `pnpm`, `curl` and `npx` on PATH, which
 *      record every invocation. That log is what proves the preconditions are steps rather
 *      than assumptions, and that three runs per URL become a median and not a mean.
 *
 * Nothing here greps the script's source for a promise: a comment saying "median of three"
 * survives every refactor that stops computing one.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..')
const SCRIPT = join(ROOT, 'scripts', 'lcp-budget.sh')

type Run = { status: number; stdout: string; stderr: string; output: string }

/** Run a snippet with the script sourced, so its functions are under test rather than its prose. */
function sourced(snippet: string, env: Record<string, string> = {}): Run {
  const result = spawnSync('bash', ['-c', `source "$1" || exit 97\n${snippet}`, '_', SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  return { status: result.status ?? -1, stdout, stderr, output: stdout + stderr }
}

/** A Lighthouse report shaped like the real one: an LCP audit and a composite score beside it. */
function reportFixture(dir: string, name: string, body: unknown): string {
  const path = join(dir, name)
  writeFileSync(path, JSON.stringify(body))
  return path
}

function lhr(lcpMs: number | null, performanceScore = 0.05): unknown {
  return {
    audits: {
      'largest-contentful-paint':
        lcpMs === null ? { scoreDisplayMode: 'error' } : { numericValue: lcpMs },
    },
    categories: { performance: { score: performanceScore } },
  }
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'lcp-budget-test-'))
}

/**
 * A stub PATH: `pnpm`, `curl` and `npx` that log what they were asked to do.
 *
 * The npx stub writes a real report file at whatever `--output-path` it is handed, with a
 * per-URL run counter, so the three runs of one URL can disagree — which is the only way to
 * tell a median apart from a mean, a max, or "the first one".
 */
function stubBin(dir: string, log: string): string {
  const bin = join(dir, 'bin')
  mkdirSync(bin, { recursive: true })

  const write = (name: string, body: string) => {
    const path = join(bin, name)
    writeFileSync(path, `#!/usr/bin/env bash\n${body}`)
    chmodSync(path, 0o755)
  }

  write('pnpm', `echo "pnpm $*" >> "${log}"\nexit 0\n`)
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
      'key="$(echo "$url" | tr -c "a-zA-Z0-9" "_")"',
      `counter="${dir}/run_\${key}"`,
      'n=$(cat "$counter" 2>/dev/null || echo 0)',
      'echo $((n + 1)) > "$counter"',
      // The slow URL is slow on every run; everything else swings wildly around a fast median.
      // A run that produced no LCP at all: Lighthouse writes `scoreDisplayMode: "error"` for
      // NO_LCP, a page that never painted, an error page, a failed navigation. The stub used
      // to be incapable of this, which is why the whole pipeline never exercised the path
      // `lcp_ms_from_report` was written to guard — and the gate shipped able to print
      // `── PASS  /  LCP 0ms` and exit 0.
      'if [ -n "${FAKE_ERROR_AUDIT:-}" ]; then',
      '  printf \'{"audits":{"largest-contentful-paint":{"scoreDisplayMode":"error","errorMessage":"NO_LCP"}},"categories":{"performance":{"score":0.05}}}\' > "$out"',
      '  exit 0',
      'fi',
      'if [ -n "${FAKE_SLOW_URL:-}" ] && [ "${url%${FAKE_SLOW_URL}}" != "$url" ]; then',
      '  lcp="${FAKE_SLOW_MS:-4200}"',
      'else',
      '  set -- 9000 1200 1000',
      '  lcp=$(eval echo "\\${$((n % 3 + 1))}")',
      'fi',
      // A dismal composite score beside a fine LCP: asserting the score fails here, LCP passes.
      'printf \'{"audits":{"largest-contentful-paint":{"numericValue":%s}},"categories":{"performance":{"score":0.05}}}\' "$lcp" > "$out"',
      'exit 0',
    ].join('\n'),
  )

  return bin
}

/** The whole pipeline, against stubs. Nothing real is migrated, built, started or measured. */
function runPipeline(env: Record<string, string> = {}): Run & { log: string } {
  const dir = scratch()
  const log = join(dir, 'calls.log')
  writeFileSync(log, '')
  const bin = stubBin(dir, log)

  const result = spawnSync('bash', [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...process.env,
      ...env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      LCP_WAIT_ATTEMPTS: env.LCP_WAIT_ATTEMPTS ?? '3',
      // Non-zero, deliberately: the server is launched in the background, and an interval of 0
      // would race the stub's own record of having been launched. 0.2s is ~100x the fork it
      // waits on, which is the difference between a slow test and a flaky one.
      LCP_WAIT_INTERVAL_S: env.LCP_WAIT_INTERVAL_S ?? '0.2',
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
  }
}

const PUBLIC_PAGES = ['/', '/projetos', '/artigos', '/aulas', '/biblioteca-3d', '/calendario']

describe('the LCP budget measures LCP, per page, as a median (T015)', () => {
  it('takes the middle of three runs, not their mean', () => {
    const run = sourced('median_of_three 1000 3000 2000')
    expect(run.status, run.output).toBe(0)
    expect(
      run.stdout.trim(),
      'the mean of these is 2000 too — this case only pins the order-independence',
    ).toBe('2000')

    // 9000 1200 1000: median 1200, mean 3733, max 9000, first 9000. Only the median is under
    // the 2.5s budget, so every wrong reduction is distinguishable from this one number.
    const swing = sourced('median_of_three 9000 1200 1000')
    expect(swing.status, swing.output).toBe(0)
    expect(swing.stdout.trim(), `a mean (3733) or a max (9000) is not a median: ${swing.output}`).toBe(
      '1200',
    )
  })

  it('reads LCP out of the report, not the performance score', () => {
    const dir = scratch()
    const fast = reportFixture(dir, 'fast.json', lhr(1234.56, 0.02))
    const run = sourced(`lcp_ms_from_report "${fast}"`)
    expect(run.status, run.output).toBe(0)
    expect(
      Number(run.stdout.trim()),
      `a 0.02 performance score sits beside a 1234ms LCP; the budget asserts the metric: ${run.output}`,
    ).toBeCloseTo(1234.56, 1)
  })

  it('refuses a report with no LCP audit instead of scoring it zero', () => {
    const dir = scratch()
    const broken = reportFixture(dir, 'broken.json', lhr(null))
    const run = sourced(`lcp_ms_from_report "${broken}"`)
    expect(
      run.status,
      'a missing largest-contentful-paint audit read as 0 is a gate that can never fail again',
    ).not.toBe(0)
    expect(run.output).toMatch(/largest-contentful-paint/)
  })

  it('names the URL and the measured value when a page blows the budget', () => {
    const run = sourced('assert_lcp_at_most 2500 /projetos 4200')
    expect(run.status, `4200ms against a 2500ms budget must fail: ${run.output}`).not.toBe(0)
    expect(run.output, 'a failure that does not name the page cannot be acted on').toContain('/projetos')
    expect(run.output, 'a failure that does not name the measurement cannot be believed').toMatch(/4200/)
    expect(run.output).toMatch(/2500/)
  })

  it('passes a page that is inside the budget', () => {
    const run = sourced('assert_lcp_at_most 2500 /artigos 1200')
    expect(run.status, run.output).toBe(0)
  })
})

describe('the LCP budget owns its preconditions (T015, FR-025)', () => {
  const run = runPipeline()

  it('migrates, seeds, builds and starts before it measures anything', () => {
    const order = ['migrate', 'seed', 'build', 'start'].map((step) =>
      run.log.split('\n').findIndex((line) => line.startsWith('pnpm ') && line.includes(step)),
    )
    expect(order.every((index) => index >= 0), `missing a step in:\n${run.log}`).toBe(true)
    expect(
      order.slice(0, 3),
      `migrate, seed and build must run in that order — seeding is part of the gate, not a ` +
        `precondition someone remembers:\n${run.log}`,
    ).toEqual([...order.slice(0, 3)].sort((a, b) => a - b))
  })

  it('waits for a real 200 with the Host header before the first measurement', () => {
    const lines = run.log.split('\n')
    const probe = lines.findIndex((line) => line.startsWith('curl ') && /Host:\s*\S+/.test(line))
    const firstMeasurement = lines.findIndex((line) => line.startsWith('npx '))
    expect(probe, `no readiness probe carrying a Host header:\n${run.log}`).toBeGreaterThanOrEqual(0)
    expect(firstMeasurement, `nothing was measured at all:\n${run.log}`).toBeGreaterThanOrEqual(0)
    expect(
      probe,
      `Lighthouse ran before the server answered — tenancy resolves from the Host header, and ` +
        `an unseeded 404 page measures at a magnificent LCP:\n${run.log}`,
    ).toBeLessThan(firstMeasurement)
  })

  it('refuses to measure a server that never returns 200', () => {
    const dead = runPipeline({ FAKE_HTTP_CODE: '404' })
    expect(dead.status, `a 404 for every attempt must not be measured: ${dead.output}`).not.toBe(0)
    expect(
      dead.log,
      `the server was never even started before the readiness probe gave up:\n${dead.log}`,
    ).toContain('start')
    expect(
      dead.output,
      `the give-up message must name the status it kept getting, or the next person debugs ` +
        `Lighthouse instead of the seed:\n${dead.output}`,
    ).toMatch(/404/)
    expect(
      dead.log.includes('npx '),
      `Lighthouse was invoked against a server that never served a 200:\n${dead.log}`,
    ).toBe(false)
  })

  it('measures every public page three times, on the 4G profile', () => {
    for (const page of PUBLIC_PAGES) {
      const target = `http://localhost:3000${page === '/' ? '/' : page}`
      const runs = run.log
        .split('\n')
        .filter((line) => line.startsWith('npx ') && line.includes(` ${target} `))
      expect(runs.length, `${page} was measured ${runs.length} times, not 3:\n${run.log}`).toBe(3)
      expect(runs[0], `${page} was not throttled to the named 4G profile`).toContain(
        'throttling.rttMs=150',
      )
      expect(runs[0]).toContain('throttling.throughputKbps=1638')
      // The two above are the LANTERN keys, read only by `--throttling-method=simulate`. This
      // gate runs `devtools`, where the browser is throttled from `requestLatencyMs` and
      // `downloadThroughputKbps` (core/lib/emulation.js) — so asserting only the first pair
      // was checking argv and not throttling. The measurement happened to be right because the
      // unset keys fell back to mobileSlow4G's own values; a default that moved would have
      // moved the profile with nothing going red.
      expect(
        runs[0],
        `${page} carries no devtools latency — the Lantern keys are inert under this method`,
      ).toContain('throttling.requestLatencyMs=562.5')
      expect(runs[0]).toContain('throttling.downloadThroughputKbps=1474.56')
      // Pinned rather than inherited: `scripts/lcp-mutation.sh` sizes its planted hero against
      // this number, so a Lighthouse default that moved would move that ceiling silently.
      expect(runs[0], `${page} inherits Lighthouse's load cap instead of pinning it`).toContain(
        'max-wait-for-load=45000',
      )
    }
  })

  it('fails, loudly and unmeasured, when every Lighthouse run errors', () => {
    // The defect this closes, measured on this tree (bash 5.3.15): `lcp_ms_from_report` refused
    // the report correctly, and `samples+=("$(lcp_ms_from_report ...)")` — an array append —
    // did NOT trip `set -e`, so all three runs proceeded, the median was the empty string, and
    // `printf '%.0f' ""` printed `0` and exited **0**. The gate reported `── PASS  /  LCP 0ms`
    // for all six pages and returned 0, having measured nothing. The unit case above passed
    // throughout, because it asserted the function and never the caller.
    const blind = runPipeline({ FAKE_ERROR_AUDIT: '1' })

    expect(
      blind.status,
      `six unreadable reports must fail the gate. A run that produced no number measured ` +
        `nothing, and a gate that reads that as zero can never fail again:\n${blind.output}`,
    ).not.toBe(0)
    expect(
      blind.output,
      `the gate printed a PASS line on a run with no LCP audit anywhere:\n${blind.output}`,
    ).not.toMatch(/── PASS/)
    expect(blind.output).toMatch(/largest-contentful-paint/)
  })

  it('refuses a measurement that is not a number rather than rounding it to zero', () => {
    // ── Called the way `main` calls it, and that is the whole test ────────────────────────
    //
    // `main` runs `assert_lcp_at_most ... || failures+=("$page")`. Attaching `||` SUPPRESSES
    // errexit for the whole command, so the `printf: invalid number` that aborts this function
    // when it is called bare does nothing here — `[ 0 -le 2500 ]` then passes and a PASS line
    // is printed for a page that was never measured.
    //
    // Measured: the first draft of this case called it bare, and passed against the unguarded
    // script purely because errexit rescued it in a context production never uses. A guard on
    // the VALUE, not on an exit status, is what holds in both.
    for (const measured of ['', 'NaN', '1.2.3']) {
      const run = sourced(
        `failures=()\nassert_lcp_at_most 2500 /projetos '${measured}' || failures+=(/projetos)\n` +
          `[ \${#failures[@]} -gt 0 ] || { echo "ACCEPTED-AS-PASS"; exit 1; }`,
      )
      expect(
        run.status,
        `'${measured}' was accepted as a measurement in the context main() actually uses ` +
          `(a trailing \`||\`, which turns errexit off): ${run.output}`,
      ).toBe(0)
      expect(run.output, `the refusal must not read as a pass: ${run.output}`).not.toMatch(/── PASS/)
    }
  })

  it('passes on a median that is inside the budget even when single runs are not', () => {
    expect(
      run.status,
      `runs of 9000/1200/1000 have a median of 1200ms — a mean (3733) or a max (9000) would ` +
        `have failed here, which is the whole point of the median:\n${run.output}`,
    ).toBe(0)
  })

  it('fails naming the one slow page, without averaging it away across the others', () => {
    const slow = runPipeline({ FAKE_SLOW_URL: '/projetos', FAKE_SLOW_MS: '4200' })
    expect(
      slow.status,
      `one page over budget must fail the gate; five fast pages do not redeem it:\n${slow.output}`,
    ).not.toBe(0)
    expect(slow.output, `the failure must name the page:\n${slow.output}`).toContain('/projetos')
    expect(slow.output, `the failure must name the measured value:\n${slow.output}`).toMatch(/4200/)
  })
})

describe('the gate can be run by hand as well as by CI (T015)', () => {
  it('is executable and explains itself without measuring anything', () => {
    // The CI job that runs it is T017's; what T015 owes is a script a rotating volunteer can
    // invoke directly, and a --help that does not spend twenty minutes building first.
    const help = execFileSync(SCRIPT, ['--help'], { cwd: ROOT, encoding: 'utf8' })
    expect(help).toMatch(/lcp-budget/)
  })
})
