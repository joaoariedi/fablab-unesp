import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { LINHAS_AVATAR } from '../collections/avatar/AvatarItem'
import { TOTAL_TONS_DE_CABELO } from '../collections/avatar/TomDeCabelo'
import { TOTAL_TONS_DE_PELE } from '../collections/avatar/TomDePele'

/**
 * T039 / FR-032, SC-011, CLR-004 — the builder's **recorded** budget, kept honest.
 *
 * CLR-004 split the performance promise in two. `scripts/lcp-budget.sh` keeps measuring the six
 * public pages on every pull request and **does not learn to sign in**; the avatar builder —
 * the largest island in the product — gets a budget that is *measured once and written down*,
 * on the same profile, and enforced by nobody. The clarification prices that weakening itself:
 * *"a regression in the builder is caught by a measurement someone takes, not by CI. That is a
 * real weakening, and it is the reason the budget must be recorded rather than merely intended
 * — an unrecorded budget is not a budget."*
 *
 * `docs/avatar-budget.md` is that record. This file is the only thing standing between it and
 * folklore, and it does **not** measure: measuring needs a browser, a production build and a
 * database nothing else shares (`scripts/lcp-budget.sh` owns all three). What it can do — and
 * what the gate cannot, since the gate never visits this page — is notice that the record has
 * stopped describing the tree it was taken from.
 *
 * ── The four ways this particular record goes stale ─────────────────────────────────────────
 *
 *   1. **The profile moves.** Every throttling value is read out of the gate script, never
 *      retyped here (§4), so a record measured at 2500 ms cannot survive a 2000 ms budget.
 *   2. **The split collapses.** If `/criar-conta` is ever added to the gate's `PAGES`, CLR-004
 *      no longer holds and this document is describing a decision the tree has reversed (§2).
 *   3. **The sprites land.** The whole point of counting picker and preview bytes *separately*
 *      is that ~92 thumbnails draw `sprite` and only the handful of chosen pieces pull the
 *      four-frame `spriteFolhas`. Today the page hands the builder neither — the catalogue is
 *      read at `depth: 0` and `itensDoBuilder` emits no art — so both counts are zero, and the
 *      moment that changes the recorded number is a measurement of a different page (§5).
 *   4. **The catalogue shrinks.** A number measured against nine empty pickers is the trap
 *      `lcp-budget.sh`'s own header warns about: a page missing its content measures
 *      magnificently. §6 holds the recorded row counts to the sizes the collections declare.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..')
const SCRIPT = join(ROOT, 'scripts', 'lcp-budget.sh')
const RECORD = join(ROOT, 'docs', 'avatar-budget.md')
const PAGE_MODULE = join(ROOT, 'apps', 'web', 'app', '(frontend)', 'criar-conta', 'page.tsx')

const SCRIPT_SOURCE = readFileSync(SCRIPT, 'utf8')
const PAGE_SOURCE = readFileSync(PAGE_MODULE, 'utf8')

/**
 * The record, or the empty string when it is absent.
 *
 * Read defensively, for the reason `lcp-measurements.test.ts` records: a `readFileSync` throw at
 * module scope aborts the whole file and vitest reports it as an unhandled error — which is the
 * one shape a missing deliverable must NOT have, since this repo has already lost 160 tests to
 * a file that failed before it could fail loudly.
 */
const RECORD_SOURCE = existsSync(RECORD) ? readFileSync(RECORD, 'utf8') : ''

/** The route the builder's budget is about — step 1 of the signup flow. */
const BUILDER_PAGE = '/criar-conta'

/** One declaration out of the gate script, so the record cannot cite a profile it stopped using. */
function fromScript(pattern: RegExp, what: string): string {
  const found = SCRIPT_SOURCE.match(pattern)
  if (!found?.[1]) {
    throw new Error(
      `scripts/lcp-budget.sh no longer declares ${what} in the shape /${pattern.source}/. ` +
        "The builder's budget is quoted from that script; if the gate changed, this test must " +
        'be taught the new spelling and the builder re-measured.',
    )
  }
  return found[1]
}

