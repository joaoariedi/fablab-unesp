import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * T011 / SC-012 — SquareFont must never enter the repository.
 *
 * The designer removed SquareFont on 2026-08-27 and gave the logotype to Aldo the Apache
 * (CLR-002), so this is no longer a gate about a fallback path — there is no missing file to
 * fall back from. What survives is a **live** risk: the previous `docs/product/fonts/README.md`
 * instructed developers to place `Square.ttf` in that folder, so working trees out there still
 * hold a binary whose own metadata says `Typeface © Bou Fonts. 2011. All Rights Reserved`,
 * one `git add -A` away from a public MIT repository. `.gitignore` covers the two documented
 * paths; this file asserts the cover held, and covers the paths it does not name.
 *
 * ── Why this reads the git index and not the working tree ───────────────────────────────
 *
 * The thing SC-012 forbids is *distribution*, and a file is distributed the moment it is
 * tracked. A developer's untracked `Square.ttf` is their business — `git ls-files` is
 * therefore the exact question, and scanning the filesystem would be both the wrong question
 * and permanently red on the trees this gate exists to protect.
 *
 * ── Why the source scan matches usage shapes and not the bare word ──────────────────────
 *
 * SC-012's wording is "no source, stylesheet or config *names* SquareFont", but a scan for
 * the literal word is red on today's clean tree: `eslint.config.mjs` and
 * `tests/purity-boundary.test.ts` both name the face on purpose, in a comment and in an
 * assertion message, explaining why *this* gate needs `node:fs` and `git ls-files`. A gate
 * that cannot pass on a clean tree cannot distinguish pass from fail — the exact defect
 * review round 2 measured in the colour scan, which returned exit 1 on a clean tree.
 *
 * So the rules below match the shapes in which a font is *used*: an asset reference, a
 * `font-family` declaration, a font-stack entry. Prose that discusses the ban stays legal;
 * anything that would make a browser ask for the face does not. Both halves are asserted —
 * the rules are run against planted violations (they must fire) and against the two files
 * that legitimately name the face (they must not).
 */

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/** `git ls-files` on a repo this size is milliseconds; a loaded CI machine is not. */
const GIT_TIMEOUT_MS = 30_000

/**
 * SC-012's artefact glob, `Square*.{ttf,otf,woff,woff2}`, as a path test. Anchored to the
 * basename so a directory called `square-icons/` is not swept in, and case-insensitive
 * because the old instructions were followed by hand on case-insensitive filesystems.
 */
const ARTEFACT_PATTERN = /(?:^|\/)square[^/]*\.(?:ttf|otf|woff2?)$/i

/** Source, stylesheet and config extensions — the three surfaces SC-012 names. */
const SCANNED_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.json',
  '.yml',
  '.yaml',
  '.toml',
] as const

/**
 * The one exclusion, and it is structural rather than a judgement call: this file defines the
 * forbidden patterns and plants probes made of them, so scanning it would report its own
 * vocabulary as a violation. Asserted below to be exactly one path, so the list cannot grow
 * into an allowlist where a real usage could hide.
 */
const SELF_PATH = 'packages/ui/tests/fonts.test.ts'

const EXCLUDED_FROM_SCAN: readonly string[] = [SELF_PATH]

interface UsageRule {
  readonly name: string
  readonly pattern: RegExp
  /** Printed when the rule fires, so the failure explains itself without opening the spec. */
  readonly why: string
}

