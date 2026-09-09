import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T027 / SC-006 — the budget re-measured with the real hero in place, per page, and recorded.
 *
 * T015 built the gate, T016 watched it fail, T017 put both in CI — and every one of those ran
 * against a Home with **no hero**. T025 then added the single largest asset in the product and
 * T026 built the page around it. So the number SC-006 promises has never actually been measured
 * against the thing that threatens it: the gate was green on a page that did not exist yet.
 *
 * This task closes that. `docs/lcp-measurements.md` carries the run — the gate's own transcript,
 * the six medians, the hero that was on disk while it ran, and the profile it ran on — and this
 * file is what keeps that record honest.
 *
 * ── Why a recorded measurement needs a test at all ──────────────────────────────────────────
 *
 * Because the alternative is folklore. A number written into a document decays in four ways,
 * and all four have already happened somewhere in this feature:
 *
 *   1. **The page list grows.** A seventh public page joins `PAGES` in the gate and the record
 *      still shows six. § 2 compares the two sets rather than counting them, so the new page is
 *      named in the failure.
 *   2. **The budget moves.** `LCP_BUDGET_MS` is read out of the script, never retyped here, so
 *      a record whose margins were computed against 2500 cannot quietly survive a 2000ms gate.
 *   3. **The hero is re-exported.** The whole point of T027 is *"with the real hero in place"*.
 *      A measurement taken against a 143 KB AVIF says nothing about a 900 KB one, so § 5 holds
 *      every byte count in the record against `statSync` of the file it names — the same device
 *      `tests/public/home-hero.test.ts` uses for T025's own numbers.
 *   4. **The table drifts from the evidence.** A summary table is typed by hand; the transcript
 *      is printed by the gate. § 4 requires them to agree, so a mistyped median is a failure
 *      rather than a decision someone later trusts.
 *
 * ── What this file deliberately does NOT do ─────────────────────────────────────────────────
 *
 * It does not measure. `scripts/lcp-budget.sh` measures, with a browser, in a job that owns its
 * database (T015/T017), and re-measuring here would be a second gate disagreeing with the first
 * on a machine nobody chose. What it can do — and what the gate cannot — is notice that the
 * record no longer describes the tree it was taken from.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..')
const SCRIPT = join(ROOT, 'scripts', 'lcp-budget.sh')
const RECORD = join(ROOT, 'docs', 'lcp-measurements.md')
const HERO_DIR = join(ROOT, 'apps', 'web', 'public', 'hero')

const SCRIPT_SOURCE = readFileSync(SCRIPT, 'utf8')

/**
 * The record, or the empty string when it is absent.
 *
 * Read defensively on purpose: a `readFileSync` throw at module scope aborts the file and
 * vitest reports it as an unhandled error, which is the shape a missing record should NOT
 * have. Every assertion below then fails saying what is missing and where it belongs.
 */
const RECORD_SOURCE = existsSync(RECORD) ? readFileSync(RECORD, 'utf8') : ''

/** One declaration out of the gate script, so the record cannot cite a profile it stopped using. */
function fromScript(pattern: RegExp, what: string): string {
  const found = SCRIPT_SOURCE.match(pattern)
  if (!found?.[1]) {
    throw new Error(
      `scripts/lcp-budget.sh no longer declares ${what} in the shape /${pattern.source}/. ` +
        'The record is measured against the gate; if the gate changed, this test must be ' +
        'taught the new spelling and the pages re-measured.',
    )
  }
  return found[1]
}

const MEASURED_PAGES = fromScript(/^PAGES=\(([^)]*)\)/m, 'its page list').trim().split(/\s+/)
const BUDGET_MS = Number(fromScript(/BUDGET_MS="\$\{LCP_BUDGET_MS:-(\d+)\}"/, 'its budget'))
const RUNS_PER_URL = fromScript(/^RUNS_PER_URL=(\d+)/m, 'its runs per URL')
const MAX_WAIT_MS = fromScript(/LCP_MAX_WAIT_MS="\$\{LCP_MAX_WAIT_MS:-(\d+)\}"/, 'its load cap')
const THROUGHPUT_KBPS = fromScript(
  /--throttling\.downloadThroughputKbps=([\d.]+)/,
  'its download throughput',
)
const CPU_SLOWDOWN = fromScript(/--throttling\.cpuSlowdownMultiplier=(\d+)/, 'its CPU slowdown')

/**
 * The two lines `assert_lcp_at_most` prints — one per verdict, and BOTH have to parse.
 *
 * A parser that understood only `── PASS` would drop exactly the page a reader most needs to
 * find: an over-budget page is reported in the other shape, so the record could carry a red run
 * while § 2 counted five pages and § 3 iterated only the ones that passed. That is this repo's
 * recurring defect — a check that reports success because it never saw the failing half — so
 * the failing shape is parsed first-class rather than as an afterthought.
 *
 * Fresh instances per call: a `/g` regex carries `lastIndex` between `.test()` and
 * `.matchAll()`, and a shared one silently starts a later scan half way through the transcript.
 */
