import type {
  ArrayField,
  DateField,
  Field,
  JSONField,
  NumberField,
  RelationshipField,
  SelectField,
  TextField,
} from 'payload'
import { describe, expect, it } from 'vitest'

import { PerfilMaker } from '../../collections/content/PerfilMaker'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'

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

/** The same lookup one level down, inside the `skills` array's own field list. */
const rowFieldNamed = (array: ArrayField | undefined, name: string): Field | undefined =>
  array?.fields.find((f) => (f as { name?: string }).name === name)

/** Payload accepts `'aluno'` and `{ label, value }` interchangeably; only the value is asserted. */
const optionValues = (field: SelectField | undefined): string[] =>
  (field?.options ?? []).map((option) => (typeof option === 'string' ? option : option.value))

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

  it('still leaves the XP ledger to 005, now that 004 has landed its own fields', () => {
    // `skills` left this list in T009: feature 004 adds it *here*, additively, which is what
    // T042 planned for. What stays absent is the ledger — a maker's overall level and XP total
    // are feature 005's, and `nivel`/`xp` exist only INSIDE a `skills` row, where they describe
    // that maker's relation to one skill rather than a number for the whole profile.
    for (const name of ['avatar', 'avatarPixel', 'nivel', 'xp', 'xpTotal']) {
      expect(
        fieldNamed(name),
        `${name} was invented at the top level; 005 owns the ledger and would have to reshape ` +
          'this collection. Per-skill level and XP belong to a `skills` row.',
      ).toBeUndefined()
    }
  })
})

/**
 * T009 / FR-008, FR-012, FR-013, FR-024 — the fields signup writes, **added** to the shipped
 * collection rather than a re-creation of it.
 *
 * The block above is the T042 contract and is deliberately left standing: "add, do not
 * re-create" is only a claim while the original assertions still pass beside the new ones.
 *
 * Three of the assertions below are the ones that cost something:
 *
 *  - **`curso` must not be a `select`.** The round-4 mockup makes it a *combobox* — type
 *    freely OR pick from the list (`Digite ou selecione seu curso`) — and FR-008 repeats the
 *    word. A `select` validates the value against its options and would refuse every course
 *    nobody thought to list, which for a lab open to the whole community is most of them.
 *  - **`vinculoUnesp` needs an answer for someone with no link.** FR-009 accepts any e-mail
 *    precisely because the UNESP relationship is declared in this field instead — so a list of
 *    only `aluno`/`servidor`/`voluntario` leaves a community member with no truthful answer,
 *    and the field becomes a lie or a blank.
 *  - **The personal columns are nullable.** See the test that says so; it is asserting a
 *    decision, not an accident.
 */
describe('perfilMaker gains step 2\'s personal data (T009, FR-008)', () => {
  it('stores dataNascimento as a date, day only — a birthday has no time of day', () => {
    const nascimento = fieldNamed('dataNascimento') as DateField | undefined

    expect(
      nascimento,
      'perfilMaker declares no dataNascimento; step 2 collects it (FR-008, onboarding.md § 6.2)',
    ).toBeDefined()
    expect(
      nascimento?.type,
      'a birth date held as text cannot be compared or aged, and every reader parses it again',
    ).toBe('date')
    expect(
      nascimento?.admin?.date?.pickerAppearance,
      'the admin picker offers a time of day for a birthday, so the stored instant depends on ' +
        'the editor\'s clock — the mockup\'s field is DD / MM / AAAA',
    ).toBe('dayOnly')
  })

  it('offers vinculoUnesp as a select that includes having no link at all (FR-009)', () => {
    const vinculo = fieldNamed('vinculoUnesp') as SelectField | undefined

    expect(vinculo, 'perfilMaker declares no vinculoUnesp').toBeDefined()
    expect(vinculo?.type, 'the mockup renders a select with a chevron, not a free-text box').toBe('select')

    const values = optionValues(vinculo)
    expect(values.length, 'a select with no options is a dead control').toBeGreaterThan(0)
    expect(
      values.some((value) => value.includes('sem')),
      'every option asserts a link to the UNESP, so a community member — whom FR-009 admits ' +
        `with any e-mail — has no truthful answer. Options offered: ${values.join(', ')}`,
    ).toBe(true)
  })

  it('offers escolaridade as a select with a list to choose from', () => {
    const escolaridade = fieldNamed('escolaridade') as SelectField | undefined

    expect(escolaridade, 'perfilMaker declares no escolaridade').toBeDefined()
    expect(escolaridade?.type).toBe('select')
    expect(
      optionValues(escolaridade).length,
      'Selecione sua escolaridade with nothing to select',
    ).toBeGreaterThan(0)
  })

  it('keeps curso free text, because FR-008 calls it a combobox', () => {
    const curso = fieldNamed('curso') as TextField | undefined

    expect(curso, 'perfilMaker declares no curso').toBeDefined()
    expect(
      curso?.type,
      'curso is a select, so a course absent from the list cannot be entered at all — the ' +
        'mockup says "Digite ou selecione seu curso" and the list is a suggestion',
    ).toBe('text')
  })

  it('leaves the four personal columns nullable, because the form is what obliges them', () => {
    // Deliberate, and the reason is measured rather than stylistic. Profiles exist that step 2
    // never created — the tenancy fixtures seed one per organization with `nome`, `handle` and
    // `usuario` alone — so a NOT NULL column here does not fail this file, it throws inside
    // `beforeAll` and reports the ENTIRE tests/tenancy directory as *skipped* (tasks.md
    // preamble item 1; it cost feature 002 160 silent tests). FR-008 says step 2 *collects*
    // these, and step 2's form is where an empty course must be refused with a field error
    // rather than a 500 from the database.
    for (const name of ['dataNascimento', 'vinculoUnesp', 'escolaridade', 'curso']) {
      expect(
        (fieldNamed(name) as { required?: boolean } | undefined)?.required ?? false,
        `${name} is required at the column. Every profile the signup form did not create — the ` +
          'tenancy fixtures, the seed, an admin-created profile — is now unwritable, and the ' +
          'failure surfaces as a skipped suite rather than a red one.',
      ).toBe(false)
    }
  })

  it('holds no e-mail and no password: identity is global and lives on users', () => {
    for (const name of ['email', 'senha', 'senhaHash', 'password']) {
      expect(
        fieldNamed(name),
        `${name} was copied onto the per-lab profile. A person making at two labs would then ` +
          'have two credentials for one login, which is exactly what CLR-002 splits apart.',
      ).toBeUndefined()
    }
  })
})

