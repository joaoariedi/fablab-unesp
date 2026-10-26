import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

/**
 * The docs-only classifier, run as CI runs it (feature 009, FR-001, FR-002, FR-007, FR-008, FR-012).
 *
 * A docs-only pull request skips the work of every code-stage job, so the one thing this script
 * must never do is call a change "docs" when a test reads the file it touches — that turns a
 * red `Tests` into a green one nobody ran. Every doubt therefore resolves to `code`, and these
 * cases pin both directions: plain docs stay docs, and everything else (test-read Markdown,
 * non-Markdown, empty input, a git error, a push, no repository at all) is code.
 *
 * The script is RUN, never re-implemented (the style of required-checks.test.ts). It classifies
 * the repository of its working directory, so the `github`-mode cases run it inside throwaway
 * fixture repositories: the `docs_only=true` case could not pass if it diffed this repo instead.
 *
 * This file quotes Markdown paths on purpose — they are its fixtures — and the script excludes
 * it from the "read by a test" search for exactly that reason (FR-002).
 */

const ROOT = join(import.meta.dirname, '..', '..', '..')
const SCRIPT = join(ROOT, 'scripts', 'ci-change-scope.sh')
const SELF = 'apps/web/tests/ci-change-scope.test.ts'

/** The environment with every input the script reads from CI removed, so a run inside GitHub
 *  Actions (where `GITHUB_EVENT_NAME` and `GITHUB_OUTPUT` are set) tests the same thing. */
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of ['GITHUB_EVENT_NAME', 'GITHUB_OUTPUT', 'CHANGE_SCOPE_BASE']) delete env[key]
  return { ...env, ...extra }
}

function run(args: string[], input = '', env: Record<string, string> = {}, cwd = ROOT): string {
  return execFileSync('bash', [SCRIPT, ...args], { cwd, input, env: cleanEnv(env), encoding: 'utf8' })
}

const classify = (paths: string, cwd = ROOT) => run(['classify'], paths, {}, cwd).trim()

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=ci', '-c', 'user.email=ci@example.invalid', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
    env: cleanEnv(),
  })

const scratch: string[] = []
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ci-change-scope-'))
  scratch.push(dir)
  return dir
}

function writeFiles(dir: string, files: string[]): void {
  for (const file of files) {
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    writeFileSync(join(dir, file), `${file}\n`)
  }
}

/** A two-commit repository: a base holding code and docs, then a commit adding `changed`. */
function fixtureRepo(changed: string[]): string {
  const dir = tempDir()
  git(dir, 'init', '-q')
  writeFiles(dir, ['src/app.ts', 'README.md'])
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'base')
  writeFiles(dir, changed)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'change')
  return dir
}

/** Runs `github` mode in `cwd` and returns the stdout and what it appended to GITHUB_OUTPUT. */
function runGithub(cwd: string, env: Record<string, string> = {}): { stdout: string; output: string } {
  const output = join(tempDir(), 'github-output')
  writeFileSync(output, '')
  const stdout = run(['github'], '', { GITHUB_EVENT_NAME: 'pull_request', GITHUB_OUTPUT: output, ...env }, cwd)
  return { stdout, output: readFileSync(output, 'utf8') }
}

/**
 * Tracked Markdown files whose path or basename appears QUOTED in a tracked non-Markdown file
 * other than this one — the read set FR-002 defines, derived from the tree, not hand-counted.
 */