const passLine = (): RegExp => /──\s+PASS\s+(\/\S*)\s+LCP\s+(\d+)ms\s+\(budget\s+(\d+)ms\)/g
const failLine = (): RegExp =>
  /FAIL:\s+(\/\S*)\s+—\s+LCP\s+(\d+)ms exceeds the (\d+)ms budget/g

type Measurement = { page: string; lcpMs: number; budgetMs: number }

/** The fenced code blocks of the record, which is where the gate's transcript has to live. */
function fencedBlocks(): string[] {
  return RECORD_SOURCE.split('\n```')
    .filter((_, index) => index % 2 === 1)
    .map((block) => block.replace(/^[^\n]*\n/, ''))
}

/** The transcript block: the fence that carries the gate's own per-page output. */
function transcript(): string {
  return fencedBlocks().find((block) => passLine().test(block) || failLine().test(block)) ?? ''
}

/** Every measurement the pasted transcript reports, in the gate's own wording. */
function measurements(): Measurement[] {
  return [...transcript().matchAll(passLine()), ...transcript().matchAll(failLine())].map(
    (match) => ({
      page: match[1] ?? '',
      lcpMs: Number(match[2]),
      budgetMs: Number(match[3]),
    }),
  )
}

/** The body of one `## `-headed section of the record. */
function section(title: string): string {
  const start = RECORD_SOURCE.indexOf(`## ${title}`)
  if (start < 0) return ''
  const rest = RECORD_SOURCE.slice(start + 3)
  const end = rest.indexOf('\n## ')
  return end < 0 ? rest : rest.slice(0, end)
}

/** The data rows of the first markdown table in a section, header and separator dropped. */
function tableRows(title: string): string[][] {
  const cells = section(title)
    .split('\n')
    .filter((line) => line.trimStart().startsWith('|'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)))
  return cells.slice(1)
}

const MISSING =
  `docs/lcp-measurements.md is the deliverable of T027: the LCP budget re-run with the ` +
  `real hero in place, per page. Without it SC-006 rests on a gate that has only ever ` +
  `measured a Home with no hero.`

describe('§1 — the record is the gate\'s own output, not a summary of it (T027, SC-006)', () => {
  it('exists', () => {
    expect(existsSync(RECORD), MISSING).toBe(true)
  })

  it('pastes the transcript scripts/lcp-budget.sh printed', () => {
    expect(
      transcript(),
      `${MISSING} A table of numbers with no transcript is a claim; the gate's own output is ` +
        'evidence, and it is the only part of this document nobody typed.',
    ).toMatch(/──\s+PASS|FAIL:/)
  })

  it('shows the run reaching its own verdict rather than being abandoned half way', () => {
    // The gate prints one of two closing lines, and only ever after walking every page:
    // "── PASS: every public page …" or "FAIL: N page(s) over the …ms LCP budget: …".
    // A transcript that stops after four pages was interrupted, and an interrupted run is not a
    // measurement of the two pages it never reached. Which verdict it was is § 3's business,
    // not this assertion's — conflating the two would make "the run completed" unprovable on
    // exactly the run a reader most needs to trust.
    expect(
      transcript(),
      'the transcript carries no closing verdict, so the run was cut short or edited. ' +
        'scripts/lcp-budget.sh ends with either "── PASS: every public page is within the ' +
        `${BUDGET_MS}ms LCP budget" or "FAIL: N page(s) over the ${BUDGET_MS}ms LCP budget".`,
    ).toMatch(
      new RegExp(
        `every public page is within the ${BUDGET_MS}ms LCP budget|` +
          `page\\(s\\) over the ${BUDGET_MS}ms LCP budget`,
      ),
    )
  })
})

describe('§2 — every page the gate measures was measured (T027, FR-025)', () => {
  it('records exactly the pages scripts/lcp-budget.sh walks', () => {
    expect(
      measurements()
        .map((entry) => entry.page)
        .sort(),
      'the record and the gate disagree about which pages are public. A page added to PAGES ' +
        'and not re-measured is a page SC-006 promises nothing about.',
    ).toEqual([...MEASURED_PAGES].sort())
  })

  it('summarises exactly those pages in its table', () => {
    expect(
      tableRows('Per page, measured')
        .map((row) => row[0] ?? '')
        .sort(),
      'the summary table names a different set of pages than the gate measures.',
    ).toEqual([...MEASURED_PAGES].sort())
  })
})

