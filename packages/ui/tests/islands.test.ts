import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * T033 / FR-014, SC-007 — the islands audit.
 *
 * FR-014: *"Components are server components unless they carry real interactivity;
 * `'use client'` requires a stated reason"*. SC-007's validation method is this file:
 * *"Test listing `'use client'` components; each must carry a reason comment"*.
 *
 * ── Why a text scan and not an import ───────────────────────────────────────────────────
 *
 * `'use client'` has no runtime symptom inside Vitest. The directive is a bundler
 * instruction: under `node` (CLR-003 adds no jsdom, and nothing here renders a component)
 * a client component imports and behaves exactly like a server one. The only instrument
 * that can see the boundary is the source text, so this file reads the tree from disk.
 *
 * ── Why the scan looks for a DIRECTIVE, not for the substring ───────────────────────────
 *
 * `HeaderNav.tsx`, `MobileTabBar.tsx` and `MenuSheet.tsx` all *discuss* `'use client'` in
 * prose — plan § Sketch 5's boundary is quoted in their docblocks. A `grep` for the
 * substring would report three islands where the tree has one, and the audit would then be
 * demanding reason comments from two server components. A directive is only a directive as
 * the **first statement** of the file, so that is what `clientDirective()` looks for.
 *
 * ── The three things asserted, and why each is a distinct failure ───────────────────────
 *
 * 1. **Every island carries a reason beside its directive.** SC-007 in as many words. The
 *    reason must be adjacent — a justification buried in a docblock forty lines down is not
 *    what a reviewer sees when a diff adds `'use client'` to line 1. `MenuSheet.tsx` was
 *    written to this rule deliberately: *"The reason, beside the directive rather than only
 *    in the docblock (FR-014, US6, SC-007)"*.
 * 2. **Every island actually uses a client-only API.** FR-014's first clause — "unless they
 *    carry real interactivity". A directive over a component with no state and no handler
 *    ships a bundle for markup the server could have emitted, and a *stated* reason does not
 *    make it true. This half is what stops the audit degrading into a comment-writing ritual.
 * 3. **No file carries an inert directive below its first statement.** `'use client'` under
 *    an import is not a directive at all — it is an expression statement React never sees,
 *    so the component silently stays a server component and its `useState` fails at build.
 *    Silent + build-breaking is exactly the shape that deserves a test.
 */

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/** Build output and installed packages are full of directives nobody in this repo wrote. */
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', 'out'])

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs']

/**
 * A reason has to be prose, not a label. `// island` satisfies "carries a comment" while
 * telling a reviewer nothing; the threshold is what separates the two. It is deliberately
 * low — one short sentence clears it — because the assertion is against empty ceremony,
 * not a word count.
 */
const MIN_REASON_CHARS = 40

/** The APIs that genuinely require a client bundle: hooks, and JSX event handlers. */
const CLIENT_API_RE = /\buse(?:State|Effect|LayoutEffect|Reducer|Ref|Context|Memo|Callback|Transition|DeferredValue|Optimistic|FormStatus|SyncExternalStore|ImperativeHandle|Id)\b|\son[A-Z]\w*=/

const DIRECTIVE_LINE_RE = /^\s*['"]use client['"]\s*;?\s*$/

const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g

/**
 * A line comment, but not the `//` inside `https://`. A protocol-relative or absolute URL is
 * the one place `//` appears in real code, and treating it as a comment would delete the rest
 * of its line — handler included — reporting a genuine island as unjustified.
 */
const LINE_COMMENT_RE = /(^|[^:])\/\/.*$/gm

/**
 * `source` with its comments removed, so {@link CLIENT_API_RE} is asked about code only.
 *
 * Without this the audit's second assertion passes for free on precisely the ritual it exists
 * to catch: a reason comment naturally NAMES the hook it justifies (*"toggles with useState"*),
 * so a whole-text scan reads that prose as the interactivity itself. It is the same prose-vs-code
 * confusion this file already guards against for the directive, one assertion further down.
 *
 * Deliberately a text strip rather than a parse: over-stripping can only hide a client API, and
 * a hidden one turns an island red for a human to look at. Under-stripping is the direction that
 * lets an unjustified island through silently, and that is the direction this closes.
 *
 * @example stripComments("// uses useState\nconst a = 1") // => "\nconst a = 1"
 */
function stripComments(source: string): string {
  return source.replace(BLOCK_COMMENT_RE, ' ').replace(LINE_COMMENT_RE, '$1')
}

interface Island {
  /** Repo-relative, so failure messages name a path a reader can open. */
  readonly file: string
  /** The comment text adjacent to the directive — empty when there is none. */
  readonly reason: string
  readonly usesClientApi: boolean
}

/** Leading blank lines, line comments and block comments — everything React skips before the
 *  first statement. Returned so the caller can ask what that first statement is. */
function stripLeadingTrivia(source: string): string {
  let rest = source.trimStart()
  let changed = true
  while (changed) {
    changed = false
    if (rest.startsWith('//')) {
      rest = rest.slice(rest.indexOf('\n') + 1).trimStart()
      changed = true
    } else if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/')
      // An unterminated block comment is a syntax error the compiler owns; bail rather
      // than loop forever on it.
      if (end === -1) return ''
      rest = rest.slice(end + 2).trimStart()
      changed = true
    }
  }
  return rest
}