describe('perfilMaker carries the avatar and the consent stamp (T009, FR-012, FR-024)', () => {
  it('stores avatarConfig as json, not as a text blob every reader parses', () => {
    const config = fieldNamed('avatarConfig') as JSONField | undefined

    expect(
      config,
      'perfilMaker declares no avatarConfig, so the avatar built in step 1 has nowhere to land ' +
        'and US1\'s VOLTAR loses the work',
    ).toBeDefined()
    expect(config?.type).toBe('json')
  })

  it('relates avatarRender to midiaImagem, optional and guarded by sameTenant', () => {
    const render = fieldNamed('avatarRender') as RelationshipField | undefined

    expect(render, 'perfilMaker declares no avatarRender (FR-024)').toBeDefined()
    expect(render?.type).toBe('relationship')
    expect(
      render?.relationTo,
      'the composed PNG must go through the media collections and their upload limits (FR-033); ' +
        'a raw key would be a foreign key with no constraint',
    ).toBe('midiaImagem')
    expect(
      render?.required ?? false,
      'the render is generated after the configuration is saved (FR-024), so requiring it makes ' +
        'the profile uncreatable until a PNG exists',
    ).toBe(false)
    expect(
      render?.validate,
      'both sides are scoped, and spike S4c measured that the plugin ACCEPTS a cross-tenant ' +
        'relationship on its own: without sameTenant a profile can point at another lab\'s image',
    ).toBe(sameTenant)
  })

  it('stamps consent with the VERSION as well as the moment (FR-012)', () => {
    const em = fieldNamed('aceiteTermosEm') as DateField | undefined
    const versao = fieldNamed('aceiteTermosVersao') as TextField | undefined

    expect(em, 'perfilMaker declares no aceiteTermosEm: the LGPD gate leaves no trace').toBeDefined()
    expect(em?.type).toBe('date')
    expect(
      versao,
      'only the timestamp is stamped, so nothing records WHICH terms were accepted and a ' +
        're-consent can never be demanded of the people who accepted the old ones (FR-012)',
    ).toBeDefined()
    expect(versao?.type).toBe('text')
  })
})

describe('perfilMaker holds the maker\'s skills at level 0 (T009, FR-013)', () => {
  const skills = (): ArrayField | undefined => fieldNamed('skills') as ArrayField | undefined

  it('is an array of rows, one per skill, and never a bare relationship list', () => {
    expect(
      skills(),
      'perfilMaker declares no skills, so FR-013 has nowhere to write the active catalogue at ' +
        'level 0 and Minha Conta has no pips to render (FR-021)',
    ).toBeDefined()
    expect(
      skills()?.type,
      'a hasMany relationship records WHICH skills but not the level of each, which is the ' +
        'whole content of the SUAS SKILLS panel',
    ).toBe('array')
  })

  it('points each row at a scoped skill under sameTenant', () => {
    const skill = rowFieldNamed(skills(), 'skill') as RelationshipField | undefined

    expect(skill, 'a skills row names no skill').toBeDefined()
    expect(skill?.type).toBe('relationship')
    expect(skill?.relationTo).toBe('skill')
    expect(skill?.required, 'a row with no skill is progress against nothing').toBe(true)
    expect(
      skill?.validate,
      'skill is scoped per organization (CLR-001) and so is this profile: without sameTenant a ' +
        'maker of lab A carries a level in lab B\'s vocabulary',
    ).toBe(sameTenant)
  })

  it('starts every row at level 0 with 0 XP, and neither may go negative', () => {
    for (const name of ['nivel', 'xp']) {
      const numero = rowFieldNamed(skills(), name) as NumberField | undefined

      expect(numero, `a skills row carries no ${name} (gamification.md § Skills)`).toBeDefined()
      expect(numero?.type).toBe('number')
      expect(
        numero?.defaultValue,
        `${name} has no default, so FR-013's assignment has to write it and a row created any ` +
          'other way answers undefined — a three-valued number the pips cannot draw',
      ).toBe(0)
      expect(numero?.min, `${name} may go negative`).toBe(0)
    }
  })

  it('sets no minRows: a lab with no active skill still gets a profile', () => {
    expect(
      skills()?.minRows ?? 0,
      'FR-013 assigns every ACTIVE skill, and a new organization has none until the team adds ' +
        'them — a minimum would refuse the first maker to sign up there',
    ).toBe(0)
  })
})