const GATED_PAGES = fromScript(/^PAGES=\(([^)]*)\)/m, 'its page list').trim().split(/\s+/)
const BUDGET_MS = Number(fromScript(/BUDGET_MS="\$\{LCP_BUDGET_MS:-(\d+)\}"/, 'its budget'))
const RUNS_PER_URL = fromScript(/^RUNS_PER_URL=(\d+)/m, 'its runs per URL')
const MAX_WAIT_MS = fromScript(/LCP_MAX_WAIT_MS="\$\{LCP_MAX_WAIT_MS:-(\d+)\}"/, 'its load cap')
const THROUGHPUT_KBPS = fromScript(
  /--throttling\.downloadThroughputKbps=([\d.]+)/,
  'its download throughput',
)
const CPU_SLOWDOWN = fromScript(/--throttling\.cpuSlowdownMultiplier=(\d+)/, 'its CPU slowdown')

/**
 * The two lines `assert_lcp_at_most` prints, and BOTH are parsed first-class.
 *
 * A parser that understood only `── PASS` would drop exactly the run a reader most needs to
 * find: an over-budget page is reported in the other wording, so a red transcript could sit in
 * the document while every assertion below iterated an empty list and reported green.
 *
 * Fresh instances per call — a `/g` regex carries `lastIndex` between `.test()` and
 * `.matchAll()`, and a shared one starts a later scan half way through the transcript.
 */
const passLine = (): RegExp => /──\s+PASS\s+(\/\S*)\s+LCP\s+(\d+)ms\s+\(budget\s+(\d+)ms\)/g
const failLine = (): RegExp => /FAIL:\s+(\/\S*)\s+—\s+LCP\s+(\d+)ms exceeds the (\d+)ms budget/g

type Measurement = { page: string; lcpMs: number; budgetMs: number }

/** The fenced code blocks of the record — where the gate's own output has to live. */
function fencedBlocks(): string[] {
  return RECORD_SOURCE.split('\n```')
    .filter((_, index) => index % 2 === 1)
    .map((block) => block.replace(/^[^\n]*\n/, ''))
}

/** The transcript block: the fence carrying per-page output in the gate's wording. */
function transcript(): string {
  return fencedBlocks().find((block) => passLine().test(block) || failLine().test(block)) ?? ''
}

/** Every measurement the pasted transcript reports. */
function measurements(): Measurement[] {
  return [...transcript().matchAll(passLine()), ...transcript().matchAll(failLine())].map(
    (match) => ({ page: match[1] ?? '', lcpMs: Number(match[2]), budgetMs: Number(match[3]) }),
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
  const rows = section(title)
    .split('\n')
    .filter((line) => line.trimStart().startsWith('|'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)))
  return rows.slice(1)
}

/**
 * The body of `itensDoBuilder` — the one function that decides whether a byte of sprite art
 * reaches this page.
 *
 * Sliced rather than grepped over the whole module, and that distinction cost a round: the file
 * *discusses* sprites in three docblocks (`ItemDoc` says they are "deliberately absent", the
 * frame-size constant calls a body sprite taller than it is wide), so a module-wide `/sprite/`
 * matches commentary and reports art that is not there. What ships is what this function maps.
 */
function itensDoBuilderBody(): string {
  const start = PAGE_SOURCE.indexOf('function itensDoBuilder')
  if (start < 0) {
    throw new Error(
      'criar-conta/page.tsx no longer declares itensDoBuilder. That function is what turns ' +
        'catalogue rows into the builder\'s items, so the probe below has lost its subject — ' +
        'point it at whatever replaced it and re-measure the page.',
    )
  }
  const rest = PAGE_SOURCE.slice(start)
  const end = rest.indexOf('\n}')
  return end < 0 ? rest : rest.slice(0, end)
}

/** The digits of a table cell — `1,234 B` and `92 rows` alike. `NaN` when there are none. */
function digits(cell: string | undefined): number {
  const found = (cell ?? '').replace(/[^\d]/g, '')
  return found === '' ? Number.NaN : Number(found)
}

