import type { CollectionConfig, Field } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  AvatarItem,
  CATEGORIA_COM_BASE,
  CATEGORIAS_AVATAR,
  LINHAS_AVATAR,
  type CategoriaAvatar,
} from '../../collections/avatar/AvatarItem.js'

/**
 * T007 / FR-003, FR-004, CLR-001 — the cosmetic catalogue.
 *
 * `avatarItem` is the third **global** catalogue of this feature and the only one with a
 * shape of its own, so the assertions below are about the three properties that make the
 * design real rather than stated:
 *
 *  - **the nine categories, at the counts `onboarding.md` fixes.** The round-3 mockup moved
 *    `olhos`/`nariz`/`boca` from "5 with a `Ver mais`" to a flat 4, and killed the `Ver mais`
 *    row along with them. A count living only in a seed is a count nobody can be held to —
 *    which is exactly how the superseded catalogue of six skin tones survived into round 3.
 *  - **`compativelBase` on `roupaCima` and nowhere else** (FR-004). Every other slot is one
 *    sprite. A base on `sapatos` is a row the builder can never show, and a `roupaCima`
 *    *without* one is a row it cannot choose between — so the rule is asserted in both
 *    directions, not just the forbidden one.
 *  - **read is open and writing is the master's**, for the reasons `tons.test.ts` records:
 *    the visitor at step 1 of `/criar-conta` has no account at all (FR-003), and an
 *    organization admin who could mint a cosmetic would have made the catalogue per-lab
 *    through the back door (CLR-001).
 *
 * Registration in `payload.config.ts` and `SCOPE_REGISTRY` is **T008's**, so this runs
 * against the exported config — the same vantage point `tons.test.ts` uses.
 */

/** The counts `onboarding.md` § `avatar_item` fixes, written out so the constant cannot move. */
const CATALOGO_FIXADO: ReadonlyArray<readonly [CategoriaAvatar, number]> = [
  ['cabelo', 30],
  ['olhos', 4],
  ['nariz', 4],
  ['boca', 4],
  ['roupaCima', 10],
  ['roupaBaixo', 10],
  ['sapatos', 10],
  ['oculos', 5],
  ['chapeu', 5],
]

const orgAdmin = (organization: number) => ({
  id: 7,
  collection: 'users',
  role: 'user',
  orgs: [{ organization, role: 'admin' }],
})

const master = { id: 1, collection: 'users', role: 'master', orgs: [] }

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decide = async (
  collection: CollectionConfig,
  operation: 'read' | 'create' | 'update' | 'delete',
  user: unknown,
): Promise<unknown> => {
  const access = collection.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(
      `${collection.slug} declares no ${operation} access; it would fall back to Payload's ` +
        'logged-in default, which is a different gate from the role this catalogue is shut ' +
        'behind (CLR-001) — an organization admin would pass it.',
    )
  }
  return access({ req: { user } } as never)
}

const fieldNamed = (name: string): Field | undefined =>
  AvatarItem.fields.find((field) => (field as { name?: string }).name === name)

const requireField = (name: string): Record<string, unknown> => {
  const field = fieldNamed(name)
  if (!field) {
    throw new Error(
      `avatarItem declares no field "${name}". onboarding.md § avatar_item fixes seven: ` +
        'categoria, nome, sprite, spriteFolhas, compativelBase, camadaZ, pintavel.',
    )
  }
  return field as unknown as Record<string, unknown>
}

/**
 * Payload calls `validate(value, options)` and spreads the field config into the TOP LEVEL of
 * the options — `siblingData` carries the rest of the document. Both are supplied here because
 * the rule under test reads the row's `categoria`, not the value in isolation.
 */
const validarBase = (value: unknown, categoria: unknown): unknown => {
  const field = requireField('compativelBase')
  if (typeof field.validate !== 'function') {
    throw new Error(
      'avatarItem.compativelBase declares no validate. FR-004 says only roupaCima varies by ' +
        'base; without a validate nothing stops a base landing on sapatos.',
    )
  }
  return (field.validate as (v: unknown, o: unknown) => unknown)(value, {
    siblingData: { categoria },
    data: { categoria },
    name: 'compativelBase',
  })
}

