import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The mutation gate has to keep covering the paths it claims to cover (T013, SC-002, SC-012).
 *
 * `scripts/isolation-mutation.sh` is the proof that the isolation harness CAN FAIL, and it is
 * the one gate in the repo that is worthless the moment it drifts: a layer whose `perl`
 * pattern no longer matches its target file mutates nothing, the harness stays green, and the
 * script reports success on a source tree it never touched. That failure is silent by
 * construction, so it needs a gate of its own, and this is it.
 *
 * Three drifts are covered, each measured against the script's own behaviour rather than a
 * second copy of the layer list:
 *
 *   1. a layer the script accepts but CI never runs — SC-012 says the gate set grows, and a
 *      layer nobody runs is a gate that shrank without the diff saying so;
 *   2. a mutation whose pattern stopped matching, i.e. the marked expression moved;
 *   3. the public read path (`lib/tenancy/public-payload.ts`) losing its layer entirely — it
 *      runs with `overrideAccess: true` and serves anonymous traffic, so nothing downstream
 *      catches a leak there.
 *
 * The layer list is read out of the script by RUNNING it with an unknown layer, not by
 * grepping its source: the usage line is the contract, and a test that parses the `case`
 * statement would keep passing after a rename that breaks every caller.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..')
const SCRIPT = 'scripts/isolation-mutation.sh'

const read = (file: string) => readFileSync(join(ROOT, file), 'utf8')

/** The refusal path only: an unknown layer exits 64 before anything is mutated or run. */
function usageOf(): { status: number; usage: string } {
  try {
    execFileSync('bash', [SCRIPT, 'not-a-real-layer'], { cwd: ROOT, encoding: 'utf8' })
  } catch (error) {
    const failure = error as { status?: number; stderr?: string; stdout?: string }
    return { status: failure.status ?? -1, usage: `${failure.stderr ?? ''}${failure.stdout ?? ''}` }
  }
  return { status: 0, usage: '' }
}

/** Layers as the script itself advertises them: `usage: … <a|b|c>`. */
function advertisedLayers(usage: string): string[] {
  const inside = /<([^>]+)>/.exec(usage)?.[1] ?? ''
  return inside.split('|').filter(Boolean).sort()
}

/** The `layer:` matrix in the CI job that runs this script. */
function ciLayers(): string[] {
  const inside = /layer:\s*\[([^\]]+)\]/.exec(read('.github/workflows/ci.yml'))?.[1] ?? ''
  return inside
    .split(',')
    .map((layer) => layer.trim())
    .filter(Boolean)
    .sort()
}

/**
 * Every `perl` substitution the script applies, paired with the file it edits.
 *
 * The script writes them as `perl -0pi -e "s/PATTERN/REPLACEMENT/" \` followed by the target
 * on the next line, and no pattern contains a `/` — the replacements do, which is why only
 * the pattern half is captured.
 */
