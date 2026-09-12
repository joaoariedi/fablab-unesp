import type { CollectionConfig, Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { TomDeCabelo, TOTAL_TONS_DE_CABELO } from '../../collections/avatar/TomDeCabelo.js'
import { TomDePele, TOTAL_TONS_DE_PELE } from '../../collections/avatar/TomDePele.js'

/**
 * T006 / FR-003, FR-027, CLR-001 — the two palette catalogues.
 *
 * They are the first **global** collections this product authors that are not infrastructure:
 * `organizations` is the tenant and `users` is identity, whereas these are reference rows one
 * designer drew and every lab shares. CLR-001 priced that — a second lab cannot add its own
 * cosmetics in v1 — so the assertions below are about the two properties that make the
 * decision real rather than stated:
 *
 *  - **read is `masterOnly()`, the same gate `organizations` uses.** The visitor at step 1 of
 *    `/criar-conta` has no account (FR-003), which looks like an argument for an open boolean
 *    and is not: the anonymous page path builds its client with `overrideAccess: true`, so
 *    collection access is never consulted there. An open `read` would have bought only
 *    unauthenticated enumeration of `/api/<slug>`. The visitor's read is a named allow-list in
 *    `lib/tenancy/public-payload.ts` (`PUBLIC_GLOBAL_CATALOGUE`), where it can be argued for.
 *  - **writing is the master's alone.** An organization admin who could mint a skin tone
 *    would have made the catalogue per-lab by the back door, which is the migration CLR-001
 *    defers to feature 007 rather than a v1 feature.
 *
 * `hex` is asserted hard because CLR-005 exempts these rows from feature 001's colour fence.
 * The exemption is only safe while the column cannot hold anything but a colour: the fence
 * stops a literal reaching a component, and nothing else is watching this value.
 *
 * Registration in `payload.config.ts` and `SCOPE_REGISTRY` is **T008's**, so these run against
 * the exported configs — the same vantage point `categoria-artigo.test.ts` uses and for the
 * same reason.
 */

type Catalogo = {
  readonly collection: CollectionConfig
  readonly slug: string
  readonly total: number
  /** The size `onboarding.md` fixes. Written out, so the constant cannot quietly move. */
  readonly totalFixado: number
  readonly singular: string
  readonly plural: string
}

const CATALOGOS: readonly Catalogo[] = [
  {
    collection: TomDePele,
    slug: 'tomDePele',
    total: TOTAL_TONS_DE_PELE,
    totalFixado: 20,
    singular: 'Tom de pele',
    plural: 'Tons de pele',
  },
  {
    collection: TomDeCabelo,
    slug: 'tomDeCabelo',
    total: TOTAL_TONS_DE_CABELO,
    totalFixado: 10,
    singular: 'Tom de cabelo',
    plural: 'Tons de cabelo',
  },
]

/** A session as Payload deserialises it; `collection` is what makes the plugin compose. */
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
      `${collection.slug} declares no ${operation} access; it would fall back to logged-in, ` +
        `which refuses the signed-out visitor at step 1 of /criar-conta (FR-003).`,
    )
  }
  return access({ req: { user } } as never)
}

const fieldNamed = (collection: CollectionConfig, name: string): Field | undefined =>
  collection.fields.find((field) => (field as { name?: string }).name === name)

/** Payload calls `validate(value, options)`; only the value is read here. */
const validateHex = (collection: CollectionConfig, value: unknown): unknown => {
  const hex = fieldNamed(collection, 'hex') as { validate?: unknown } | undefined
  if (typeof hex?.validate !== 'function') {
    throw new Error(
      `${collection.slug}.hex declares no validate. CLR-005 exempts these rows from the colour ` +
        `fence, so this field is the only thing standing between the column and 'red'.`,
    )
  }
  return (hex.validate as (v: unknown, o: unknown) => unknown)(value, {})
}

