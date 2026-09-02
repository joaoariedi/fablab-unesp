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

/**
 * What the usage scan skips. Everything else tracked is scanned — the set is DERIVED, not
 * enumerated, because an allowlist of extensions is the shape that already failed here.
 *
 * The first draft listed eleven extensions and omitted `.svg`. Measured: this repo tracks
 * brand SVGs carrying live `font-family` declarations, and planting
 * `font-family:'SquareFont'` in `docs/product/brand/fablab-github-banner-1280x320.svg` left
 * the suite 19/19 green. A tracked, committed, public file declaring SquareFont as the
 * rendered face — the exact thing SC-012 forbids — and every assertion passed. It is also
 * the *likeliest* place for it: CLR-002 records SquareFont as the **logotype**, and the
 * logotype lives in `docs/product/brand/`. `.jsonc` was missing too, while SC-012 names
 * "config" and `.markdownlint-cli2.jsonc` is tracked.
 *
 * Two skip categories, and each earns its place:
 *
 * 1. **Binaries** — nothing to read, and `git grep -I` would skip them anyway.
 * 2. **Provenance documents** — the files whose *job* is to record that SquareFont left and
 *    must never come back. `.gitignore` names `Square.ttf` precisely to block it; the fonts
 *    README and THIRD-PARTY-NOTICE explain the licensing; the spec artifacts carry the
 *    decision. Scanning them makes the gate red on a clean tree forever, which is the
 *    can-never-pass defect this feature has already produced twice.
 *
 * Note what is NOT skipped: `.md` under `docs/product/brand/`, every `.css`, `.svg`, `.html`
 * and config file, and `packages/ui/src/tokens/typography.css` — which names SquareFont in a
 * comment explaining the token's absence and stays green because the rules below match
 * *usage*, never mention.
 */
const BINARY_EXTENSIONS = ['.woff2', '.woff', '.ttf', '.otf', '.png', '.jpg', '.jpeg', '.pdf', '.ico']

/**
 * Provenance: naming the retired face here is the point, not a violation. Every entry carries
 * a literal `Square.ttf` / `Squareo.ttf` path, which is what makes it unscannable — and the
 * "skips only the files a usage rule would actually fire on" case below holds the list to
 * exactly that, so it cannot drift into an allowlist. `docs/sdd-strategy.md` sat here until
 * that case was written and measured it: no rule fires on it, so the skip removed a whole
 * file from the scan and protected nothing.
 */
const PROVENANCE_PATHS = [
  '.gitignore',
  'docs/product/fonts/README.md',
  'docs/product/fonts/THIRD-PARTY-NOTICE.md',
  'docs/backlog.md',
]

/** Spec artefacts record the decision in full; scanning them re-reports the decision. */
const PROVENANCE_PREFIXES = ['.specify/']

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

function isBinaryPath(path: string): boolean {
  const lower = path.toLowerCase()
  return BINARY_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

function isScanned(path: string): boolean {
  if (isBinaryPath(path)) return false
  if (PROVENANCE_PATHS.includes(path)) return false
  if (PROVENANCE_PREFIXES.some((prefix) => path.startsWith(prefix))) return false
  return true
}

/** Reads a tracked file relative to the repo root. */
function readTracked(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8')
}

/** Applies every usage rule to one file's text, line by line, so failures cite a location. */
function scanText(path: string, text: string): readonly Violation[] {
  return text.split('\n').flatMap((line, index) =>
    USAGE_RULES.filter((rule) => rule.pattern.test(line)).map((rule) => ({
      path,
      line: index + 1,
      rule: rule.name,
      // Truncated because the scan now reaches SVGs, and the real violation this gate was
      // widened to catch lives on a line carrying an inlined base64 font — an 80KB failure
      // message that buries the path it is trying to report.
      text: line.trim().slice(0, 160),
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

  it('skips only the files a usage rule would actually fire on', () => {
    // A skip that is not load-bearing is an allowlist entry wearing a provenance label: it
    // takes a whole file out of the scan while nothing in that file needed taking out, and
    // it reads as justified because its neighbours are. The first real usage written there
    // is then invisible, and the diff that adds it shows nothing unusual.
    //
    // Measured on this list: `docs/sdd-strategy.md` was skipped and no rule fires on any of
    // its lines — the skip bought nothing and cost the whole file. The four that remain each
    // carry a literal `Square.ttf` path, which is exactly why they cannot be scanned.
    const untracked = PROVENANCE_PATHS.filter((path) => !TRACKED.includes(path))
    expect(
      untracked,
      'a skip naming a path that is not in the index protects nothing and hides the next ' +
        'file that takes that name',
    ).toEqual([])

    const inert = PROVENANCE_PATHS.filter((path) => scanText(path, readTracked(path)).length === 0)
    expect(
      inert,
      'these paths are skipped, but no usage rule fires on them — so the skip is not ' +
        'provenance, it is an exclusion. Delete them from PROVENANCE_PATHS and let the scan ' +
        'read them; if a later edit does trip a rule there, that is the gate working.',
    ).toEqual([])

    for (const prefix of PROVENANCE_PREFIXES) {
      const firing = TRACKED.filter(
        (path) =>
          path.startsWith(prefix) && !isBinaryPath(path) && scanText(path, readTracked(path)).length > 0,
      )
      expect(
        firing.length,
        `${prefix} is skipped wholesale, but nothing tracked under it trips a rule — the ` +
          'prefix excludes a subtree for no reason',
      ).toBeGreaterThan(0)
    }
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