function mutations(): { pattern: string; target: string }[] {
  const source = read(SCRIPT)
  const found = source.matchAll(/perl -0pi -e "s\/(.+?)\/[^"]*"\s*\\\s*\n\s*"\$WEB\/([^"]+)"/g)
  return [...found].map((match) => ({ pattern: match[1]!, target: `apps/web/${match[2]!}` }))
}

describe('the isolation mutation gate covers what it claims to (T013)', () => {
  const { status, usage } = usageOf()

  it('refuses an unknown layer instead of mutating anything', () => {
    expect(status, `an unknown layer should exit 64; got ${status} with: ${usage}`).toBe(64)
  })

  it('offers a layer for the public read path', () => {
    expect(
      advertisedLayers(usage),
      'the public read path runs with overrideAccess: true and serves anonymous traffic, ' +
        'so breaking it must fail a gate of its own',
    ).toContain('public-path')
  })

  it('has a CI job for every layer it accepts', () => {
    expect(
      ciLayers(),
      'the CI matrix and the script disagree about the layers — a layer the script accepts ' +
        'but CI never runs is a gate that shrank silently (SC-012)',
    ).toEqual(advertisedLayers(usage))
  })

  it('breaks the public read path in lib/tenancy/public-payload.ts', () => {
    expect(
      mutations().map((mutation) => mutation.target),
      'no layer mutates the public read path, so a leak there fails nothing',
    ).toContain('apps/web/lib/tenancy/public-payload.ts')
  })

  it('requires the public-read harness to notice, not the isolation harness', () => {
    expect(
      read(SCRIPT),
      'the public path is proven by tests/tenancy/public-read.test.ts — the isolation ' +
        'harness does not exercise getPublicScopedPayload at all',
    ).toContain('tests/tenancy/public-read.test.ts')
  })

  it.each(mutations())('still matches the expression it patches in $target', ({ pattern, target }) => {
    expect(
      new RegExp(pattern).test(read(target)),
      `${SCRIPT} patches ${target} with /${pattern}/, which no longer matches it. The marked ` +
        `expression moved: the mutation would apply nothing and the harness would stay green.`,
    ).toBe(true)
  })

  it('restores every file it mutates', () => {
    // The restore list is one path per line, so a bare line is the shape being asserted —
    // a path mentioned only in prose does not get the file put back.
    const listed = new Set(
      read(SCRIPT)
        .split('\n')
        .map((line) => line.trim().replace(/\s*\\$/, '')),
    )
    for (const { target } of mutations()) {
      expect(
        listed.has(target),
        `${target} is mutated but is not in the restore list — a failed run would leave the ` +
          `mutation sitting in the working tree`,
      ).toBe(true)
    }
  })
})

/**
 * The `xp-ledger` layer, specifically (T047, FR-035, SC-010, D7).
 *
 * The suite above asks the questions that apply to every layer. This one asks the three that
 * are only answerable about this one, and each guards a way the layer could exist in the
 * script while proving nothing:
 *
 *   1. it fails through `tests/tenancy/xp-isolation.test.ts` — the only harness that drives an
 *      ACTION rather than a read matrix, and the only one that can notice a credit landing at
 *      the wrong lab;
 *   2. its `EXPECT` is a title that harness actually declares, not a phrase from the plan that
 *      no test ever prints;
 *   3. its `EVIDENCE` matches the assertion's RENDERED message and **not** the harness source.
 *      That distinction is the whole of T046's requirement: vitest prints a code frame of the
 *      failing file, so an `EVIDENCE` that also matches the template would be satisfied by any
 *      failure in the file — a missing database included — and the script would report a proof
 *      it never obtained.
 */
describe('the xp-ledger layer (T047, FR-035)', () => {
  const XP_HARNESS = 'tests/tenancy/xp-isolation.test.ts'

  /** One `case` arm of the script's layer table, read as its three shell assignments. */
  function xpLedgerArm(): { harness: string; surface: string; evidence: string } | null {
    const arm = /^\s*xp-ledger\)\n([\s\S]*?)\n\s*;;/m.exec(read(SCRIPT))
    if (!arm) return null
    const value = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(arm[1]!)?.[1] ?? ''
    return { harness: value('HARNESS'), surface: value('EXPECT'), evidence: value('EVIDENCE') }
  }

  it('is a layer the script accepts', () => {
    const { usage } = usageOf()
    expect(
      advertisedLayers(usage),
      'FR-035 gives the ledger its own vantage point in the mutation gate; without the layer ' +
        'the XP harness has never been observed failing',
    ).toContain('xp-ledger')
  })

  it('fails through the XP harness, which no other layer drives', () => {
    expect(
      xpLedgerArm()?.harness,
      `the xp-ledger layer must run ${XP_HARNESS}: isolation.test.ts asks what a user can SEE ` +
        `and stays green no matter where a credit lands`,
    ).toBe(XP_HARNESS)
  })

  it('expects a surface the harness actually declares', () => {
    const surface = xpLedgerArm()?.surface ?? ''
    expect(surface, 'the xp-ledger layer names no EXPECT surface').not.toBe('')
    expect(
      read(`apps/web/${XP_HARNESS}`),
      `EXPECT is '${surface}', which ${XP_HARNESS} never prints — the script would report ` +
        `"failed, but not for the right reason" on a harness that failed for exactly it`,
    ).toContain(surface)
  })

  it('mutates creditXp choice of client, not the machinery four layers already rewrite', () => {
    expect(
      mutations().map((mutation) => mutation.target),
      'no mutation touches lib/content/xp.ts, so nothing in the layer breaks the credit path',
    ).toContain('apps/web/lib/content/xp.ts')
  })

  it('takes EVIDENCE only the counting assertion can print, never a code frame', () => {
    const evidence = xpLedgerArm()?.evidence ?? ''
    expect(evidence, 'the xp-ledger layer names no EVIDENCE').not.toBe('')

    const source = read(`apps/web/${XP_HARNESS}`)
    expect(
      new RegExp(evidence).test(source),
      `EVIDENCE /${evidence}/ matches the harness SOURCE. Vitest prints a code frame of the ` +
        `failing file, so any failure in it — a database that never started included — would ` +
        `satisfy the grep and the script would announce a proof it never ran.`,
    ).toBe(false)
    expect(
      new RegExp(evidence).test(source.replaceAll('${desvio}', '7')),
      `EVIDENCE /${evidence}/ does not match the message the delta assertion RENDERS, so a ` +
        `real leak would be reported as "something else broke"`,
    ).toBe(true)
  })
})