describe.each(CATALOGOS)('$slug is a global palette catalogue (T006, CLR-001)', (catalogo) => {
  const { collection } = catalogo

  it('carries the slug the builder and the seed address it by', () => {
    expect(collection.slug).toBe(catalogo.slug)
  })

  it('is labelled in PT-BR, because the admin is the lab team\'s surface (Principle 4)', () => {
    expect(collection.labels).toEqual({
      singular: catalogo.singular,
      plural: catalogo.plural,
    })
  })

  it('declares exactly nome, hex and ordem — onboarding.md\'s three columns', () => {
    const names = collection.fields.map((field) => (field as { name?: string }).name)
    expect(names).toEqual(['nome', 'hex', 'ordem'])
  })

  it('requires all three: a swatch with no colour or no place in the row is not a swatch', () => {
    for (const [name, type] of [
      ['nome', 'text'],
      ['hex', 'text'],
      ['ordem', 'number'],
    ] as const) {
      const field = fieldNamed(collection, name) as
        | { type?: string; required?: boolean }
        | undefined
      expect(field?.type, `${catalogo.slug}.${name} type`).toBe(type)
      expect(field?.required, `${catalogo.slug}.${name} required`).toBe(true)
    }
  })

  it.each(['#000000', '#ffffff', '#A1B2C3', '#abc', '#ABC'])(
    'accepts the strict hex %s',
    (value) => {
      expect(validateHex(collection, value)).toBe(true)
    },
  )

  it.each([
    'red',
    'a1b2c3',
    '#a1b2c',
    '#a1b2c3;',
    ' #a1b2c3 ',
    'rgb(0, 0, 0)',
    'var(--color-primary)',
    '#',
    '',
  ])('refuses %j, which is not a colour this column may hold', (value) => {
    expect(validateHex(collection, value)).toEqual(expect.any(String))
  })

  it.each([undefined, null, 123, {}])(
    'refuses the absent or non-string value %j rather than storing a blank swatch',
    (value) => {
      expect(validateHex(collection, value)).toEqual(expect.any(String))
    },
  )

  it('names the offending value in the refusal, so the row that failed is findable', () => {
    const message = String(validateHex(collection, 'chartreuse'))
    expect(message).toContain('chartreuse')
  })

  /**
   * Shut on the REST surface, exactly like `organizations` — the only other global collection.
   *
   * The first draft asserted the opposite (`read` resolves `true` for a null user) on the
   * argument that step 1 of `/criar-conta` has no account yet. The argument is about the wrong
   * function: the anonymous page path builds its client with `overrideAccess: true`, so this
   * access control is **never consulted** there. What the open boolean granted was
   * unauthenticated enumeration of `/api/<slug>`, and the visitor's read was not enabled by it
   * — it was enabled by `PUBLIC_GLOBAL_CATALOGUE` in `lib/tenancy/public-payload.ts`, which is
   * where a global collection's anonymous read is supposed to be argued for.
   *
   * `tests/tenancy/public-catalogue.test.ts` owns the other half: that the door is open there,
   * and still shut for every global collection that is not the catalogue.
   */
  it('refuses read to a signed-out caller on the REST surface, as every global does', async () => {
    await expect(decide(collection, 'read', null)).resolves.toBe(false)
  })

  it('refuses read to an organization admin too — the gate is the role (CLR-001)', async () => {
    await expect(decide(collection, 'read', orgAdmin(1))).resolves.toBe(false)
  })

  it.each(['create', 'update', 'delete'] as const)(
    'refuses %s to an organization admin — the catalogue is the platform\'s (CLR-001)',
    async (operation) => {
      await expect(decide(collection, operation, orgAdmin(1))).resolves.toBe(false)
    },
  )

  it.each(['create', 'update', 'delete'] as const)(
    'lets the master %s it, because somebody has to ship the designer\'s art',
    async (operation) => {
      await expect(decide(collection, operation, master)).resolves.toBe(true)
    },
  )

  it('exports the catalogue size onboarding.md fixes, for the seed to be held to', () => {
    expect(catalogo.total).toBe(catalogo.totalFixado)
  })

  it('states that same size in the admin description, so the two cannot drift', () => {
    const description = collection.admin?.description
    expect(typeof description, `${catalogo.slug} admin.description`).toBe('string')
    expect(String(description)).toContain(String(catalogo.total))
  })
})
