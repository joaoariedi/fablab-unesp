import type { Field, NumberField } from 'payload'
import { describe, expect, it } from 'vitest'

import { REGRAS_XP_CITE, RegrasXp } from '../../collections/content/RegrasXp'

/**
 * T005 / FR-009, FR-028 — `regrasXp`, the economy **as per-organization data**.
 *
 * CLR-010 is the whole reason this collection exists: FR-007 stated the level cap as a
 * requirement while FR-009 made it editable data, and the two cannot both be true.
 * Constitution Principle 3 breaks the tie — *"retuning XP is an edit, not a deploy"* — so the
 * authority for `xpPorAcao`, `xpPorNivel` and `nivelMaximo` is **this row**, per organization,
 * and the numbers in `gamification.md` are the CITe **seed**.
 *
 * That decision is what these assertions defend, and it is asserted in the one direction that
 * can actually break: **no number of the economy may be frozen in the schema**. A `max: 10` on
 * `nivelMaximo` would put CLR-010's seed value back into the deploy, where `packages/game`
 * deliberately refuses to keep it (`rules.ts` takes its tunables as an argument for exactly
 * this reason).
 *
 * Two shapes cost something and are asserted hard:
 *
 *  - **`xpPorNivel` cannot be zero.** `levelFor` divides by it: `Math.floor(5 / 0)` is
 *    `Infinity`, so `min(nivelMaximo, Infinity)` pins every maker at the cap, and
 *    `Math.floor(0 / 0)` is `NaN`, which sorts nowhere and renders as a blank level. A lab
 *    retuning its economy in the admin is precisely who would type it, and the clamp in
 *    `rules.ts` does not save them — `Math.max(0, Math.min(10, NaN))` is still `NaN`.
 *  - **One row per organization is an ACCESS rule.** `create` and `delete` are refused for
 *    everyone, so the economy row arrives exactly once — from `SEED_ON_CREATE` through the
 *    system client, which runs `overrideAccess: true` (T013) — and cannot be duplicated into a
 *    second, contradictory economy or removed out from under every reader. The same idiom as
 *    `curtida.update` and the ledger's append-only rule: a flat refusal, not a narrowed row set.
 *
 * Config-shape only, against the exported collection. `payload.config.ts` registration and the
 * `SCOPE_REGISTRY` entry land together in **T009**, because `registry.test.ts` diffs the two in
 * both directions and fails the build whenever they disagree — the same vantage point
 * `skill.test.ts` and `perfil-maker.test.ts` assert from.
 */

const fieldNamed = (name: string): Field | undefined =>
  RegrasXp.fields.find((f) => (f as { name?: string }).name === name)

const numberFieldNamed = (name: string): NumberField | undefined =>
  fieldNamed(name) as NumberField | undefined

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decide = async (
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const access = RegrasXp.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(`regrasXp declares no ${operation} access; it would fall back to logged-in`)
  }
  return access({ req: { user } } as never)
}

/** A session as Payload deserialises it. `collection` is what makes the plugin compose. */
const member = (organization: number, role: string) => ({
  id: 99,
  collection: 'users',
  role: 'user',
  orgs: [{ organization, role }],
})

describe('regrasXp is per-organization data, not a deploy-time constant (T005, FR-009)', () => {
  it('is slugged regrasXp and labelled in PT-BR, because the admin is the lab team\'s surface', () => {
    expect(RegrasXp.slug).toBe('regrasXp')
    expect(RegrasXp.labels?.singular).toBe('Regras de XP')
    expect(RegrasXp.labels?.plural).toBe('Regras de XP')
  })

  it('writes nothing to payload-locked-documents, which no plugin scopes', () => {
    // Same switch, same reason, as every other scoped collection: each row of that internal
    // collection names a document by collection and id, and it is not tenant-filtered
    // (FR-018, CLR-004). Locking is ON by default — the predicate is `lockDocuments !== false`
    // — so the leak reopens by omission.
    expect(RegrasXp.lockDocuments).toBe(false)
  })

  it('declares the /mine endpoint the isolation harness asserts against', () => {
    expect(
      (RegrasXp.endpoints || []).some((e) => (e as { path?: string }).path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection; ' +
        'isolation.test.ts throws for a scoped collection that declares none',
    ).toBe(true)
  })

  it('declares no tenant field of its own — the multi-tenant plugin injects it', () => {
    expect(
      fieldNamed('tenant'),
      'a hand-declared tenant collides with the one the plugin injects, and the two disagree ' +
        'about which one access control filters on',
    ).toBeUndefined()
  })
})

describe('regrasXp access: every maker reads the economy, only the team retunes it (FR-009)', () => {
  it('answers a member with a query constraint, never a bare authorisation (FR-006)', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      'read access returned a boolean: the operation is authorised and then every row leaks, ' +
        'including the other lab\'s economy (FR-006)',
    ).toBe('object')
    expect(JSON.stringify(result)).toContain('tenant')
  })

  it('refuses an anonymous reader — the public path is getPublicScopedPayload, not this', async () => {
    expect(await decide('read', undefined)).toBe(false)
  })

  it('lets the lab team retune its own economy — FR-009 is an edit, not a deploy', async () => {
    const result = await decide('update', member(7, 'admin'))

    expect(
      result,
      'an org admin was refused update: retuning the economy would need a deploy, which is ' +
        'exactly what FR-009 and constitution Principle 3 forbid',
    ).not.toBe(false)
    expect(
      JSON.stringify(result),
      'update is not scoped to the writer\'s own lab: one admin retunes another lab\'s economy',
    ).toContain('7')
  })

  it('refuses a maker the retune: the economy is the lab\'s, not user-generated', async () => {
    expect(
      await decide('update', member(1, 'maker')),
      'a maker was allowed to edit regrasXp; anyone could set xpPorNivel to 1 and cap themselves',
    ).toBe(false)
  })

  it('refuses create to EVERYONE, so one organization can never hold two economies', async () => {
    // The row arrives exactly once, from SEED_ON_CREATE through the system client, which runs
    // `overrideAccess: true` (T013) and therefore never reaches this rule. A second row would
    // make "the economy" ambiguous for every reader — `creditXp`, the projections, the lab
    // level and the ranking all ask this collection one question and expect one answer.
    for (const user of [undefined, member(1, 'maker'), member(7, 'admin'), { id: 1, role: 'master' }]) {
      expect(
        await decide('create', user),
        'create is open: a team member can add a second, contradictory economy row',
      ).toBe(false)
    }
  })

  it('refuses delete to EVERYONE, so no reader is left without a curve', async () => {
    for (const user of [undefined, member(1, 'maker'), member(7, 'admin'), { id: 1, role: 'master' }]) {
      expect(
        await decide('delete', user),
        'delete is open: the organization loses its economy and every level becomes NaN',
      ).toBe(false)
    }
  })
})