const USAGE_RULES: readonly UsageRule[] = [
  {
    name: 'font-asset-reference',
    // `src: url('/fonts/Square.woff2')`, an import of the binary, a preload entry in a config.
    pattern: /square[\w.-]*\.(?:ttf|otf|woff2?)/i,
    why: 'references a SquareFont binary; the face left the project on 2026-08-27 (CLR-002)',
  },
  {
    name: 'font-family-declaration',
    // CSS `font-family: SquareFont`, JS `fontFamily: 'SquareFont'`, and the token form
    // `--font-logotype: SquareFont` — the token CLR-002 deleted along with the face.
    pattern: /(?:font-?family|--font-[\w-]*)\s*[:=][^;{}\n]*square/i,
    why: 'declares SquareFont as a font family; --font-display (Aldo) covers logo, logotype and headings',
  },
  {
    name: 'font-stack-entry',
    // A quoted string that *starts* with the face — `'SquareFont, sans-serif'` — which is how
    // it would reach a stack without the word `font-family` on the same line.
    pattern: /['"`]\s*squarefont\b/i,
    why: 'names SquareFont as a font stack entry',
  },
]

interface Violation {
  readonly path: string
  readonly line: number
  readonly rule: string
  readonly text: string
}

function git(...args: readonly string[]): string {
  return execFileSync('git', [...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    // A lockfile-sized listing overruns the default pipe buffer on a big tree; failing there
    // would look like an empty index, which is the vacuous-pass this gate must never produce.
    maxBuffer: 32 * 1024 * 1024,
  })
}

/** Every path in the git index. `-z` because a filename may legally contain a newline. */
function trackedPaths(): readonly string[] {
  return git('ls-files', '-z').split('\0').filter((path) => path.length > 0)
}

function isScanned(path: string): boolean {
  return SCANNED_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension))
}

/** Applies every usage rule to one file's text, line by line, so failures cite a location. */
function scanText(path: string, text: string): readonly Violation[] {
  return text.split('\n').flatMap((line, index) =>
    USAGE_RULES.filter((rule) => rule.pattern.test(line)).map((rule) => ({
      path,
      line: index + 1,
      rule: rule.name,
      text: line.trim(),
    })),
  )
}

function describeViolations(violations: readonly Violation[]): string {
  return violations
    .map((violation) => {
      const rule = USAGE_RULES.find((candidate) => candidate.name === violation.rule)
      return `${violation.path}:${violation.line} [${violation.rule}] ${violation.text}\n    → ${rule?.why ?? ''}`
    })
    .join('\n')
}

const TRACKED = trackedPaths()
const SCANNED = TRACKED.filter(
  (path) => isScanned(path) && !EXCLUDED_FROM_SCAN.includes(path),
)

describe('no SquareFont artefact is tracked (SC-012)', () => {
  it('has no file matching Square*.{ttf,otf,woff,woff2} in the git index', () => {
    const artefacts = TRACKED.filter((path) => ARTEFACT_PATTERN.test(path))
    expect(
      artefacts,
      'SquareFont declares "© Bou Fonts. 2011. All Rights Reserved" in its own metadata and ' +
        'this repository is public and MIT. The face was removed on 2026-08-27 (CLR-002) — ' +
        'if one of these was force-added past .gitignore, remove it from the index ' +
        '(`git rm --cached <path>`) rather than relaxing this test.',
    ).toEqual([])
  })

  it('reads a git index that actually contains the fonts the project ships', () => {
    // Vacuity guard. An empty or unread index makes the assertion above pass over nothing —
    // the failure mode this plan produced five times across three review rounds.
    const fonts = TRACKED.filter((path) => /\.(?:ttf|otf|woff2?)$/i.test(path)).map(
      (path) => basename(path),
    )
    expect(fonts, 'the committed faces must be visible to this scan for its absence claim to mean anything')
      .toContain('AldotheApache.ttf')
  })
})

