import type { Field, RelationshipField, TextField } from 'payload'
import { describe, expect, it } from 'vitest'

import { PerfilMaker } from '../../collections/content/PerfilMaker'

/**
 * T042 / FR-003b, FR-005 — `perfilMaker`, the author block every content card renders.
 *
 * CLR-002 is the thing under test, not the field list: level, XP and skills are
 * per-organization, so the profile is a **scoped collection beside the global `usuario`** and
 * one person making at two labs has one login and two profiles. Putting `nome` and `handle` on
 * `usuario` would work exactly until the second lab exists.
 *
 * Two of the assertions below are the ones that cost something:
 *
 *  - **`handle` must not be globally `unique`.** Payload's `unique` is a database constraint
 *    over the whole table, and the multi-tenant plugin does not narrow it to the tenant. A
 *    handle is *derived from the person's name* (`@nomesobrenome`, onboarding.md round 4), so
 *    the same person joining a second lab would produce the same handle — and a global unique
 *    index would refuse the second profile, which is precisely the shape CLR-002 exists to
 *    make possible.
 *  - **avatar, nivel and xp are absent.** Features 004 and 005 add them *to this collection*;
 *    a field invented here would be one they have to reshape.
 *
 * Config-shape only, against the exported collection: `payload.config.ts` registration lands
 * with the registry entry in T044, because `registry.test.ts` fails the build whenever the
 * config and `SCOPE_REGISTRY` disagree in either direction — the two cannot land separately.
 */

const fieldNamed = (name: string): Field | undefined =>
  PerfilMaker.fields.find((f) => (f as { name?: string }).name === name)

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decide = async (
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const access = PerfilMaker.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(`perfilMaker declares no ${operation} access; it would fall back to logged-in`)
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

describe('perfilMaker is the scoped author collection (T042, FR-003b, FR-005)', () => {
  it('is slugged perfilMaker and labelled in PT-BR', () => {
    expect(PerfilMaker.slug).toBe('perfilMaker')
    expect(PerfilMaker.labels?.singular).toBe('Perfil de maker')
    expect(PerfilMaker.labels?.plural).toBe('Perfis de maker')
  })

  it('declares the /mine endpoint the isolation harness asserts against', () => {
    expect(
      (PerfilMaker.endpoints || []).some((e) => (e as { path?: string }).path === '/mine'),
      'the customEndpoint surface of the isolation harness has no subject on this collection',
    ).toBe(true)
  })

  it('answers a member with a query constraint, never a bare authorisation (FR-006)', async () => {
    const result = await decide('read', member(1, 'maker'))

    expect(
      typeof result,
      'read access returned a boolean: the operation is authorised and then every row leaks, ' +
        'including the other lab\'s makers (FR-006)',
    ).toBe('object')
    expect(JSON.stringify(result)).toContain('tenant')
  })

  it('refuses an anonymous reader — the public path is getPublicScopedPayload, not this', async () => {
    expect(await decide('read', undefined)).toBe(false)
  })

  it('scopes every write to the writer\'s own labs', async () => {
    for (const operation of ['create', 'update', 'delete'] as const) {
      const result = await decide(operation, member(7, 'admin'))
      expect(result, `an org admin was refused ${operation}`).not.toBe(false)
      expect(
        JSON.stringify(result),
        `${operation} is not scoped to the writer's own lab`,
      ).toContain('7')
    }
  })
})

describe('perfilMaker carries the fields content renders (T042, FR-003b)', () => {
  it('requires nome, capped at the 60 characters onboarding.md fixed in round 4', () => {
    const nome = fieldNamed('nome') as TextField | undefined

    expect(nome, 'perfilMaker declares no nome (onboarding.md § usuario / perfil_maker)').toBeDefined()
    expect(nome?.type).toBe('text')
    expect(nome?.required, 'nome is optional: a card would render an author with no name').toBe(true)
    expect(
      nome?.maxLength,
      'nome is unbounded — the AutorInline block breaks on the first 400-character name',
    ).toBe(60)
  })

  it('requires an indexed handle', () => {
    const handle = fieldNamed('handle') as TextField | undefined

    expect(handle, 'perfilMaker declares no handle (@nomesobrenome)').toBeDefined()
    expect(handle?.type).toBe('text')
    expect(handle?.required).toBe(true)
    expect(handle?.index, 'handle is looked up by the public profile route').toBe(true)
  })

  it('does NOT make handle globally unique — that would forbid the second profile (CLR-002)', () => {
    const handle = fieldNamed('handle') as TextField | undefined

    expect(
      handle?.unique ?? false,
      'unique is a whole-table constraint the multi-tenant plugin does not narrow to the tenant. ' +
        'The handle is derived from the person\'s name, so one maker joining a second lab would ' +
        'collide with their own first profile — the one login, two profiles CLR-002 requires.',
    ).toBe(false)
  })

  it('links the scoped profile to the global usuario, with no sameTenant validator', () => {
    const usuario = fieldNamed('usuario') as RelationshipField | undefined

    expect(
      usuario,
      'nothing joins the profile to the login: "one login, two profiles" is unimplementable',
    ).toBeDefined()
    expect(usuario?.type).toBe('relationship')
    expect(usuario?.relationTo).toBe('users')
    expect(
      usuario?.validate,
      'sameTenant on a relationship whose target is global compares against a tenant that ' +
        'does not exist (data-model.md § Relationships that need sameTenant)',
    ).toBeUndefined()
  })

  it('leaves avatar to 004 and level/XP to 005, which extend this collection', () => {
    for (const name of ['avatar', 'avatarPixel', 'nivel', 'xp', 'xpTotal', 'skills']) {
      expect(
        fieldNamed(name),
        `${name} was invented here; 004/005 own it and would have to reshape this collection`,
      ).toBeUndefined()
    }
  })
})
