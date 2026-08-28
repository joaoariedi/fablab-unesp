import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T009 / FR-005 — the two faces ship as WOFF2 under `apps/web/public/fonts/`.
 *
 * Sketch 8 settled where the bytes live and why the answer is not `docs/`: `docs/` is
 * documentation, Next serves `public/`, and `@font-face` asks for an absolute
 * `url('/fonts/…')`. So `public/fonts/` is the **only** location the runtime can serve, and
 * `docs/product/fonts/` keeps the `.ttf` sources as the provenance record beside the licence
 * notice. Both halves are asserted here, because deleting the sources to "clean up" would
 * strip a redistribution obligation (Comfortaa is OFL) and leave the WOFF2 unattributable.
 *
 * The conversion is a **one-off run on a maintainer's machine**, not a build step. Principle 1
 * counts a converter in any manifest as a dependency added to the stack, so the last tests
 * read every workspace manifest rather than trusting the claim — derived from
 * `pnpm-workspace.yaml`, because the hand-written list they replaced named three of the
 * four and `packages/game` could have carried a converter unseen.
 *
 * Why the header is parsed instead of just calling `existsSync`: the failure this guards is
 * not an absent file, it is a **wrong** one — a `.ttf` renamed to `.woff2` (which browsers
 * reject outright), a truncated copy, or the two faces swapped. All three pass an existence
 * check and produce no error until a page renders in a browser nobody is watching.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const PUBLIC_FONTS = join(REPO_ROOT, 'apps', 'web', 'public', 'fonts')
const SOURCE_FONTS = join(REPO_ROOT, 'docs', 'product', 'fonts')

/** WOFF2 signature: the ASCII tag `wOF2` in the first four bytes (W3C WOFF2 §Header). */
const WOFF2_SIGNATURE = 'wOF2'

/**
 * The complete font set. The filenames are load-bearing: `@font-face` (T010) and the
 * preload link (T010b) both request these exact absolute paths, so a rename here breaks
 * typography silently — the fallback stack renders and nothing throws.
 */
const FACES = [
  { woff2: 'aldo-the-apache.woff2', ttf: 'AldotheApache.ttf', role: '--font-display' },
  { woff2: 'comfortaa.woff2', ttf: 'Comfortaa-VariableFont_wght.ttf', role: '--font-body' },
] as const

/**
 * Every manifest a `pnpm install` reads, derived from `pnpm-workspace.yaml` rather than
 * listed by hand. The hand-written list this replaced named three files and the workspace
 * has four — `packages/game/package.json` was outside the scan, so a converter declared
 * there was installed on every machine and reported by nothing. The globs are the authority
 * on what gets installed, so they are the authority on what gets scanned; a package added
 * tomorrow joins the scan without anyone remembering to add it.
 */
const MANIFESTS = workspaceManifests()

/**
 * A hand-written floor, kept deliberately independent of the derivation above. If the YAML
 * parser stops matching, or a glob stops expanding, `MANIFESTS` shrinks and every assertion
 * over it passes over nothing — the vacuity this feature has now produced repeatedly. These
 * four exist today; the scan must reach all of them.
 */
const REQUIRED_MANIFESTS = [
  'package.json',
  'apps/web/package.json',
  'packages/game/package.json',
  'packages/ui/package.json',
] as const

/**
 * Package-name fragments that would mean a font converter joined the stack. Matched as
 * substrings of the dependency name, so `ttf2woff2`, `wawoff2` and `fonteditor-core` all hit.
 */
const CONVERTER_FRAGMENTS = [
  'woff',
  'ttf',
  'otf',
  'fonttools',
  'fontmin',
  'glyphhanger',
  'subfont',
  'opentype',
  'fonteditor',
]

/**
 * The workspace globs, read out of `pnpm-workspace.yaml`'s `packages:` block. Parsed with a
 * line scanner rather than a YAML dependency: Principle 1 is the rule this whole describe
 * block enforces, and adding a parser to check that no parser was added would be absurd.
 */