describe('regrasXp carries the three tunables packages/game takes as an argument (FR-009)', () => {
  it('names exactly xpPorAcao, xpPorNivel and nivelMaximo — XpRules, as columns', () => {
    const declared = RegrasXp.fields.map((f) => (f as { name?: string }).name)

    expect(
      declared.sort(),
      'the columns and `XpRules` in packages/game/src/rules.ts have drifted apart, so the row ' +
        'read here cannot be handed to levelFor without a translation nobody declared',
    ).toEqual(['nivelMaximo', 'xpPorAcao', 'xpPorNivel'])
  })

  it('exports the CITe seed as the single place those three numbers are written', () => {
    // FR-009 seeds a new organization "from the CITe default". T013's SEED_ON_CREATE entry
    // imports this rather than retyping 1/5/10, so the schema default and the seeded row
    // cannot disagree about what a new lab starts with.
    expect(REGRAS_XP_CITE).toEqual({ xpPorAcao: 1, xpPorNivel: 5, nivelMaximo: 10 })
  })

  for (const name of ['xpPorAcao', 'xpPorNivel', 'nivelMaximo'] as const) {
    it(`declares ${name} as a required number defaulting to the CITe seed`, () => {
      const field = numberFieldNamed(name)

      expect(field, `regrasXp declares no ${name}: the economy is incomplete`).toBeDefined()
      expect(field?.type).toBe('number')
      expect(
        field?.required,
        `${name} is optional, so a row can exist that answers undefined — and every arithmetic ` +
          'on it (floor(xp / undefined)) is NaN rather than a refusal',
      ).toBe(true)
      expect(
        field?.defaultValue,
        `${name}'s default disagrees with REGRAS_XP_CITE, so a row created without it starts on ` +
          'an economy nobody decided',
      ).toBe(REGRAS_XP_CITE[name])
    })
  }

  it('floors xpPorNivel at 1, because levelFor divides by it', () => {
    const xpPorNivel = numberFieldNamed('xpPorNivel')

    // Not a style preference — the arithmetic, run here so the failure message carries it.
    expect(Math.floor(5 / 0)).toBe(Infinity)
    expect(Number.isNaN(Math.max(0, Math.min(10, Math.floor(0 / 0))))).toBe(true)

    expect(
      xpPorNivel?.min,
      'xpPorNivel accepts 0: levelFor divides by it, so floor(xp / 0) is Infinity and every ' +
        'maker is pinned at the cap, while floor(0 / 0) is NaN — which rules.ts\'s clamp does ' +
        'NOT rescue, because Math.min(10, NaN) is NaN. The admin form is who types it.',
    ).toBeGreaterThanOrEqual(1)
  })

  it('floors xpPorAcao and nivelMaximo at 0 — a negative economy pays for nothing', () => {
    expect(numberFieldNamed('xpPorAcao')?.min).toBeGreaterThanOrEqual(0)
    expect(numberFieldNamed('nivelMaximo')?.min).toBeGreaterThanOrEqual(0)
  })

  it('declares NO max on any tunable — that would freeze CLR-010\'s seed into the schema', () => {
    for (const name of ['xpPorAcao', 'xpPorNivel', 'nivelMaximo'] as const) {
      expect(
        numberFieldNamed(name)?.max,
        `${name} carries a max, so the ceiling of this organization's economy is a deploy-time ` +
          'answer to a runtime question. A lab that wants twenty levels would need a migration, ' +
          'and CLR-010 decided the numbers are data (constitution Principle 3).',
      ).toBeUndefined()
    }
  })
})