describe('no source, stylesheet or config uses SquareFont (SC-012)', () => {
  it('finds no usage in any tracked source, stylesheet or config', () => {
    const violations = SCANNED.flatMap((path) =>
      scanText(path, readFileSync(join(REPO_ROOT, path), 'utf8')),
    )
    expect(
      violations.length,
      `SquareFont is used by:\n${describeViolations(violations)}\n\n` +
        'CLR-002 replaced it with Aldo the Apache under --font-display, which covers logo, ' +
        'logotype and headings. There is no --font-logotype.',
    ).toBe(0)
  })

  it('scans the surfaces a font declaration could hide in', () => {
    // Vacuity guard, and a specific one: a stylesheet-only scan would miss `fontFamily` in a
    // component and a preload entry in a config, which is where CLR-002 says the face used to
    // live (the logotype) and where a bundler config would fetch it.
    const extensions = new Set(SCANNED.map((path) => path.slice(path.lastIndexOf('.'))))
    expect(SCANNED.length).toBeGreaterThan(20)
    expect([...extensions]).toEqual(expect.arrayContaining(['.ts', '.mjs', '.json']))
  })

  it('excludes exactly one file, and it is this one', () => {
    // The exclusion exists because this file *defines* the forbidden patterns. Keeping it a
    // single path, checked against this file's own location, stops it becoming an allowlist
    // where a real usage could sit — and stops the one entry being quietly repointed at some
    // other file. Asserted against the constant rather than the index, because on a feature
    // branch this file is not committed yet and "not in the index" is not evidence of anything.
    expect(EXCLUDED_FROM_SCAN).toEqual([SELF_PATH])
    expect(relative(REPO_ROOT, fileURLToPath(import.meta.url))).toBe(SELF_PATH)
    const skipped = TRACKED.filter((path) => isScanned(path) && !SCANNED.includes(path))
    expect(
      skipped.filter((path) => path !== SELF_PATH),
      'no tracked source, stylesheet or config may be skipped except this file',
    ).toEqual([])
  })
})

/**
 * The rules themselves, run against planted text. SC-012 is an "asserts absence" gate, and the
 * plan's standing rule is that such a gate is not trusted until it has been watched failing
 * against a deliberate violation (T011b plants a real file; these plant the shapes).
 */
describe('the usage rules fire on real usage and stay quiet on prose', () => {
  const FORBIDDEN: readonly (readonly [string, string])[] = [
    ['a @font-face src', "@font-face { src: url('/fonts/Square.woff2') format('woff2'); }"],
    ['a css font-family', "  font-family: 'SquareFont', 'Arial Narrow', sans-serif;"],
    ['the deleted logotype token', "  --font-logotype: 'SquareFont', sans-serif;"],
    ['a react style object', "const logotype = { fontFamily: 'SquareFont' }"],
    ['a bare font stack string', 'export const LOGOTYPE = "SquareFont, sans-serif"'],
    ['a ttf import', "import square from '../fonts/Square.ttf'"],
    ['an outline variant', "  src: url('/fonts/Squareo.otf');"],
    ['a config asset entry', '  { "preload": "/fonts/Square.woff" }'],
  ]

  it.each(FORBIDDEN)('rejects %s', (_label, source) => {
    expect(
      scanText('probe.css', source).map((violation) => violation.rule),
      `this shape puts SquareFont in front of a browser and must be caught: ${source}`,
    ).not.toEqual([])
  })

  const ALLOWED: readonly (readonly [string, string])[] = [
    ['the committed display face', "  font-family: 'Aldo the Apache', 'Arial Narrow', sans-serif;"],
    ['the committed body face', "  src: url('/fonts/Comfortaa.woff2') format('woff2');"],
    ['a comment explaining this gate', '// T011 asserts no SquareFont artefact is tracked'],
    [
      'an assertion message naming the face',
      "throw new Error(`tests/ must keep '${name}': T011 asserts no SquareFont artefact is tracked`)",
    ],
    ['a changelog line in code', "const NOTE = 'the designer replaced SquareFont with Aldo'"],
  ]

  it.each(ALLOWED)('leaves %s alone', (_label, source) => {
    expect(
      scanText('probe.ts', source),
      'prose that discusses the ban must stay legal, or the gate is red on a clean tree and ' +
        'can never distinguish pass from fail (review round 2, the colour scan)',
    ).toEqual([])
  })

  it('is quiet on the two files that name the face on purpose', () => {
    // The negative controls above are text I wrote; these are the real files. If a future
    // rewrite of either one trips this gate, that is the signal to reword the file — not to
    // widen an exclusion list.
    const deliberate = ['eslint.config.mjs', 'packages/ui/tests/purity-boundary.test.ts']
    for (const path of deliberate) {
      expect(SCANNED, `${path} must be inside the scan for this control to mean anything`).toContain(path)
      const text = readFileSync(join(REPO_ROOT, path), 'utf8')
      expect(text.toLowerCase(), `${path} is expected to name the face in prose`).toContain('squarefont')
      expect(scanText(path, text), describeViolations(scanText(path, text))).toEqual([])
    }
  })
})
