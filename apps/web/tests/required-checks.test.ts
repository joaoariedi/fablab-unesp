import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The merge-blocking gate set is MEASURED against GitHub, not assumed (T030, SC-012).
 *
 * Features 000, 001 and 002 each ended by adding jobs to `.github/workflows/ci.yml`, and
 * `ci.yml`'s own header states the consequence: "Job NAMES are the required-status-check
 * contexts on `dev` and `main`. Renaming one silently un-protects the branch." That sentence
 * describes a state that lives on GitHub, in branch protection — a place no file in this tree
 * can see. So for three features the claim "the gate is merge-blocking" has been made by
 * reading `ci.yml`, which cannot possibly answer it: a job present in the workflow and absent
 * from `required_status_checks.contexts` runs on every PR, reports its red, and is merged
 * past. That is not a gate. It is a notification.
 *
 * It was not hypothetical. Queried live on 2026-09-08, both branches carried eleven contexts
 * and FOUR jobs that run on every PR were not among them — `Colour tokens` and `Isolation
 * harness can fail (public-path)`, inherited unmet from feature 002's T050, plus this feature's
 * own `Performance budget` and `Performance budget can fail`. Each was advisory: it ran,
 * reported its red, and was merged past.
 *
 * **Closed on 2026-09-09.** Both branches now require all fifteen, `strict: true`, and
 * `.github/required-checks.json` records that measurement. This file did the job it was written
 * for — it made the gap impossible to keep claiming was closed — and what it guards now is the
 * other direction: that a gate added tomorrow cannot quietly join CI without joining protection.
 *
 * T018 was a repository-admin action on GitHub, outside any run's reach. What IS in reach, and
 * what this file is, is making the state **measured, pinned and visible** instead of assumed:
 *
 *   * `.github/required-checks.json` is the live protection API's answer, recorded;
 *   * `scripts/required-checks.sh` re-queries the live API and fails on any disagreement with
 *     that record, so the record cannot quietly become a lie;
 *   * the assertions below pin the advisory set to exactly what `tasks.md` names — today that
 *     is nothing, so a gate that stops being required, or one added to `ci.yml` and not to
 *     protection, fails here. That is the failure which let the first two sit unnoticed for a
 *     whole feature.
 *
 * Deliberately NOT asserted: any particular gate being missing. That would have turned the
 * human fix into a red suite and given whoever performed it a reason to delete this file — and
 * on 2026-09-09 it very nearly did anyway, through the table-must-exist check that has since
 * been relaxed (see {@link documentedGaps}). What is asserted is that the record and `tasks.md`
 * agree, in whichever state they are in.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..')
const WORKFLOW = '.github/workflows/ci.yml'
const SNAPSHOT = '.github/required-checks.json'
const SCRIPT = 'scripts/required-checks.sh'
const TASKS = '.specify/specs/003-paginas-publicas/tasks.md'

const read = (file: string) => readFileSync(join(ROOT, file), 'utf8')

/**
 * Job names as GitHub will report them, with the one matrix job expanded.
 *
 * `isolation-mutation` interpolates `${{ matrix.layer }}` into its name on purpose — see the
 * comment on that job — so its three contexts are three distinct strings, and a comparison
 * against protection has to expand them or it invents a context nobody can require.
 */
