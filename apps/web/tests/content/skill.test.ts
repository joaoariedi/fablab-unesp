import type { CheckboxField, Field, TextField } from 'payload'
import { describe, expect, it } from 'vitest'

import { Skill } from '../../collections/content/Skill'

/**
 * T005 / FR-013, FR-027, CLR-001 — `skill`, the **only** catalogue this feature scopes.
 *
 * Its three sibling catalogues (`avatarItem`, `tomDePele`, `tomDeCabelo`) are global: one
 * designer's art, identical everywhere. `skill` is not, and CLR-001 records why — the PO
 * decided on 2026-08-24 that the catalogue is **administrable per organization**, so the lab
 * team adds and removes rows. That single difference is what the assertions below are for:
 * a `skill` that read like the palettes would hand every lab CITe's vocabulary.
 *
 * Two properties cost something and are asserted hard:
 *
 *  - **`ativa` is a required checkbox with a default.** FR-013 assigns every **active** skill
 *    at level 0 when a profile is created, so "active" is a filter that runs on every signup.
 *    A nullable flag makes it a three-valued filter, and the row that answers `undefined` is
 *    the one silently left off a maker's profile. `required: true` on a checkbox means "must
 *    carry a boolean", not "must be ticked" — measured on `evento.inscricaoObrigatoria`:
 *    `validations.checkbox(false, { required: true })` is accepted, `undefined` is not.
 *  - **Removal is deactivation, so the catalogue has no destructive edit.** `gamification.md`
 *    (PO, 2026-08-24) states that removing a skill must not touch anyone's XP: the ledger is
 *    immutable and a reactivated skill shows its old progress again. That is only true while
 *    the row survives, which is why `ativa` exists at all rather than the admin deleting.
 *
 * Level, XP and pips are **not** here. They belong to a maker's relation to a skill —
 * `perfilMaker.skills` (T009) — not to the catalogue row, and a `nivel` column here would be
 * one number for the whole lab.
 *
 * Config-shape only, against the exported collection. `payload.config.ts` registration and the
 * `SCOPE_REGISTRY` entry land together in **T008**, because `registry.test.ts` diffs the two in
 * both directions and fails the build whenever they disagree — the same reason
 * `perfil-maker.test.ts` and `tons.test.ts` assert from this vantage point.
 */

const fieldNamed = (name: string): Field | undefined =>
  Skill.fields.find((f) => (f as { name?: string }).name === name)

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decide = async (
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const access = Skill.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(`skill declares no ${operation} access; it would fall back to logged-in`)
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

describe('skill is a scoped catalogue, not global reference data (T005, FR-027, CLR-001)', () => {
  it('is slugged skill and labelled in PT-BR, because the admin is the lab team\'s surface', () => {
    expect(Skill.slug).toBe('skill')
    expect(Skill.labels?.singular).toBe('Skill')
    expect(Skill.labels?.plural).toBe('Skills')
  })

  it('writes nothing to payload-locked-documents, which no plugin scopes', () => {
    // Same switch, same reason, as every other scoped collection: each row of that internal
    // collection names a document by collection and id, and it is not tenant-filtered
    // (FR-018, CLR-004). Locking is ON by default — the predicate is `lockDocuments !== false`
    // — so the leak reopens by omission.
    expect(Skill.lockDocuments).toBe(false)
  })

  it('declares the /mine endpoint the isolation harness asserts against', () => {
    expect(
      (Skill.endpoints || []).some((e) => (e as { path?: string }).path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection; ' +
        'isolation.test.ts throws for a scoped collection that declares none',
    ).toBe(true)
  })

  it('answers a member with a query constraint, never a bare authorisation (FR-006)', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      'read access returned a boolean: the operation is authorised and then every row leaks, ' +
        'including the other lab\'s skill catalogue (FR-006)',
    ).toBe('object')
    expect(JSON.stringify(result)).toContain('tenant')
  })

  it('refuses an anonymous reader — the public path is getPublicScopedPayload, not this', async () => {
    expect(await decide('read', undefined)).toBe(false)
  })

  it('lets the lab team administer the catalogue, scoped to their own lab', async () => {
    // CLR-001's whole justification: the org admin adds and removes skills. If writing were
    // `masterOnly` the catalogue would be per-organization in name only.
    for (const operation of ['create', 'update', 'delete'] as const) {
      const result = await decide(operation, member(7, 'admin'))
      expect(result, `an org admin was refused ${operation}`).not.toBe(false)
      expect(
        JSON.stringify(result),
        `${operation} is not scoped to the writer's own lab`,
      ).toContain('7')
    }
  })

  it('refuses a maker: the catalogue is the lab\'s vocabulary, not user-generated', async () => {
    for (const operation of ['create', 'update', 'delete'] as const) {
      expect(
        await decide(operation, member(1, 'maker')),
        `a maker was allowed to ${operation} a skill; every maker would mint their own`,
      ).toBe(false)
    }
  })
})

describe('skill carries the fields FR-013 reads at signup (T005, FR-013)', () => {
  it('requires nome — the label the SUAS SKILLS panel renders', () => {
    const nome = fieldNamed('nome') as TextField | undefined

    expect(nome, 'skill declares no nome (gamification.md § Skills)').toBeDefined()
    expect(nome?.type).toBe('text')
    expect(nome?.required, 'nome is optional: a skill card would render with no label').toBe(true)
  })

  it('requires an indexed slug, so a seed and a migration can name a row stably', () => {
    const slug = fieldNamed('slug') as TextField | undefined

    expect(slug, 'skill declares no slug: nothing can reference a row except by database id').toBeDefined()
    expect(slug?.type).toBe('text')
    expect(slug?.required).toBe(true)
    expect(slug?.index, 'slug is looked up by seed and by content that names a skill').toBe(true)
  })

  it('does NOT make slug globally unique — that is a whole-table constraint (CLR-001)', () => {
    const slug = fieldNamed('slug') as TextField | undefined

    expect(
      slug?.unique ?? false,
      'Payload\'s `unique` spans the table and the multi-tenant plugin does not narrow it to ' +
        'the tenant (perfilMaker.handle, CLR-002). A second lab seeding `modelagem-3d` would be ' +
        'refused the row the PO decided it may have.',
    ).toBe(false)
  })

  it('carries ativa as a required checkbox defaulting to active', () => {
    const ativa = fieldNamed('ativa') as CheckboxField | undefined

    expect(
      ativa,
      'skill declares no ativa: FR-013 has no "active" to filter on, and removing a skill ' +
        'could only mean deleting the row — which gamification.md forbids (the XP ledger is ' +
        'immutable and a reactivated skill must show its old progress)',
    ).toBeDefined()
    expect(ativa?.type).toBe('checkbox')
    expect(
      ativa?.required,
      'ativa may be undefined, so FR-013\'s filter is three-valued and the row that answers ' +
        'undefined is silently left off every new profile',
    ).toBe(true)
    expect(
      ativa?.defaultValue,
      'a new skill must enter every maker\'s panel at level 0 (gamification.md, PO 2026-08-24)',
    ).toBe(true)
  })

  it('holds no level or XP: those describe a maker\'s relation to a skill, not the catalogue', () => {
    for (const name of ['nivel', 'xp', 'xpTotal', 'pips', 'maker', 'perfil']) {
      expect(
        fieldNamed(name),
        `${name} was declared on the catalogue row, so it would be one value for the whole lab. ` +
          'Per-maker progress lives on perfilMaker.skills (T009) and is feature 005\'s to evolve.',
      ).toBeUndefined()
    }
  })
})