/**
 * Where a `'use client'` sits in `source`, if anywhere.
 *
 * @example clientDirective("'use client'\nimport x from 'y'") // => 'first'
 */
function clientDirective(source: string): 'first' | 'later' | 'none' {
  const rest = stripLeadingTrivia(source)
  if (/^['"]use client['"]\s*;?/.test(rest)) return 'first'
  return source.split('\n').some((line) => DIRECTIVE_LINE_RE.test(line)) ? 'later' : 'none'
}

/**
 * The comment block touching the directive, above or below it.
 *
 * Both sides count: a reason written above the directive is just as visible in a diff as one
 * written below it, and forcing a single side would be style enforcement rather than FR-014.
 */
function adjacentReason(source: string): string {
  const lines = source.split('\n')
  const at = lines.findIndex((line) => DIRECTIVE_LINE_RE.test(line))
  if (at === -1) return ''
  const parts: string[] = []
  for (const step of [-1, 1]) {
    for (let i = at + step; i >= 0 && i < lines.length; i += step) {
      const line = (lines[i] ?? '').trim()
      if (line === '') break
      const comment = line.replace(/^\/\/+|^\/\*+|^\*+\/?|\*\/$/g, '').trim()
      if (comment === line && line !== '') break
      parts.push(comment)
    }
  }
  return parts.join(' ').trim()
}

/** Every source file under `root`, skipping build output and installed packages. */
function sourceFiles(root: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...sourceFiles(full))
    } else if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      found.push(full)
    }
  }
  return found
}

function readIsland(full: string, root: string): Island {
  const source = readFileSync(full, 'utf8')
  return {
    file: relative(root, full),
    reason: adjacentReason(source),
    usesClientApi: CLIENT_API_RE.test(stripComments(source)),
  }
}

/** Every file under `root` whose FIRST statement is `'use client'`. */
function listIslands(root: string): Island[] {
  return sourceFiles(root)
    .filter((full) => clientDirective(readFileSync(full, 'utf8')) === 'first')
    .map((full) => readIsland(full, root))
    .sort((a, b) => a.file.localeCompare(b.file))
}

/** Files where a `'use client'` appears too late to be a directive — silently inert. */
function inertDirectives(root: string): string[] {
  return sourceFiles(root)
    .filter((full) => clientDirective(readFileSync(full, 'utf8')) === 'later')
    .map((full) => relative(root, full))
}

const islands = listIslands(REPO_ROOT)
const fixtures: string[] = []

/** A throwaway tree holding one file, so the audit runs over real bytes on real disk. */
function fixtureWith(name: string, source: string): string {
  const root = mkdtempSync(join(tmpdir(), 'islands-'))
  fixtures.push(root)
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', name), source, 'utf8')
  return root
}

afterAll(() => {
  for (const root of fixtures) rmSync(root, { recursive: true, force: true })
})

describe('the audit lists the islands the tree actually has (SC-007)', () => {
  it('finds at least one — an empty list would pass every rule below vacuously', () => {
    expect(
      islands.map((island) => island.file),
      'the scanner found no client component anywhere in the repo. The shell has one ' +
        '(packages/ui/src/shell/MenuSheet.tsx), so this is a broken scanner reporting a ' +
        'clean tree, not a clean tree.',
    ).not.toEqual([])
  })

  it("lists MenuSheet — the shell's only island (plan § Sketch 5)", () => {
    expect(islands.map((island) => island.file)).toContain('packages/ui/src/shell/MenuSheet.tsx')
  })

  it('does not list the server components that merely discuss the directive in prose', () => {
    const listed = islands.map((island) => island.file)
    expect(listed).not.toContain('packages/ui/src/shell/HeaderNav.tsx')
    expect(listed).not.toContain('packages/ui/src/shell/MobileTabBar.tsx')
  })
})