function workspaceGlobs(): string[] {
  const lines = readFileSync(join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8').split('\n')
  const start = lines.findIndex((line) => /^packages:\s*$/.test(line))
  if (start === -1) {
    throw new Error(
      'pnpm-workspace.yaml declares no `packages:` block. Without it this scan cannot know ' +
        'which manifests pnpm installs from, and silently scanning fewer would be worse ' +
        'than failing here.',
    )
  }
  const globs: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break // the block ended: a new top-level key or a comment column 0
    const entry = /^\s+-\s*['"]?([^'"\s#]+)/.exec(line)?.[1]
    if (entry !== undefined) globs.push(entry)
  }
  return globs
}

/**
 * `apps/*` → every directory under `apps/`. Only the trailing-`/*` and literal forms are
 * understood, and anything else throws rather than expanding to nothing — an unsupported
 * glob that quietly contributes no directories is how a scan shrinks without a failure.
 */
function expandGlob(glob: string): string[] {
  if (!glob.includes('*')) return [glob]
  if (!glob.endsWith('/*') || glob.slice(0, -2).includes('*')) {
    throw new Error(
      `pnpm-workspace.yaml declares the glob ${JSON.stringify(glob)}, which this scan does ` +
        'not understand. Teach expandGlob() the new form — do not leave it unexpanded, or ' +
        'the manifests under it stop being checked for a converter.',
    )
  }
  const parent = glob.slice(0, -2)
  return readdirSync(join(REPO_ROOT, parent), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${parent}/${entry.name}`)
}

/** The root manifest plus one per workspace package that actually has a `package.json`. */
function workspaceManifests(): string[] {
  const candidates = [
    'package.json',
    ...workspaceGlobs()
      .flatMap(expandGlob)
      .map((directory) => `${directory}/package.json`),
  ]
  return candidates.filter((manifest) => existsSync(join(REPO_ROOT, manifest))).sort()
}

interface Woff2Header {
  /** The four-byte signature, decoded as ASCII. */
  signature: string
  /** `length` (offset 8): the total size the file declares itself to be. */
  declaredLength: number
  /** `totalSfntSize` (offset 16): the size of the font once decompressed. */
  totalSfntSize: number
}

/** Reads the fixed-position fields of the WOFF2 header. No decompression involved. */
function readWoff2Header(bytes: Buffer): Woff2Header {
  return {
    signature: bytes.subarray(0, 4).toString('ascii'),
    declaredLength: bytes.readUInt32BE(8),
    totalSfntSize: bytes.readUInt32BE(16),
  }
}

/** Dependency names declared across every dependency field of one manifest. */
function declaredDependencies(manifest: string): string[] {
  const parsed = JSON.parse(readFileSync(join(REPO_ROOT, manifest), 'utf8')) as Record<
    string,
    unknown
  >
  const fields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
  return fields.flatMap((field) => Object.keys((parsed[field] as object | undefined) ?? {}))
}

describe('the two faces ship as WOFF2 under apps/web/public/fonts/', () => {
  it('contains exactly the two faces and nothing else', () => {
    let entries: string[]
    try {
      entries = readdirSync(PUBLIC_FONTS).sort()
    } catch (error) {
      throw new Error(
        `${PUBLIC_FONTS} is not readable (${String(error)}). The runtime serves fonts from ` +
          'apps/web/public/fonts/ only; docs/product/fonts/ is the provenance record and Next ' +
          'never serves it.',
      )
    }
    expect(
      entries,
      'The font directory does not hold exactly the two faces. Aldo and Comfortaa are the ' +
        'complete set since SquareFont left the project (CLR-002); a third file here is ' +
        'either an unused byte payload or a face no @font-face declares.',
    ).toEqual([...FACES].map((face) => face.woff2).sort())
  })

  it.each(FACES)('$woff2 is a real WOFF2, not a renamed source ($role)', ({ woff2 }) => {
    const path = join(PUBLIC_FONTS, woff2)
    const bytes = readFileSync(path)
    const header = readWoff2Header(bytes)

    expect(
      header.signature,
      `${path} starts with ${JSON.stringify(header.signature)}, not ${WOFF2_SIGNATURE}. A ` +
        'file with the .woff2 extension but another format is rejected by every browser, ' +
        'and @font-face reports nothing — the page just renders the fallback stack.',
    ).toBe(WOFF2_SIGNATURE)

    expect(
      header.declaredLength,
      `${path} declares length ${header.declaredLength} in its header but is ${bytes.length} ` +
        'bytes on disk — the file is truncated or padded, so the decoder aborts.',
    ).toBe(bytes.length)
  })

  it.each(FACES)('$woff2 carries the bytes of $ttf, compressed', ({ woff2, ttf }) => {
    const compressed = readFileSync(join(PUBLIC_FONTS, woff2))
    const source = readFileSync(join(SOURCE_FONTS, ttf))
    const { totalSfntSize } = readWoff2Header(compressed)

    expect(
      compressed.length,
      `${woff2} (${compressed.length} B) is not smaller than its source ${ttf} ` +
        `(${source.length} B). WOFF2 is Brotli-compressed; a file this size was not converted.`,
    ).toBeLessThan(source.length)

    // The decompressed size is the cheapest available identity check: the two faces differ
    // by more than 10x, so a swapped pair — comfortaa.woff2 holding Aldo — fails here even
    // though both files are valid WOFF2 and both exist. Reading the actual name table would
    // need a Brotli decoder, i.e. exactly the dependency the last test forbids.
    const ratio = totalSfntSize / source.length
    expect(
      ratio,
      `${woff2} decompresses to ${totalSfntSize} B, but ${ttf} is ${source.length} B ` +
        `(ratio ${ratio.toFixed(2)}). That is not this source: check the two faces are not ` +
        'swapped, and that the converted file came from docs/product/fonts/.',
    ).toBeGreaterThan(0.5)
    expect(ratio, `${woff2} decompresses to ${totalSfntSize} B; ${ttf} is ${source.length} B`)
      .toBeLessThan(1.5)
  })
})

describe('the .ttf sources stay in docs/ as the provenance record', () => {
  it.each(FACES)('$ttf is still present beside the licence notice', ({ ttf }) => {
    const entries = readdirSync(SOURCE_FONTS)
    expect(
      entries,
      `${ttf} left docs/product/fonts/. The .ttf sources are the provenance record: without ` +
        'them the shipped WOFF2 is a binary of unstated origin, and Comfortaa is OFL — ' +
        'redistribution carries the licence with it.',
    ).toContain(ttf)
  })

  it('keeps the licence text and the third-party notice next to the sources', () => {
    const entries = readdirSync(SOURCE_FONTS)
    expect(entries, 'OFL.txt is gone; Comfortaa may not be redistributed without it').toContain(
      'OFL.txt',
    )
    expect(
      entries,
      'THIRD-PARTY-NOTICE.md is gone; it records the accepted risk on Aldo the Apache (ISS-001)',
    ).toContain('THIRD-PARTY-NOTICE.md')
  })
})

describe('no converter joined the stack (Principle 1)', () => {
  it('scans every manifest a pnpm install reads, not a hand-written list', () => {
    for (const manifest of REQUIRED_MANIFESTS) {
      expect(
        MANIFESTS,
        `${manifest} is outside this scan, so a font converter declared there would be ` +
          'installed on every machine and reported by nothing. Principle 1 is a property of ' +
          'the whole workspace, not of the three manifests someone happened to list.',
      ).toContain(manifest)
    }
    expect(
      MANIFESTS.length,
      'the derivation found fewer manifests than the hand-written floor, which means it is ' +
        'contributing nothing and the scan is only as wide as the list it replaced',
    ).toBeGreaterThanOrEqual(REQUIRED_MANIFESTS.length)
  })

  it.each(MANIFESTS)('%s declares no font-conversion dependency', (manifest) => {
    const offenders = declaredDependencies(manifest).filter((name) =>
      CONVERTER_FRAGMENTS.some((fragment) => name.toLowerCase().includes(fragment)),
    )
    expect(
      offenders,
      `${manifest} declares ${offenders.join(', ')}. The TTF→WOFF2 conversion is a one-off ` +
        'run on a maintainer machine and is documented as such; making it a project ' +
        'dependency puts a converter in every install and every CI run for output that is ' +
        'already committed.',
    ).toEqual([])
  })
})
