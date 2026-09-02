import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * T001d / FR-001 — `src/styles.css` is the entry the `./styles.css` export points at.
 *
 * The app gets ONE stylesheet import; this file is what makes that true. It is an
 * aggregator and nothing else: three `@import`s, no declarations of its own.
 *
 * ── The assertion this file exists for ──────────────────────────────────────────────────
 *
 * **A dangling `@import` is silent.** CSS has no link-time check: a browser fetches the
 * target, gets a 404, and renders the page unstyled with nothing in the build log. That is
 * not hypothetical here — T001d was originally listed in Setup while blocked by T004/T005/
 * T010, the workflow ran it in phase order, and it shipped an aggregator whose three
 * imports ALL pointed at files that did not yet exist. The suite was green.
 *
 * So the load-bearing assertion is `existsSync` on each RESOLVED target, not a comparison
 * of the parsed paths against a list retyped in this file. That weaker form asserts only
 * that the stylesheet equals the test author's restatement of the stylesheet — it would
 * have stayed green through the exact defect above, and it stays green over nothing when
 * a token file is renamed. `reports a renamed target` below proves this file's resolver
 * actually goes to disk, by renaming a target in a throwaway copy of the real tree.
 */

const STYLES_PATH = fileURLToPath(new URL('../src/styles.css', import.meta.url))
const TOKENS_DIR = fileURLToPath(new URL('../src/tokens', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const FENCE_SCRIPT = join(REPO_ROOT, 'scripts', 'check-colour-tokens.sh')

/** In cascade order: palette defines the colours the other two may reference. */
const EXPECTED_IMPORTS = [
  './tokens/palette.css',
  './tokens/typography.css',
  './tokens/layout.css',
]

/** `@import url('x')`, `@import "x"` and `@import 'x';` all reduce to the path. */
const IMPORT_RE = /@import\s+(?:url\(\s*)?["']([^"']+)["']/g

function readStyles(): string {
  return readFileSync(STYLES_PATH, 'utf8')
}

function parseImportPaths(css: string): string[] {
  // The capture group is mandatory in IMPORT_RE; the assertion is required only because the
  // package typechecks tests/ under noUncheckedIndexedAccess (T001c).
  return [...css.matchAll(IMPORT_RE)].map((match) => match[1]!)
}

/** Comments may legitimately contain anything; strip them before looking for rules. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * The `@import` paths in `cssPath` whose target is not a file on disk.
 *
 * Resolution is relative to the importing stylesheet, which is what a CSS engine does —
 * resolving against the working directory would make this pass or fail by where vitest
 * was launched from.
 *
 * @example danglingImports('/repo/packages/ui/src/styles.css') // => [] on a healthy tree
 */
function danglingImports(cssPath: string): string[] {
  const base = dirname(cssPath)
  return parseImportPaths(readFileSync(cssPath, 'utf8')).filter(
    (importPath) => !existsSync(resolve(base, importPath)),
  )
}

const fixtures: string[] = []

/** A throwaway copy of the real `src/` — same stylesheet, same token files, real bytes. */
function copyRealTree(): string {
  const root = mkdtempSync(join(tmpdir(), 'styles-entry-'))
  fixtures.push(root)
  mkdirSync(join(root, 'tokens'), { recursive: true })
  copyFileSync(STYLES_PATH, join(root, 'styles.css'))
  for (const importPath of parseImportPaths(readStyles())) {
    const source = resolve(dirname(STYLES_PATH), importPath)
    // A target that is already missing is the condition under test; the fixture builder
    // must not throw on it, or the dangling-import cases would report ENOENT instead of
    // the dangling import they exist to name.
    if (existsSync(source)) copyFileSync(source, join(root, importPath))
  }
  return root
}

afterAll(() => {
  for (const root of fixtures) rmSync(root, { recursive: true, force: true })
})

describe('packages/ui/src/styles.css', () => {
  it('exists and is readable — the ./styles.css export must resolve to a real file', () => {
    expect(existsSync(STYLES_PATH), `${STYLES_PATH} does not exist`).toBe(true)
    expect(() => readStyles()).not.toThrow()
  })

  it('imports palette, typography and layout, in that order and nothing else', () => {
    expect(parseImportPaths(readStyles())).toEqual(EXPECTED_IMPORTS)
  })

  it('carries no rules of its own — a declaration here would be a token outside tokens/', () => {
    const withoutImports = stripComments(readStyles()).replace(IMPORT_RE, '')
    // Anything left that is not whitespace or a stray `;`/`)` from a stripped import
    // is a selector, an at-rule or a declaration — all of which belong in tokens/.
    expect(withoutImports.replace(/[\s;)]/g, '')).toBe('')
  })

  it('imports only relative paths under ./tokens/ — no package or absolute URL', () => {
    const paths = parseImportPaths(readStyles())
    expect(paths.length).toBeGreaterThan(0)
    for (const path of paths) {
      expect(path).toMatch(/^\.\/tokens\/[a-z-]+\.css$/)
    }
  })
})

describe('every @import resolves to a file that exists on disk (FR-001)', () => {
  it('has no dangling import', () => {
    expect(
      danglingImports(STYLES_PATH),
      'a dangling @import is SILENT in CSS — no build error, no console warning, just an ' +
        'unstyled page. T001d shipped one of these once (all three targets missing) and ' +
        'the suite stayed green. Create the target under src/tokens/, or drop the import.',
    ).toEqual([])
  })

  it.each(EXPECTED_IMPORTS)('%s is a real file under src/tokens/', (importPath) => {
    expect(existsSync(resolve(dirname(STYLES_PATH), importPath))).toBe(true)
  })

  it('reports a renamed target, so the check above is anchored to disk', () => {
    // The non-vacuity proof. Without it, `has no dangling import` could be an `existsSync`
    // on a path that always resolves, or a list comparison dressed up as a disk check —
    // both green forever. A byte-for-byte copy of the real tree is used so this exercises
    // the shipped stylesheet, not a hand-written stand-in.
    const root = copyRealTree()
    const victim = EXPECTED_IMPORTS[2]!
    // `force` so this reads as "the target is absent", not "the target was present and is
    // now absent" — if the real tree is already missing it, the assertion below is still
    // the one that reports, rather than an ENOENT from the setup line.
    rmSync(join(root, victim), { force: true })

    expect(danglingImports(join(root, 'styles.css'))).toEqual([victim])
  })

  it('reports nothing when that same tree is intact', () => {
    // The other half of the pair: proves the previous case fails because of the rename and
    // not because the fixture was broken from the start.
    expect(danglingImports(join(copyRealTree(), 'styles.css'))).toEqual([])
  })
})

describe('the colour fence DOES scan this file (T007b)', () => {
  it('reports a raw colour written in src/styles.css', () => {
    // The WHY comment in styles.css used to claim the opposite — that the file sits outside
    // the fence's reach, so a value here would be "a token nobody guards". It is the reverse:
    // the fence scans `packages/ui/src` and exempts the single path `packages/ui/src/tokens/`,
    // which this file is not under. Asserting it here keeps that comment honest instead of
    // leaving a reviewer to re-derive it from a shell script.
    const root = mkdtempSync(join(tmpdir(), 'styles-entry-fence-'))
    fixtures.push(root)
    mkdirSync(join(root, 'scripts'), { recursive: true })
    copyFileSync(FENCE_SCRIPT, join(root, 'scripts', 'check-colour-tokens.sh'))
    mkdirSync(join(root, 'packages', 'ui', 'src', 'tokens'), { recursive: true })
    mkdirSync(join(root, 'apps', 'web'), { recursive: true })
    writeFileSync(
      join(root, 'packages', 'ui', 'src', 'styles.css'),
      ':root { --oops: #EE703E; }\n',
      'utf8',
    )

    const run = spawnSync('bash', [join(root, 'scripts', 'check-colour-tokens.sh')], {
      cwd: root,
      encoding: 'utf8',
    })

    expect(run.status, `stdout:\n${run.stdout}\nstderr:\n${run.stderr}`).toBe(1)
    expect(run.stderr).toContain('packages/ui/src/styles.css')
  })

  it('is not under the one exempted path', () => {
    expect(STYLES_PATH.startsWith(`${TOKENS_DIR}/`)).toBe(false)
  })
})
