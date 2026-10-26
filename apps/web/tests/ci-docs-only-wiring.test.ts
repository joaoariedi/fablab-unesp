import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The docs-only path is wired into every code-stage job, and into nothing else (feature 009,
 * FR-013, FR-014, US6).
 *
 * `scripts/ci-change-scope.sh` decides; `.github/workflows/ci.yml` obeys. The decision is only
 * worth anything if every code-stage job asks for it the same way — a job that forgets the gate
 * runs in full (slow, harmless), but a job that gates the wrong step, loses `fetch-depth`, or
 * stops calling the script turns the feature into a silent no-op or, worse, skips work on a code
 * pull request. So the wiring is pinned, job by job, and the job set is an allow-list of the three
 * docs-stage jobs: a job added tomorrow is gated by default or fails here.
 *
 * The second half pins FR-014: a docs-only run skips `pnpm test`, so every test that scans the
 * WHOLE tracked tree — and therefore reads every Markdown file — must still run on that path.
 *
 * This file names no Markdown path or basename in quotes: a quoted one would make that document
 * code for every pull request (FR-002).
 */

const ROOT = join(import.meta.dirname, '..', '..', '..')
const WORKFLOW = '.github/workflows/ci.yml'
const CI = readFileSync(join(ROOT, WORKFLOW), 'utf8')

type Job = { key: string; name: string; body: string }

/**
 * The `jobs:` mapping, split on indentation. Copied from lcp-ci-jobs.test.ts (`jobs()`), not
 * imported: that file is pinned by FR-011 and stays unedited. No YAML dependency exists in this
 * workspace; the split is anchored to exactly two spaces of indent under a column-zero `jobs:`.
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

/** A job's steps, each the text from its `- ` line up to the next one. */
function steps(job: Job): string[] {
  const lines = job.body.split('\n')
  const start = lines.findIndex((line) => /^ {4}steps:\s*$/.test(line))
  if (start < 0) return []
  const found: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^ {0,4}\S/.test(line)) break // a sibling of `steps:` — the list ended
    if (/^ {6}- /.test(line)) found.push('')
    if (found.length > 0) found[found.length - 1] += `${line}\n`
  }
  return found
}

const ALL = jobs()

const DOCS_STAGE = new Set(['Secret scan', 'Markdown lint', 'Link integrity'])
const CODE_STAGE = ALL.filter((job) => !DOCS_STAGE.has(job.name))

/** The two step conditions, matched as the step's OWN `if:` key — never a comment mentioning it. */
const RUN_ON_CODE = /^ {6}(- | {2})if: steps\.scope\.outputs\.docs_only != 'true'\s*$/m
const RUN_ON_DOCS = /^ {6}(- | {2})if: steps\.scope\.outputs\.docs_only == 'true'\s*$/m
const ANY_STEP_IF = /^ {6}(- | {2})if:/m

/** The `Tests` steps the docs-only step needs, and so the only ones left ungated there. */
const TESTS_UNGATED = [
  /^ {6}- uses:\s*pnpm\/action-setup@/m,
  /^ {6}- uses:\s*actions\/setup-node@/m,
  /^ {6}- run:\s*pnpm install --frozen-lockfile\s*$/m,
]

describe('[FR-004] [FR-005] [FR-013] the job set', () => {
  it('every docs-stage job still exists under its name', () => {
    expect(ALL.map((job) => job.name)).toEqual(expect.arrayContaining([...DOCS_STAGE]))
  })

  it.each(ALL.map((job) => [job.name, job] as const))('%s has no job-level if:', (name, job) => {
    expect(
      job.body,
      `${name}: a job-level if: skips the job, and a skipped matrix job reports one unexpanded ` +
        `context instead of a context per layer (FR-004) — gate the steps instead`,
    ).not.toMatch(/^ {4}if:/m)
  })

  it.each([...DOCS_STAGE])('%s is never gated by the classifier (FR-005)', (name) => {
    const job = ALL.find((candidate) => candidate.name === name)!
    expect(job.body, `${name} is a docs-stage job and must run its full check on every run`).not.toMatch(
      /ci-change-scope|docs_only/,
    )
  })
})