describe("every 'use client' carries a stated reason (FR-014, SC-007)", () => {
  it('has no island whose directive stands unexplained', () => {
    const unexplained = islands
      .filter((island) => island.reason.length < MIN_REASON_CHARS)
      .map((island) => `${island.file} (reason: ${JSON.stringify(island.reason)})`)
    expect(
      unexplained,
      `FR-014 requires a stated reason beside the directive — at least ${MIN_REASON_CHARS} ` +
        'characters of prose in a comment touching it, saying what interactivity is being ' +
        'paid for. Write the reason, or make the component a server component.',
    ).toEqual([])
  })

  it('has no island without real interactivity to justify the bundle', () => {
    const unjustified = islands.filter((island) => !island.usesClientApi).map((i) => i.file)
    expect(
      unjustified,
      "FR-014's first clause: a component is a server component UNLESS it carries real " +
        'interactivity. These carry the directive but use no hook and no event handler, so ' +
        'they ship JavaScript for markup the server could have emitted.',
    ).toEqual([])
  })

  it('carries no inert directive below the first statement', () => {
    expect(
      inertDirectives(REPO_ROOT),
      "'use client' below an import is an expression statement, not a directive: React never " +
        'sees it, the component stays a server component, and its hooks fail at build time. ' +
        'Move it to line 1.',
    ).toEqual([])
  })
})

describe('the audit reports the violations it exists to catch (non-vacuity)', () => {
  it('names a directive with no comment at all', () => {
    const root = fixtureWith('Bare.tsx', "'use client'\nimport { useState } from 'react'\n")
    const found = listIslands(root)
    expect(found.map((island) => island.file)).toEqual(['src/Bare.tsx'])
    expect(found[0]?.reason).toBe('')
  })

  it('names a label too thin to be a reason', () => {
    const root = fixtureWith('Thin.tsx', "'use client'\n// island\nconst x = useState\n")
    expect(listIslands(root)[0]?.reason.length).toBeLessThan(MIN_REASON_CHARS)
  })

  it('does not count a client API named only in the reason comment', () => {
    const source =
      "'use client'\n" +
      '// This sheet toggles: a useState holds open and closed, and onClick flips it on a\n' +
      '// press, which is genuine interactivity a server component cannot express.\n' +
      'export const Static = () => null\n'
    const island = listIslands(fixtureWith('ProseApi.tsx', source))[0]
    expect(island?.reason.length).toBeGreaterThanOrEqual(MIN_REASON_CHARS)
    expect(
      island?.usesClientApi,
      'the reason comment NAMES useState and onClick; the component uses neither. A reason ' +
        'naturally names the hook it justifies, so scanning comment text for client APIs ' +
        'makes assertion 2 pass for free on exactly the ritual it exists to catch.',
    ).toBe(false)
  })

  it('does not count a client API named only in a docblock', () => {
    const source =
      "'use client'\n" +
      '// Real prose reason, long enough to clear the threshold on its own merits here.\n' +
      '/**\n * The sheet keeps its open state in useState and flips it from onClick.\n */\n' +
      'export const Static = () => null\n'
    expect(listIslands(fixtureWith('DocblockApi.tsx', source))[0]?.usesClientApi).toBe(false)
  })

  it('still sees a handler on a line that also carries a protocol-relative URL', () => {
    const source =
      "'use client'\n" +
      '// Real prose reason, long enough to clear the threshold on its own merits here.\n' +
      'export const Link = () => <a href="https://example.com" onClick={flip} />\n'
    expect(
      listIslands(fixtureWith('UrlHandler.tsx', source))[0]?.usesClientApi,
      'a `//` inside a URL is not a comment. Treating it as one would delete the rest of the ' +
        'line — including the handler — and report a genuine island as unjustified.',
    ).toBe(true)
  })

  it('names a directive over a component with no interactivity', () => {
    const source =
      "'use client'\n// Reasoned at length, and still wrong: this component holds no state.\n" +
      'export const Static = () => null\n'
    expect(listIslands(fixtureWith('Static.tsx', source))[0]?.usesClientApi).toBe(false)
  })

  it('accepts a reason written above the directive', () => {
    const source =
      '// It toggles: the sheet opens and closes on a press, which is real interactivity.\n' +
      "'use client'\nimport { useState } from 'react'\n"
    const island = listIslands(fixtureWith('Above.tsx', source))[0]
    expect(island?.reason.length).toBeGreaterThanOrEqual(MIN_REASON_CHARS)
    expect(island?.usesClientApi).toBe(true)
  })

  it('ignores a file that only mentions the directive in prose', () => {
    const source = "// This sibling is NOT 'use client' — the cascade does the work.\nexport {}\n"
    expect(listIslands(fixtureWith('Prose.tsx', source))).toEqual([])
  })

  it('flags a directive stranded below an import as inert', () => {
    const root = fixtureWith('Late.tsx', "import { useState } from 'react'\n'use client'\n")
    expect(inertDirectives(root)).toEqual(['src/Late.tsx'])
    expect(listIslands(root)).toEqual([])
  })
})
