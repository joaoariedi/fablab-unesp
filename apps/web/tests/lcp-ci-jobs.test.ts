import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The LCP budget has to actually RUN somewhere (T017, SC-006, SC-012).
 *
 * T015 built the gate and T016 built the proof that it can fail. Both are shell scripts, and a
 * shell script belonging to no pipeline is exactly the failure feature 001 shipped three times
 * before anyone noticed: `scripts/check-colour-tokens.sh` was written in round 1, had its exit
 * contract fixed in round 2, and was still in no job at all in round 3. Three rounds, one
 * mechanism, never once in a position to fire. So the jobs get a gate of their own.
 *
 * Two things are asserted, and neither is a restatement of the YAML:
 *
 *   1. **The names.** Branch protection lists required status checks by NAME (T018 adds these
 *      two contexts by hand). A renamed job silently un-protects the branch, and a context that
 *      never appears blocks every merge forever — so `Performance budget` and `Performance
 *      budget can fail` are an interface, exactly as this workflow's own header says.
 *
 *   2. **The database.** `scripts/lcp-budget.sh` migrates, SEEDS, builds, starts and only then
 *      measures — because tenancy resolves from the Host header and the seeded organization is
 *      what owns `localhost`. Without those rows every route 404s and Lighthouse measures an
 *      error page at a magnificent LCP: the gate passes hardest exactly when the content is
 *      gone. The test suite DESTROYS those rows — measured, and it has already cost this
 *      project a debugging round. Hence the task's requirement: the budget job must own a
 *      database the test job does not share. That means its own Postgres service AND no test
 *      run inside the same job, since a suite running beside the measurement empties the
 *      domains between the seed and the first probe.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..')
const WORKFLOW = '.github/workflows/ci.yml'
const CI = readFileSync(join(ROOT, WORKFLOW), 'utf8')

type Job = { key: string; name: string; body: string }

/**
 * The `jobs:` mapping, split on indentation.
 *
 * Nothing here parses YAML properly — there is no YAML dependency in this workspace, and the
 * shapes being asserted (a job key, its `name:`, the text of its steps) survive a two-space
 * split perfectly well. What it must NOT do is match a job key inside another job's `with:`
 * block, so the split is anchored to exactly two spaces of indent under a column-zero `jobs:`.
 */
function jobs(): Job[] {
  const lines = CI.split('\n')
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line))
  if (start < 0) throw new Error(`${WORKFLOW} has no top-level jobs: mapping`)

  const found: Job[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break // back to column zero: the jobs mapping ended
    const key = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)?.[1]
    if (key) {
      found.push({ key, name: '', body: '' })
      continue
    }
    const current = found.at(-1)
    if (!current) continue
    current.body += `${line}\n`
    const name = /^ {4}name:\s*(.+?)\s*$/.exec(line)?.[1]
    if (name && !current.name) current.name = name.replace(/^['"]|['"]$/g, '')
  }
  return found
}

const ALL = jobs()

function jobNamed(name: string): Job {
  const match = ALL.find((job) => job.name === name)
  expect(
    match,
    `no job in ${WORKFLOW} is named "${name}". Branch protection requires status checks by ` +
      `name (T018), so this exact string is the interface — the jobs present are: ` +
      `${ALL.map((job) => job.name || job.key).join(', ')}`,
  ).toBeDefined()
  return match!
}

/** The suite invocations that would empty the seeded host domains mid-measurement. */
const RUNS_THE_SUITE = /^\s*(- (name:.*\n\s*)?run:\s*)?.*\b(pnpm (-r )?(--filter \S+ )?test\b|vitest)/m

describe('the LCP budget is wired into CI under its required-check name (T017, SC-006)', () => {
  it('runs the budget gate in a job named "Performance budget"', () => {
    const job = jobNamed('Performance budget')
    expect(
      job.body,
      `the "Performance budget" job does not run scripts/lcp-budget.sh — a gate belonging to ` +
        `no pipeline is the check-colour-tokens.sh failure repeated`,
    ).toContain('scripts/lcp-budget.sh')
  })

  it('runs the proof-of-failure in a job named "Performance budget can fail"', () => {
    const job = jobNamed('Performance budget can fail')
    expect(
      job.body,
      `SC-012: a budget only ever observed green is evidence of nothing, so lcp-mutation.sh ` +
        `has to run in CI too`,
    ).toContain('scripts/lcp-mutation.sh')
  })

  it.each(['Performance budget', 'Performance budget can fail'])(
    '%s can start: checkout, pnpm, Node and installed dependencies',
    (name) => {
      const job = jobNamed(name)
      // Both scripts shell out to `pnpm --filter @fablab/web migrate|seed|build|start`. A job
      // missing any of these fails before it measures anything, which is a gate that cannot
      // start — worse than no gate, because the red looks like a real budget failure.
      for (const requirement of [
        'actions/checkout',
        'pnpm/action-setup',
        'actions/setup-node',
        'pnpm install --frozen-lockfile',
      ]) {
        expect(job.body, `${name} never runs ${requirement}, so its script cannot run pnpm`).toContain(
          requirement,
        )
      }
    },
  )
})

describe('the budget owns a database the test job does not share (T017)', () => {
  it.each(['Performance budget', 'Performance budget can fail'])(
    '%s brings its own Postgres service',
    (name) => {
      const job = jobNamed(name)
      expect(
        job.body,
        `${name} declares no Postgres service, so migrate and seed have nothing to run ` +
          `against and the gate measures a 404 page at a magnificent LCP`,
      ).toMatch(/services:[\s\S]*image:\s*postgres/)
    },
  )

  it.each(['Performance budget', 'Performance budget can fail'])(
    '%s does not run the test suite beside its own seed',
    (name) => {
      const job = jobNamed(name)
      expect(
        RUNS_THE_SUITE.test(job.body),
        `${name} runs the test suite in the same job as the measurement. The suite destroys ` +
          `the seeded host domains — measured — so the budget would then be measuring the 404 ` +
          `page, which scores beautifully`,
      ).toBe(false)
    },
  )

  it('keeps the measurement out of the Tests job entirely', () => {
    const tests = jobNamed('Tests')
    for (const script of ['scripts/lcp-budget.sh', 'scripts/lcp-mutation.sh']) {
      expect(
        tests.body,
        `the Tests job runs ${script}. That is the one database whose seeded domains the suite ` +
          `is known to destroy — the measurement has to own its own`,
      ).not.toContain(script)
    }
  })
})