const MISSING =
  'docs/avatar-budget.md is the deliverable of T039: LCP on /criar-conta at the gate\'s own ' +
  'profile, with picker and preview sheet bytes counted separately. CLR-004 leaves the builder ' +
  'with no per-PR gate at all, so without this document FR-032 rests on nothing.'

describe("§1 — the record is the gate's own output, not a summary of it (T039, FR-032)", () => {
  it('exists', () => {
    expect(existsSync(RECORD), MISSING).toBe(true)
  })

  it('pastes a transcript in the wording scripts/lcp-budget.sh prints', () => {
    expect(
      transcript(),
      `${MISSING} A number with no transcript beside it is a claim; the assertion the gate ` +
        'itself printed is evidence, and it is the only part of this document nobody typed.',
    ).toMatch(/──\s+PASS|FAIL:/)
  })
})

describe('§2 — CLR-004 holds: the builder is recorded, the six pages are gated', () => {
  it('measures the builder, and only the builder', () => {
    expect(
      measurements().map((entry) => entry.page),
      'the record is the budget for the avatar builder at /criar-conta. A record that measures ' +
        'a different set of pages is either a second copy of the public budget or a run that ' +
        'never reached this page.',
    ).toEqual([BUILDER_PAGE])
  })

  it('is measuring a page the per-PR gate deliberately does not walk', () => {
    expect(
      GATED_PAGES,
      `${BUILDER_PAGE} is in scripts/lcp-budget.sh's PAGES, so the per-PR gate now covers it ` +
        'and CLR-004 — "the LCP gate stays public; the builder gets a recorded budget" — has ' +
        'been reversed. Either the clarification moved, or a signed-out signup page was added ' +
        'to a gate the clarification says stays on the six public pages.',
    ).not.toContain(BUILDER_PAGE)
  })
})

describe('§3 — the recorded median is inside the budget the gate enforces (SC-011)', () => {
  it('was measured against the budget the script still declares', () => {
    expect(measurements(), 'no measurement was parsed out of the record').not.toHaveLength(0)
    for (const entry of measurements()) {
      expect(
        entry.budgetMs,
        `${entry.page} was measured against a ${entry.budgetMs}ms budget; the gate now declares ` +
          `${BUDGET_MS}ms. The record predates the change and the builder needs re-measuring.`,
      ).toBe(BUDGET_MS)
    }
  })

  it('has the builder inside it', () => {
    expect(measurements(), 'no measurement was parsed out of the record').not.toHaveLength(0)
    for (const entry of measurements()) {
      expect(
        entry.lcpMs,
        `${entry.page} measured ${entry.lcpMs}ms against ${BUDGET_MS}ms. A record documenting a ` +
          'violation is not a record of the budget being met — the fix is the page, never this ' +
          'number.',
      ).toBeLessThanOrEqual(BUDGET_MS)
    }
  })
})

describe('§4 — the profile is the one scripts/lcp-budget.sh declares (T039, FR-032)', () => {
  const declared: ReadonlyArray<readonly [string, string]> = [
    ['the budget', String(BUDGET_MS)],
    ['the runs per URL', RUNS_PER_URL],
    ['the download throughput', THROUGHPUT_KBPS],
    ['the CPU slowdown', CPU_SLOWDOWN],
    ['the load cap', MAX_WAIT_MS],
  ]

  it.each(declared)('records %s the gate applies', (what, value) => {
    expect(
      section('The profile it was measured on'),
      `the record does not cite ${what} (${value}). T039 asks for the measurement at ` +
        "*lcp-budget.sh's own profile*, and a profile copied by hand is one edit away from " +
        'describing a run nobody made.',
    ).toContain(value)
  })
})