/**
 * Refuses a vacuous pass.
 *
 * Every `for … expect` below iterates something parsed out of the record, and an empty parse
 * makes the loop assert nothing while reporting green — the exact shape of "a gate that reports
 * success while checking nothing" this feature has now rejected five times. So each such case
 * states its own expected size first.
 */
function refuseEmpty(rows: readonly unknown[], what: string): void {
  expect(
    rows.length,
    `no ${what} was parsed out of docs/lcp-measurements.md, so the loop below would assert ` +
      'nothing and report green. An unparsed record is a missing record.',
  ).toBe(MEASURED_PAGES.length)
}

describe('§3 — every recorded median is inside the budget the gate enforces (SC-006)', () => {
  it('was measured against the budget the script still declares', () => {
    refuseEmpty(measurements(), 'measurement')
    for (const entry of measurements()) {
      expect(
        entry.budgetMs,
        `${entry.page} was measured against a ${entry.budgetMs}ms budget; the gate now ` +
          `enforces ${BUDGET_MS}ms. The record predates the change and the pages need ` +
          're-measuring.',
      ).toBe(BUDGET_MS)
    }
  })

  it('has no page over the budget', () => {
    refuseEmpty(measurements(), 'measurement')
    for (const entry of measurements()) {
      expect(
        entry.lcpMs,
        `${entry.page} measured ${entry.lcpMs}ms against the ${BUDGET_MS}ms budget. A record ` +
          'that documents a violation is not a record of SC-006 being met — the fix is the ' +
          'page, never this number.',
      ).toBeLessThanOrEqual(BUDGET_MS)
    }
  })
})

describe('§4 — the table is derived from the transcript, not typed beside it (T027)', () => {
  it('quotes the same milliseconds the gate printed', () => {
    const printed = new Map(measurements().map((entry) => [entry.page, entry.lcpMs]))
    refuseEmpty(tableRows('Per page, measured'), 'summary row')
    for (const row of tableRows('Per page, measured')) {
      const page = row[0] ?? ''
      const summarised = Number((row[1] ?? '').replace(/[^\d]/g, ''))
      expect(
        summarised,
        `the table says ${page} measured ${row[1]}, and the transcript above it says ` +
          `${printed.get(page)}ms. One of them is a typo, and only one of them was printed by ` +
          'the gate.',
      ).toBe(printed.get(page))
    }
  })
})

describe('§5 — the hero that was in place is the hero on disk (T027, T025)', () => {
  const recorded = () =>
    tableRows('The hero in place while it ran').map((row) => ({
      file: row[0] ?? '',
      bytes: Number((row[1] ?? '').replace(/[^\d]/g, '')),
    }))

  it('names every derivative apps/web/public/hero holds', () => {
    expect(
      recorded()
        .map((entry) => entry.file)
        .sort(),
      'the record describes a different set of hero files than the tree has. "With the real ' +
        'hero in place" is the whole of T027: a measurement taken without one of these is a ' +
        'measurement of a different page.',
    ).toEqual(readdirSync(HERO_DIR).sort())
  })

  it('weighs what the record says it weighed', () => {
    // Same refusal as § 3, sized against the directory rather than the page list: a hero table
    // nobody could parse would leave this loop asserting nothing about the largest asset in the
    // product.
    expect(
      recorded().length,
      'no hero derivative was parsed out of the record, so the byte comparison below runs zero ' +
        'times and passes.',
    ).toBe(readdirSync(HERO_DIR).length)
    for (const entry of recorded()) {
      const actual = statSync(join(HERO_DIR, entry.file)).size
      expect(
        actual,
        `${entry.file} is ${actual} bytes; the run was measured against ${entry.bytes}. ` +
          'Re-exporting the art invalidates the measurement — re-run scripts/lcp-budget.sh ' +
          'and re-record it rather than editing this number.',
      ).toBe(entry.bytes)
    }
  })
})

describe('§6 — the profile is the one the gate declares (T027, FR-025)', () => {
  const declared: ReadonlyArray<readonly [string, string]> = [
    ['the budget', String(BUDGET_MS)],
    ['the runs per URL', RUNS_PER_URL],
    ['the download throughput', THROUGHPUT_KBPS],
    ['the CPU slowdown', CPU_SLOWDOWN],
    ['the load cap', MAX_WAIT_MS],
  ]

  it.each(declared)('records %s the script uses', (what, value) => {
    expect(
      section('The profile it was measured on'),
      `the record does not cite ${what} (${value}) that scripts/lcp-budget.sh applies. A ` +
        'measurement is only as meaningful as the profile beside it, and a profile copied by ' +
        'hand is one edit away from describing a run nobody made.',
    ).toContain(value)
  })
})