describe('[FR-001] [FR-003] [FR-006] [FR-007] [FR-010] [FR-013] every code-stage job asks the classifier', () => {
  it('there are code-stage jobs to check', () => {
    expect(CODE_STAGE.length).toBeGreaterThanOrEqual(10)
  })

  it.each(CODE_STAGE.map((job) => [job.name, job] as const))('%s: checkout deep enough to diff', (name, job) => {
    const [checkout] = steps(job)
    expect(checkout, `${name}: the first step must be actions/checkout`).toMatch(/uses:\s*actions\/checkout@/)
    expect(
      checkout,
      `${name}: checkout lost fetch-depth 2, so HEAD^1 is missing, the diff fails and every pull ` +
        `request silently takes the full path (FR-001)`,
    ).toMatch(/^\s+fetch-depth:\s*2\s*(#.*)?$/m)
  })

  it.each(CODE_STAGE.map((job) => [job.name, job] as const))('%s: step 2 is the scope step', (name, job) => {
    const scope = steps(job)[1] ?? ''
    expect(scope, `${name}: step 2 must carry id: scope — every later if: reads its output`).toMatch(
      /^\s+(- )?id:\s*scope\s*$/m,
    )
    expect(
      scope,
      `${name}: the scope step lost continue-on-error, so a classifier crash turns a code pull request red (FR-007)`,
    ).toMatch(/^\s+continue-on-error:\s*true\s*(#.*)?$/m)
    expect(
      scope,
      `${name}: the scope step must run exactly the classifier's github mode; any other command ` +
        `leaves docs_only unset and the feature a silent no-op (FR-001)`,
    ).toMatch(/^\s+run:\s*bash scripts\/ci-change-scope\.sh github\s*$/m)
    expect(scope, `${name}: the scope step uses an Action; classification is git and shell only (FR-010)`).not.toMatch(
      /uses:/,
    )
  })

  it.each(CODE_STAGE.map((job) => [job.name, job] as const))('%s: every later step is gated', (name, job) => {
    for (const step of steps(job).slice(2)) {
      if (name === 'Tests' && TESTS_UNGATED.some((rule) => rule.test(step))) {
        expect(step, `Tests: a prerequisite of the docs-only step must run on both verdicts`).not.toMatch(ANY_STEP_IF)
        continue
      }
      const gated = RUN_ON_CODE.test(step) || (name === 'Tests' && RUN_ON_DOCS.test(step))
      expect(
        gated,
        `${name}: this step runs on a docs-only pull request — give it ` +
          `"if: steps.scope.outputs.docs_only != 'true'" (FR-003):\n${step}`,
      ).toBe(true)
    }
  })

  it.each(CODE_STAGE.filter((job) => job.name !== 'Tests').map((job) => [job.name, job] as const))(
    '%s runs nothing on the docs-only verdict',
    (name, job) => {
      expect(job.body, `${name}: only Tests has a docs-only step (FR-014)`).not.toMatch(RUN_ON_DOCS)
    },
  )

  it('Tests leaves exactly its three prerequisites ungated, each once', () => {
    const tests = steps(ALL.find((job) => job.name === 'Tests')!)
    for (const rule of TESTS_UNGATED) {
      expect(
        tests.filter((step) => rule.test(step)),
        `Tests: ${rule} must match exactly one step`,
      ).toHaveLength(1)
    }
  })
})

describe('[FR-009] the required contexts still resolve from the job names', () => {
  it('every recorded context on both branches is a job name, with the matrix expanded', () => {
    const layers = (/layer:\s*\[([^\]]+)\]/.exec(CI)?.[1] ?? '').split(',').map((layer) => layer.trim())
    const names = ALL.flatMap((job) =>
      job.name.includes('${{ matrix.layer }}')
        ? layers.map((layer) => job.name.replace('${{ matrix.layer }}', layer))
        : [job.name],
    )
    const recorded = JSON.parse(readFileSync(join(ROOT, '.github/required-checks.json'), 'utf8')) as {
      branches: Record<string, string[]>
    }
    for (const [branch, contexts] of Object.entries(recorded.branches)) {
      expect(contexts).toHaveLength(16)
      for (const context of contexts) {
        expect(names, `${branch} requires "${context}", which no job in ${WORKFLOW} reports`).toContain(context)
      }
    }
  })
})

// ── FR-014: the whole-tree tests run on the docs-only path ───────────────────────────────

const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })

/** The test files of the workspace. Scoped to test files, so this listing reads no Markdown. */
const TEST_PATHSPECS = [':(glob)apps/**/*.test.ts', ':(glob)apps/**/*.test.tsx', ':(glob)packages/**/*.test.ts', ':(glob)packages/**/*.test.tsx']
const testFiles = () => git('ls-files', '-z', '--', ...TEST_PATHSPECS).split('\0').filter(Boolean)

/**
 * Files exempt from the caller scan, each with the reason. Both are this feature's own tests and
 * list file NAMES only — neither reads the content of a Markdown file — and the scan below would
 * otherwise flag their own listing calls. An exemption is not a precedent: a third entry deserves
 * its own argument.
 */
const NAME_ONLY_LISTERS = new Map([
  ['apps/web/tests/ci-change-scope.test.ts', 'lists Markdown names to derive the read set; its search excludes Markdown content'],
  ['apps/web/tests/ci-docs-only-wiring.test.ts', 'lists test files and resolves pathspecs; reads no Markdown'],
])

/** A call is `ls-files` inside one quoted string literal (comments name it in backticks). */
const LS_FILES_CALL = /(['"])[^'"\n]*\bls-files\b[^'"\n]*\1/g

type Caller = { file: string; line: number; pathspecs: string[] | null }

/** Quoted literals of a `const NAME = [ … ]` array in `source`, or null when there is none. */
function constArray(source: string, name: string): string[] | null {
  const body = new RegExp(`const ${name}\\b[^=]*=\\s*\\[([^\\]]*)\\]`).exec(source)?.[1]
  return body === undefined ? null : [...body.matchAll(/(['"])([^'"\n]*)\1/g)].map((match) => match[2]!)
}

/** The pathspecs after a `--`: inline literals and spread `const` arrays; null if unresolvable. */
function pathspecsAfter(rest: string, source: string): string[] | null {
  const found: string[] = []
  for (const token of rest.matchAll(/(['"])([^'"\n]*)\1|\.\.\.([A-Za-z_$][\w$]*)/g)) {
    if (token[3]) {
      const spread = constArray(source, token[3])
      if (!spread) return null
      found.push(...spread)
    } else if (token[2]) found.push(token[2])
  }
  return found.length > 0 ? found : null
}

function lsFilesCallers(): Caller[] {
  const callers: Caller[] = []
  for (const file of testFiles()) {
    if (NAME_ONLY_LISTERS.has(file)) continue
    const source = readFileSync(join(ROOT, file), 'utf8')
    source.split('\n').forEach((text, index) => {
      for (const match of text.matchAll(LS_FILES_CALL)) {
        const literal = match[0]
        const rest = text.slice(match.index + literal.length)
        const inline = / -- (.*)$/.exec(literal.slice(1, -1))?.[1]
        const separator = /(['"])--\1/.exec(rest)
        const pathspecs =
          inline !== undefined
            ? inline.split(/\s+/).filter(Boolean)
            : separator
              ? pathspecsAfter(rest.slice(separator.index + separator[0].length), source)
              : undefined
        callers.push({ file, line: index + 1, pathspecs: pathspecs === undefined ? [] : pathspecs })
      }
    })
  }
  return callers
}

/** Workspace package name → directory, from each package's own manifest. */
function packageDirs(): Map<string, string> {
  const dirs = new Map<string, string>()
  for (const manifest of git('ls-files', '-z', '--', 'apps/*/package.json', 'packages/*/package.json').split('\0').filter(Boolean)) {
    const { name } = JSON.parse(readFileSync(join(ROOT, manifest), 'utf8')) as { name: string }
    dirs.set(name, manifest.replace(/\/package\.json$/, ''))
  }
  return dirs
}

/** The repo-relative test files the `Tests` docs-only steps run. */
function docsOnlyTestFiles(): string[] {
  const tests = steps(ALL.find((job) => job.name === 'Tests')!)
  const dirs = packageDirs()
  return tests
    .filter((step) => RUN_ON_DOCS.test(step))
    .flatMap((step) => {
      const run = /^\s+run:\s*pnpm --filter (\S+) exec vitest run ((?:\S+\.test\.tsx?\s*)+)$/m.exec(step)
      expect(
        run,
        `Tests: a docs-only step must be exactly "pnpm --filter <package> exec vitest run <files>" — ` +
          `no migrate, no database, no other command (FR-014):\n${step}`,
      ).not.toBeNull()
      const dir = dirs.get(run![1]!)
      expect(dir, `Tests: the docs-only step filters on ${run![1]}, which is no workspace package`).toBeDefined()
      return run![2]!.trim().split(/\s+/).map((file) => `${dir}/${file}`)
    })
    .sort()
}

describe('[FR-014] the whole-tree tests still run on a docs-only pull request', () => {
  const callers = lsFilesCallers()

  it('finds the known callers, so an empty scan cannot pass vacuously', () => {
    const files = callers.map((caller) => caller.file)
    expect(files).toContain('packages/ui/tests/fonts.test.ts')
    expect(files).toContain('apps/web/tests/theme.test.ts')
  })

  it('every exempt name-only lister still exists', () => {
    for (const file of NAME_ONLY_LISTERS.keys()) expect(existsSync(join(ROOT, file)), `stale exemption: ${file}`).toBe(true)
  })

  it('Tests runs exactly the test files with an unscoped ls-files call', () => {
    const unscoped = [...new Set(callers.filter((caller) => caller.pathspecs?.length === 0).map((caller) => caller.file))].sort()
    expect(
      docsOnlyTestFiles(),
      `the docs-only step in Tests must run every test that lists the whole tracked tree — a scanner ` +
        `left off it reads every Markdown file and is skipped on exactly the pull requests that change one`,
    ).toEqual(unscoped)
  })

  it('every scoped caller lists only paths holding no tracked Markdown', () => {
    for (const caller of callers.filter((candidate) => candidate.pathspecs?.length !== 0)) {
      const where = `${caller.file}:${caller.line}`
      expect(caller.pathspecs, `${where}: its pathspecs cannot be resolved to literals, so its scope is unknown`).not.toBeNull()
      const markdown = git('ls-files', '-z', '--', ...caller.pathspecs!)
        .split('\0')
        .filter((path) => path.endsWith('.md'))
      expect(
        markdown,
        `${where} lists tracked Markdown, so a docs-only pull request can change its input while ` +
          `it is skipped — add it to the docs-only step or narrow its pathspecs`,
      ).toEqual([])
    }
  })
})