function ciGateNames(): string[] {
  const ci = read(WORKFLOW)
  const layers = (/layer:\s*\[([^\]]+)\]/.exec(ci)?.[1] ?? '')
    .split(',')
    .map((layer) => layer.trim())
    .filter(Boolean)

  const names = [...ci.matchAll(/^ {4}name:\s*(.+?)\s*$/gm)]
    .map((match) => match[1] ?? '')
    .map((name) => name.replace(/^['"]|['"]$/g, ''))

  return names.flatMap((name) =>
    name.includes('${{ matrix.layer }}')
      ? layers.map((layer) => name.replace('${{ matrix.layer }}', layer))
      : [name],
  )
}

/** `branches` is keyed literally rather than by index signature: both protected branches are
 *  named in the contract, and a snapshot missing one is a failure the first assertion states
 *  outright instead of an `undefined` surfacing three tests later. */
type Snapshot = {
  repo: string
  measuredAt: string
  branches: { main: string[]; dev: string[] }
}

function snapshot(): Snapshot {
  return JSON.parse(read(SNAPSHOT)) as Snapshot
}

/**
 * The contexts `tasks.md` claims are missing: the backticked first cell of every row in a
 * "Missing context" table, or NOTHING when the document declares no such table.
 *
 * The original required that table to exist, so that closing T018 could not be faked by
 * deleting it. When T018 was actually closed on 2026-09-09 the table went with it — correctly,
 * because there is no longer a gap to tabulate — and both cases below went red on a repo whose
 * protection had just become *stricter*. A gate that fires when the thing it guards is fixed
 * teaches one lesson, and it is to delete the gate.
 *
 * An absent table is now read as "no gap claimed", and the guarantee moves into the equality
 * that uses it: if protection really does leave a gate advisory, `gaps` is non-empty, this
 * returns `[]`, and the assertion fails — which is the case the table existed to catch. Hiding
 * the gap by deleting the table is therefore still impossible; claiming there is none, when
 * there is none, is now merely quiet.
 */
function documentedGaps(): string[] {
  const lines = read(TASKS).split('\n')
  const header = lines.findIndex((line) => line.startsWith('| Missing context |'))
  if (header === -1) return []

  const rows: string[] = []
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('|')) break
    const cell = /^\|\s*`([^`]+)`\s*\|/.exec(line)?.[1]
    if (cell) rows.push(cell)
  }
  return rows
}

/** The refusal path only: an unrecognised argument exits 64 before any network call. */
function usageOf(): { status: number; usage: string } {
  try {
    execFileSync('bash', [SCRIPT, '--not-a-real-flag'], { cwd: ROOT, encoding: 'utf8' })
  } catch (error) {
    const failure = error as { status?: number; stderr?: string; stdout?: string }
    return { status: failure.status ?? -1, usage: `${failure.stderr ?? ''}${failure.stdout ?? ''}` }
  }
  return { status: 0, usage: '' }
}

describe('the recorded protection state is the live one (T030, SC-012)', () => {
  it('records both protected branches, measured from the live API', () => {
    const recorded = snapshot()
    expect(recorded.repo).toBe('joaoariedi/fablab-unesp')
    expect(
      Object.keys(recorded.branches).sort(),
      `${SNAPSHOT} must record both protected branches. A gate required on dev and not on ` +
        'main is not a gate on main.',
    ).toEqual(['dev', 'main'])
    expect(
      recorded.measuredAt,
      `${SNAPSHOT} must carry the date the live API was queried — an undated record is the ` +
        '"assumed" this task exists to replace',
    ).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('requires the same contexts on main and on dev', () => {
    const { branches } = snapshot()
    expect(
      [...branches.main].sort(),
      'main and dev diverged: a context required on only one of them lets the same change ' +
        'in through the other branch',
    ).toEqual([...branches.dev].sort())
  })

  it('requires no context that names a job CI does not run', () => {
    const gates = ciGateNames()
    const { branches } = snapshot()
    for (const [branch, contexts] of Object.entries(branches)) {
      for (const context of contexts) {
        expect(
          gates,
          `branch ${branch} requires the status check "${context}", and no job in ${WORKFLOW} ` +
            'reports under that name. A required context that never appears blocks every ' +
            `merge forever. Jobs present: ${gates.join(', ')}`,
        ).toContain(context)
      }
    }
  })
})

describe('the gap between the gates and the protection is pinned (T030, T018, SC-012)', () => {
  it('leaves exactly the gates tasks.md names as advisory — today, none', () => {
    const required = new Set(snapshot().branches.dev)
    const gaps = ciGateNames().filter((gate) => !required.has(gate))
    expect(
      gaps.sort(),
      'the set of CI gates that branch protection does NOT require has changed since T018 ' +
        `measured it. ${TASKS} § Outstanding must list exactly these, and no more — an ` +
        'unlisted one is a gate that runs, reports red, and is merged past with nobody ' +
        'having decided that.',
    ).toEqual(documentedGaps().sort())
  })

  it("accounts for this feature's own two performance gates", () => {
    // SC-006's budget and its proof-of-failure. Feature 002's T050 left two gates advisory
    // and unrecorded for a whole feature; these two are recorded either way — required, or
    // named as outstanding — so the same thing cannot happen twice.
    const required = new Set(snapshot().branches.dev)
    const documented = new Set(documentedGaps())
    for (const gate of ['Performance budget', 'Performance budget can fail']) {
      expect(
        required.has(gate) || documented.has(gate),
        `"${gate}" is neither a required status check nor listed as outstanding in ${TASKS}. ` +
          'SC-012 is then being claimed on a gate whose merge-blocking status nobody checked.',
      ).toBe(true)
    }
  })
})

describe('the record is re-derivable from the live API (T030)', () => {
  // Read out of the script by RUNNING it, as apps/web/tests/isolation-mutation-layers.test.ts
  // does: the usage line is the contract, and grepping the source would keep passing after a
  // rename that breaks every caller.
  const { status, usage } = usageOf()

  it('refuses an unrecognised argument before touching the network', () => {
    expect(status, `${SCRIPT} must exit 64 on a bad argument; got ${status}`).toBe(64)
  })

  it.each([
    ['the protection endpoint', 'branches/'],
    ['the protection sub-resource', 'protection'],
    ['main', 'main'],
    ['dev', 'dev'],
    ['the snapshot it verifies', SNAPSHOT],
  ])('advertises %s', (_what, needle) => {
    expect(
      usage,
      `${SCRIPT}'s usage never mentions "${needle}", so what it verifies cannot be read off ` +
        `the script itself. Usage was:\n${usage}`,
    ).toContain(needle)
  })
})