function quotedMarkdownReads(): string[] {
  const quoted = new Set(
    execFileSync('git', ['grep', '-ohE', `['"][^'"]*\\.md['"]`, '--', ':!*.md', `:!${SELF}`], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)
      .map((literal) => literal.slice(1, -1)),
  )
  return execFileSync('git', ['ls-files', '-z', '--', '*.md'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((path) => quoted.has(path) || quoted.has(path.split('/').at(-1) ?? ''))
}

describe('[FR-002] Markdown no test reads is docs (US1)', () => {
  // These three are also the guard on the header rule: the script, ci.yml and the wiring test
  // describe the rule in words, and a quoted Markdown path in any of them would turn one of
  // these into code for every pull request.
  it.each(['README.md', 'CHANGELOG.md', 'tasks/TODO.md'])('%s alone is docs', (path) => {
    expect(classify(path), `${path} is quoted by no test, yet the classifier called it code`).toBe('docs')
  })

  it('a list of unread Markdown files is docs', () => {
    expect(classify('README.md\nCHANGELOG.md\n')).toBe('docs')
  })

  it('an accented file name is classified on its merits', () => {
    expect(classify('docs/instalação.md')).toBe('docs')
  })
})

describe('[FR-002] Markdown a test reads is code (US3, SC-003)', () => {
  const reads = quotedMarkdownReads()

  it('the derived read set holds at least the reads research.md names', () => {
    for (const path of [
      'docs/lgpd.md',
      'docs/tech-stack.md',
      'docs/backlog.md',
      '.specify/specs/003-paginas-publicas/tasks.md',
      '.specify/specs/002-cms-conteudo/checklists/requirements.md',
      '.specify/specs/002-cms-conteudo/checklists/api.md',
      '.specify/specs/002-cms-conteudo/checklists/security.md',
      '.specify/specs/002-cms-conteudo/checklists/ux.md',
    ]) {
      expect(reads, `${path} is read by a test but the derivation missed it`).toContain(path)
    }
  })

  it.each(reads)('%s is read by a test, so it is code', (path) => {
    expect(classify(path), `${path} is quoted in a tracked test or script; a change to it can turn Tests red`).toBe('code')
  })

  it('one read file makes the whole list code', () => {
    expect(classify('README.md\ndocs/lgpd.md\n')).toBe('code')
  })

  it('a checklist is code through its quoted basename alone', () => {
    expect(classify('.specify/specs/002-cms-conteudo/checklists/ux.md')).toBe('code')
  })
})

describe('[FR-002] [FR-007] anything else is code', () => {
  it.each([
    ['an .mdx file', 'docs/page.mdx'],
    ['a TypeScript file', 'apps/web/lib/env.ts'],
    ['a docs file beside a code file', 'README.md\napps/web/lib/env.ts'],
    ['an empty list', ''],
    ['a list of blank lines', '\n\n'],
  ])('%s is code', (_label, paths) => {
    expect(classify(paths)).toBe('code')
  })
})

describe('[FR-002] adversarial paths are data, never options or syntax', () => {
  it.each(['-e.md', 'docs/a b.md', "docs/it's.md"])('%s is docs, exit 0', (path) => {
    expect(classify(path)).toBe('docs')
  })

  it("git's C-quoted form of a path holding a double quote is code", () => {
    expect(classify('"docs/q\\"x.md"')).toBe('code')
  })
})

describe('[FR-001] [FR-007] [FR-008] github mode diffs the pull request it runs in', () => {
  it('a docs-only commit writes docs_only=true and prints the verdict and files', () => {
    const { stdout, output } = runGithub(fixtureRepo(['docs/guide.md']))
    expect(output).toBe('docs_only=true\n')
    expect(stdout).toContain('change scope: docs')
    expect(stdout).toContain('docs/guide.md')
  })

  it('an accented Markdown name reaches the classifier raw (core.quotePath=false)', () => {
    const { output } = runGithub(fixtureRepo(['docs/instalação.md']))
    expect(output, 'git C-quoted the accented name, so it no longer ends in .md').toBe('docs_only=true\n')
  })

  it('a code commit writes docs_only=false', () => {
    const { stdout, output } = runGithub(fixtureRepo(['docs/guide.md', 'src/other.ts']))
    expect(output).toBe('docs_only=false\n')
    expect(stdout).toContain('change scope: code')
  })

  it('a push event always takes the code path (FR-008)', () => {
    const { output } = runGithub(fixtureRepo(['docs/guide.md']), { GITHUB_EVENT_NAME: 'push' })
    expect(output).toBe('docs_only=false\n')
  })

  it('a base revision git cannot resolve takes the code path (FR-007)', () => {
    const { output } = runGithub(fixtureRepo(['docs/guide.md']), { CHANGE_SCOPE_BASE: 'no-such-revision' })
    expect(output).toBe('docs_only=false\n')
  })

  it('exits 0 with GITHUB_OUTPUT unset', () => {
    const stdout = run(['github'], '', { GITHUB_EVENT_NAME: 'pull_request' }, fixtureRepo(['docs/guide.md']))
    expect(stdout).toContain('change scope: docs')
  })
})

describe('[FR-007] outside a repository there is no evidence of docs', () => {
  // GIT_CEILING_DIRECTORIES stops git walking up into whatever repository holds the temp dir.
  const outside = () => {
    const dir = tempDir()
    return { dir, env: { GIT_CEILING_DIRECTORIES: dirname(dir) } }
  }

  it('classify says code', () => {
    const { dir, env } = outside()
    expect(run(['classify'], 'README.md\n', env, dir).trim()).toBe('code')
  })

  it('github writes docs_only=false', () => {
    const { dir, env } = outside()
    const output = join(tempDir(), 'github-output')
    writeFileSync(output, '')
    run(['github'], '', { ...env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_OUTPUT: output }, dir)
    expect(readFileSync(output, 'utf8')).toBe('docs_only=false\n')
  })
})

describe('[FR-012] the CLI contract', () => {
  it.each([[[]], [['--help']], [['docs']]])('%j is a usage error: exit 64, usage on stderr', (args) => {
    let status = 0
    let stderr = ''
    try {
      execFileSync('bash', [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8', env: cleanEnv(), stdio: 'pipe' })
    } catch (error) {
      const failure = error as { status?: number; stderr?: string }
      status = failure.status ?? -1
      stderr = failure.stderr ?? ''
    }
    expect(status).toBe(64)
    expect(stderr).toMatch(/usage:/)
  })
})