describe('avatarItem is the global cosmetic catalogue (T007, CLR-001)', () => {
  it('carries the slug the builder, the seed and the registry address it by', () => {
    expect(AvatarItem.slug).toBe('avatarItem')
  })

  it("is labelled in PT-BR, because the admin is the lab team's surface (Principle 4)", () => {
    expect(AvatarItem.labels).toEqual({ singular: 'Item de avatar', plural: 'Itens de avatar' })
  })

  it('declares the seven columns onboarding.md § avatar_item fixes, in that order', () => {
    const names = AvatarItem.fields.map((field) => (field as { name?: string }).name)
    expect(names).toEqual([
      'categoria',
      'nome',
      'sprite',
      'spriteFolhas',
      'compativelBase',
      'camadaZ',
      'pintavel',
    ])
  })
})

describe('the nine categories, at the counts onboarding.md fixes (FR-003)', () => {
  it('exports exactly nine, in the order the builder stacks its pickers', () => {
    expect(Object.keys(CATEGORIAS_AVATAR)).toEqual(CATALOGO_FIXADO.map(([nome]) => nome))
  })

  it.each(CATALOGO_FIXADO)('offers %s at %i options, the size onboarding.md fixes', (
    categoria,
    total,
  ) => {
    expect(CATEGORIAS_AVATAR[categoria]).toBe(total)
  })

  /**
   * The distinction the first draft collapsed, and the one number a green test could not see.
   *
   * `roupaCima` was read as ten **rows** with the f/m split left to the seed. `onboarding.md`
   * § *Card `ROUPAS`* fixes ten **pieces**, *"cada peça tem versão `F` (com peitos) e `M`"* —
   * so ten options per base and twenty rows. Both readings satisfy `CATEGORIAS_AVATAR.roupaCima
   * === 10`; only one of them offers a person the catalogue FR-003 names. Under the other the
   * seed writes ten rows, splits them, and the builder shows five tops.
   */
  it('holds the seed to ROWS, which doubles for the one slot that varies by base', () => {
    expect(
      LINHAS_AVATAR.roupaCima,
      'ten rows means five tops per base once `compativelBase` splits them — half the ' +
        'catalogue. Each of the ten pieces ships an `f` sprite and an `m` sprite.',
    ).toBe(20)

    for (const [categoria, opcoes] of CATALOGO_FIXADO) {
      if (categoria === CATEGORIA_COM_BASE) continue
      expect(
        LINHAS_AVATAR[categoria],
        `${categoria} is produced in a single sprite version, so a row IS an option — ` +
          'doubling it would seed a duplicate nobody can tell apart in the picker',
      ).toBe(opcoes)
    }
  })

  it('derives the rows rather than restating them, so one edit moves both', () => {
    // The guard on the derivation itself: a hand-written second table is how the catalogue
    // moved once already and left prose behind claiming six skin tones.
    expect(Object.keys(LINHAS_AVATAR)).toEqual(Object.keys(CATEGORIAS_AVATAR))
  })

  it('offers those nine as the categoria enum, and nothing else', () => {
    const categoria = requireField('categoria')
    expect(categoria.type).toBe('select')
    expect(categoria.required).toBe(true)
    const values = (categoria.options as ReadonlyArray<{ value: string }>).map(
      (option) => option.value,
    )
    expect(values).toEqual(CATALOGO_FIXADO.map(([nome]) => nome))
  })

  it('labels every option in PT-BR, so the admin picker is not a list of identifiers', () => {
    const options = requireField('categoria').options as ReadonlyArray<{ label?: unknown }>
    for (const option of options) {
      expect(typeof option.label, `label for ${JSON.stringify(option)}`).toBe('string')
      expect(String(option.label).length).toBeGreaterThan(0)
    }
  })

  it('states every category and its size in the admin description, so the two cannot drift', () => {
    const description = String(AvatarItem.admin?.description ?? '')
    for (const [categoria, total] of CATALOGO_FIXADO) {
      expect(description, `${categoria} in admin.description`).toContain(`${categoria} (${total})`)
    }
  })
})

describe('required columns: a row the builder cannot draw is not a catalogue row', () => {
  it.each([
    ['categoria', 'select', true],
    ['nome', 'text', true],
    ['sprite', 'relationship', true],
    ['spriteFolhas', 'relationship', false],
    ['compativelBase', 'select', false],
    ['camadaZ', 'number', true],
    ['pintavel', 'checkbox', false],
  ] as const)('%s is a %s and required=%s', (name, type, required) => {
    const field = requireField(name)
    expect(field.type, `${name} type`).toBe(type)
    expect(field.required === true, `${name} required`).toBe(required)
  })

  it.each(['sprite', 'spriteFolhas'] as const)(
    '%s is a relationship to midiaImagem — D3: every file in the product is a relationship',
    (name) => {
      expect(requireField(name).relationTo).toBe('midiaImagem')
    },
  )

  it.each(['sprite', 'spriteFolhas'] as const)(
    '%s declares no validate: sameTenant on a GLOBAL row compares against a tenant it has not got',
    (name) => {
      // And a declared `validate` REPLACES Payload's default rather than composing with it,
      // which is what would silently make `sprite`'s `required` inert.
      expect(requireField(name).validate).toBeUndefined()
    },
  )
})