describe('§5 — picker and preview sheet bytes, counted separately (T039, FR-032)', () => {
  const bytesRow = (pattern: RegExp): string[] =>
    tableRows('Picker and preview sheet bytes').find((row) => pattern.test(row[0] ?? '')) ?? []

  const picker = (): string[] => bytesRow(/picker/i)
  const preview = (): string[] => bytesRow(/preview/i)

  it('counts the two sheets on their own rows, never as one figure', () => {
    const linhas = tableRows('Picker and preview sheet bytes')
    const daPicker = linhas.filter((row) => /picker/i.test(row[0] ?? ''))
    const daPreview = linhas.filter((row) => /preview/i.test(row[0] ?? ''))

    expect(
      [daPicker.length, daPreview.length],
      'the record must carry a picker-sprite row and a preview-sheet row with their own byte ' +
        'counts. They are the two halves FR-032 separates: ~92 thumbnails draw `sprite`, and ' +
        'only the pieces someone actually chose pull the four-frame `spriteFolhas`.',
    ).toEqual([1, 1])

    // TWO ROWS, not two matches. The first version asked only that each `find` returned
    // something, and a single row worded "Picker and preview sprite sheets, combined" satisfies
    // both regexes — so the record could be collapsed into exactly the one combined figure this
    // case forbids, and the suite stayed 14/14 green. Measured, not imagined.
    expect(
      daPicker[0],
      'one row is being counted as both halves, so the record carries a combined figure. A ' +
        'single number cannot tell a regression in the picker from one in the preview, which ' +
        'is the whole reason FR-032 asks for them apart.',
    ).not.toBe(daPreview[0])
  })

  it('agrees with the art the page actually asks for', () => {
    // The staleness probe, and the reason it is written against the page rather than a
    // directory: these sprites are `relationship` columns on `avatarItem`, not files in the
    // repo, so there is nothing to `statSync`. What decides whether a byte of sprite art
    // reaches this page is `itensDoBuilder` — it maps id, nome, slot, camadaZ and base and
    // nothing else — over a read taken at `depth: 0`, which leaves the relationships as ids.
    // The day either changes, the recorded zeros describe a page that no longer exists.
    expect(
      itensDoBuilderBody(),
      'apps/web/app/(frontend)/criar-conta/page.tsx now hands the builder sprite art, so the ' +
        'byte counts in docs/avatar-budget.md were taken from a lighter page than the one that ' +
        'ships. Re-run the measurement and re-record it rather than editing the numbers.',
    ).not.toMatch(/sprite/i)
    expect(
      PAGE_SOURCE,
      "the avatarItem read no longer takes depth: 0, so the sprite relationships are being " +
        'populated and the page is carrying art the recorded zeros say it does not. Re-measure.',
    ).toContain("collection: 'avatarItem', depth: 0")
    for (const [what, row] of [['picker sprites', picker()], ['preview sheets', preview()]] as const) {
      expect(
        digits(row[row.length - 1]),
        `the record puts ${what} at ${row[row.length - 1]} while the page requests no sprite ` +
          'art at all. Zero is the honest figure today, and it is the baseline the first ' +
          'wired sprite will be compared against.',
      ).toBe(0)
    }
  })
})

describe('§6 — the builder was full when it was measured (T039, CLR-004)', () => {
  const ROWS: Readonly<Record<string, number>> = {
    tomDePele: TOTAL_TONS_DE_PELE,
    tomDeCabelo: TOTAL_TONS_DE_CABELO,
    avatarItem: Object.values(LINHAS_AVATAR).reduce((soma, linhas) => soma + linhas, 0),
  }

  it('records the catalogue the page walked, at the sizes the collections declare', () => {
    const recorded = Object.fromEntries(
      tableRows('The catalogue that was on the page').map((row) => [row[0] ?? '', digits(row[1])]),
    )
    expect(
      recorded,
      'a builder measured over an empty catalogue is the trap scripts/lcp-budget.sh warns ' +
        'about in its own header: a page missing its content measures magnificently. The ' +
        'record must name how many rows each of the three collections held, and they must be ' +
        'the sizes TOTAL_TONS_DE_PELE, TOTAL_TONS_DE_CABELO and LINHAS_AVATAR fix.',
    ).toEqual(ROWS)
  })
})