describe('compativelBase belongs to roupaCima alone (FR-004)', () => {
  it('names roupaCima as the one slot that varies by base', () => {
    expect(CATEGORIA_COM_BASE).toBe('roupaCima')
  })

  it.each(['f', 'm'] as const)('accepts %s on roupaCima', (base) => {
    expect(validarBase(base, 'roupaCima')).toBe(true)
  })

  it.each([
    ['cabelo', 'f'],
    ['sapatos', 'm'],
    ['oculos', 'f'],
    ['chapeu', 'm'],
  ] as const)('refuses a base on %s — that slot is one sprite, not two', (categoria, base) => {
    expect(validarBase(base, categoria)).toEqual(expect.any(String))
  })

  it.each(['cabelo', 'olhos', 'nariz', 'boca', 'roupaBaixo', 'sapatos', 'oculos', 'chapeu'])(
    'leaves %s empty without complaint: the field is blank on every other category',
    (categoria) => {
      expect(validarBase(undefined, categoria)).toBe(true)
      expect(validarBase(null, categoria)).toBe(true)
      expect(validarBase('', categoria)).toBe(true)
    },
  )

  it.each([undefined, null, ''])(
    'refuses the empty value %j on roupaCima: the builder must be able to pick between bases',
    (value) => {
      expect(validarBase(value, 'roupaCima')).toEqual(expect.any(String))
    },
  )

  it.each(['F', 'M', 'x', 'feminino', 0, {}])(
    'refuses %j on roupaCima — a declared validate replaces the option check, so it does it itself',
    (value) => {
      expect(validarBase(value, 'roupaCima')).toEqual(expect.any(String))
    },
  )

  it('names the offending category in the refusal, so the failing row is findable', () => {
    expect(String(validarBase('f', 'sapatos'))).toContain('sapatos')
  })

  it('offers only f and m, and hides itself on every other category in the admin', () => {
    const field = requireField('compativelBase')
    const values = (field.options as ReadonlyArray<{ value: string }>).map((o) => o.value)
    expect(values).toEqual(['f', 'm'])

    const condition = (field.admin as { condition?: unknown } | undefined)?.condition
    expect(typeof condition).toBe('function')
    const show = condition as (data: unknown, siblingData: unknown) => unknown
    expect(show({ categoria: 'roupaCima' }, { categoria: 'roupaCima' })).toBe(true)
    expect(show({ categoria: 'sapatos' }, { categoria: 'sapatos' })).toBe(false)
  })
})

describe('access: the catalogue is the platform\'s, and the builder is read by strangers', () => {
  /**
   * Shut on the REST surface, exactly like `organizations` — the only other global collection.
   *
   * The first draft asserted the opposite, reasoning that step 1 of `/criar-conta` has no
   * account yet. That reasoning is about the wrong function: the anonymous page path builds its
   * client with `overrideAccess: true`, so this access control is **never consulted** there.
   * The open boolean bought unauthenticated enumeration of `/api/avatarItem`; the visitor's
   * read is served by `PUBLIC_GLOBAL_CATALOGUE` in `lib/tenancy/public-payload.ts`, which is
   * where a global collection's anonymous read is supposed to be argued for.
   */
  it('refuses read to a signed-out caller on the REST surface, as every global does', async () => {
    await expect(decide(AvatarItem, 'read', null)).resolves.toBe(false)
  })

  it('refuses read to an organization admin too — the gate is the role (CLR-001)', async () => {
    await expect(decide(AvatarItem, 'read', orgAdmin(1))).resolves.toBe(false)
  })

  it.each(['create', 'update', 'delete'] as const)(
    'refuses %s to an organization admin — the catalogue is the platform\'s (CLR-001)',
    async (operation) => {
      await expect(decide(AvatarItem, operation, orgAdmin(1))).resolves.toBe(false)
    },
  )

  it.each(['create', 'update', 'delete'] as const)(
    "lets the master %s it, because somebody has to ship the designer's art",
    async (operation) => {
      await expect(decide(AvatarItem, operation, master)).resolves.toBe(true)
    },
  )
})
